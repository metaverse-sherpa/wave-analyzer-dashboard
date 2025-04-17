import { supabase } from '@/lib/supabase';
import { getHistoricalPrices } from '@/services/yahooFinanceService';
import { getDeepSeekWaveAnalysis } from '@/api/deepseekApi';
import { StockHistoricalData, DeepSeekWaveAnalysis, WaveAnalysis } from '@/types/shared';

interface AnalysisScheduleItem {
  symbol: string;
  interval: string;
  lastAnalyzed: number;
}

// Function to get all stock symbols from profiles table
export async function getAllStockSymbols(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('key')
      .filter('key::text', 'ilike', 'stock_%');
      
    if (error) {
      console.error('Error fetching stock symbols:', error);
      return [];
    }
    
    return data
      .map(item => item.key.replace('stock_', ''))
      .filter(symbol => symbol && symbol.length > 0);
  } catch (err) {
    console.error('Failed to fetch stock symbols:', err);
    return [];
  }
}

// Function to update Elliott Wave analysis for a single stock
export async function updateStockWaveAnalysis(symbol: string): Promise<boolean> {
  console.log(`Updating Elliott Wave analysis for ${symbol}`);
  
  try {
    // 1. Get historical data for the past 2 years with the '1d' timeframe
    const historicalData = await getHistoricalPrices(symbol, '1d', true);
    
    if (!historicalData || historicalData.length < 50) {
      console.error(`Insufficient historical data for ${symbol}`);
      return false;
    }
    
    // 2. Send data to DeepSeek API for analysis
    const waveAnalysis = await getDeepSeekWaveAnalysis(symbol, historicalData);
    
    // 3. Store only the analysis results in Supabase
    const { error } = await supabase
      .from('wave_analysis')
      .upsert({
        symbol,
        analysis: waveAnalysis,
        updated_at: new Date().toISOString()
      }, { onConflict: 'symbol' });
      
    if (error) {
      console.error(`Error storing wave analysis for ${symbol}:`, error);
      return false;
    }
    
    console.log(`Successfully updated wave analysis for ${symbol}`);
    return true;
  } catch (err) {
    console.error(`Failed to update wave analysis for ${symbol}:`, err);
    return false;
  }
}

// Main function to update all stocks' Elliott Wave analysis
export async function updateAllWaveAnalyses(): Promise<{
  success: number;
  failed: number;
  symbols: { success: string[]; failed: string[] };
}> {
  const symbols = await getAllStockSymbols();
  const results = {
    success: 0,
    failed: 0,
    symbols: { success: [], failed: [] }
  };
  
  console.log(`Starting batch Elliott Wave analysis for ${symbols.length} stocks`);
  
  // Process stocks in batches to avoid overloading the API
  const batchSize = 5;
  const processBatch = async (batch: string[]) => {
    const promises = batch.map(async (symbol) => {
      const success = await updateStockWaveAnalysis(symbol);
      if (success) {
        results.success++;
        results.symbols.success.push(symbol);
      } else {
        results.failed++;
        results.symbols.failed.push(symbol);
      }
      return { symbol, success };
    });
    
    return Promise.all(promises);
  };
  
  // Process stocks in batches
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await processBatch(batch);
    
    // Add a small delay between batches to prevent rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`Completed batch Elliott Wave analysis: ${results.success} successful, ${results.failed} failed`);
  return results;
}

/**
 * Schedule for periodic analysis of stock data
 * This helps keep the analysis data up to date without requiring manual refreshes
 */
export async function scheduleWaveAnalysis() {
  try {
    // Get list of stocks to analyze from database
    const { data: scheduleData, error } = await supabase
      .from('analysis_schedule')
      .select('*')
      .order('last_analyzed', { ascending: true })
      .limit(5);
    
    if (error) {
      console.error('Error fetching analysis schedule:', error);
      return;
    }
    
    if (!scheduleData || scheduleData.length === 0) {
      console.log('No stocks scheduled for analysis');
      return;
    }
    
    // Process each scheduled item
    for (const item of scheduleData) {
      const schedule: AnalysisScheduleItem = {
        symbol: item.symbol,
        interval: item.interval,
        lastAnalyzed: item.last_analyzed
      };
      
      try {
        // Get historical data
        const historicalData = await getHistoricalPrices(schedule.symbol, schedule.interval, true);
        
        if (!historicalData || historicalData.length === 0) {
          console.warn(`No historical data available for ${schedule.symbol}`);
          continue;
        }
        
        // Run wave analysis
        const analysis = await getDeepSeekWaveAnalysis(schedule.symbol, historicalData);
        
        // Update analysis in database
        const { error: updateError } = await supabase
          .from('wave_analyses')
          .upsert({
            symbol: schedule.symbol,
            interval: schedule.interval,
            analysis: analysis,
            last_updated: Math.floor(Date.now() / 1000)
          });
          
        if (updateError) {
          console.error(`Error updating analysis for ${schedule.symbol}:`, updateError);
        } else {
          // Update schedule
          await supabase
            .from('analysis_schedule')
            .update({ last_analyzed: Math.floor(Date.now() / 1000) })
            .eq('symbol', schedule.symbol)
            .eq('interval', schedule.interval);
            
          console.log(`Updated analysis for ${schedule.symbol}`);
        }
      } catch (err) {
        console.error(`Error analyzing ${schedule.symbol}:`, err);
      }
    }
  } catch (err) {
    console.error('Error in scheduled wave analysis:', err);
  }
}