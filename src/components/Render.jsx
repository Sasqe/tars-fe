import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { debounce } from 'lodash';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import '../styles/Render.css';


const layerConfig = [
    { name: 'input', size: 28 },
    { name: 'conv1', size: Math.min(32, 16) },
    { name: 'conv2', size: Math.min(32, 32) },
    { name: 'conv3', size: Math.min(32, 64) },
    { name: 'fc1', size: Math.min(32, 128) },
    { name: 'output', size: 10 }
];

const Node = React.memo(({ position, intensity }) => {
    const color = useMemo(() => `rgb(${100 + intensity * 155}, ${100 + intensity * 155}, ${100 + intensity * 155})`, [intensity]);

    return (
        <mesh position={position}>
            <sphereGeometry args={[0.4, 6, 6]} />
            <meshStandardMaterial color={color} />
        </mesh>
    );
});

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

const SocketOverlay = ({ isConnected, toggleConnection }) => {
    return (
        <div
            className={`socket-overlay ${isConnected ? 'connected' : 'disconnected'}`}
            onClick={toggleConnection}
        >
            {isConnected ? '✔ Connected' : '❗ Disconnected'}
        </div>
    );
};

const Skeleton = () => {
    const [nodes, setNodes] = useState([]);
    const [connections, setConnections] = useState([]);
    const [activity, setActivity] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);

    const updateActivity = debounce((layer, data) => {
        setActivity(prev => ({ ...prev, [layer]: data }));
    }, 100);

    const connectWebSocket = useCallback(() => {
        if (1==1) return;

        const ws = new WebSocket('ws://localhost:8000');
        wsRef.current = ws;

        ws.onopen = () => setIsConnected(true);
        ws.onclose = () => {
            setIsConnected(false);
            wsRef.current = null;
        };
        ws.onerror = () => setIsConnected(false);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const { layer, activation_data } = data;

                if (layer && activation_data) {
                    updateActivity(layer, activation_data);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
    }, [updateActivity]);

    const disconnectWebSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
            setIsConnected(false);
        }
    }, []);

    const toggleConnection = () => {
        if (isConnected) {
            disconnectWebSocket();
        } else {
            connectWebSocket();
        }
    };

    useEffect(() => {
        connectWebSocket();
        return () => disconnectWebSocket();
    }, [connectWebSocket, disconnectWebSocket]);

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
                newNodes.push({ id: `${layer.name}-${i}`, position: [x, y, z] });
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
                        newConnections.push({ start: startNode.position, end: endNode.position });
                    }
                }
            }
        }

        setNodes(newNodes);
        setConnections(newConnections);
    }, []);


    const memoizedNodes = useMemo(() => nodes.map(node => (
        <Node
            key={node.id}
            position={node.position}
            intensity={(activity[node.id] || 0) * 0.8}
        />
    )), [nodes, activity]);

    const memoizedConnections = useMemo(() => connections.map((conn, index) => (
        <Connection
            key={index}
            start={conn.start}
            end={conn.end}
            opacity={(activity[`${conn.start}-${conn.end}`] || 0.1) * 0.8}
        />
    )), [connections, activity]);

    return (
        <div className="render-background">
            <MetricsOverlay nodes={nodes} connections={connections} />
            <SocketOverlay isConnected={isConnected} toggleConnection={toggleConnection} />
            <div className="skeleton-container">
                <Canvas camera={{ position: [0, 0, 70], fov: 50 }} frameloop="demand">
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