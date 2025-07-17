import React, { useEffect, useState } from "react";

const Skeleton = () => {
  const rawLayers = [
    { name: "Input", size: 14 },
    { name: "Conv2d 1", size: 16 },
    { name: "Conv2d 2", size: 32 },
    { name: "Conv2d 3", size: 64 },
    { name: "Conv2d 4", size: 64 },
    { name: "Fc 1", size: 32 },
    { name: "Output", size: 10 }
  ];

  const layers = rawLayers.map(layer => ({
    ...layer,
    size: Math.min(layer.size, 16)
  }));

  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const [outputActivations, setOutputActivations] = useState(new Array(10).fill(0));

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws"); // socket endpoint
    try {
      ws.onopen = () => {
        console.log("connected");
      }
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.layer === "layer_17") {
          console.log("processing output data!");
          processOutputLayerActivations(data.activation_data[0]);
        }
      };
    } catch (error) {
    console.log("error");
    }

    return () => {
      ws.close();
    };
  }, []);

  const processOutputLayerActivations = (activations) => {
    const maxActivation = Math.max(...activations);
    const minActivation = Math.min(...activations);

    const normalizedActivations = activations.map(value => {
      return (value - minActivation) / (maxActivation - minActivation);
    });

    setOutputActivations(normalizedActivations);
  };

  const svgWidth = windowSize.width * 0.8;
  const svgHeight = windowSize.height * 0.8;
  const leftOffset = (windowSize.width - svgWidth) / 2;
  const topOffset = (windowSize.height - svgHeight) / 2;

  const layerCount = layers.length;
  const layerGap = svgWidth / (layerCount + 1);

  const inputNeuronCount = 16;
  const baseGap = svgHeight / (inputNeuronCount + 1);
  const neuronGap = baseGap * 0.9;

  const positions = layers.map((layer, layerIdx) => {
    const x = layerGap * (layerIdx + 1);
    const neuronCount = layer.size;
    const centralY = svgHeight / 2;
    let neuronPositions = Array.from({ length: neuronCount }).map((_, neuronIdx) => {
      return { x, y: centralY + (neuronIdx - (neuronCount - 1) / 2) * neuronGap };
    });

    if (layerIdx === 0) {
      neuronPositions = [
        ...Array.from({ length: 8 }).map((_, i) => ({ x, y: centralY - (i + 1) * neuronGap })),
        ...Array.from({ length: 8 }).map((_, i) => ({ x, y: centralY + (i + 1) * neuronGap }))
      ];
    }
    return neuronPositions;
  });

  let connections = [];
  for (let i = 0; i < layerCount - 1; i++) {
    const currentLayer = positions[i];
    const nextLayer = positions[i + 1];
    currentLayer.forEach(({ x: x1, y: y1 }) => {
      nextLayer.forEach(({ x: x2, y: y2 }) => {
        connections.push(
          <line
            key={`line-${i}-${x1}-${y1}-${x2}-${y2}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#333"
            strokeWidth="1"
          />
        );
      });
    });
  }

  let neurons = [];
  positions.forEach((layerPositions, layerIdx) => {
    layerPositions.forEach(({ x, y }, neuronIdx) => {
      const brightness = layerIdx === layers.length - 1 ? outputActivations[neuronIdx] : 0.4;
      const fillColor = `rgb(${brightness * 255}, ${brightness * 255}, ${brightness * 255})`;

      neurons.push(
        <circle
          key={`neuron-${layerIdx}-${neuronIdx}`}
          cx={x}
          cy={y}
          r={6}
          fill={fillColor}
        />
      );
    });
  });

  const outputLayerIndex = layers.length - 1;
  const outputLayerPositions = positions[outputLayerIndex];

  const outputLabels = outputLayerPositions.map(({ x, y }, idx) => (
    <text
      key={`output-label-${idx}`}
      x={x + 20}
      y={y + 4}
      fill="#fff"
      fontSize="14"
      textAnchor="start"
    >
      {idx}
    </text>
  ));

  const separatorCircles = [
    { x: layerGap, y: svgHeight / 2 - neuronGap / 3},
    { x: layerGap, y: svgHeight / 2 },
    { x: layerGap, y: svgHeight / 2 + neuronGap / 3 }
  ].map(({ x, y }, idx) => (
    <circle key={`separator-${idx}`} cx={x} cy={y} r={2} fill="#fff" />
  ));

  const labels = layers.map((layer, layerIdx) => {
    const x = layerGap * (layerIdx + 1);
    return (
      <text
        key={`label-${layerIdx}`}
        x={x}
        y={20}
        fill="#777"
        fontSize="14"
        textAnchor="middle"
      >
        {layer.name}
      </text>
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "black",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }}
    >
      <svg width={svgWidth} height={svgHeight} style={{ position: "absolute", left: leftOffset, top: topOffset }}>
        {connections}
        {neurons}
        {separatorCircles}
        {labels}
        {outputLabels}
      </svg>
    </div>
  );
};

export default Skeleton;
