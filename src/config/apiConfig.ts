// Central configuration for API settings

// Get the API base URL from environment variables
export const getApiBaseUrl = (): string => {
  // First priority: Use the environment variable if available
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredUrl) {
    console.log('Using configured API URL:', configuredUrl);
    return configuredUrl;
  }
  
  // Fallback for development: use local server
  const isDevelopment = import.meta.env.DEV || 
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';
  
  if (isDevelopment) {
    return `http://${window.location.hostname}:3001`;
  }
  
  // Fallback for production: use same origin
  return '';
};

// Build full API URL
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  
  // If we have a full URL from environment, don't add /api prefix for Cloudflare Workers
  if (baseUrl.includes('://')) {
    // Check if the endpoint already starts with a slash
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${formattedEndpoint}`;
  }
  
  // For local development or same-origin deployments
  const apiPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}/api${apiPath}`;
}

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
export async function checkBackendHealth(): Promise<BackendHealthCheck> {
  // Define potential health endpoint paths
  const healthEndpoints = [
    buildApiUrl('health'),
    `${getApiBaseUrl()}/health`, 
    '/api/health'
  ];
  
  // Try each endpoint
  for (const endpoint of healthEndpoints) {
    try {
      console.log(`Checking health endpoint: ${endpoint}`);
      
      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(endpoint, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`Successfully connected to: ${endpoint}`);
        return {
          status: 'ok', 
          message: 'API is online',
          timestamp: new Date()
        };
      }
    } catch (err) {
      console.log(`Failed to connect to: ${endpoint}`, err);
    }
  }
  
  // All endpoints failed
  return {
    status: 'error',
    message: 'API is not available',
    timestamp: new Date()
  };
}