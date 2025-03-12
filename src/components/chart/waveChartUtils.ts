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

// Update the prepareWaveLines function
export const prepareWaveLines = (waves: Wave[], historicalData: StockHistoricalData[]) => {
  if (!waves || waves.length === 0 || !historicalData || historicalData.length === 0) return [];
  
  // Find the index of the most recent Wave 1
  const mostRecentWave1Index = findMostRecentWave1Index(waves);
  if (mostRecentWave1Index === -1) return [];
  
  // Filter waves to only include those after the most recent Wave 1
  const relevantWaves = waves.slice(mostRecentWave1Index);
  
  console.log(`Preparing wave lines for ${relevantWaves.length} waves (from most recent Wave 1)`);
  
  const waveLines = [];
  
  // Process each relevant wave
  for (let i = 0; i < relevantWaves.length; i++) {
    const wave = relevantWaves[i];
    
    // Skip if we don't have start timestamp
    if (!wave.startTimestamp) continue;
    
    console.log(`Processing wave ${wave.number} with timestamps: ${wave.startTimestamp} to ${wave.endTimestamp || 'now'}`);
    
    // Find the closest data points instead of requiring exact matches
    let startDataPoint = findClosestDataPoint(historicalData, wave.startTimestamp);
    let endDataPoint;
    
    if (wave.endTimestamp) {
      // For completed waves
      endDataPoint = findClosestDataPoint(historicalData, wave.endTimestamp);
    } else {
      // For the last, incomplete wave, use the latest data point
      endDataPoint = historicalData[historicalData.length - 1];
    }
    
    // Skip if we couldn't find the start or end points
    if (!startDataPoint || !endDataPoint) {
      console.warn(`Could not find data points for wave ${wave.number}`, {
        startTimestamp: wave.startTimestamp,
        endTimestamp: wave.endTimestamp,
        dataRangeStart: historicalData[0].timestamp,
        dataRangeEnd: historicalData[historicalData.length-1].timestamp
      });
      
      // Use wave's own price data as fallback
      if (wave.startPrice !== undefined && wave.endPrice !== undefined) {
        console.log(`Using wave's own price data as fallback for wave ${wave.number}`);
        
        // Create custom data points using wave's price data
        const data = [
          {
            timestamp: wave.startTimestamp * 1000,
            value: wave.startPrice,
            waveNumber: wave.number
          },
          {
            timestamp: (wave.endTimestamp || historicalData[historicalData.length-1].timestamp) * 1000,
            value: wave.endPrice,
            waveNumber: wave.number
          }
        ];
        
        waveLines.push({
          id: `wave-${wave.number}-${i}`,
          wave: {
            ...wave,
            isImpulse: isImpulseWave(wave.number)  // Add this for the label positioning
          },
          data,
          color: getWaveColor(wave.number)
        });
      }
      
      continue;
    }
    
    // Create line data structure for Recharts
    const data = [
      {
        timestamp: startDataPoint.timestamp * 1000, // Convert to milliseconds
        value: startDataPoint.close,
        waveNumber: wave.number
      },
      {
        timestamp: endDataPoint.timestamp * 1000, // Convert to milliseconds
        value: endDataPoint.close,
        waveNumber: wave.number
      }
    ];
    
    waveLines.push({
      id: `wave-${wave.number}-${i}`,
      wave: {
        ...wave,
        isImpulse: isImpulseWave(wave.number)  // Add this for the label positioning
      },
      data,
      color: getWaveColor(wave.number)
    });
  }
  
  console.log(`Created ${waveLines.length} wave lines from most recent Wave 1`);
  return waveLines;
};

// Helper function to find closest data point by timestamp
const findClosestDataPoint = (data: StockHistoricalData[], timestamp: number): StockHistoricalData | null => {
  if (!data || data.length === 0) return null;
  
  // First check if we have an exact match
  const exactMatch = data.find(d => d.timestamp === timestamp);
  if (exactMatch) return exactMatch;
  
  // Find closest match by minimizing the time difference
  let closestPoint = data[0];
  let minDifference = Math.abs(data[0].timestamp - timestamp);
  
  for (let i = 1; i < data.length; i++) {
    const difference = Math.abs(data[i].timestamp - timestamp);
    if (difference < minDifference) {
      minDifference = difference;
      closestPoint = data[i];
    }
  }
  
  // Only accept if the difference is within a reasonable range (7 days in seconds)
  const maxAllowableDifference = 7 * 24 * 60 * 60; // 7 days in seconds
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
};

export const getWaveStyle = (wave: Wave, isHighlighted: boolean) => ({
  stroke: getWaveColor(wave.number),
  strokeWidth: isHighlighted ? 3 : 1,
  strokeOpacity: isHighlighted ? 1 : 0.6,
  // ...other existing styles...
});