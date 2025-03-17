import { Wave, StockHistoricalData, ChartPoint } from '@/types/shared';
import { WAVE_COLORS } from '@/types/shared';

export interface WaveLine {
  id: string;
  wave: Wave;
  data: ChartPoint[];
  color: string;
}

// Define wave colors for consistency
export const getWaveColor = (waveNumber: string | number): string => {
  const WAVE_COLORS: Record<string | number, string> = {
    1: '#4CAF50', // Green
    2: '#FF9800', // Orange
    3: '#2196F3', // Blue
    4: '#F44336', // Red
    5: '#9C27B0', // Purple
    'A': '#FFEB3B', // Yellow
    'B': '#795548', // Brown
    'C': '#00BCD4'  // Cyan
  };
  
  return WAVE_COLORS[waveNumber] || '#FFFFFF';
};

// Update this to determine if a wave is impulse or corrective
export const isImpulseWave = (waveNumber: string | number): boolean => {
  // Impulse waves are usually odd-numbered (1, 3, 5) and 'A' and 'C'
  if (typeof waveNumber === 'number') {
    return waveNumber % 2 === 1; // 1, 3, 5 are impulse
  } else {
    // A and C are impulse-like, B is corrective
    return waveNumber === 'A' || waveNumber === 'C';
  }
};

// Add this helper function to find the most recent Wave 1
const findMostRecentWave1Index = (waves: Wave[]): number => {
  for (let i = waves.length - 1; i >= 0; i--) {
    if (waves[i].number === 1) {
      return i;
    }
  }
  return -1;
};

// Add this function before prepareWaveLines
export const getTimestampValue = (timestamp: any): number => {
  if (typeof timestamp === 'object' && timestamp instanceof Date) {
    return timestamp.getTime();
  } else if (typeof timestamp === 'number') {
    return timestamp;
  } else if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return 0;
};

// Update the prepareWaveLines function to handle your data structure correctly
export const prepareWaveLines = (waves: any[], priceData: any[]): any[] => {
  if (!waves || waves.length === 0 || !priceData || priceData.length === 0) {
    return [];
  }
  
  // Make sure all price data has millisecond timestamps
  const normalizedPriceData = priceData.map(point => ({
    ...point,
    timestamp: getTimestampValue(point.timestamp)
  }));
  
  return waves.map(wave => {
    try {
      // IMPORTANT: Convert timestamps to milliseconds
      const startTime = getTimestampValue(wave.startTimestamp);
      const endTime = getTimestampValue(wave.endTimestamp);
      const startPrice = Number(wave.startPrice);
      const endPrice = Number(wave.endPrice);
      
      // Filter price points within this wave's time range
      const wavePoints = normalizedPriceData
        .filter(d => d.timestamp >= startTime && d.timestamp <= endTime)
        .map(d => ({
          timestamp: d.timestamp, // Already in milliseconds
          value: Number(d.close)
        }));
      
      // Return properly structured wave data
      return {
        id: wave.id || `wave-${wave.number}-${startTime}`,
        wave: {
          ...wave,
          startTimestamp: startTime,  // Store as milliseconds
          endTimestamp: endTime       // Store as milliseconds
        },
        color: getWaveColor(wave.number),
        // If we have price points, use them; otherwise create a line
        data: wavePoints.length >= 2 ? wavePoints : [
          { timestamp: startTime, value: startPrice },
          { timestamp: endTime, value: endPrice }
        ]
      };
    } catch (error) {
      console.error("Error creating wave line:", error);
      return null;
    }
  }).filter(Boolean);
};

// Update the findClosestDataPoint function to use getTimestampValue
const findClosestDataPoint = (data: StockHistoricalData[], timestamp: any): StockHistoricalData | null => {
  if (!data || data.length === 0) return null;
  
  const targetTimestamp = getTimestampValue(timestamp);
  
  // First check if we have an exact match
  const exactMatch = data.find(d => getTimestampValue(d.timestamp) === targetTimestamp);
  if (exactMatch) return exactMatch;
  
  // Find closest match by minimizing the time difference
  let closestPoint = data[0];
  let minDifference = Math.abs(getTimestampValue(data[0].timestamp) - targetTimestamp);
  
  for (let i = 1; i < data.length; i++) {
    const difference = Math.abs(getTimestampValue(data[i].timestamp) - targetTimestamp);
    if (difference < minDifference) {
      minDifference = difference;
      closestPoint = data[i];
    }
  }
  
  // Only accept if the difference is within a reasonable range (7 days in ms)
  const maxAllowableDifference = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  if (minDifference <= maxAllowableDifference) {
    return closestPoint;
  }
  
  return null;
};

// Helper to get a description of the wave pattern
export const getWavePatternDescription = (waves: Wave[]): string => {
  if (!waves || waves.length === 0) return "No wave pattern detected";
  
  const waveNumbers = waves.map(w => w.number);
  
  if (waveNumbers.includes(5)) {
    return "5-Wave Impulse Pattern";
  } else if (waveNumbers.includes('C')) {
    return "A-B-C Corrective Pattern";
  } else if (waveNumbers.length >= 3) {
    return `Wave Pattern: ${waveNumbers.join('-')}`;
  } else {
    return "Forming Wave Pattern";
  }
  
  // If you format dates in this function
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    
    try {
      // Handle different timestamp formats
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      if (typeof timestamp === 'number') {
        const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        return new Date(ms).toLocaleDateString();
      }
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString();
      }
      return 'Invalid date';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };
  
  // ... use formatDate where needed ...
};

export const getWaveStyle = (wave: Wave, isHighlighted: boolean) => ({
  stroke: getWaveColor(wave.number),
  strokeWidth: isHighlighted ? 3 : 1,
  strokeOpacity: isHighlighted ? 1 : 0.6,
  // ...other existing styles...
});