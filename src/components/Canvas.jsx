import React, {useRef, useState} from 'react';
import '../styles/Canvas.css';

const Canvas = () => {
    const [visible, setVisible] = useState(false);
    const holdTimeout = useRef(null);
    const isHolding = useRef(false);

    const handleMouseDown = () => {
        isHolding.current = true;
        holdTimeout.current = setTimeout(() => {
            if (isHolding.current) {
                setVisible(true);
            }
        }, 200); // 200ms hold threshold
    };

    const handleMouseMove = () => {
        if (isHolding.current) {
            clearTimeout(holdTimeout.current);
            isHolding.current = false; // Cancel activation if mouse moves during hold
        }
    };

    const handleMouseUp = () => {
        clearTimeout(holdTimeout.current);
        isHolding.current = false;
        setVisible(false);
    };

    return (
        <div
            className="canvas-container"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            <div className={`canvas-wrapper ${visible ? 'visible' : ''}`}></div>
        </div>
    );
};

export default Canvas;
