import React, {useEffect, useMemo, useRef, useState} from 'react';
import {debounce} from 'lodash';
import {Canvas} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import '../styles/Render.css';


const layerConfig = [
    { name: 'input', size: 28, wsLayer: 'input' },
    { name: 'conv1', size: Math.min(32, 16), wsLayer: 'layer_3' },
    { name: 'conv2', size: Math.min(32, 32), wsLayer: 'layer_7' },
    { name: 'conv3', size: Math.min(32, 64), wsLayer: 'layer_10' },
    { name: 'conv4', size: Math.min(32, 64), wsLayer: 'layer_15' },
    { name: 'fc1', size: Math.min(32, 128), wsLayer: 'layer_19' },
    { name: 'output', size: 10, wsLayer: 'layer_19' }
];

const THRESHOLD = 0.2;

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
    const [isInteracting, setIsInteracting] = useState(false);
    const wsRef = useRef(null);

    const updateActivity = debounce((layer, data) => {
        setActivity(prev => ({ ...prev, [layer]: data }));
    }, 100);

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
            if (!event.data.startsWith('{')) {
                return;
            }
            try {
                const data = JSON.parse(event.data);
                const { layer, activation_data } = data;

                if (layer && activation_data) {
                    console.log(`📡 Activation received for layer: ${layer}`);
                    updateActivity(layer, activation_data);
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
        let intensity = 0.5;
        if (node.layer === 'input' && activity['input']) {
            const flatData = activity['input'].flat(3);
            intensity = (flatData[node.wsIndex] || 0.5) * 10; // inflate the intensity to know for sure which activations are mapped
        } else {
            intensity = (activity[node.layer]?.[0]?.[node.wsIndex] || 0.5);
        }
        return (
            <Node
                key={node.id}
                position={node.position}
                intensity={intensity}
            />
        );
    }), [nodes, activity]);

    const memoizedConnections = useMemo(() => connections.map((conn, index) => {
        const startIntensity = (activity[conn.startLayer]?.[0]?.[conn.startIndex] || 0.5);
        const endIntensity = (activity[conn.endLayer]?.[0]?.[conn.endIndex] || 0.5);
        const opacity = (startIntensity + endIntensity) / 2;
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
                <Canvas camera={{ position: [0, 0, 70], fov: 50 }} frameloop={isInteracting ? 'always' : 'demand'}>
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