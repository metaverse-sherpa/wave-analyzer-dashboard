import { DeepSeekAnalysis, DeepSeekWaveAnalysis, WaveAnalysis, HistoricalDataPoint, Wave } from '@/types/shared';
import { supabase } from '@/lib/supabase';

export const convertDeepSeekToWaveAnalysis = (
  deepseekAnalysis: DeepSeekWaveAnalysis,
  historicalData?: HistoricalDataPoint[]
): WaveAnalysis => {
  // Log the raw DeepSeek response for debugging
  console.log(`Processing wave analysis for ${deepseekAnalysis.symbol || 'unknown'}`);
  
  // Initialize waves array, preferring existing waves or creating a new array
  let waves: Wave[] = deepseekAnalysis.waves || [];
  
  // Clear existing waves if using the new completedWaves format
  if (deepseekAnalysis.completedWaves && Array.isArray(deepseekAnalysis.completedWaves)) {
    // Reset waves array when using completedWaves to avoid duplication
    waves = [];
    
    console.log(`Found ${deepseekAnalysis.completedWaves.length} completed waves in the new format`);
    
    // Convert each completedWave to the format expected by the chart
    deepseekAnalysis.completedWaves.forEach(wave => {
      if (!wave.number || !wave.startTime || !wave.startPrice || !wave.endTime || !wave.endPrice) {
        console.warn('Skipping wave with missing required properties:', wave);
        return;
      }
      
      // Determine wave type based on the number (1,3,5 are impulse, others are corrective)
      const waveType = determineWaveType(wave.number);
      
      // Convert date strings to timestamps
      const startTimestamp = new Date(wave.startTime).getTime();
      const endTimestamp = new Date(wave.endTime).getTime();
      
      // Create wave object with all required properties for the chart
      const formattedWave: Wave = {
        number: wave.number,
        startTimestamp: startTimestamp,
        startPrice: wave.startPrice,
        endTimestamp: endTimestamp,
        endPrice: wave.endPrice,
        subwaves: [],
        type: waveType,
        isComplete: true,
        isInvalid: false,
        isImpulse: waveType === 'impulse'
      };
      
      // Add to waves array
      waves.push(formattedWave);
    });
    
    // Set back to the deepseekAnalysis object to ensure it's available to the chart
    deepseekAnalysis.waves = waves;
  }
  
  // Handle current wave if present (which should be in progress)
  let currentWave = deepseekAnalysis.currentWave;
  if (currentWave && typeof currentWave === 'object') {
    // Check if it has all required properties
    if (currentWave.number && currentWave.startTime && currentWave.startPrice) {
      const waveType = determineWaveType(currentWave.number);
      
      // Convert date string to timestamp
      const startTimestamp = new Date(currentWave.startTime).getTime();
      
      // Format current wave according to the expected structure
      const formattedCurrentWave: Wave = {
        number: currentWave.number,
        startTimestamp: startTimestamp,
        startPrice: currentWave.startPrice,
        // Current wave doesn't have an end since it's in progress
        type: waveType,
        isComplete: false,
        isInvalid: false,
        isImpulse: waveType === 'impulse',
        subwaves: []
      };
      
      // Update the currentWave property with the formatted wave
      deepseekAnalysis.currentWave = formattedCurrentWave;
      
      console.log(`Current wave: ${currentWave.number}, starting at ${new Date(startTimestamp).toISOString()}`);
      
      // Also add the current wave to the waves array
      waves.push(formattedCurrentWave);
    } else {
      console.warn('Current wave missing required properties', currentWave);
      deepseekAnalysis.currentWave = null;
    }
  }

  // If we have historical data, validate the wave dates against the data range
  if (historicalData && historicalData.length > 0) {
    const earliestDataTimestamp = Math.min(...historicalData.map(d => 
      typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime()
    ));
    
    const latestDataTimestamp = Math.max(...historicalData.map(d => 
      typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime()
    ));
    
    console.log(`Historical data range: ${new Date(earliestDataTimestamp).toISOString()} to ${new Date(latestDataTimestamp).toISOString()}, 
      data points: ${historicalData.length}`);
    
    // Filter out waves that claim to start before our earliest data point or after our latest
    const validWaves = waves.filter(wave => {
      const waveStartTimestamp = typeof wave.startTimestamp === 'number' 
        ? wave.startTimestamp 
        : new Date(wave.startTimestamp).getTime();
      
      const isValid = waveStartTimestamp >= earliestDataTimestamp && waveStartTimestamp <= latestDataTimestamp;
      if (!isValid) {
        console.warn(`Filtering out wave ${wave.number} with start date ${new Date(waveStartTimestamp).toISOString()} 
          which is outside our data range (${new Date(earliestDataTimestamp).toISOString()} to ${new Date(latestDataTimestamp).toISOString()})`);
      }
      
      return isValid;
    });
    
    if (validWaves.length === 0 && waves.length > 0) {
      console.warn(`No valid waves within data range. Will adjust the timestamps to match the data range.`);
      
      // Instead of filtering, let's adjust the timestamps to be within our data range
      waves = waves.map(wave => {
        const waveStartTimestamp = typeof wave.startTimestamp === 'number' 
          ? wave.startTimestamp 
          : new Date(wave.startTimestamp).getTime();
          
        if (waveStartTimestamp < earliestDataTimestamp) {
          return {
            ...wave,
            startTimestamp: earliestDataTimestamp
          };
        } else if (waveStartTimestamp > latestDataTimestamp) {
          return {
            ...wave,
            startTimestamp: latestDataTimestamp
          };
        }
        
        return wave;
      });
      
      console.log(`Adjusted timestamps for ${waves.length} waves to match data range`);
    } else {
      // Use the valid waves if there are any
      waves = validWaves;
    }
    
    console.log(`Final wave count after validation: ${waves.length}`);
  }

  // Ensure every wave has all required properties
  waves = waves.map(wave => {
    return {
      ...wave,
      type: wave.type || determineWaveType(wave.number),
      isComplete: typeof wave.isComplete === 'boolean' ? wave.isComplete : Boolean(wave.endTimestamp),
      isInvalid: Boolean(wave.isInvalid),
      isImpulse: typeof wave.isImpulse === 'boolean' ? wave.isImpulse : (wave.type === 'impulse')
    };
  });

  // Create and return the final WaveAnalysis object that the chart component expects
  return {
    waves: waves,
    currentWave: deepseekAnalysis.currentWave || null,
    fibTargets: deepseekAnalysis.fibTargets || [],
    trend: deepseekAnalysis.trend || 'neutral',
    impulsePattern: deepseekAnalysis.impulsePattern || false,
    correctivePattern: deepseekAnalysis.correctivePattern || false,
    invalidWaves: [],
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
    // First, try to find the analysis from Supabase cache where the AI Elliott Wave analysis is stored
    const { data: waveAnalysisData, error: waveError } = await supabase
      .from('cache')
      .select('data, timestamp')
      .eq('key', `wave_analysis_${symbol}`)
      .single();
    
    // If we found wave analysis data, use that
    if (!waveError && waveAnalysisData?.data) {
      console.log(`Found standard wave analysis for ${symbol}`);
      
      // If the data is a string and looks like JSON, try to parse it
      let analysisData = null;
      
      if (typeof waveAnalysisData.data === 'string') {
        // Check if the string starts with a curly brace (JSON object)
        if (waveAnalysisData.data.trim().startsWith('{')) {
          try {
            analysisData = JSON.parse(waveAnalysisData.data);
          } catch (parseError) {
            console.warn(`Failed to parse wave analysis JSON for ${symbol}:`, parseError);
            // If parsing fails, create a basic structure with the raw text as analysis
            analysisData = {
              analysis: waveAnalysisData.data,
              waves: [],
              currentWave: null,
              trend: 'neutral'
            };
          }
        } else {
          // Handle raw text format (non-JSON)
          console.log(`Wave analysis for ${symbol} is in raw text format, not JSON`);
          analysisData = {
            analysis: waveAnalysisData.data,
            waves: [],
            currentWave: null,
            trend: extractTrendFromText(waveAnalysisData.data)
          };
        }
      } else if (waveAnalysisData.data !== null && typeof waveAnalysisData.data === 'object') {
        // If it's already an object, use it directly
        analysisData = waveAnalysisData.data;
      }
      
      return analysisData;
    }
    
    // If AI analysis is not found, fall back to full AI Elliott Wave analysis from Supabase
    const { data: aiAnalysisData, error: aiError } = await supabase
      .from('cache')
      .select('data, timestamp')
      .eq('key', `ai_elliott_wave_${symbol}`)
      .single();

    // If we found AI analysis data, use that
    if (!aiError && aiAnalysisData?.data) {
      console.log(`Found AI Elliott Wave analysis for ${symbol}`);
      
      // If the data is a string that looks like JSON, try to parse it
      let analysisData = null;
      
      if (typeof aiAnalysisData.data === 'string') {
        // Check if the string starts with a curly brace (JSON object)
        if (aiAnalysisData.data.trim().startsWith('{')) {
          try {
            analysisData = JSON.parse(aiAnalysisData.data);
          } catch (parseError) {
            console.warn(`Failed to parse AI Elliott Wave JSON for ${symbol}:`, parseError);
            // If parsing fails, create a basic structure with the raw text as analysis
            analysisData = {
              analysis: aiAnalysisData.data,
              waves: [],
              currentWave: null,
              trend: extractTrendFromText(aiAnalysisData.data)
            };
          }
        } else {
          // Handle raw text format (non-JSON)
          console.log(`AI Elliott Wave analysis for ${symbol} is in raw text format, not JSON`);
          analysisData = {
            analysis: aiAnalysisData.data,
            waves: [],
            currentWave: null,
            trend: extractTrendFromText(aiAnalysisData.data)
          };
        }
      } else if (aiAnalysisData.data !== null && typeof aiAnalysisData.data === 'object') {
        // If it's already an object, use it directly
        analysisData = aiAnalysisData.data;
      }
      
      return analysisData;
    }

    // If no data found in Supabase at all, log and return null
    console.warn(`No wave analysis found for ${symbol} in Supabase cache`);
    return null;
  } catch (error) {
    console.error('Error fetching cached wave analysis:', error);
    return null;
  }
};

// Helper function to extract trend from text
function extractTrendFromText(text: string): 'bullish' | 'bearish' | 'neutral' {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('bullish')) {
    return 'bullish';
  } else if (lowerText.includes('bearish')) {
    return 'bearish';
  } else {
    return 'neutral';
  }
}