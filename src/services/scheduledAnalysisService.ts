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
    console.log('[SCHEDULER:DEBUG] Fetching wave analysis schedule from Supabase');
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'wave_analysis_schedule')
      .single();
    
    if (error) {
      console.error('[SCHEDULER:ERROR] Error fetching wave analysis schedule:', error);
      return DEFAULT_SCHEDULE_CONFIG;
    }
    
    console.log('[SCHEDULER:DEBUG] Retrieved schedule config:', JSON.stringify(data?.value || DEFAULT_SCHEDULE_CONFIG));
    return data?.value || DEFAULT_SCHEDULE_CONFIG;
  } catch (error) {
    console.error('[SCHEDULER:ERROR] Error in getScheduleConfig:', error);
    return DEFAULT_SCHEDULE_CONFIG;
  }
}

/**
 * Save the schedule configuration to Supabase
 */
export async function saveScheduleConfig(config: ScheduleConfig): Promise<boolean> {
  try {
    console.log('[SCHEDULER:DEBUG] Saving schedule config:', JSON.stringify(config));
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
      console.error('[SCHEDULER:ERROR] Error saving wave analysis schedule:', error);
      return false;
    }
    
    console.log('[SCHEDULER:DEBUG] Schedule config saved successfully');
    return true;
  } catch (error) {
    console.error('[SCHEDULER:ERROR] Error in saveScheduleConfig:', error);
    return false;
  }
}

/**
 * Check if it's time to run the scheduled analysis
 */
export function shouldRunScheduledAnalysis(config: ScheduleConfig): boolean {
  if (!config.enabled) {
    console.log('[SCHEDULER:DEBUG] Schedule is disabled, should not run');
    return false;
  }
  
  const now = new Date();
  
  // If never run before, run it
  if (!config.lastRun) {
    console.log('[SCHEDULER:DEBUG] Never run before, should run now');
    return true;
  }
  
  const lastRun = new Date(config.lastRun);
  const elapsedMinutes = (now.getTime() - lastRun.getTime()) / (1000 * 60);
  
  const shouldRun = elapsedMinutes >= config.intervalMinutes;
  console.log(`[SCHEDULER:DEBUG] Last run: ${lastRun.toISOString()}, elapsed: ${elapsedMinutes.toFixed(2)} minutes, interval: ${config.intervalMinutes} minutes, should run: ${shouldRun}`);
  
  return shouldRun;
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
    console.log('[SCHEDULER:DEBUG] --------- Starting runScheduledAnalysis ---------');
    const config = await getScheduleConfig();
    
    console.log('[SCHEDULER:DEBUG] Got schedule config:', JSON.stringify(config));
    
    if (!shouldRunScheduledAnalysis(config)) {
      console.log('[SCHEDULER:WARNING] Analysis not scheduled to run yet');
      return { 
        success: false, 
        results: {},
        error: 'Not scheduled to run yet' 
      };
    }
    
    const results: Record<string, any> = {};
    
    console.log(`[SCHEDULER:INFO] Will process ${config.symbols.length} symbols across ${config.timeframes.length} timeframes`);
    console.log(`[SCHEDULER:DEBUG] Symbols: ${config.symbols.join(', ')}`);
    console.log(`[SCHEDULER:DEBUG] Timeframes: ${config.timeframes.join(', ')}`);
    
    // Trigger wave analysis for each symbol and timeframe using the background worker
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        try {
          console.log(`[SCHEDULER:INFO] ---------- Processing ${symbol} (${timeframe}) ----------`);
          
          // Queue the analysis in the background worker
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            console.log(`[SCHEDULER:DEBUG] Using service worker for ${symbol}`);
            
            // Log the message being sent to service worker
            const message = {
              type: 'analyze-waves',
              symbol,
              timeframe,
              force: true
            };
            console.log(`[SCHEDULER:DEBUG] Message to service worker:`, JSON.stringify(message));
            
            navigator.serviceWorker.controller.postMessage(message);
            
            console.log(`[SCHEDULER:INFO] Message sent to service worker for ${symbol}`);
            results[`${symbol}-${timeframe}`] = { queued: true };
          } else {
            // Fallback to direct API call if service worker is not available
            console.log(`[SCHEDULER:WARNING] Service worker not available for ${symbol}, using direct API call`);
            const apiEndpoint = process.env.VITE_API_ENDPOINT || '';
            console.log(`[SCHEDULER:DEBUG] API endpoint: ${apiEndpoint}`);
            
            console.log(`[SCHEDULER:DEBUG] Preparing fetch request to ${apiEndpoint}/analyze-waves`);
            const requestBody = {
              symbol,
              timeframe,
              force: true,
              storeInCache: true
            };
            console.log(`[SCHEDULER:DEBUG] Request body:`, JSON.stringify(requestBody));
            
            const response = await fetch(`${apiEndpoint}/analyze-waves`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(requestBody)
            });
            
            console.log(`[SCHEDULER:DEBUG] Fetch response status: ${response.status}`);
            
            if (!response.ok) {
              const text = await response.text();
              console.error(`[SCHEDULER:ERROR] API error for ${symbol}: ${response.status}`, text);
              throw new Error(`API error: ${response.status} - ${text}`);
            }
            
            const responseJson = await response.json();
            console.log(`[SCHEDULER:INFO] API response for ${symbol}:`, JSON.stringify(responseJson).substring(0, 200) + '...');
            results[`${symbol}-${timeframe}`] = responseJson;
          }
        } catch (error) {
          console.error(`[SCHEDULER:ERROR] Error analyzing ${symbol} (${timeframe}):`, error);
          results[`${symbol}-${timeframe}`] = { error: String(error) };
        }
      }
    }
    
    // Update the lastRun timestamp
    console.log('[SCHEDULER:INFO] Updating lastRun timestamp');
    await saveScheduleConfig({
      ...config,
      lastRun: new Date().toISOString()
    });
    
    console.log('[SCHEDULER:INFO] Analysis completed successfully');
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('[SCHEDULER:ERROR] Error in runScheduledAnalysis:', error);
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
  console.log('[SCHEDULER:INFO] Initializing scheduled analysis system');
  // Check every 10 minutes if we should run the analysis
  const checkInterval = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  const checkAndRun = async () => {
    console.log('[SCHEDULER:DEBUG] Checking if scheduled analysis should run...');
    const config = await getScheduleConfig();
    if (shouldRunScheduledAnalysis(config)) {
      console.log('[SCHEDULER:INFO] Running scheduled wave analysis...');
      await runScheduledAnalysis();
    } else {
      console.log('[SCHEDULER:DEBUG] Not time to run scheduled analysis yet');
    }
  };
  
  // Initial check
  console.log('[SCHEDULER:INFO] Setting up initial check in 5 seconds');
  setTimeout(checkAndRun, 5000);
  
  // Set up recurring checks
  console.log(`[SCHEDULER:INFO] Setting up recurring checks every ${checkInterval/60000} minutes`);
  setInterval(checkAndRun, checkInterval);
}