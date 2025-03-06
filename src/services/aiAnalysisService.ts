import { toast } from "@/lib/toast";

export interface StockAnalysis {
  symbol: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  summary: string;
  keyPoints: string[];
  timestamp: number;
}

// Mock Deep AI analysis
export const getAIAnalysis = async (symbol: string): Promise<StockAnalysis> => {
  // In a real implementation, this would call the DeepSeek API
  // For this demo, we'll return mock data
  
  try {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate semi-random analysis based on the symbol
    const analysisOptions = [
      {
        sentiment: 'bullish',
        confidence: 0.85,
        summary: `${symbol} shows strong technical patterns suggesting continued upward momentum. The company's recent earnings beat expectations, and several analysts have increased their price targets.`,
        keyPoints: [
          'Strong support at current price levels',
          'Recent earnings beat expectations by 15%',
          'Increasing institutional ownership',
          'Positive sector outlook',
          'Healthy volume on up days'
        ]
      },
      {
        sentiment: 'bearish',
        confidence: 0.75,
        summary: `${symbol} is showing signs of weakness in the current market environment. Technical indicators suggest a potential reversal, and the company faces headwinds in its core business segments.`,
        keyPoints: [
          'Resistance at key technical levels',
          'Slowing revenue growth in recent quarters',
          'Increasing competition in core markets',
          'Valuation concerns among analysts',
          'Declining profit margins'
        ]
      },
      {
        sentiment: 'neutral',
        confidence: 0.65,
        summary: `${symbol} presents a mixed picture, with both bullish and bearish signals. While the company has solid fundamentals, current market conditions create uncertainty for near-term performance.`,
        keyPoints: [
          'Trading in a well-defined range',
          'Recent product launches show promise but are unproven',
          'Stable but not growing market share',
          'Fair valuation relative to peers',
          'Awaiting catalyst for directional move'
        ]
      }
    ];
    
    // Pseudorandom selection based on symbol
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const selection = analysisOptions[hash % analysisOptions.length];
    
    return {
      symbol,
      sentiment: selection.sentiment as 'bullish' | 'bearish' | 'neutral',
      confidence: selection.confidence,
      summary: selection.summary,
      keyPoints: selection.keyPoints,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error getting AI analysis:', error);
    toast.error('Failed to get AI analysis');
    
    // Return a neutral analysis as fallback
    return {
      symbol,
      sentiment: 'neutral',
      confidence: 0.5,
      summary: `Unable to analyze ${symbol} at this time.`,
      keyPoints: ['Analysis unavailable'],
      timestamp: Date.now()
    };
  }
};
