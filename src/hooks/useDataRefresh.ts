import { useContext } from 'react';
import { DataRefreshContext } from '@/context/DataRefreshContext';
import type { DataRefreshContextType } from '@/context/DataRefreshContext';

// Use named function declaration for consistent Fast Refresh behavior
function useDataRefresh(): DataRefreshContextType {
  const context = useContext(DataRefreshContext);
  
  if (context === undefined) {
    throw new Error('useDataRefresh must be used within a DataRefreshProvider');
  }
  
  return context;
}

export { useDataRefresh };