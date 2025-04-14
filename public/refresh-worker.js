/**
 * Wave Analyzer Dashboard Refresh Worker
 * 
 * This service worker handles background data refreshing operations
 * that continue even when users navigate between pages.
 * 
 * It works by maintaining its own refresh cycles separate from
 * the main UI thread, communicating via postMessage.
 */

// Keep track of active refresh intervals
const activeIntervals = new Map();
const activeFetches = new Map();
const activeOperations = new Map();
let isInitialized = false;
let apiEndpoint = '';
let refreshToken = '';

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  const { action, payload } = event.data;
  
  switch (action) {
    case 'INIT':
      // Initialize the worker with API configuration
      handleInit(payload);
      break;
      
    case 'START_REFRESH':
      // Start a refresh cycle for a specific task
      handleStartRefresh(payload);
      break;
      
    case 'STOP_REFRESH':
      // Stop a specific refresh cycle
      handleStopRefresh(payload);
      break;
      
    case 'STOP_ALL':
      // Stop all refresh cycles
      handleStopAll();
      break;
      
    case 'PAUSE':
      // Pause all refresh cycles without clearing them
      handlePause();
      break;
      
    case 'RESUME':
      // Resume previously paused refresh cycles
      handleResume();
      break;
      
    case 'PING':
      // Heartbeat to check worker is alive
      self.postMessage({ action: 'PONG', timestamp: Date.now() });
      break;
      
    case 'FULL_DATA_REFRESH':
      // Special action: Clear cache and reload historical data, then analyze waves
      handleFullDataRefresh(payload);
      break;
  }
});

/**
 * Initialize the worker with configuration settings
 */
function handleInit(payload) {
  const { config } = payload;
  
  if (config) {
    apiEndpoint = config.apiEndpoint || '';
    refreshToken = config.refreshToken || '';
    isInitialized = true;
    console.log('[Refresh Worker] Initialized successfully');
    self.postMessage({ action: 'INITIALIZED', success: true });
  } else {
    console.error('[Refresh Worker] Initialization failed: No configuration provided');
    self.postMessage({ action: 'INITIALIZED', success: false, error: 'No configuration provided' });
  }
}

/**
 * Handle a full data refresh operation - similar to clicking "Load Historical Data" followed by "Analyze Waves"
 */
async function handleFullDataRefresh(payload) {
  const { stockCount = 100, cacheExpiryDays = 7 } = payload?.options || {};
  const operationId = 'full_data_refresh';
  
  try {
    // Check if operation is already in progress
    if (activeOperations.has(operationId)) {
      console.log('[Refresh Worker] Full data refresh already in progress');
      return;
    }
    
    // Mark operation as active
    activeOperations.set(operationId, true);
    
    // Report starting status
    self.postMessage({ 
      action: 'FULL_REFRESH_STARTED',
      timestamp: Date.now()
    });
    
    // Step 1: Clear both historical data and wave analysis cache
    self.postMessage({ 
      action: 'OPERATION_STATUS',
      step: 'clear_caches',
      message: 'Clearing historical data and wave analysis caches...',
      progress: 5
    });
    
    // Clear both caches in parallel for efficiency
    await Promise.all([
      clearHistoricalCache(),
      clearWaveAnalysisCache()
    ]);
    
    // Step 2: Load historical data
    self.postMessage({ 
      action: 'OPERATION_STATUS',
      step: 'load_historical_data',
      message: 'Loading historical data for top stocks...',
      progress: 10
    });
    
    // Get top stocks first
    const topStocks = await fetchTopStocks(stockCount);
    const totalStocks = topStocks.length;
    
    // Process stocks in batches to update progress
    for (let i = 0; i < totalStocks; i++) {
      const stock = topStocks[i];
      const symbol = stock.symbol;
      
      // Report progress
      self.postMessage({ 
        action: 'OPERATION_STATUS',
        step: 'loading_stock_data',
        message: `Loading historical data for ${symbol} (${i+1}/${totalStocks})`,
        progress: 10 + Math.floor((i / totalStocks) * 40) // Progress from 10% to 50%
      });
      
      // Load historical data for this symbol
      await loadHistoricalDataForSymbol(symbol, cacheExpiryDays);
      
      // Small pause to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Step 3: Run wave analysis
    self.postMessage({ 
      action: 'OPERATION_STATUS',
      step: 'analyze_waves',
      message: 'Starting wave analysis...',
      progress: 50
    });
    
    // Process wave analysis in batches
    for (let i = 0; i < totalStocks; i++) {
      const stock = topStocks[i];
      const symbol = stock.symbol;
      
      // Report progress
      self.postMessage({ 
        action: 'OPERATION_STATUS',
        step: 'analyzing_waves',
        message: `Analyzing waves for ${symbol} (${i+1}/${totalStocks})`,
        progress: 50 + Math.floor((i / totalStocks) * 45) // Progress from 50% to 95%
      });
      
      // Analyze waves for this symbol
      await analyzeWavesForSymbol(symbol);
      
      // Small pause to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Completed
    self.postMessage({ 
      action: 'FULL_REFRESH_COMPLETED',
      timestamp: Date.now(),
      totalProcessed: totalStocks
    });
    
  } catch (error) {
    console.error('[Refresh Worker] Full data refresh error:', error);
    
    self.postMessage({ 
      action: 'FULL_REFRESH_ERROR',
      error: error.message || 'Unknown error'
    });
  } finally {
    // Clean up
    activeOperations.delete(operationId);
  }
}

/**
 * Clear the historical data cache 
 */
async function clearHistoricalCache() {
  try {
    // Ensure proper URL formation
    const apiUrl = `${apiEndpoint}/clear-cache`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        cacheType: 'historical_data'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Refresh Worker] Clear cache error:', error);
    throw error;
  }
}

/**
 * Clear the wave analysis data cache
 */
async function clearWaveAnalysisCache() {
  try {
    // Ensure proper URL formation
    const apiUrl = `${apiEndpoint}/clear-cache`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        cacheType: 'wave_analysis'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Refresh Worker] Clear wave analysis cache error:', error);
    throw error;
  }
}

/**
 * Fetch the list of top stocks to process
 */
async function fetchTopStocks(limit = 100) {
  try {
    const apiUrl = `${apiEndpoint}/stocks/top?limit=${limit}`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Refresh Worker] Fetch top stocks error:', error);
    throw error;
  }
}

/**
 * Load historical data for a specific symbol
 */
async function loadHistoricalDataForSymbol(symbol, cacheExpiryDays) {
  try {
    const apiUrl = `${apiEndpoint}/stocks/historical/${symbol}?timeframe=2y&interval=1d`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Store the data to Supabase via API endpoint
    await storeHistoricalData(symbol, data, cacheExpiryDays);
    
    return data;
  } catch (error) {
    console.error(`[Refresh Worker] Error loading historical data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Store historical data in Supabase
 */
async function storeHistoricalData(symbol, data, cacheExpiryDays) {
  try {
    const apiUrl = `${apiEndpoint}/store-historical`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        symbol,
        timeframe: '1d',
        data,
        duration: cacheExpiryDays * 24 * 60 * 60 * 1000,
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[Refresh Worker] Error storing data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Analyze waves for a specific symbol
 */
async function analyzeWavesForSymbol(symbol) {
  try {
    const apiUrl = `${apiEndpoint}/analyze-waves`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        symbol,
        timeframe: '1d',
        force: true,
        storeInCache: true  // Add explicit flag to store results in cache
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Store the wave analysis in Supabase via our API endpoint
    const storeUrl = `${apiEndpoint}/store-wave-analysis`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    await fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        symbol,
        timeframe: '1d',
        waveAnalysis: result
      })
    }).then(response => {
      if (!response.ok) {
        console.error(`[Refresh Worker] Error storing wave analysis for ${symbol}: ${response.status}`);
      } else {
        console.log(`[Refresh Worker] Successfully stored wave analysis for ${symbol} in Supabase`);
      }
    }).catch(error => {
      console.error(`[Refresh Worker] Error storing wave analysis for ${symbol}:`, error);
    });
    
    return result;
  } catch (error) {
    console.error(`[Refresh Worker] Error analyzing waves for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Start a new refresh cycle for a specific task
 */
function handleStartRefresh(payload) {
  const { id, interval, task, params } = payload;
  
  if (!isInitialized) {
    self.postMessage({ 
      action: 'REFRESH_ERROR', 
      id, 
      error: 'Worker not initialized' 
    });
    return;
  }
  
  // First, stop any existing interval with this ID
  if (activeIntervals.has(id)) {
    clearInterval(activeIntervals.get(id));
  }
  
  console.log(`[Refresh Worker] Starting refresh cycle for ${id} (${interval}ms)`);
  
  // Execute task immediately first time
  executeTask(id, task, params);
  
  // Then set up the interval
  const intervalId = setInterval(() => {
    executeTask(id, task, params);
  }, interval);
  
  // Store the interval ID for later management
  activeIntervals.set(id, intervalId);
  
  self.postMessage({ action: 'REFRESH_STARTED', id });
}

/**
 * Execute a specific refresh task
 */
async function executeTask(id, task, params) {
  try {
    console.log(`[Refresh Worker] Executing task: ${task}`);
    
    let result = null;
    
    switch (task) {
      case 'FETCH_MARKET_DATA':
        result = await fetchMarketData(params);
        break;
        
      case 'ANALYZE_PATTERNS':
        result = await analyzePatterns(params);
        break;
        
      case 'UPDATE_REVERSALS':
        result = await updateReversals(params);
        break;
        
      case 'FULL_DATA_REFRESH':
        result = await handleFullDataRefresh(params);
        break;
        
      default:
        throw new Error(`Unknown task type: ${task}`);
    }
    
    // Send the result back to the main thread
    self.postMessage({
      action: 'REFRESH_RESULT',
      id,
      task,
      timestamp: Date.now(),
      result
    });
  } catch (error) {
    console.error(`[Refresh Worker] Task error (${id}):`, error);
    
    self.postMessage({
      action: 'REFRESH_ERROR',
      id,
      task,
      timestamp: Date.now(),
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Fetch market data from the API
 */
async function fetchMarketData(params) {
  const { symbols, timeframe } = params;
  
  if (!symbols || !symbols.length) {
    throw new Error('No symbols provided for market data fetch');
  }
  
  const requestId = `market_${Date.now()}`;
  
  try {
    // Track this fetch operation
    activeFetches.set(requestId, true);
    
    // Fix: Remove the duplicate /api path
    const apiUrl = `${apiEndpoint}/historical-data`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        symbols,
        timeframe: timeframe || '1d'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Refresh Worker] Market data fetch error:', error);
    throw error;
  } finally {
    activeFetches.delete(requestId);
  }
}

/**
 * Analyze patterns in the provided data
 */
async function analyzePatterns(params) {
  const { data, options } = params;
  
  if (!data) {
    throw new Error('No data provided for pattern analysis');
  }
  
  const requestId = `analyze_${Date.now()}`;
  
  try {
    // Track this fetch operation
    activeFetches.set(requestId, true);
    
    // Fix: Remove the duplicate /api path
    const apiUrl = `${apiEndpoint}/analyze-patterns`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        data,
        options
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[Refresh Worker] Pattern analysis error:', error);
    throw error;
  } finally {
    activeFetches.delete(requestId);
  }
}

/**
 * Update reversals data
 */
async function updateReversals(params) {
  const { symbols, force } = params;
  
  const requestId = `reversals_${Date.now()}`;
  
  try {
    // Track this fetch operation
    activeFetches.set(requestId, true);
    
    // Fix: Remove the duplicate /api path
    const apiUrl = `${apiEndpoint}/update-reversals`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      },
      body: JSON.stringify({
        symbols: symbols || [],
        force: force || false
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[Refresh Worker] Reversals update error:', error);
    throw error;
  } finally {
    activeFetches.delete(requestId);
  }
}

/**
 * Stop a specific refresh cycle
 */
function handleStopRefresh(payload) {
  const { id } = payload;
  
  if (activeIntervals.has(id)) {
    clearInterval(activeIntervals.get(id));
    activeIntervals.delete(id);
    console.log(`[Refresh Worker] Stopped refresh cycle for ${id}`);
    self.postMessage({ action: 'REFRESH_STOPPED', id });
  } else {
    console.log(`[Refresh Worker] No active refresh cycle found for ${id}`);
    self.postMessage({ action: 'REFRESH_NOT_FOUND', id });
  }
}

/**
 * Stop all refresh cycles
 */
function handleStopAll() {
  activeIntervals.forEach((intervalId, taskId) => {
    clearInterval(intervalId);
    console.log(`[Refresh Worker] Stopped refresh cycle for ${taskId}`);
  });
  
  activeIntervals.clear();
  
  // Also stop any active operations
  activeOperations.clear();
  
  console.log('[Refresh Worker] All refresh cycles and operations stopped');
  self.postMessage({ action: 'ALL_REFRESHES_STOPPED' });
}

/**
 * Pause all refresh cycles without clearing them
 */
function handlePause() {
  const pausedIntervals = new Map();
  
  activeIntervals.forEach((intervalId, taskId) => {
    clearInterval(intervalId);
    pausedIntervals.set(taskId, true);
  });
  
  // Store paused state but don't clear the map
  // so we know what to resume later
  console.log('[Refresh Worker] All refresh cycles paused');
  self.postMessage({ action: 'REFRESHES_PAUSED' });
}

/**
 * Resume previously paused refresh cycles
 */
function handleResume() {
  // TODO: Implement resume logic based on your specific needs
  console.log('[Refresh Worker] Resume functionality needs implementation');
  self.postMessage({ action: 'RESUME_NOT_IMPLEMENTED' });
}

// Self-check heartbeat to ensure worker is healthy
setInterval(() => {
  self.postMessage({ 
    action: 'HEARTBEAT', 
    timestamp: Date.now(),
    activeTaskCount: activeIntervals.size,
    activeFetchesCount: activeFetches.size,
    activeOperationsCount: activeOperations.size
  });
}, 30000); // Every 30 seconds

console.log('[Refresh Worker] Started and ready to receive messages');