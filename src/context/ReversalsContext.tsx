import React, { createContext, useContext } from 'react';

// Define the context interface
interface ReversalsContextType {
  lastCacheUpdate: number;
  refreshReversals: () => void;
  loading: boolean;
}

// Create context with a default value
const ReversalsContext = createContext<ReversalsContextType>({
  lastCacheUpdate: 0,
  refreshReversals: () => {},
  loading: false
});

// Hook for using the context - exported separately for Fast Refresh compatibility
export function useReversals() {
  const context = useContext(ReversalsContext);
  if (!context) {
    throw new Error('useReversals must be used within a ReversalsProvider');
  }
  return context;
}

// Export the context 
export { ReversalsContext };