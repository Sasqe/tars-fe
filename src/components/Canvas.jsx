import React, {useRef, useState, useEffect, useCallback} from 'react';
import '../styles/Canvas.css';
import config from "../config";

const Canvas = ({ onResult }) => {
    const [visible, setVisible] = useState(false);
    const holdTimeout = useRef(null);
    const isHolding = useRef(false);
    const canvasRef = useRef(null);
    const drawing = useRef(false);
    const ctx = useRef(null);

    const [canvasSize, setCanvasSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    });

    useEffect(() => {
        const handleResize = () => {
            setCanvasSize({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (canvasRef.current) {
            const initContext = canvasRef.current.getContext('2d');
            initContext.strokeStyle = 'white';
            initContext.lineWidth = 4;
            initContext.lineJoin = 'round';
            initContext.lineCap = 'round';
        }
    }, [canvasSize]);

    const deactivateCanvas = useCallback(() => {
        setVisible(false);
        if (drawing.current) {
            drawing.current = false;
            ctx.current = null;
        }
        isHolding.current = false;
        clearTimeout(holdTimeout.current);
    }, []);

    const submitDrawing = useCallback(() => {
        if (!canvasRef.current) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;
        const tempContext = tempCanvas.getContext('2d');

        tempContext.fillStyle = 'black';
        tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempContext.drawImage(canvasRef.current, 0, 0);

        tempCanvas.toBlob((blob) => {
            if (blob) {
                const formData = new FormData();
                formData.append('file', blob, 'drawing.png');

                fetch(`${config.ASK_URL}`, {
                    method: 'POST',
                    headers: {
                        "x-api-key": config.API_KEY
                    },
                    body: formData
                })
                    .then(response => response.json())
                    .then(data => {
                        console.log('API Response:', data);
                        onResult?.(data);
                    })
                    .catch(error => {
                        console.error('Error submitting drawing:', error);
                        onResult?.({ error: String(error) });
                    });
            }
        }, 'image/png');
    }, [onResult]);

    const startDraw = (x, y) => {
        if (canvasRef.current) {
            ctx.current = canvasRef.current.getContext('2d');
            ctx.current.strokeStyle = 'white';
            ctx.current.lineWidth = 4;
            ctx.current.lineJoin = 'round';
            ctx.current.lineCap = 'round';

            drawing.current = true;
            ctx.current.beginPath();
            ctx.current.moveTo(x, y);
        }
    };

    const continueDraw = (x, y) => {
        if (drawing.current && ctx.current) {
            ctx.current.lineTo(x, y);
            ctx.current.stroke();
        }
    };

    // --- Mouse Handlers ---
    const handleMouseDown = (e) => {
        isHolding.current = true;
        holdTimeout.current = setTimeout(() => {
            if (isHolding.current) {
                setVisible(true);
                const rect = canvasRef.current.getBoundingClientRect();
                startDraw(e.clientX - rect.left, e.clientY - rect.top);
            }
        }, 200);
    };

    const handleMouseMove = (e) => {
        if (isHolding.current) {
            clearTimeout(holdTimeout.current);
            isHolding.current = false;
        }
        if (drawing.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            continueDraw(e.clientX - rect.left, e.clientY - rect.top);
        }
    };

    const handleMouseUp = () => {
        if (drawing.current) {
            submitDrawing();
        }
        deactivateCanvas();
    };

    // --- Touch Handlers ---
    const handleTouchStart = (e) => {
        e.preventDefault();
        setVisible(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        startDraw(touch.clientX - rect.left, touch.clientY - rect.top);
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        continueDraw(touch.clientX - rect.left, touch.clientY - rect.top);
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        if (drawing.current) {
            submitDrawing();
        }
        deactivateCanvas();
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
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <canvas
                ref={canvasRef}
                className={`canvas-wrapper ${visible ? 'visible' : ''}`}
                width={canvasSize.width}
                height={canvasSize.height}
            />
        </div>
    );
};

export default React.memo(Canvas);