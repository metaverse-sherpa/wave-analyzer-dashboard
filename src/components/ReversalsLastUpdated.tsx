import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
// Import the context and hook from the dedicated context file
import { useReversals } from '@/context/ReversalsContext';

// The component definition
function ReversalsLastUpdated() {
  const { lastCacheUpdate, refreshReversals, loading: contextLoading } = useReversals();
  const { triggerGlobalRefresh } = useGlobalRefresh();
  const { loadCacheTableData } = useWaveAnalysis();
  
  // Add local loading state to track the entire refresh process
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Combine both loading states
  const loading = isRefreshing || contextLoading;
  
  const handleRefreshClick = async () => {
    // Skip if already loading
    if (loading) return;
    
    // Set local loading state to true
    setIsRefreshing(true);
    
    try {
      // First try to load all symbols from Supabase cache
      const { data: cacheData, error } = await supabase
        .from('cache')
        .select('key')
        .like('key', 'wave_analysis_%');
      
      // Extract symbols from the cache keys (format: 'wave_analysis_SYMBOL')
      let symbols = [];
      
      if (!error && cacheData && cacheData.length > 0) {
        symbols = cacheData
          .map(item => {
            // Extract the part after 'wave_analysis_'
            const keyPart = item.key.replace('wave_analysis_', '');
            // Remove the timeframe suffix (e.g., '_1d', '_4h')
            const symbolOnly = keyPart.replace(/_\w+$/, ''); 
            return symbolOnly;
          })
          .filter(Boolean); // Remove any empty strings
        
        // Deduplicate symbols
        symbols = [...new Set(symbols)];
        
        console.log(`Loaded ${symbols.length} unique symbols from Supabase cache`);
      } else {
        // Fall back to localStorage or default symbols if Supabase query fails
        symbols = localStorage.getItem('symbols')?.split(',') || ['AAPL', 'MSFT', 'GOOG'];
        console.log(`Using ${symbols.length} symbols from localStorage/defaults`);
        
        if (error) {
          console.warn('Error loading symbols from Supabase:', error);
        }
      }
      
      if (symbols.length === 0) {
        toast.error('No symbols found for refresh');
        return;
      }
      
      toast.info(`Refreshing data for ${symbols.length} symbols...`);
      
      // Step 1: Update the live price data
      const priceUpdateSuccess = await triggerGlobalRefresh(symbols);
      
      if (!priceUpdateSuccess) {
        toast.error('Failed to update price data');
        return;
      }
      
      // Step 2: After prices are updated, reload the cached wave analysis data
      // This ensures the UI is updated with the latest data
      toast.info('Reloading wave analysis with updated prices...');
      await loadCacheTableData();
      
      // Step 3: Finally refresh the reversals UI component
      refreshReversals();
      
      toast.success('Reversal alerts refreshed with latest prices');
    } catch (err) {
      console.error('Error during refresh:', err);
      toast.error('Refresh failed. Please try again.');
    } finally {
      // Always reset loading state, even if there was an error
      setIsRefreshing(false);
    }
  };
  
  return (
    <>
      {lastCacheUpdate > 0 && (
        <span className="text-xs text-muted-foreground mr-2" title={new Date(lastCacheUpdate).toLocaleString()}>
          Updated {new Date(lastCacheUpdate).toLocaleTimeString()}
        </span>
      )}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6" 
        onClick={handleRefreshClick}
        disabled={loading}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        <span className="sr-only">Refresh</span>
      </Button>
    </>
  );
}

// Just default export the component
export default ReversalsLastUpdated;