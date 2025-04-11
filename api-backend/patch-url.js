// This file provides patched versions of Node.js core modules for Cloudflare Workers
import { URL as NodeURL, URLSearchParams as NodeURLSearchParams } from 'node:url';

// Export the patched modules
export { NodeURL as URL, NodeURLSearchParams as URLSearchParams };

// Make them available globally for older libraries that rely on them
globalThis.URL = globalThis.URL || NodeURL;
globalThis.URLSearchParams = globalThis.URLSearchParams || NodeURLSearchParams;

// Make the url module available to yahoo-finance2
const url = { URLSearchParams: NodeURLSearchParams };
globalThis.url = url;

console.log("URL module patches initialized");