import React, {useRef, useState, useEffect} from 'react';
import '../styles/Canvas.css';

const Canvas = () => {
    const [visible, setVisible] = useState(false);
    const holdTimeout = useRef(null);
    const isHolding = useRef(false);
    const canvasRef = useRef(null);
    const drawing = useRef(false);
    const ctx = useRef(null);

    const handleMouseDown = (e) => {
        isHolding.current = true;
        holdTimeout.current = setTimeout(() => {
            if (isHolding.current) {
                setVisible(true);
                if (canvasRef.current) {
                    ctx.current = canvasRef.current.getContext('2d');
                    ctx.current.strokeStyle = 'white';
                    ctx.current.lineWidth = 2;
                    ctx.current.lineJoin = 'round';
                    ctx.current.lineCap = 'round';
                    drawing.current = true;
                    ctx.current.beginPath();
                    const rect = canvasRef.current.getBoundingClientRect();
                    ctx.current.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                }
            }
        }, 200); // 200ms hold threshold
    };

    const handleMouseMove = (e) => {
        if (isHolding.current) {
            clearTimeout(holdTimeout.current);
            isHolding.current = false; // Cancel activation if mouse moves during hold
        }
        if (drawing.current && ctx.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            ctx.current.lineTo(e.clientX - rect.left, e.clientY - rect.top);
            ctx.current.stroke();
        }
    };

    const handleMouseUp = () => {
        clearTimeout(holdTimeout.current);
        isHolding.current = false;
        setVisible(false);
        if (drawing.current) {
            drawing.current = false;
            ctx.current = null;
        }
    };

    useEffect(() => {
        if (!visible && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }, [visible]);

    return (
        <div
            className="canvas-container"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            <canvas
                ref={canvasRef}
                className={`canvas-wrapper ${visible ? 'visible' : ''}`}
                width={window.innerWidth}
                height={window.innerHeight}
            ></canvas>
        </div>
    );
};

export default Canvas;