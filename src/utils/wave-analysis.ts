import { DeepSeekAnalysis, DeepSeekWaveAnalysis, WaveAnalysis, HistoricalDataPoint } from '@/types/shared';

export const convertDeepSeekToWaveAnalysis = (
  deepseekAnalysis: DeepSeekWaveAnalysis,
  historicalData?: HistoricalDataPoint[]
): WaveAnalysis => {
  return {
    waves: deepseekAnalysis.waves || [],
    currentWave: deepseekAnalysis.currentWave || null,
    fibTargets: deepseekAnalysis.fibTargets || [],
    trend: deepseekAnalysis.trend || 'neutral',
    impulsePattern: deepseekAnalysis.impulsePattern || false,
    correctivePattern: deepseekAnalysis.correctivePattern || false,
    invalidWaves: deepseekAnalysis.invalidWaves || [],
    symbol: deepseekAnalysis.symbol,
    analysis: deepseekAnalysis.analysis,
    stopLoss: deepseekAnalysis.stopLoss,
    confidenceLevel: deepseekAnalysis.confidenceLevel
  };
};

export const getCachedWaveAnalysis = async (symbol: string): Promise<WaveAnalysis | null> => {
  try {
    const response = await fetch(`/api/wave-analysis/${symbol}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching cached wave analysis:', error);
    return null;
  }
};