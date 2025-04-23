import { DeepSeekAnalysis, DeepSeekWaveAnalysis, WaveAnalysis, HistoricalDataPoint, Wave } from '@/types/shared';

export const convertDeepSeekToWaveAnalysis = (
  deepseekAnalysis: DeepSeekWaveAnalysis,
  historicalData?: HistoricalDataPoint[]
): WaveAnalysis => {
  // Log the raw DeepSeek response for debugging
  console.log(`Raw DeepSeek response for ${deepseekAnalysis.symbol || 'unknown'}:`, deepseekAnalysis);
  
  // Handle both original format and new format with completedWaves
  let waves = deepseekAnalysis.waves || [];
  
  // If we have completedWaves in the response (new API format), convert them to our Wave format
  if (deepseekAnalysis.completedWaves && Array.isArray(deepseekAnalysis.completedWaves)) {
    waves = deepseekAnalysis.completedWaves.map(wave => {
      // Determine wave type based on the number if available
      const waveType = determineWaveType(wave.number);
      
      // Use type assertion to handle DeepSeek API format which might have different property names
      const deepSeekWave = wave as any;
      
      return {
        number: wave.number,
        startTimestamp: deepSeekWave.startTimestamp || (deepSeekWave.startTime ? new Date(deepSeekWave.startTime).getTime() : undefined),
        startPrice: wave.startPrice,
        endTimestamp: deepSeekWave.endTimestamp || (deepSeekWave.endTime ? new Date(deepSeekWave.endTime).getTime() : undefined),
        endPrice: wave.endPrice,
        subwaves: wave.subwaves || [],
        // Use invalidationPrice as per the interface and fall back to invalidationLevel if provided
        invalidationPrice: wave.invalidationPrice || (deepSeekWave.invalidationLevel !== undefined ? deepSeekWave.invalidationLevel : undefined),
        invalidationTimestamp: wave.invalidationTimestamp,
        type: waveType, // Add required 'type' property
        isComplete: true, // Use isComplete as per interface
        isInvalid: Boolean(wave.isInvalid || wave.isInvalidated),
        isImpulse: waveType === 'impulse'
      };
    });
  }
  
  // Get the current wave from the response
  let currentWave = deepseekAnalysis.currentWave;
  
  // If we have a currentWave in the new API format, convert it to our Wave format
  if (currentWave && typeof currentWave === 'object') {
    // Use type assertion to handle the API format
    const deepSeekCurrentWave = currentWave as any;
    
    // Check if it has startTime property (indicating it's from the DeepSeek API format)
    if (deepSeekCurrentWave.startTime !== undefined) {
      // Determine wave type based on the number if available
      const waveType = determineWaveType(currentWave.number);
      
      currentWave = {
        number: currentWave.number,
        startTimestamp: new Date(deepSeekCurrentWave.startTime).getTime(),
        startPrice: currentWave.startPrice,
        // Current wave won't have end properties as it's ongoing
        type: waveType, // Add required 'type' property
        isComplete: false, // Use isComplete as per interface
        isInvalid: Boolean(currentWave.isInvalid || currentWave.isInvalidated),
        isImpulse: waveType === 'impulse'
      };
      
      // Add the current wave to the waves array as well
      waves.push(currentWave);
    }
  }

  // If we have historical data, validate the wave dates against the data range
  if (historicalData && historicalData.length > 0) {
    // Find the earliest and latest dates in our historical data
    const earliestDataTimestamp = Math.min(...historicalData.map(d => 
      typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime()
    ));
    
    const latestDataTimestamp = Math.max(...historicalData.map(d => 
      typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime()
    ));
    
    console.log(`Historical data range: ${new Date(earliestDataTimestamp).toISOString()} to ${new Date(latestDataTimestamp).toISOString()}, 
      data points: ${historicalData.length}`);
    
    // Filter out waves that claim to start before our earliest data point
    const validWaves = waves.filter(wave => {
      const waveStartTimestamp = typeof wave.startTimestamp === 'number' 
        ? wave.startTimestamp 
        : new Date(wave.startTimestamp).getTime();
      
      const isValid = waveStartTimestamp >= earliestDataTimestamp;
      if (!isValid) {
        console.warn(`Filtering out wave ${wave.number} with start date ${new Date(waveStartTimestamp).toISOString()} 
          which is before our earliest data point ${new Date(earliestDataTimestamp).toISOString()}`);
      }
      
      return isValid;
    });
    
    // If we've filtered out all waves, try adjusting them to start at our earliest data point instead
    if (validWaves.length === 0 && waves.length > 0) {
      console.warn(`No valid waves within data range. Attempting to adjust waves to start from our earliest data.`);
      
      // Find the first data point
      const earliestDataPoint = historicalData.find(d => {
        const timestamp = typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime();
        return timestamp === earliestDataTimestamp;
      });
      
      if (earliestDataPoint) {
        // Get all the waves and adjust their timestamps
        waves = waves.map((wave, index) => {
          if (index === 0) {
            // First wave starts at our earliest data point
            return {
              ...wave,
              startTimestamp: earliestDataTimestamp,
              startPrice: earliestDataPoint.close
            };
          } else {
            // Keep the relative timing of other waves intact
            return wave;
          }
        });
        
        console.log(`Adjusted ${waves.length} waves to start from earliest data point.`);
      }
    } else {
      // Use the valid waves
      waves = validWaves;
    }

    // Also validate the current wave
    if (currentWave) {
      const currentWaveStartTimestamp = typeof currentWave.startTimestamp === 'number'
        ? currentWave.startTimestamp
        : new Date(currentWave.startTimestamp).getTime();
      
      if (currentWaveStartTimestamp < earliestDataTimestamp) {
        console.warn(`Current wave ${currentWave.number} has invalid start date 
          ${new Date(currentWaveStartTimestamp).toISOString()} (before earliest data point).
          Adjusting to earliest data point.`);
        
        // Adjust the current wave to start at the beginning of our data
        const earliestDataPoint = historicalData.find(d => {
          const timestamp = typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime();
          return timestamp === earliestDataTimestamp;
        });
        
        if (earliestDataPoint) {
          currentWave = {
            ...currentWave,
            startTimestamp: earliestDataTimestamp,
            startPrice: earliestDataPoint.close
          };
        }
      }
    }
    
    console.log(`Validated waves: Original count: ${deepseekAnalysis.waves?.length || 0}, Valid count: ${waves.length}`);
  }

  // Ensure every wave has all required properties from the Wave interface
  waves = waves.map(wave => {
    const waveType = wave.type || determineWaveType(wave.number);
    // Handle both direct properties and any properties from the DeepSeek API format
    const deepSeekWave = wave as any;
    
    return {
      ...wave,
      type: waveType,
      isComplete: wave.isComplete !== undefined ? wave.isComplete : true,
      isInvalid: wave.isInvalid ?? wave.isInvalidated ?? false,
      isImpulse: wave.isImpulse !== undefined ? wave.isImpulse : (waveType === 'impulse')
    };
  });

  // If we have invalidWaves in the response, ensure they also have the required properties
  const invalidWaves = (deepseekAnalysis.invalidWaves || []).map(wave => {
    const waveType = determineWaveType(wave.number);
    return {
      ...wave,
      type: wave.type || waveType,
      isComplete: 'isComplete' in wave ? wave.isComplete : true,
      isInvalid: true,
      isImpulse: wave.isImpulse !== undefined ? wave.isImpulse : (waveType === 'impulse')
    };
  });

  return {
    waves: waves,
    currentWave: currentWave || null,
    fibTargets: deepseekAnalysis.fibTargets || [],
    trend: deepseekAnalysis.trend || 'neutral',
    impulsePattern: deepseekAnalysis.impulsePattern || false,
    correctivePattern: deepseekAnalysis.correctivePattern || false,
    invalidWaves: invalidWaves,
    symbol: deepseekAnalysis.symbol,
    analysis: deepseekAnalysis.analysis,
    stopLoss: deepseekAnalysis.stopLoss,
    confidenceLevel: deepseekAnalysis.confidenceLevel
  };
};

// Helper function to determine wave type based on wave number
function determineWaveType(waveNumber: number | string): 'impulse' | 'corrective' {
  if (typeof waveNumber === 'number') {
    // Waves 1, 3, 5 are impulse waves, 2 and 4 are corrective
    return [1, 3, 5].includes(waveNumber) ? 'impulse' : 'corrective';
  }
  
  // For string wave numbers (like 'A', 'B', 'C')
  if (typeof waveNumber === 'string') {
    // A, B, C are typically corrective waves
    return ['A', 'B', 'C'].includes(waveNumber.toUpperCase()) ? 'corrective' : 'impulse';
  }
  
  // Default to impulse if we can't determine
  return 'impulse';
}

export const getCachedWaveAnalysis = async (symbol: string): Promise<WaveAnalysis | null> => {
  try {
    const response = await fetch(`/api/wave-analysis/${symbol}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    console.log(`Cached wave analysis for ${symbol}:`, data);
    return data;
  } catch (error) {
    console.error('Error fetching cached wave analysis:', error);
    return null;
  }
};