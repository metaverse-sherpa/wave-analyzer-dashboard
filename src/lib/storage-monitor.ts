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
];

// Function to check if a key should be allowed
const isAllowedKey = (key: string): boolean => {
  // Direct match with allowed keys list
  if (ALLOWED_KEYS.includes(key)) return true;
  
  // Allow all Supabase-related keys (they use localStorage for auth)
  if (key.startsWith('sb-') || 
      key.includes('supabase') || 
      key.includes('auth-token')) return true;
  
  // Allow development tool keys
  if (key === 'test' || key.startsWith('react-devtools')) return true;
  
  return false;
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