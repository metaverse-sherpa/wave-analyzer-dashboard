// Import URL patches first to fix yahoo-finance2 compatibility
import './patch-url.js';

// Now import other dependencies
import yahooFinance from 'yahoo-finance2';

// Constants
const APP_VERSION = '0.0.9';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Content-Type': 'application/json'
};

// In-memory cache
const CACHE = {};

// HTML documentation to serve at the root path
const API_DOCUMENTATION = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wave Analyzer API Documentation</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2563eb;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        h2 {
            color: #1d4ed8;
            margin-top: 30px;
        }
        h3 {
            color: #1e40af;
            margin-top: 25px;
        }
        .endpoint {
            background-color: #f9fafb;
            border-left: 4px solid #2563eb;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .method {
            background-color: #2563eb;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
            margin-right: 10px;
        }
        .path {
            font-family: monospace;
            font-weight: bold;
            font-size: 1.1em;
        }
        code {
            background-color: #f1f5f9;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: monospace;
        }
        pre {
            background-color: #f1f5f9;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 10px;
            text-align: left.
        }
        th {
            background-color: #f9fafb;
            font-weight: bold.
        }
        .example-request, .example-response {
            margin-top: 10px;
        }
        .note {
            background-color: #fffbeb;
            border-left: 4px solid #f59e0b;
            padding: 10px 15px;
            margin: 15px 0;
            border-radius: 4px.
        }
        footer {
            margin-top: 50px;
            text-align: center;
            color: #6b7280;
            font-size: 0.9em;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb.
        }
    </style>
</head>
<body>
    <h1>Wave Analyzer API Documentation</h1>
    
    <p>Welcome to the Wave Analyzer API documentation. This API provides access to stock market data, historical prices, and analysis tools.</p>
    
    <div class="note">
        <strong>Base URL:</strong> <code>https://elliottwaves.ai/api</code>
    </div>
    
    <h2>API Health</h2>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/health</span>
        <p>Checks if the API is operational.</p>
        
        <h4>Example Response:</h4>
        <pre>{
  "status": "ok",
  "timestamp": "2023-11-05T12:34:56.789Z"
}</pre>
    </div>

    // ...existing code...</div>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { ...corsHeaders };
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Basic health check endpoint
      if (url.pathname === '/health' || url.pathname === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), { headers });
      }
      
      // Test endpoint to verify Yahoo Finance is working
      if (url.pathname === '/test-yahoo' || url.pathname === '/api/test-yahoo') {
        try {
          // Fetch a simple quote to verify Yahoo Finance is working
          const data = await yahooFinance.quote('AAPL');
          return new Response(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            data: {
              symbol: data.symbol,
              price: data.regularMarketPrice,
              change: data.regularMarketChange,
              percentChange: data.regularMarketChangePercent
            }
          }), { headers });
        } catch (error) {
          return new Response(JSON.stringify({
            status: 'error',
            message: `Yahoo Finance error: ${error.message}`
          }), { 
            status: 500, 
            headers 
          });
        }
      }
      
      // Handle unknown endpoints
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Not found'
      }), {
        status: 404,
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({
        status: 'error',
        message: `Server error: ${error.message}`
      }), {
        status: 500,
        headers
      });
    }
  }
};