import React, { useEffect, useRef } from 'react';
import anime from 'animejs/lib/anime.es.js';
import '../styles/Canvas.css';

const Canvas = () => {
  const wrapperRef = useRef(null);
  let columns = 0;
  let rows = 0;
  let toggled = true;
  let holdTimeout = null;
  let isHolding = false;
  let successfulHold = false;

  useEffect(() => {
    const toggle = () => {
      toggled = !toggled;
      document.body.classList.toggle('toggled', toggled);
    };

    const handleOnHold = (index) => {
      successfulHold = true;
      toggle();
      anime({
        targets: '.tile',
        opacity: toggled ? 0 : 1,
        delay: anime.stagger(10, {
          grid: [columns, rows],
          from: index,
        }),
        duration: 50, // Smooth animation
        easing: 'easeInOutQuad',
      });
    };
    const activateTile = (tile) => {
      if (!tile.classList.contains('active')) {
        tile.classList.add('active');
      }
    };
    const clearActiveTiles = () => {
      const activeTiles = wrapperRef.current.querySelectorAll('.tile.active');
      activeTiles.forEach((tile) => tile.classList.remove('active'));
    };
    const createTile = (index) => {
      const tile = document.createElement('div');
      tile.classList.add('tile');
      tile.style.opacity = toggled ? 0 : 1;

      tile.onmousedown = (e) => {
        successfulHold = false;
        isHolding = true;

        holdTimeout = setTimeout(() => {
          if (isHolding) handleOnHold(index);
        }, 200); // 200ms hold delay

        // Prevent default drag behavior
        e.preventDefault();
      };

      tile.onmousemove = (e) => {
        if (isHolding) {
          clearTimeout(holdTimeout);
          isHolding = false; // Cancel hold if mouse moves
        }
        if (!isHolding && !toggled) {
          activateTile(tile);
        }
      };

      tile.onmouseup = (e) => {
        clearTimeout(holdTimeout);
        if (successfulHold) {
          handleOnHold(index); // Toggle back on release after a successful hold
        }
        isHolding = false;

        clearActiveTiles(); // Reset grid on mouse release
        // Prevent default drag behavior
        e.preventDefault();
      };

      tile.onmouseleave = (e) => {
        clearTimeout(holdTimeout);
        isHolding = false; // Cancel hold on mouse leave

        // Prevent default drag behavior
        e.preventDefault();
      };

      // Prevent drag behavior on dragstart
      tile.ondragstart = (e) => e.preventDefault();

      return tile;
    };

    const createTiles = (quantity) => {
      Array.from(Array(quantity)).forEach((_, index) => {
        wrapperRef.current.appendChild(createTile(index));
      });
    };

    const createGrid = () => {
      wrapperRef.current.innerHTML = '';
      const size = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size'));
      columns = Math.floor(document.body.clientWidth / size);
      rows = Math.floor(document.body.clientHeight / size);
      wrapperRef.current.style.setProperty('--columns', columns);
      wrapperRef.current.style.setProperty('--rows', rows);
      createTiles(columns * rows);
    };

    createGrid();
    window.onresize = createGrid;

    return () => {
      clearTimeout(holdTimeout); // Cleanup
      window.onresize = null;
    };
  }, []);

  return <div id="tiles" ref={wrapperRef}></div>;
};

export default Canvas;
