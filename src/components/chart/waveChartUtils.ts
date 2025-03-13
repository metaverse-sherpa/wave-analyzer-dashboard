import { Wave } from '@/utils/elliottWaveAnalysis';
import { StockHistoricalData } from '@/services/yahooFinanceService';

// Define wave colors for consistency
export const getWaveColor = (waveNumber: string | number): string => {
  const colorMap = {
    1: '#4CAF50', // Green
    2: '#FF9800', // Orange
    3: '#2196F3', // Blue
    4: '#F44336', // Red
    5: '#9C27B0', // Purple
    'A': '#FFEB3B', // Yellow
    'B': '#795548', // Brown
    'C': '#00BCD4',  // Cyan
  };
  
  return colorMap[waveNumber] || '#FFFFFF';
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
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  } else if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  } else if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return 0;
};

// Update the prepareWaveLines function
export const prepareWaveLines = (waves: Wave[], chartData: StockHistoricalData[]): WaveLine[] => {
  if (!waves || waves.length === 0 || !chartData || chartData.length === 0) return [];
  
  // Find the index of the most recent Wave 1
  const mostRecentWave1Index = findMostRecentWave1Index(waves);
  if (mostRecentWave1Index === -1) return [];
  
  // Filter waves to only include those after the most recent Wave 1
  const relevantWaves = waves.slice(mostRecentWave1Index);
  
  console.log(`Preparing wave lines for ${relevantWaves.length} waves`);
  
  const waveLines = [];
  
  // Process each relevant wave
  for (let i = 0; i < relevantWaves.length; i++) {
    const wave = relevantWaves[i];
    
    // Skip if we don't have start timestamp
    if (!wave.startTimestamp) continue;
    
    console.log(`Processing wave ${wave.number} with timestamps:`, {
      start: wave.startTimestamp instanceof Date ? wave.startTimestamp.toISOString() : wave.startTimestamp,
      end: wave.endTimestamp ? (wave.endTimestamp instanceof Date ? wave.endTimestamp.toISOString() : wave.endTimestamp) : 'now'
    });
    
    // Find the closest data points
    let startDataPoint = findClosestDataPoint(chartData, wave.startTimestamp);
    let endDataPoint;
    
    if (wave.endTimestamp) {
      endDataPoint = findClosestDataPoint(chartData, wave.endTimestamp);
    } else {
      endDataPoint = chartData[chartData.length - 1];
    }
    
    // Skip if we couldn't find the start or end points
    if (!startDataPoint || !endDataPoint) {
      console.warn(`Could not find data points for wave ${wave.number}`);
      
      // Use wave's own price data as fallback
      if (wave.startPrice !== undefined && wave.endPrice !== undefined) {
        console.log(`Using wave's own price data as fallback for wave ${wave.number}`);
        
        // Create custom data points using wave's price data
        const waveDataPoints = [
          {
            timestamp: getTimestampValue(wave.startTimestamp),
            value: wave.startPrice,
            waveNumber: wave.number
          },
          {
            timestamp: getTimestampValue(wave.endTimestamp || chartData[chartData.length-1].timestamp),
            value: wave.endPrice,
            waveNumber: wave.number
          }
        ];
        
        waveLines.push({
          id: `wave-${wave.number}-${i}`,
          wave: {
            ...wave,
            isImpulse: isImpulseWave(wave.number)
          },
          data: waveDataPoints,
          color: getWaveColor(wave.number)
        });
      }
      
      continue;
    }
    
    // Create line data structure for Recharts
    const dataPoints = [
      {
        timestamp: getTimestampValue(startDataPoint.timestamp),
        value: startDataPoint.close,
        waveNumber: wave.number
      },
      {
        timestamp: getTimestampValue(endDataPoint.timestamp),
        value: endDataPoint.close,
        waveNumber: wave.number
      }
    ];
    
    waveLines.push({
      id: `wave-${wave.number}-${i}`,
      wave: {
        ...wave,
        isImpulse: isImpulseWave(wave.number)
      },
      data: dataPoints,
      color: getWaveColor(wave.number)
    });
  }
  
  console.log(`Created ${waveLines.length} wave lines`);
  return waveLines;
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