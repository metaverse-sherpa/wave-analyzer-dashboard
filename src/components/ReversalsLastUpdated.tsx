import React, { useContext } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';

// Define the context interface
interface ReversalsContextType {
  lastCacheUpdate: number;
  refreshReversals: () => void;
  loading: boolean;
}

// Create context with a default value
export const ReversalsContext = React.createContext<ReversalsContextType>({
  lastCacheUpdate: 0,
  refreshReversals: () => {},
  loading: false
});

// Use function declaration for the hook
export function useReversals(): ReversalsContextType {
  const context = useContext(ReversalsContext);
  if (!context) {
    throw new Error('useReversals must be used within a ReversalsProvider');
  }
  return context;
}

// Use function declaration for the component
export function ReversalsLastUpdated(): JSX.Element {
  const { lastCacheUpdate, refreshReversals, loading } = useReversals();
  const { triggerGlobalRefresh } = useGlobalRefresh();
  
  const handleRefreshClick = async () => {
    const symbols = localStorage.getItem('symbols')?.split(',') || ['AAPL', 'MSFT', 'GOOG'];
    await triggerGlobalRefresh(symbols);
    refreshReversals();
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

export default ReversalsLastUpdated;