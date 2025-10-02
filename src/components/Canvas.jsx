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

  // Track canvas dimensions in state
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Update state on window resize so the <canvas> re-renders with new size
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

  // Re-initialize context defaults whenever the canvas is re-mounted or resized
  useEffect(() => {
    if (canvasRef.current) {
      const initContext = canvasRef.current.getContext('2d');
      // You can set any "default" styles here if you'd like:
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

    // Create a temporary canvas with a black background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasRef.current.width;
    tempCanvas.height = canvasRef.current.height;
    const tempContext = tempCanvas.getContext('2d');

    // Fill with black background
    tempContext.fillStyle = 'black';
    tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw the current canvas on top (white drawing)
    tempContext.drawImage(canvasRef.current, 0, 0);

    // Convert to PNG and send to API
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

  const handleMouseDown = (e) => {
    isHolding.current = true;
    // Wait 200ms to see if user is "holding"
    holdTimeout.current = setTimeout(() => {
      if (isHolding.current) {
        setVisible(true);
        if (canvasRef.current) {
          // Grab new 2D context and set properties
          ctx.current = canvasRef.current.getContext('2d');
          ctx.current.strokeStyle = 'white';
          ctx.current.lineWidth = 4;
          ctx.current.lineJoin = 'round';
          ctx.current.lineCap = 'round';

          drawing.current = true;
          ctx.current.beginPath();
          // Move to initial mouse position
          const rect = canvasRef.current.getBoundingClientRect();
          ctx.current.moveTo(e.clientX - rect.left, e.clientY - rect.top);

        }
      }
    }, 200);
  };

  const handleMouseMove = (e) => {
    if (isHolding.current) {
      // If the mouse moved during the hold time, cancel the hold
      clearTimeout(holdTimeout.current);
      isHolding.current = false;
    }
    // If actively drawing, stroke the line
    if (drawing.current && ctx.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      ctx.current.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.current.stroke();
    }
  };

  const handleMouseUp = () => {
    if (drawing.current) {
      submitDrawing();
    }
    deactivateCanvas();
  };

  const handleMouseLeaveWindow = useCallback(() => {
    if (drawing.current) {
      deactivateCanvas();
    }
  }, [deactivateCanvas]);

  // If the mouse goes outside the browser window, shut down
  useEffect(() => {
    const handleWindowMouseMove = (e) => {
      const { clientX, clientY } = e;
      if (
        clientX <= 0 ||
        clientY <= 0 ||
        clientX >= window.innerWidth ||
        clientY >= window.innerHeight
      ) {
        handleMouseLeaveWindow();
      }
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
    };
  }, [handleMouseLeaveWindow]);

  // Clear the canvas whenever we hide it
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
        width={canvasSize.width}
        height={canvasSize.height}
      />
    </div>
  );
};

export default React.memo(Canvas);