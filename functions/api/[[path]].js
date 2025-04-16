export async function onRequest({ request, env, params }) {
  // Get the path parameter that was matched in the URL
  const path = params.path || [];
  
  // Convert path array to string and combine with any query parameters
  const url = new URL(request.url);
  const apiPath = path.join('/');
  const queryString = url.search;
  
  // Construct the API URL - using the target from your vite config
  const apiUrl = `https://api-backend.metaversesherpa.workers.dev/${apiPath}${queryString}`;
  
  // Forward the request to the API
  try {
    // Clone the request but change the URL and add CORS headers
    const apiRequest = new Request(apiUrl, {
      method: request.method,
      headers: {
        ...request.headers,
        'Origin': request.headers.get('Origin') || '*',
      },
      body: request.body,
    });

    // Actually fetch from the API
    const response = await fetch(apiRequest);
    
    // Add CORS headers to the response
    const responseHeaders = {
      ...Object.fromEntries(response.headers.entries()),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Return the API response with CORS headers
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    // Handle errors with CORS headers
    return new Response(JSON.stringify({
      error: 'Failed to proxy to API backend',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
}