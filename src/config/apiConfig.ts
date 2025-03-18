// Central API configuration 

/**
 * Get the base URL for API requests
 * @returns The API base URL with no trailing slash
 */
export const getApiBaseUrl = (): string => {
  // Use environment variable if available
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  
  if (envApiUrl) {
    // Remove trailing slash if present
    const cleanUrl = envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl;
    console.log('[API Config] Using configured API URL:', cleanUrl);
    return cleanUrl;
  }
  
  // Fallback to localhost for development
  console.log('[API Config] Using local development URL');
  return 'http://localhost:3001';
};

/**
 * Build a full API URL for a specific endpoint
 * @param endpoint The API endpoint path
 * @returns The full API URL
 */
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  
  // Remove leading slash if present on endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Don't add /api prefix when using external API
  if (baseUrl.includes('://')) {
    return `${baseUrl}/${cleanEndpoint}`;
  }
  
  // For local development, add /api prefix
  return `${baseUrl}/api/${cleanEndpoint}`;
};

// Cache durations
export const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
export const HISTORICAL_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

// API health check interface
export interface BackendHealthCheck {
  status: 'ok' | 'error';
  message: string;
  timestamp: Date;
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
      message: `API responded with status ${response.status}`,
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