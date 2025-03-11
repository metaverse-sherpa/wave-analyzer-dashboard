import React from 'react';
import { getWaveColor } from './waveChartUtils';

interface WaveLegendProps {
  waveNumbers: (string | number)[];
  compact?: boolean;
}

const WaveLegend: React.FC<WaveLegendProps> = ({ waveNumbers, compact = false }) => {
  return (
    <div className={`flex ${compact ? 'flex-wrap justify-center gap-2' : 'flex-col gap-1'}`}>
      {waveNumbers.map(number => (
        <div key={number} className="flex items-center">
          <div 
            className="w-3 h-3 rounded-full mr-1" 
            style={{ backgroundColor: getWaveColor(number) }}
          ></div>
          <span className="text-xs">
            Wave {number} - {typeof number === 'number' ? 
              (number % 2 === 1 ? 'Impulse' : 'Corrective') : 
              (number === 'B' ? 'Corrective' : 'Impulse-like')}
          </span>
        </div>
      ))}
    </div>
  );
};

export default WaveLegend;