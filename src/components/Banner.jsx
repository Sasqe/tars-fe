import React, { useEffect, useState, useRef } from 'react';

const Banner = ({ messages, typingSpeed = 25 }) => {
    const [displayedMessages, setDisplayedMessages] = useState([]);
    const [currentTyping, setCurrentTyping] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!messages || messages.length === 0) return;

        const latest = messages[messages.length - 1];
        let i = 0;
        setCurrentTyping('');
        const interval = setInterval(() => {
            setCurrentTyping(latest.slice(0, i + 1));
            i++;
            if (i >= latest.length) {
                clearInterval(interval);
                setDisplayedMessages(prev => [...prev, latest]);
                setCurrentTyping('');
            }
        }, typingSpeed);
        return () => clearInterval(interval);
    }, [messages, typingSpeed]);

    // auto-scroll to bottom when messages or typing changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [displayedMessages, currentTyping]);

    return (
        <div
            ref={scrollRef}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                overflowY: 'auto',
                maxHeight: 200,
                maxWidth: 240,
                scrollbarWidth: 'none', /* Firefox */
                msOverflowStyle: 'none', /* IE/Edge */
                pointerEvents: 'none'
            }}
        >
            {/* hide scroll bar in WebKit */}
            <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>

            {displayedMessages.map((msg, idx) => (
                <div
                    key={idx}
                    style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.3)',
                        backdropFilter: 'blur(4px)',
                        color: '#fff',
                        wordWrap: 'break-word',
                    }}
                >
                    {msg}
                </div>
            ))}

            {currentTyping && (
                <div
                    style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.3)',
                        backdropFilter: 'blur(4px)',
                        color: '#fff',
                        wordWrap: 'break-word',
                    }}
                >
                    {currentTyping}
                </div>
            )}
        </div>
    );
};

export default Banner;
