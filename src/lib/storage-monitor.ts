// Create this file to monitor localStorage usage

// List of allowed keys that should not trigger warnings
const ALLOWED_KEYS = [
  'emergency-cpu-fix',
  'crash-count',
  'debug-mode',
  'theme',           // Common UI preference 
  'user-settings',   // Add any other keys you want to allow
  'test',             // Used by React DevTools extension
  'reversal-candidates-cache',
  'symbols',
  'admin_dashboard_cache', // Used by admin dashboard
  'admin_dashboard_cache_timestamp', // Used by admin dashboard
  'authRedirect', // Used for redirecting after login
  'previewMode', // Used for preview mode
  // Add chunked storage keys
  'admin_dashboard_cache_chunk_',
  'admin_dashboard_cache_chunk_count',
  'admin_dashboard_cache_chunk_timestamp',
  'lastDataRefreshTime', // Used for tracking last data refresh time
  'refresh_token', // Used for storing refresh token
  'auth_token', // Used for storing auth token
];

// Function to check if a key should be allowed
const isAllowedKey = (key: string): boolean => {
  // Direct match with allowed keys list
  if (ALLOWED_KEYS.includes(key)) return true;
  
  // Allow chunked storage keys
  if (key.startsWith('admin_dashboard_cache_chunk_')) return true;
  
  // Allow all Supabase-related keys (they use localStorage for auth)
  if (key.startsWith('sb-') || 
      key.includes('supabase') || 
      key.includes('auth-token')) return true;
  
  // Allow development tool keys
  if (key === 'test' || key.startsWith('react-devtools')) return true;
  
  return false;
};

// Enhanced localStorage helpers for large data handling
export const storageHelpers = {
  // Check available storage space (approximate)
  checkQuota: () => {
    try {
      const testKey = '__storage_test_key__';
      let totalSize = 0;
      let testData = 'A';
      // Create a string of increasing size until we hit a quota error
      while (true) {
        localStorage.setItem(testKey, testData);
        totalSize = testData.length;
        testData += testData; // Double the size each time
        // Stop at a reasonable size for testing
        if (testData.length > 5 * 1024 * 1024) break; // 5MB
      }
      localStorage.removeItem(testKey);
      return {
        hasQuota: true,
        estimatedQuota: totalSize
      };
    } catch (e) {
      return {
        hasQuota: false,
        estimatedQuota: 0
      };
    }
  },

  // Set item with chunking for large data
  setItem: (key: string, value: string, chunkSize = 1024 * 1024) => {
    try {
      // For small items, use standard localStorage
      if (value.length < chunkSize) {
        localStorage.setItem(key, value);
        return true;
      }

      // For large items, use chunking
      const chunks = [];
      for (let i = 0; i < value.length; i += chunkSize) {
        chunks.push(value.substring(i, i + chunkSize));
      }
      
      // Store the chunk count 
      localStorage.setItem(`${key}_chunk_count`, chunks.length.toString());
      
      // Store each chunk
      let success = true;
      for (let i = 0; i < chunks.length; i++) {
        try {
          localStorage.setItem(`${key}_chunk_${i}`, chunks[i]);
        } catch (e) {
          console.warn(`Failed to store chunk ${i} of ${key}: Storage quota exceeded`);
          success = false;
          // Clean up partial chunks if we fail
          for (let j = 0; j < i; j++) {
            localStorage.removeItem(`${key}_chunk_${j}`);
          }
          localStorage.removeItem(`${key}_chunk_count`);
          break;
        }
      }
      
      return success;
    } catch (e) {
      console.warn(`Error storing ${key} in localStorage:`, e);
      return false;
    }
  },
  
  // Get item that might be chunked
  getItem: (key: string) => {
    try {
      // Check if this is a chunked item
      const chunkCount = localStorage.getItem(`${key}_chunk_count`);
      
      if (!chunkCount) {
        // Regular item, just return it
        return localStorage.getItem(key);
      }
      
      // Chunked item, reassemble it
      const count = parseInt(chunkCount, 10);
      let result = '';
      
      for (let i = 0; i < count; i++) {
        const chunk = localStorage.getItem(`${key}_chunk_${i}`);
        if (chunk === null) {
          // Missing chunk, data is corrupt
          console.warn(`Missing chunk ${i} for ${key}`);
          return null;
        }
        result += chunk;
      }
      
      return result;
    } catch (e) {
      console.warn(`Error retrieving ${key} from localStorage:`, e);
      return null;
    }
  },
  
  // Remove potentially chunked item
  removeItem: (key: string) => {
    try {
      // Check if this is a chunked item
      const chunkCount = localStorage.getItem(`${key}_chunk_count`);
      
      if (!chunkCount) {
        // Regular item, just remove it
        localStorage.removeItem(key);
        return;
      }
      
      // Chunked item, remove all chunks
      const count = parseInt(chunkCount, 10);
      
      for (let i = 0; i < count; i++) {
        localStorage.removeItem(`${key}_chunk_${i}`);
      }
      
      localStorage.removeItem(`${key}_chunk_count`);
    } catch (e) {
      console.warn(`Error removing ${key} from localStorage:`, e);
    }
  }
};

// Override localStorage methods to detect usage
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  // Only warn if the key is not allowed
  if (!isAllowedKey(key)) {
    console.warn(`⚠️ localStorage.setItem called with key "${key}"!`, new Error().stack);
  }
  return originalSetItem.call(localStorage, key, value);
};

const originalGetItem = localStorage.getItem;
localStorage.getItem = function(key) {
  // Only warn if the key is not allowed
  if (!isAllowedKey(key)) {
    console.warn(`⚠️ localStorage.getItem called with key "${key}"!`, new Error().stack);
  }
  return originalGetItem.call(localStorage, key);
};

// Original initialization function
export const initStorageMonitor = () => {
  //console.log('Storage monitor initialized with explicit allowed keys:', ALLOWED_KEYS.join(', '));
  //console.log('Also allowing all Supabase authentication keys (starting with "sb-")');
};