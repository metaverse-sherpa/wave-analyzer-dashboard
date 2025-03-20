import React, { useContext } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handleGlobalRefresh } from './ReversalsList';

// Create a simple context to share the refresh state between components
export const ReversalsContext = React.createContext<{
  lastCacheUpdate: number;
  refreshReversals: () => void;
  loading: boolean;
}>({
  lastCacheUpdate: 0,
  refreshReversals: () => {
    console.log('Default refresh function called - using global refresh');
    // Get symbols from localStorage or a simpler method
    const symbols = localStorage.getItem('symbols')?.split(',') || ['AAPL', 'MSFT', 'GOOG'];
    handleGlobalRefresh(symbols);
  },
  loading: false
});

export const useReversals = () => useContext(ReversalsContext);

// Small component just for the timestamp and refresh button
const ReversalsLastUpdated: React.FC = () => {
  const { lastCacheUpdate, refreshReversals, loading } = useReversals();
  
  // Add logging to debug
  const handleRefreshClick = () => {
    console.log('Refresh button clicked');
    refreshReversals(); // Call the actual refresh function from context
  };
  
  return (
    <>
      {lastCacheUpdate > 0 && (
        <span className="text-xs text-muted-foreground mr-2">
          {new Date(lastCacheUpdate).toLocaleTimeString()}
        </span>
      )}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6" 
        onClick={handleRefreshClick} // Use the logging wrapper
        disabled={loading}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        <span className="sr-only">Refresh</span>
      </Button>
    </>
  );
};

export default ReversalsLastUpdated;