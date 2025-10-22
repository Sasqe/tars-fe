// src/components/Render.jsx
import React, {useEffect, useRef, useState} from "react";
import Banner from './Banner';
import config from "../config";
import '../styles/Render.css'
/* ---------- Config (hoisted) ---------- */
const LAYER_CAP = 32;

const CYCLE_MS     = 150;     // pause between loops
const STEP_MS      = 60;     // spacing between phases (reset→input→conv1→conv2→fc1→output)
const END_IDLE_MS  = 200;    // quiet time after the LAST layer_17 before we snapshot & start replay

const RAW_LAYERS = [
    { name: "Input",    size: 16 },
    { name: "Conv2d 1", size: 32 },
    { name: "Conv2d 2", size: 64 },
    { name: "Fc 1",     size: 32 },
    { name: "Output",   size: 10 }
];

const LAYERS = RAW_LAYERS.map(l => ({ ...l, size: Math.min(l.size, LAYER_CAP) }));

const CONV_GAMMA          = 0.7;
const EDGE_TOP_K          = 6;
const EDGE_BETA           = 1.0;
const EDGE_GAMMA          = 0.7;
const MIN_NODE_BRIGHTNESS = 0.04;
const BASE_EDGE_OPACITY   = 0.04;

/* ---------- Helpers ---------- */
function rebinAverage(values, targetLen) {
    const srcLen = values.length;
    if (targetLen <= 0 || srcLen === 0) return new Array(Math.max(0, targetLen)).fill(0);
    const out = new Array(targetLen).fill(0);
    const scale = srcLen / targetLen;
    for (let i = 0; i < targetLen; i++) {
        const start = i * scale, end = (i + 1) * scale;
        let acc = 0, wsum = 0;
        const s0 = Math.floor(start), s1 = Math.ceil(end);
        for (let s = s0; s < s1; s++) {
            const segStart = Math.max(start, s), segEnd = Math.min(end, s + 1);
            const w = Math.max(0, segEnd - segStart);
            if (s >= 0 && s < srcLen && w > 0) { acc += values[s] * w; wsum += w; }
        }
        out[i] = wsum > 0 ? acc / wsum : 0;
    }
    return out;
}

function minMax01(arr) {
    if (!arr || arr.length === 0) return [];
    let minV = arr[0], maxV = arr[0];
    for (let i = 1; i < arr.length; i++) { const v = arr[i]; if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const denom = (maxV - minV) || 1;
    return arr.map(v => (v - minV) / denom);
}

function reduceConvActivations(act3d, targetLen) {
    const C = act3d.length;
    if (C === 0) return new Array(targetLen).fill(0);
    const H = act3d[0].length, W = act3d[0][0].length, HW = H * W;
    const per = new Array(C);
    for (let c = 0; c < C; c++) {
        let sum = 0;
        for (let i = 0; i < H; i++) { const row = act3d[c][i]; for (let j = 0; j < W; j++) sum += row[j]; }
        const mu = sum / HW;
        let dev = 0;
        for (let i = 0; i < H; i++) { const row = act3d[c][i]; for (let j = 0; j < W; j++) dev += Math.abs(row[j] - mu); }
        per[c] = dev / HW;
    }
    const reb  = rebinAverage(per, targetLen);
    const norm = minMax01(reb);
    return norm.map(v => Math.pow(v, CONV_GAMMA));
}

function reduceVectorActivations(vec1d, targetLen) {
    return minMax01(rebinAverage(vec1d, targetLen));
}

function computeEdgeOpacitiesForPair(src, dst, topK = EDGE_TOP_K, beta = EDGE_BETA, gamma = EDGE_GAMMA) {
    const srcLen = src.length, dstLen = dst.length;
    const out = Array.from({ length: dstLen }, () => new Array(srcLen).fill(0));
    const k = Math.max(0, Math.min(topK, srcLen));
    const EPS = 1e-9;

    for (let j = 0; j < dstLen; j++) {
        const bj = Math.max(0, dst[j]);
        const gate = Math.pow(bj, beta);
        const scores = new Array(srcLen);
        for (let i = 0; i < srcLen; i++) scores[i] = src[i] * gate;

        const idx = Array.from({ length: srcLen }, (_, i) => i)
            .sort((a, b) => scores[b] - scores[a])
            .slice(0, k);

        let minS = Infinity, maxS = -Infinity;
        for (const i of idx) { const s = scores[i]; if (s < minS) minS = s; if (s > maxS) maxS = s; }
        const denom = maxS - minS;

        for (const i of idx) {
            const norm = denom > EPS ? (scores[i] - minS) / denom : (scores[i] > 0 ? 1 : 0);
            out[j][i] = Math.pow(norm, gamma);
        }
    }
    return out; // [dst][src]
}

/* ---------- Component ---------- */
const Skeleton = ({ prediction }) => {
    const gradcamUrl = prediction?.gradcam_data_url;
    const [messages, setMessages] = useState([]);
    useEffect(() => {
        if (prediction?.response) {
            setMessages(prev => [...prev, prediction.response]);
        }
    }, [prediction?.response]);

    const [isConnected, setIsConnected] = useState(false);


    const layers = LAYERS;

    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    const [outputActivations, setOutputActivations] = useState(new Array(layers[4].size).fill(0));
    const [inputActivations,  setInputActivations]  = useState(new Array(layers[0].size).fill(0));
    const [fc1Activations,    setFc1Activations]    = useState(new Array(layers[3].size).fill(0));
    const [conv1Activations,  setConv1Activations]  = useState(new Array(layers[1].size).fill(0));
    const [conv2Activations,  setConv2Activations]  = useState(new Array(layers[2].size).fill(0));

    /* Live buffers (truth) — updated ONLY by WS, NEVER by replay resets */
    const liveInputRef  = useRef([...inputActivations]);
    const liveC1Ref     = useRef([...conv1Activations]);
    const liveC2Ref     = useRef([...conv2Activations]);
    const liveFc1Ref    = useRef([...fc1Activations]);
    const liveOutRef    = useRef([...outputActivations]);

    /* Display refs mirror state for convenience (not used for snapshot now) */
    const inRef   = useRef(inputActivations);
    const c1Ref   = useRef(conv1Activations);
    const c2Ref   = useRef(conv2Activations);
    const fc1Ref  = useRef(fc1Activations);
    const outRef  = useRef(outputActivations);
    useEffect(()=>{ inRef.current  = inputActivations;  }, [inputActivations]);
    useEffect(()=>{ c1Ref.current  = conv1Activations;  }, [conv1Activations]);
    useEffect(()=>{ c2Ref.current  = conv2Activations;  }, [conv2Activations]);
    useEffect(()=>{ fc1Ref.current = fc1Activations;    }, [fc1Activations]);
    useEffect(()=>{ outRef.current = outputActivations; }, [outputActivations]);

    // Snapshot of the last full pass (what to replay)
    const snapshotRef = useRef(null); // { input, conv1, conv2, fc1, output }
    const [snapshotVersion, setSnapshotVersion] = useState(0);

    // Replay transport
    const [isPlaying, setIsPlaying] = useState(false);
    const isPlayingRef = useRef(isPlaying);
    useEffect(()=>{ isPlayingRef.current = isPlaying; }, [isPlaying]);

    // Scheduler
    const phaseIdxRef     = useRef(0);        // 0..5
    const stepIntervalRef = useRef(null);     // setInterval handle
    const restTimerRef    = useRef(null);     // setTimeout between loops
    const endIdleTimerRef = useRef(null);     // quiet timer after the last layer_17

    const stopScheduler = () => {
        if (stepIntervalRef.current) { clearInterval(stepIntervalRef.current); stepIntervalRef.current = null; }
        if (restTimerRef.current)    { clearTimeout(restTimerRef.current);     restTimerRef.current = null; }
    };

    const applyPhase = (idx) => {
        const snap = snapshotRef.current;
        if (!snap) return;
        switch (idx) {
            case 0:
                setInputActivations(new Array(layers[0].size).fill(0));
                setConv1Activations(new Array(layers[1].size).fill(0));
                setConv2Activations(new Array(layers[2].size).fill(0));
                setFc1Activations(new Array(layers[3].size).fill(0));
                setOutputActivations(new Array(layers[4].size).fill(0));
                break;
            case 1: setInputActivations([...snap.input]);   break;
            case 2: setConv1Activations([...snap.conv1]);   break;
            case 3: setConv2Activations([...snap.conv2]);   break;
            case 4: setFc1Activations([...snap.fc1]);       break;
            case 5: setOutputActivations([...snap.output]); break;
            default: break;
        }
    };

    const startReplay = () => {
        if (!snapshotRef.current) return;
        stopScheduler();
        phaseIdxRef.current = 0;
        applyPhase(0); // reset immediately

        stepIntervalRef.current = setInterval(() => {
            if (!isPlayingRef.current) return;
            phaseIdxRef.current += 1;
            if (phaseIdxRef.current <= 5) {
                applyPhase(phaseIdxRef.current);
            } else {
                clearInterval(stepIntervalRef.current);
                stepIntervalRef.current = null;
                restTimerRef.current = setTimeout(() => {
                    if (!isPlayingRef.current) return;
                    startReplay();
                }, CYCLE_MS);
            }
        }, STEP_MS);
    };

    // Resize
    useEffect(() => {
        const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // WebSocket
    useEffect(() => {
        let ws;
        let retryTimeout = null;
        let reconnectDelay = 2000; // 2 seconds between retries
        let stop = false;

        const connect = () => {
            if (stop) return;
            console.log("Connecting WebSocket...");
            setIsConnected(false);

            ws = new WebSocket(`${config.WS_URL}?api_key=${config.API_KEY}`);

            ws.onopen = () => {
                console.log("WebSocket connected");
                setIsConnected(true);
                reconnectDelay = 2000; // reset backoff after successful connection
            };

            ws.onmessage = (event) => {
                if (isPlayingRef.current) {
                    setIsPlaying(false);
                    stopScheduler();
                }

                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.layer === "input") {
                    if (endIdleTimerRef.current) {
                        clearTimeout(endIdleTimerRef.current);
                        endIdleTimerRef.current = null;
                    }

                    const activations = data.activation_data[0][0];
                    const inputCount = LAYERS[0].size;
                    const rows = Math.floor(Math.sqrt(inputCount));
                    const cols = Math.ceil(inputCount / rows);
                    const blockH = 28 / rows;
                    const blockW = 28 / cols;
                    const blockMeans = [];
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            let sum = 0,
                                count = 0;
                            const y0 = Math.floor(r * blockH),
                                y1 = Math.floor((r + 1) * blockH);
                            const x0 = Math.floor(c * blockW),
                                x1 = Math.floor((c + 1) * blockW);
                            for (let y = y0; y < y1; y++)
                                for (let x = x0; x < x1; x++) {
                                    sum += activations[y][x];
                                    count++;
                                }
                            blockMeans.push(sum / count);
                        }
                    }
                    const selected = blockMeans.slice(0, inputCount);
                    const normalized = selected.map((v) => (v + 1) / 2);
                    setInputActivations(normalized);
                    liveInputRef.current = normalized;
                } else if (data.layer === "layer_3") {
                    const arr = reduceConvActivations(data.activation_data[0], LAYERS[1].size);
                    setConv1Activations(arr);
                    liveC1Ref.current = arr;
                } else if (data.layer === "layer_9") {
                    const arr = reduceConvActivations(data.activation_data[0], LAYERS[2].size);
                    setConv2Activations(arr);
                    liveC2Ref.current = arr;
                } else if (data.layer === "layer_14") {
                    const arr = reduceVectorActivations(data.activation_data[0], LAYERS[3].size);
                    setFc1Activations(arr);
                    liveFc1Ref.current = arr;
                } else if (data.layer === "layer_17") {
                    const outArr = minMax01(data.activation_data[0]);
                    setOutputActivations(outArr);
                    liveOutRef.current = outArr;

                    if (endIdleTimerRef.current)
                        clearTimeout(endIdleTimerRef.current);
                    endIdleTimerRef.current = setTimeout(() => {
                        snapshotRef.current = {
                            input: [...liveInputRef.current],
                            conv1: [...liveC1Ref.current],
                            conv2: [...liveC2Ref.current],
                            fc1: [...liveFc1Ref.current],
                            output: [...liveOutRef.current],
                        };
                        setSnapshotVersion((v) => v + 1);
                        setIsPlaying(true);
                    }, END_IDLE_MS);
                }
            };

            ws.onclose = () => {
                console.log("WebSocket closed, retrying in", reconnectDelay, "ms");
                setIsConnected(false);
                if (!stop) {
                    retryTimeout = setTimeout(() => {
                        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000); // exponential backoff cap 10s
                        connect();
                    }, reconnectDelay);
                }
            };

            ws.onerror = (err) => {
                console.log("WebSocket error", err);
                ws.close();
            };
        };

        connect();

        return () => {
            stop = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            if (endIdleTimerRef.current) clearTimeout(endIdleTimerRef.current);
            stopScheduler();
            if (ws) ws.close();
        };
    }, []);

    // Start/restart scheduler when toggled or a new snapshot arrives
    useEffect(() => {
        stopScheduler();
        if (isPlaying && snapshotRef.current) startReplay();
        return stopScheduler;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, snapshotVersion]);

    /* ---------- Render prep ---------- */
    const svgWidth  = windowSize.width;
    const svgHeight = windowSize.height;

    const layerCount  = layers.length;
    const sidePadding = svgWidth * 0.04;
    const layerGap    = (svgWidth - sidePadding * 2) / (layerCount - 1);

    const inputNeuronCount = layers[0].size;
    const baseGap   = svgHeight / (inputNeuronCount);
    const neuronGap = baseGap * 0.5;

    const positions = layers.map((layer, layerIdx) => {
        const x = sidePadding + layerGap * layerIdx;
        const neuronCount = layer.size;
        const centralY = svgHeight / 2;

        let neuronPositions = Array.from({ length: neuronCount }).map((_, idx) => ({
            x, y: centralY + (idx - (neuronCount - 1) / 2) * neuronGap
        }));

        if (layerIdx === 0) {
            neuronPositions = [
                ...Array.from({ length: 8 }).map((_, i) => ({ x, y: centralY - (i + 1) * neuronGap })),
                ...Array.from({ length: 8 }).map((_, i) => ({ x, y: centralY + (i + 1) * neuronGap }))
            ];
        }
        return neuronPositions;
    });

    function getDisplayActivationsForLayer(layerIdx) {
        if (layerIdx === 0)   return inputActivations.map(v => Math.min(v * 30, 1));
        if (layerIdx === 1)   return conv1Activations;
        if (layerIdx === 2)   return conv2Activations;
        if (layerIdx === 3)   return fc1Activations;
        return outputActivations;
    }

    const edgeOpacitiesPerPair = [];
    for (let i = 0; i < layerCount - 1; i++) {
        const srcActs = getDisplayActivationsForLayer(i);
        const dstActs = getDisplayActivationsForLayer(i + 1);
        edgeOpacitiesPerPair.push(computeEdgeOpacitiesForPair(srcActs, dstActs));
    }

    const connections = [];
    for (let i = 0; i < layerCount - 1; i++) {
        const currentLayer = positions[i];
        const nextLayer    = positions[i + 1];
        const pairOpacity  = edgeOpacitiesPerPair[i];
        currentLayer.forEach(({ x: x1, y: y1 }, srcIdx) => {
            nextLayer.forEach(({ x: x2, y: y2 }, dstIdx) => {
                const dynamicOpacity = (pairOpacity[dstIdx]?.[srcIdx]) ?? 0;
                const opacity = Math.max(BASE_EDGE_OPACITY, dynamicOpacity);
                connections.push(
                    <line
                        key={`line-${i}-${x1}-${y1}-${x2}-${y2}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#333"
                        strokeWidth="1"
                        strokeOpacity={opacity}
                    />
                );
            });
        });
    }

    const neurons = [];
    positions.forEach((layerPositions, layerIdx) => {
        layerPositions.forEach(({ x, y }, neuronIdx) => {
            let b;
            if (layerIdx === 0)      b = Math.min(inputActivations[neuronIdx] * 30, 1);
            else if (layerIdx === 1) b = conv1Activations[neuronIdx] ?? 0;
            else if (layerIdx === 2) b = conv2Activations[neuronIdx] ?? 0;
            else if (layerIdx === 3) b = fc1Activations[neuronIdx] ?? 0;
            else                     b = outputActivations[neuronIdx] ?? 0;
            b = Math.max(MIN_NODE_BRIGHTNESS, Math.min(b, 1));
            const fill = `rgb(${b * 255}, ${b * 255}, ${b * 255})`;
            neurons.push(<circle key={`neuron-${layerIdx}-${neuronIdx}`} cx={x} cy={y} r={6} fill={fill} />);
        });
    });

    const outputLayerIndex = layers.length - 1;
    const outputLabels = positions[outputLayerIndex].map(({ x, y }, idx) => {
        // dynamically adjust x so labels never go offscreen
        const mobile = windowSize.width < 600;
        const labelX = mobile
            ? Math.min(x + 8, svgWidth * 0.95) // keep near right edge but visible
            : x + 20;

        const fontSize = mobile ? 10 : 14;

        return (
            <text
                key={`output-label-${idx}`}
                x={labelX}
                y={y + 4}
                fill="#fff"
                fontSize={fontSize}
                textAnchor="start"
            >
                {idx}
            </text>
        );
    });

    const separatorX = sidePadding + layerGap * 0;
    const separatorCircles = [
        { x: separatorX, y: svgHeight / 2 - neuronGap / 3 },
        { x: separatorX, y: svgHeight / 2 },
        { x: separatorX, y: svgHeight / 2 + neuronGap / 3 }
    ].map(({ x, y }, idx) => <circle key={`separator-${idx}`} cx={x} cy={y} r={2} fill="#fff" />);
    return (
        <div style={{
            position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh",
            backgroundColor: "black", display: "flex", justifyContent: "center", alignItems: "center"
        }}>
            <div
                style={{
                    width: "100vw",
                    height: "100vh",
                    overflow: "hidden",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center"
                }}
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        maxWidth: "100vw",
                        maxHeight: "100vh",
                    }}
                >
                    {connections}
                    {neurons}
                    {separatorCircles}
                    {outputLabels}
                </svg>
            </div>

            {/* Grad-CAM — BOTTOM RIGHT */}
            {gradcamUrl && (
                <div style={{
                    position: "fixed", right: 16, bottom: 16, width: 140,
                    backgroundColor: "rgba(0,0,0,0.6)", border: "1px solid #444",
                    borderRadius: 8, padding: 8, display: "flex",
                    flexDirection: "column", alignItems: "center", gap: 6,
                    zIndex: 9999, backdropFilter: "blur(2px)", pointerEvents: "none"
                }}>
                    <img
                        key={gradcamUrl}
                        src={gradcamUrl}
                        alt="Grad-CAM"
                        style={{ width: 120, height: 120, objectFit: "contain", borderRadius: 4, background: "#111" }}
                    />
                </div>
            )}

            <div
                style={{
                    position: 'fixed',
                    top: '1rem',
                    left: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: isConnected ? 'rgba(0, 128, 0, 0.5)' : 'rgba(128, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    zIndex: 9999,
                    pointerEvents: 'none'
                }}
            >
                {isConnected ? 'Connected' : 'Disconnected...'}
                {!isConnected && <div className="spinner" />}
            </div>

            <div
                style={{
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    width: 'min(240px, 30vw)',
                    pointerEvents: 'none' // wrapper intangible too
                }}
            >
                <Banner messages={messages} />
            </div>
        </div>
    );
};

export default Skeleton;
