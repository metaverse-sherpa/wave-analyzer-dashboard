import { supabase } from '../lib/supabase';

/**
 * Interface for schedule configuration
 */
export interface ScheduleConfig {
  symbols: string[];         // List of symbols to analyze
  timeframes: string[];      // List of timeframes to use (e.g., '1d', '4h', '1h')
  intervalMinutes: number;   // How often to run the analysis in minutes
  enabled: boolean;          // Whether the schedule is enabled
  lastRun?: string;          // ISO timestamp of last run
}

/**
 * Default schedule configuration
 */
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  symbols: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'AMZN'],
  timeframes: ['1d'],
  intervalMinutes: 720, // Twice daily by default
  enabled: false
};

/**
 * Fetch the current schedule configuration from Supabase
 */
export async function getScheduleConfig(): Promise<ScheduleConfig> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'wave_analysis_schedule')
      .single();
    
    if (error) {
      console.error('Error fetching wave analysis schedule:', error);
      return DEFAULT_SCHEDULE_CONFIG;
    }
    
    return data?.value || DEFAULT_SCHEDULE_CONFIG;
  } catch (error) {
    console.error('Error in getScheduleConfig:', error);
    return DEFAULT_SCHEDULE_CONFIG;
  }
}

/**
 * Save the schedule configuration to Supabase
 */
export async function saveScheduleConfig(config: ScheduleConfig): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert(
        { 
          key: 'wave_analysis_schedule', 
          value: config 
        },
        { onConflict: 'key' }
      );
    
    if (error) {
      console.error('Error saving wave analysis schedule:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in saveScheduleConfig:', error);
    return false;
  }
}

/**
 * Check if it's time to run the scheduled analysis
 */
export function shouldRunScheduledAnalysis(config: ScheduleConfig): boolean {
  if (!config.enabled) {
    return false;
  }
  
  const now = new Date();
  
  // If never run before, run it
  if (!config.lastRun) {
    return true;
  }
  
  const lastRun = new Date(config.lastRun);
  const elapsedMinutes = (now.getTime() - lastRun.getTime()) / (1000 * 60);
  
  return elapsedMinutes >= config.intervalMinutes;
}

/**
 * Run the Elliott Wave analysis for all configured symbols and timeframes
 */
export async function runScheduledAnalysis(): Promise<{
  success: boolean;
  results: Record<string, any>;
  error?: string;
}> {
  try {
    const config = await getScheduleConfig();
    
    if (!shouldRunScheduledAnalysis(config)) {
      return { 
        success: false, 
        results: {},
        error: 'Not scheduled to run yet' 
      };
    }
    
    const results: Record<string, any> = {};
    
    // Trigger wave analysis for each symbol and timeframe using the background worker
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        try {
          // Queue the analysis in the background worker
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'analyze-waves',
              symbol,
              timeframe,
              force: true
            });
            
            results[`${symbol}-${timeframe}`] = { queued: true };
          } else {
            // Fallback to direct API call if service worker is not available
            const apiEndpoint = process.env.VITE_API_ENDPOINT || '';
            const response = await fetch(`${apiEndpoint}/analyze-waves`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                symbol,
                timeframe,
                force: true,
                storeInCache: true
              })
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            
            results[`${symbol}-${timeframe}`] = await response.json();
          }
        } catch (error) {
          console.error(`Error analyzing ${symbol} (${timeframe}):`, error);
          results[`${symbol}-${timeframe}`] = { error: String(error) };
        }
      }
    }
    
    // Update the lastRun timestamp
    await saveScheduleConfig({
      ...config,
      lastRun: new Date().toISOString()
    });
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Error in runScheduledAnalysis:', error);
    return {
      success: false,
      results: {},
      error: String(error)
    };
  }
}

/**
 * Initialize the scheduled analysis system
 * This sets up periodic checks to run the analysis
 */
export function initScheduledAnalysis(): void {
  // Check every 10 minutes if we should run the analysis
  const checkInterval = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  const checkAndRun = async () => {
    const config = await getScheduleConfig();
    if (shouldRunScheduledAnalysis(config)) {
      console.log('Running scheduled wave analysis...');
      await runScheduledAnalysis();
    }
  };
  
  // Initial check
  setTimeout(checkAndRun, 5000);
  
  // Set up recurring checks
  setInterval(checkAndRun, checkInterval);
}