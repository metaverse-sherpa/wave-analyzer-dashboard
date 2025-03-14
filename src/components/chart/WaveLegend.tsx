import React from 'react';
import { getWaveColor } from './waveChartUtils';

interface WaveLegendProps {
  waveNumbers: (string | number)[];
  compact?: boolean;
}

const WaveLegend: React.FC<WaveLegendProps> = ({ waveNumbers, compact = false }) => {
  return (
    <div className={`flex gap-2 ${compact ? 'flex-wrap' : 'flex-row'}`}>
      {waveNumbers.map(num => (
        <div key={num} className="flex items-center">
          <div 
            className="w-3 h-3 rounded-full mr-1" 
            style={{ backgroundColor: getWaveColor(num) }}
          ></div>
          <span className="text-xs">Wave {num}</span>
        </div>
      ))}
    </div>
  );
};

export default WaveLegend;