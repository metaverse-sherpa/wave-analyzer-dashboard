import { useContext } from 'react';
import { DataRefreshContext, DataRefreshContextType } from '@/context/DataRefreshManager';

/**
 * Hook to access the DataRefresh context
 */
export function useDataRefresh(): DataRefreshContextType {
  const context = useContext(DataRefreshContext);
  
  if (context === undefined) {
    throw new Error('useDataRefresh must be used within a DataRefreshProvider');
  }
  
  return context;
}