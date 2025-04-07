export async function onRequest({ request, env, params }) {
  // Get the path parameter that was matched in the URL
  const path = params.path || [];
  
  // Convert path array to string and combine with any query parameters
  const url = new URL(request.url);
  const apiPath = path.join('/');
  const queryString = url.search;
  
  // Construct the API URL - using the target from your vite config
  const apiUrl = `https://api-backend.metaversesherpa.workers.dev/${apiPath}${queryString}`;
  console.log(`Proxying request to: ${apiUrl}`);
  
  // Forward the request to the API
  try {
    // Clone the request but change the URL
    const apiRequest = new Request(apiUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Actually fetch from the API
    const response = await fetch(apiRequest);
    
    // Return the API response
    return response;
  } catch (error) {
    // Handle errors
    return new Response(JSON.stringify({
      error: 'Failed to proxy to API backend',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}