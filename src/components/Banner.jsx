import React from 'react';
const Banner = () => {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      width: '100%',
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      textAlign: 'center',
    }}>
      <p>Chat Bot: "This is where the bot will speak."</p>
    </div>
  );
};

export default Banner;
