import { apiUrl } from '@/utils/apiConfig';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const FETCH_TIMEOUT = 5000; // 5 seconds

export const useGlobalRefresh = () => {
  const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  const fetchWithRetry = async (url: string, retries = MAX_RETRIES): Promise<Response> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, FETCH_TIMEOUT);
        if (response.ok) return response;

        // If we get a 4xx error, don't retry
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`HTTP error ${response.status}`);
        }

        console.warn(`Attempt ${attempt} failed for ${url}: ${response.status}`);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.warn(`Request timeout for ${url}`);
        } else {
          console.warn(`Request failed for ${url}:`, error);
        }

        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
    throw new Error(`Failed after ${retries} retries`);
  };

  const triggerGlobalRefresh = async (symbols: string[]): Promise<boolean> => {
    console.log("External global refresh called with", symbols.length, "symbols");
    
    try {
      // Clear existing cache
      localStorage.removeItem('reversal-candidates-cache');
      
      // Use individual stock endpoints instead of the quotes endpoint
      const priceMap: Record<string, number> = {};
      const errors: string[] = [];
      
      // Process a reasonable number of symbols (first 10) for a quick refresh
      const symbolsToProcess = symbols.slice(0, 10);
      
      // Process symbols in parallel with a concurrency limit
      const concurrencyLimit = 3;
      for (let i = 0; i < symbolsToProcess.length; i += concurrencyLimit) {
        const batch = symbolsToProcess.slice(i, i + concurrencyLimit);
        const promises = batch.map(async symbol => {
          try {
            const url = apiUrl(`/stocks/${symbol}/quote`);
            console.log(`Fetching fresh price for ${symbol} from: ${url}`);
            
            const response = await fetchWithRetry(url);
            const data = await response.json();
            
            if (data && (data.regularMarketPrice || data.price || data.lastPrice)) {
              const price = data.regularMarketPrice || data.price || data.lastPrice;
              if (typeof price === 'number' && price > 0) {
                priceMap[symbol] = price;
                return;
              }
            }
            errors.push(`Invalid price data for ${symbol}`);
          } catch (error) {
            errors.push(`${symbol}: ${error.message}`);
            console.warn(`Error fetching ${symbol}:`, error);
          }
        });

        await Promise.all(promises);
      }
      
      const successCount = Object.keys(priceMap).length;
      const errorCount = errors.length;
      
      console.log(`Fetched ${successCount} price quotes, ${errorCount} errors`);
      if (errorCount > 0) {
        console.warn('Fetch errors:', errors);
      }
      
      // Return success if we got at least some prices
      return successCount > 0;
    } catch (error) {
      console.error("Error in global refresh:", error);
      return false;
    }
  };

  return { triggerGlobalRefresh };
};