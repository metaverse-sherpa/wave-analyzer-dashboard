import React from 'react';
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Console logger
const originalConsole = { ...console };

function logToFile(...args: any[]) {
  // Skip React component stack traces which tend to be large
  if (args.some(arg => 
    typeof arg === 'string' && 
    (arg.includes('Component Stack') || arg.includes('Error: Minified React error'))
  )) {
    // Just log to original console but skip sending to server
    originalConsole.log(...args);
    return;
  }
  
  const timestamp = new Date().toISOString();
  
  // Process arguments to handle large objects and potential circular references
  const processedArgs = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        // Extract only essential properties for objects to reduce size
        const essentialProps = {};
        const maxProps = 10; // Limit number of properties
        let count = 0;
        
        for (const key in arg) {
          if (count >= maxProps) break;
          
          // Skip functions, symbols, and potentially circular objects
          if (typeof arg[key] !== 'function' && typeof arg[key] !== 'symbol') {
            try {
              // Try to get a simple representation
              if (typeof arg[key] === 'object' && arg[key] !== null) {
                essentialProps[key] = '[Object]';
              } else {
                essentialProps[key] = arg[key];
              }
              count++;
            } catch (e) {
              essentialProps[key] = '[Circular]';
            }
          }
        }
        
        return JSON.stringify(essentialProps);
      } catch (e) {
        return '[Complex Object]';
      }
    }
    return arg;
  });
  
  const logEntry = `${timestamp} ${processedArgs.join(' ')}\n`;

  // Only send log to backend if it's not too large, with a more strict limit
  if (logEntry.length < 3000) { // Reduced from 4000 to 3000 to be safer
    // Send log to backend with explicit error handling
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        log: logEntry,
        timestamp: timestamp,
        type: args[0] || '[LOG]' // Capture log type for better filtering
      })
    }).catch(err => originalConsole.error('Error sending log to server:', err));
  } else {
    // For large entries, truncate and indicate truncation
    const truncatedEntry = logEntry.substring(0, 2500) + '... [truncated]';
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        log: truncatedEntry,
        timestamp: timestamp,
        type: `${args[0] || '[LOG]'} [TRUNCATED]` 
      })
    }).catch(err => originalConsole.error('Error sending log to server:', err));
    
    originalConsole.warn('Log entry truncated to send to server:', logEntry.length);
  }

  // Also log to original console
  originalConsole.log(...args);
}

// Override console methods
console.log = (...args) => logToFile('[LOG]', ...args);
console.warn = (...args) => logToFile('[WARN]', ...args);
console.error = (...args) => logToFile('[ERROR]', ...args);
console.info = (...args) => logToFile('[INFO]', ...args);

// Add window error handler - filter out React-specific errors
window.addEventListener('error', (event) => {
  // Skip React component stack errors which tend to be large
  if (event.message && !event.message.includes('Component Stack') && !event.message.includes('Minified React error')) {
    logToFile('[GLOBAL ERROR]', event.message, event.filename, event.lineno);
  } else {
    // Just log to original console
    originalConsole.error('[GLOBAL ERROR]', event.message, event.filename, event.lineno);
  }
});

// Add unhandled promise rejection handler - filter out React-specific errors
window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = event.reason?.message || event.reason?.toString() || 'Unknown reason';
  
  // Skip React component stack errors which tend to be large
  if (!errorMessage.includes('Component Stack') && !errorMessage.includes('Minified React error')) {
    logToFile('[UNHANDLED PROMISE]', errorMessage);
  } else {
    // Just log to original console
    originalConsole.error('[UNHANDLED PROMISE]', event.reason);
  }
});

createRoot(document.getElementById("root")!).render(<App />);
