// Central API configuration 

/**
 * Get the base URL for API requests
 * @returns The API base URL with no trailing slash
 */
export const getApiBaseUrl = (): string => {
  // In development, always use the local proxy which is configured in vite.config.ts
  if (import.meta.env.DEV) {
    return '';  // Use relative URL to work with Vite proxy
  }

  // In production, use environment variable if available
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiUrl) {
    return envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl;
  }

  // Fallback to relative URL in production
  return '/api';
};

/**
 * Set the application to use the fallback API
 */
export const switchToFallbackApi = (): void => {
  sessionStorage.setItem('using_fallback_api', 'true');
  console.log('[API Config] Switched to fallback API');
};

/**
 * Build a full API URL for a specific endpoint
 * @param endpoint The API endpoint path
 * @returns The full API URL
 */
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // In development or when using relative URLs, ensure the /api prefix
  if (!baseUrl || !baseUrl.includes('://')) {
    return `/api/${cleanEndpoint}`;
  }
  
  // For absolute URLs, use as is
  return `${baseUrl}/${cleanEndpoint}`;
};

/**
 * Build a full API URL for a specific endpoint with extra safety checks
 * @param endpoint The API endpoint path
 * @returns The full API URL
 */
export const buildSafeApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  
  // Remove leading slash if present on endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Try to detect if we're already using fallback API
  const usingFallback = sessionStorage.getItem('using_fallback_api') === 'true';
  
  // If we're getting news or market data and we're not on fallback yet, 
  // but we've seen 404s before, use the fallback automatically
  const failedApiRequestsCount = parseInt(sessionStorage.getItem('failed_api_requests_count') || '0', 10);
  if (
    !usingFallback && 
    failedApiRequestsCount > 3 && 
    (endpoint.includes('/market/') || endpoint.includes('/news'))
  ) {
    console.log('[API Config] Preemptively using fallback API due to previous failures');
    switchToFallbackApi();
    const fallbackUrl = import.meta.env.VITE_FALLBACK_API_URL || 'https://www.elliottwaves.ai/api';
    return `${fallbackUrl}/${cleanEndpoint}`;
  }
  
  // Don't add /api prefix when using external API
  if (baseUrl.includes('://')) {
    return `${baseUrl}/${cleanEndpoint}`;
  }
  
  // For local development, add /api prefix
  return `${baseUrl}/api/${cleanEndpoint}`;
};

/**
 * Record a failed API request to potentially trigger fallback API usage
 */
export const recordFailedApiRequest = (): void => {
  const failedCount = parseInt(sessionStorage.getItem('failed_api_requests_count') || '0', 10);
  sessionStorage.setItem('failed_api_requests_count', (failedCount + 1).toString());
  
  // If we've had multiple failures, switch to fallback API
  if (failedCount >= 3) {
    switchToFallbackApi();
  }
};

/**
 * Reset the failed API request counter
 */
export const resetApiFailureTracking = (): void => {
  sessionStorage.removeItem('failed_api_requests_count');
};

// Cache durations
export const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
export const HISTORICAL_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

// API health check interface
export interface BackendHealthCheck {
  status: 'ok' | 'error';
  message: string;
  timestamp: Date;
  version?: string;
}

// Check if the API is available
export const checkBackendHealth = async () => {
  const url = buildApiUrl('health');
  console.log('[API] Checking health at:', url);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      return {
        status: 'ok',
        message: data.message || 'API is online',
        version: data.version || '1.0.0',
        timestamp: new Date()
      };
    }
    return {
      status: 'error',
      message: 'API health check failed',
      timestamp: new Date()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    };
  }
};