// Create a central place for API configuration

// Access the environment variable with fallback to relative URL (served by same origin)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Helper function to create full API URLs
export const apiUrl = (path: string) => {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // Remove 'api/' prefix if the base URL already includes it and path also includes it
  const apiPrefix = API_BASE_URL.endsWith('/api') || API_BASE_URL.endsWith('/api/');
  const pathHasApiPrefix = cleanPath.startsWith('api/');
  
  if (apiPrefix && pathHasApiPrefix) {
    return `${API_BASE_URL}/${cleanPath.substring(4)}`;
  }
  
  return `${API_BASE_URL}/${cleanPath}`;
};

// For debugging
if (import.meta.env.VITE_DEBUG_API_CALLS) {
  console.log('API Base URL:', API_BASE_URL);
}