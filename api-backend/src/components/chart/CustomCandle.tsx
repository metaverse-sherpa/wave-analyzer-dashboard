import React from 'react';
import { Rectangle, Line } from 'recharts';

interface HighLowLines {
  high: number;
  low: number;
  stroke: string;
}

interface CustomCandleProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  highLowLines: HighLowLines;
}

const CustomCandle: React.FC<CustomCandleProps> = (props) => {
  const { x, y, width, height, fill, stroke, highLowLines } = props;
  const centerX = x + width / 2;

  return (
    <>
      {/* Main candle body */}
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={Math.max(1, height)} // Ensure minimum height of 1px
        fill={fill}
        stroke={stroke}
      />
      
      {/* High-low lines (wicks) */}
      <Line
        x1={centerX}
        y1={y}
        x2={centerX}
        y2={highLowLines.high}
        stroke={highLowLines.stroke}
        strokeWidth={1}
      />
      <Line
        x1={centerX}
        y1={y + height}
        x2={centerX}
        y2={highLowLines.low}
        stroke={highLowLines.stroke}
        strokeWidth={1}
      />
    </>
  );
};

export default CustomCandle;
