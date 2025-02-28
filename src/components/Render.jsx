import React, {useEffect, useMemo, useRef, useState} from 'react';
import {debounce} from 'lodash';
import {Canvas} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import '../styles/Render.css';


const layerConfig = [
    { name: 'input', size: 28, wsLayer: 'input' },  // **Mini 28×28 grid**
    { name: 'conv1', size: Math.min(32, 16), wsLayer: 'layer_0' },
    { name: 'conv2', size: Math.min(32, 32), wsLayer: 'layer_4' },
    { name: 'conv3', size: Math.min(32, 64), wsLayer: 'layer_7' },
    { name: 'conv4', size: Math.min(32, 64), wsLayer: 'layer_10' },
    { name: 'fc1', size: Math.min(32, 32), wsLayer: 'layer_15' },  // Fully Connected
    { name: 'output', size: 10, wsLayer: 'layer_18' }  // **Final 10 output nodes**
];


const flattenActivations = (data, shape) => {
    if (!Array.isArray(data)) return [];

    if (shape.length === 4) {
        // Conv/Feature Map: [Batch, Channels, Height, Width]
        const [batch, channels, height, width] = shape;
        return data.flat(batch).flat(channels).flat(height).flat(width);
    } else if (shape.length === 2) {
        // Fully Connected Layer: [Batch, Neurons]
        const [batch, neurons] = shape;
        return data.flat(batch).flat(neurons);
    } else if (shape.length === 3) {
        // Rare cases like LSTM: [Batch, Time, Features]
        const [batch, time, features] = shape;
        return data.flat(batch).flat(time).flat(features);
    } else {
        return data.flat();
    }
};


const Node = React.memo(({ position, intensity }) => (
    <mesh position={position}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color={`rgb(${100 + intensity * 155}, ${100 + intensity * 155}, ${100 + intensity * 155})`} />
    </mesh>
));

const Connection = React.memo(({ start, end, opacity }) => (
    <line>
        <bufferGeometry attach="geometry">
            <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([...start, ...end])}
                count={2}
                itemSize={3}
            />
        </bufferGeometry>
        <lineBasicMaterial color="#222222" opacity={0.5 + (opacity * 0.5)} transparent />
    </line>
));

const MetricsOverlay = ({ nodes, connections }) => {
    const totalHiddenNeurons = 23552;
    const totalSynapses = 4641024;

    const metrics = {
        type: 'Convolutional',
        dataset: 'MNIST',
        hiddenNeurons: totalHiddenNeurons,
        synapses: totalSynapses,
        synapsesShown: connections.length,
        neuronsShown: nodes.length
    };

    return (
        <div className="metrics-overlay">
            <p>Type: {metrics.type}</p>
            <p>Data Set: {metrics.dataset}</p>
            <p>Hidden Neurons: {metrics.hiddenNeurons}</p>
            <p>Synapses: {metrics.synapses}</p>
            <p>Synapses shown: {metrics.synapsesShown}</p>
            <p>Neurons shown: {metrics.neuronsShown}</p>
        </div>
    );
};

const SocketOverlay = ({ isConnected }) => (
    <div className={`socket-overlay ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '✔ Connected' : '❗ Disconnected'}
    </div>
);

const Skeleton = () => {
    const [nodes, setNodes] = useState([]);
    const [connections, setConnections] = useState([]);
    const [activity, setActivity] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);

    const updateActivity = debounce((layer, data) => {
        setActivity(prev => ({ ...prev, [layer]: data }));
    }, 20);

    useEffect(() => {
        if (wsRef.current) return;

        const ws = new WebSocket('ws://localhost:8000/ws');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ WebSocket connection opened');
            setIsConnected(true);
        };

        ws.onclose = () => {
            console.log('❌ WebSocket connection closed');
            setIsConnected(false);
            wsRef.current = null;
        };

        ws.onerror = (error) => {
            console.error('⚠️ WebSocket error:', error);
            setIsConnected(false);
        };

       ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const { layer, activation_data, activation_shape } = data;
                console.log("recieved data:", {data});
                if (layer && activation_data && activation_shape) {

                    // Flatten based on shape
                    const flattenedData = flattenActivations(activation_data, activation_shape);

                    // Update activity
                    updateActivity(layer, flattenedData);
                }
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
            }
       };

        return () => {
            console.log('🔄 Cleaning up WebSocket connection');
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [updateActivity]);

    useEffect(() => {
        const newNodes = [];
        const newConnections = [];
        const layerSpacing = 15;
        const nodeSpacing = 2;

        const totalWidth = (layerConfig.length - 1) * layerSpacing;
        const xOffset = -totalWidth / 2;

        layerConfig.forEach((layer, layerIndex) => {
            const yOffset = (layer.size - 1) * nodeSpacing * 0.5;

            for (let i = 0; i < layer.size; i++) {
                const x = layerIndex * layerSpacing + xOffset;
                const y = i * nodeSpacing - yOffset;
                const z = 0;
                const wsIndex = layer.name === 'input' ? i : i * Math.floor(784 / layer.size);
                newNodes.push({ id: `${layer.name}-${i}`, position: [x, y, z], wsIndex, layer: layer.wsLayer });
            }
        });

        for (let i = 0; i < layerConfig.length - 1; i++) {
            const currentLayer = layerConfig[i];
            const nextLayer = layerConfig[i + 1];

            for (let j = 0; j < currentLayer.size; j++) {
                for (let k = 0; k < nextLayer.size; k++) {
                    const startNode = newNodes.find(n => n.id === `${currentLayer.name}-${j}`);
                    const endNode = newNodes.find(n => n.id === `${nextLayer.name}-${k}`);

                    if (startNode && endNode) {
                        newConnections.push({
                            start: startNode.position,
                            end: endNode.position,
                            startIndex: startNode.wsIndex,
                            endIndex: endNode.wsIndex,
                            startLayer: startNode.layer,
                            endLayer: endNode.layer
                        });
                    }
                }
            }
        }

        setNodes(newNodes);
        setConnections(newConnections);
    }, []);

    const memoizedNodes = useMemo(() => nodes.map(node => {
    const layerData = activity[node.layer] || [];
    const intensity = layerData[node.wsIndex] ?? 0.5;

    return (
        <Node
            key={node.id}
            position={node.position}
            intensity={Math.min(1, Math.max(0, intensity))}
        />
        );
    }), [nodes, activity]);


    const memoizedConnections = useMemo(() => connections.map((conn, index) => {
        const startLayerData = activity[conn.startLayer] || [];
        const endLayerData = activity[conn.endLayer] || [];

        const startIntensity = startLayerData[conn.startIndex] ?? 0.5;
        const endIntensity = endLayerData[conn.endIndex] ?? 0.5;

        const opacity = Math.min(1, Math.max(0, (startIntensity + endIntensity) / 2));

        return (
            <Connection
                key={index}
                start={conn.start}
                end={conn.end}
                opacity={opacity}
            />
        );
    }), [connections, activity]);


    return (
        <div className="render-background">
            <MetricsOverlay nodes={nodes} connections={connections} />
            <SocketOverlay isConnected={isConnected} />
            <div className="skeleton-container">
                <Canvas camera={{ position: [0, 0, 70], fov: 50 }} frameloop='demand'>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} />
                    {memoizedNodes}
                    {memoizedConnections}
                    <OrbitControls enableDamping={true} dampingFactor={0.1} />
                </Canvas>
            </div>
        </div>
    );
};

export default React.memo(Skeleton);