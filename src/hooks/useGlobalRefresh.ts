import { apiUrl } from '@/utils/apiConfig';
import { toast } from '@/lib/toast';

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
      
      // Process all symbols
      const symbolsToProcess = symbols;
      
      // Better throttling configuration:
      // 1. Smaller batch size (2 instead of 5)
      // 2. More delay between batches (1500ms)
      // 3. Sequential processing of batches to prevent overwhelming the API
      const batchSize = 2;
      const totalBatches = Math.ceil(symbolsToProcess.length / batchSize);
      
      if (symbolsToProcess.length > 10) {
        toast.info(`Processing ${symbolsToProcess.length} symbols in smaller batches to avoid API rate limits. This may take a few minutes.`);
      }
      
      console.log(`Processing ${symbolsToProcess.length} symbols in ${totalBatches} batches (${batchSize} per batch)`);
      
      // Process batches sequentially with delay between batches
      for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = symbolsToProcess.slice(i, i + batchSize);
        
        console.log(`Processing batch ${batchNumber}/${totalBatches} with symbols: ${batch.join(', ')}`);
        
        // Process symbols in the current batch concurrently
        const promises = batch.map(async symbol => {
          try {
            // Update to use the correct endpoint that returns stock data
            const url = apiUrl(`/stocks/${symbol}`);
            console.log(`Fetching fresh price for ${symbol} from: ${url}`);
            
            const response = await fetchWithRetry(url);
            const responseData = await response.json();
            
            if (responseData.status === 'success' && responseData.data) {
              const data = responseData.data;
              if (data && (data.regularMarketPrice || data.price || data.lastPrice)) {
                const price = data.regularMarketPrice || data.price || data.lastPrice;
                if (typeof price === 'number' && price > 0) {
                  priceMap[symbol] = price;
                  return;
                }
              }
            }
            errors.push(`Invalid price data for ${symbol}`);
          } catch (error) {
            errors.push(`${symbol}: ${error.message}`);
            console.warn(`Error fetching ${symbol}:`, error);
          }
        });

        // Wait for all promises in the batch to resolve
        await Promise.all(promises);
        console.log(`Completed batch ${batchNumber}/${totalBatches} (${Math.round((batchNumber/totalBatches) * 100)}%)`);
        
        // Add a delay before processing the next batch to reduce API load
        if (i + batchSize < symbolsToProcess.length) {
          console.log(`Waiting 1.5s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      
      const successCount = Object.keys(priceMap).length;
      const errorCount = errors.length;
      
      console.log(`Fetched ${successCount} price quotes, ${errorCount} errors`);
      if (errorCount > 0) {
        console.warn('Fetch errors:', errors);
        if (errorCount > successCount) {
          toast.warning(`Encountered ${errorCount} errors while refreshing data. Some stocks may not have updated information.`);
        }
      }
      
      // Return success if we got at least some prices
      return successCount > 0;
    } catch (error) {
      console.error("Error in global refresh:", error);
      toast.error("Error refreshing stock data. Please try again later.");
      return false;
    }
  };

  return { triggerGlobalRefresh };
};