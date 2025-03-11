import { Wave } from "@/utils/elliottWaveAnalysis";
import { StockHistoricalData } from "@/services/yahooFinanceService";

// Get color for a specific wave number/letter
export const getWaveColor = (waveNumber: string | number): string => {
  const waveColors: Record<string | number, string> = {
    1: '#4CAF50', // Green
    2: '#FF9800', // Orange
    3: '#2196F3', // Blue
    4: '#F44336', // Red
    5: '#9C27B0', // Purple
    'A': '#FFEB3B', // Yellow
    'B': '#795548', // Brown
    'C': '#00BCD4'  // Cyan
  };

  return waveColors[waveNumber] || '#888888';
};

// Format wave data for chart rendering
export const prepareWaveLines = (waves: Wave[], data: StockHistoricalData[]) => {
  return waves.map(wave => {
    const startPoint = data.find(d => d.timestamp === wave.startTimestamp);
    const endPoint = wave.endTimestamp 
      ? data.find(d => d.timestamp === wave.endTimestamp)
      : null;
    
    if (!startPoint) return null;
    
    // For the end point, use the actual end point if available,
    // otherwise use the most recent data point
    const finalEndPoint = endPoint || data[data.length - 1];
    
    return {
      id: `wave-${wave.number}`,
      wave,
      data: [
        {
          timestamp: startPoint.timestamp * 1000, // Convert to milliseconds
          value: startPoint.close,
          wavePoint: 'start',
          waveNumber: wave.number,
          isImpulse: wave.isImpulse
        },
        {
          timestamp: finalEndPoint.timestamp * 1000, // Convert to milliseconds
          value: finalEndPoint.close,
          wavePoint: 'end',
          waveNumber: wave.number,
          isImpulse: wave.isImpulse
        }
      ],
      color: getWaveColor(wave.number)
    };
  }).filter(Boolean);
};

// Get descriptive text for a wave sequence
export const getWavePatternDescription = (waves: Wave[]): string => {
  if (waves.length >= 5 && 
      typeof waves[0].number === 'number' && 
      waves[0].number === 1) {
    return "Complete 5-Wave Impulse Sequence";
  }
  
  if (waves.length >= 3 && 
      waves[0].number === 'A' && 
      waves[1].number === 'B' && 
      waves[2].number === 'C') {
    return "A-B-C Corrective Sequence";
  }
  
  if (waves.length > 0) {
    return `Partial Wave Sequence (${waves.length} waves)`;
  }
  
  return "No Wave Sequence Identified";
};