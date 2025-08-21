import React, { useEffect, useState } from "react";

const Skeleton = () => {
  const rawLayers = [
    { name: "Input", size: 16 },
    { name: "Conv2d 1", size: 32 },
    { name: "Conv2d 2", size: 64 },
    { name: "Fc 1", size: 32 },
    { name: "Output", size: 10 }
  ];

  const layers = rawLayers.map(layer => ({
    ...layer,
    size: Math.min(layer.size, 32)
  }));

  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const [outputActivations, setOutputActivations] = useState(new Array(10).fill(0));
  const [inputActivations, setInputActivations] = useState(new Array(layers[0].size).fill(0));

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
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // not JSON (e.g. handshake text), ignore
        console.log("(WSMessage):", event.data);
        return;
      }
        if (data.layer === "layer_17") {
          console.log("processing output data!");
          processOutputLayerActivations(data.activation_data[0]);
        }
        if (data.layer === "input") {
          console.log("processing input data!");
          processInputLayerActivations(data.activation_data[0][0]);
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

  const processInputLayerActivations = (activations) => {
    const inputCount = layers[0].size;
    const rows = Math.floor(Math.sqrt(inputCount)), cols = Math.ceil(inputCount / rows);             // now exactly 16 blocks
    const blockH = 28 / rows;             // = 7
    const blockW = 28 / cols;             // = 7
    const blockMeans = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0, count = 0;
        const y0 = Math.floor(r * blockH);
        const y1 = Math.floor((r + 1) * blockH);
        const x0 = Math.floor(c * blockW);
        const x1 = Math.floor((c + 1) * blockW);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += activations[y][x];
            count++;
          }
        }
        blockMeans.push(sum / count);
      }
    }

    // normalize into [0…1]
    const selected = blockMeans.slice(0, inputCount);
    const normalized = selected.map(v => (v + 1) / 2);
    setInputActivations(normalized);
  }

  const svgWidth   = windowSize.width;
  const svgHeight  = windowSize.height;
  const leftOffset = 0;
  const topOffset  = 0;

  const layerCount = layers.length;
  const sidePadding = svgWidth * 0.04;
  const layerGap = (svgWidth - sidePadding * 2) / (layerCount - 1);// 5% on each side

  const inputNeuronCount = 16;
  const baseGap = svgHeight / (inputNeuronCount);
  const neuronGap = baseGap * 0.5;

  const positions = layers.map((layer, layerIdx) => {
    const x = sidePadding + layerGap * layerIdx;
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
      let brightness;
      if (layerIdx === 0) {
        brightness = Math.min(inputActivations[neuronIdx] * 30, 1);
      } else if (layerIdx === layers.length - 1) {
        brightness = outputActivations[neuronIdx];
      } else {
        brightness = 0.4;  // until Conv1 is hooked up
      }
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

  const separatorX = sidePadding + layerGap * 0;
  const separatorCircles = [
    { x: separatorX, y: svgHeight / 2 - neuronGap / 3 },
    { x: separatorX, y: svgHeight / 2 },
    { x: separatorX, y: svgHeight / 2 + neuronGap / 3 }
  ].map(({ x, y }, idx) => (
    <circle key={`separator-${idx}`} cx={x} cy={y} r={2} fill="#fff" />
  ));

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
        {outputLabels}
      </svg>
    </div>
  );
};

export default Skeleton;
