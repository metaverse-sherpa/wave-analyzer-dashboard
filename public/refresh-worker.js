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
      // Special action: Load historical data and analyze waves
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
 * Handle a full data refresh operation
 */
async function handleFullDataRefresh(payload) {
  const { stockCount = 100 } = payload?.options || {};
  const operationId = 'full_data_refresh';
  
  try {
    if (activeOperations.has(operationId)) {
      console.log('[Refresh Worker] Full data refresh already in progress');
      return;
    }
    
    activeOperations.set(operationId, true);
    
    self.postMessage({ 
      action: 'FULL_REFRESH_STARTED',
      timestamp: Date.now()
    });
    
    // Step 1: Get top stocks
    self.postMessage({ 
      action: 'OPERATION_STATUS',
      step: 'load_historical_data',
      message: 'Loading historical data for top stocks...',
      progress: 10
    });
    
    const topStocks = await fetchTopStocks(stockCount);
    const totalStocks = topStocks.length;
    
    // Step 2: Process each stock
    for (let i = 0; i < totalStocks; i++) {
      const stock = topStocks[i];
      const symbol = stock.symbol;
      
      self.postMessage({ 
        action: 'OPERATION_STATUS',
        step: 'analyzing_waves',
        message: `Analyzing waves for ${symbol} (${i+1}/${totalStocks})`,
        progress: Math.floor((i / totalStocks) * 90) + 10
      });
      
      await analyzeWavesForSymbol(symbol);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
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
    activeOperations.delete(operationId);
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
async function loadHistoricalDataForSymbol(symbol) {
  try {
    const apiUrl = `${apiEndpoint}/stocks/${symbol}/history`.replace(/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const json = await response.json();
    return json.data || json;
  } catch (error) {
    console.error(`[Refresh Worker] Error loading historical data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Analyze waves for a specific symbol
 */
async function analyzeWavesForSymbol(symbol) {
  try {
    // First get historical data
    const historicalData = await loadHistoricalDataForSymbol(symbol);
    
    // Then analyze waves
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
        historicalData,
        force: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
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