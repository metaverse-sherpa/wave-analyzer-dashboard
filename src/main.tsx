import React from 'react';
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Console logger
const originalConsole = { ...console };
const logFile = 'browser-logs.txt';

function logToFile(...args: any[]) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ')}\n`;

  // Send log to backend
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log: logEntry })
  }).catch(err => originalConsole.error('Error writing to log file:', err));

  // Also log to original console
  originalConsole.log(...args);
}

// Override console methods
console.log = (...args) => logToFile('[LOG]', ...args);
console.warn = (...args) => logToFile('[WARN]', ...args);
console.error = (...args) => logToFile('[ERROR]', ...args);
console.info = (...args) => logToFile('[INFO]', ...args);

createRoot(document.getElementById("root")!).render(<App />);
