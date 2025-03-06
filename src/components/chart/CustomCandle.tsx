
import React from 'react';

interface CustomCandleProps {
  x: number;
  y: number;
  width: number;
  height: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

const CustomCandle: React.FC<CustomCandleProps> = ({ x, y, width, height, open, close, high, low }) => {
  const isUp = close >= open;
  
  return (
    <g>
      {/* Candle body */}
      <rect
        x={x - width / 2}
        y={isUp ? y : y + height}
        width={width}
        height={Math.abs(height) || 1}
        fill={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
      />
      
      {/* Upper wick */}
      <line
        x1={x}
        y1={isUp ? y : y + height}
        x2={x}
        y2={y - high}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        strokeWidth={1}
      />
      
      {/* Lower wick */}
      <line
        x1={x}
        y1={isUp ? y + height : y}
        x2={x}
        y2={y + low}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        strokeWidth={1}
      />
    </g>
  );
};

export default CustomCandle;
