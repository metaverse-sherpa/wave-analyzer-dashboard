import { createContext } from 'react';

// Type for the refresh context
export interface DataRefreshContextType {
  lastRefreshTime: number | null;
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  cancelRefresh: () => void;
  progress: {
    total: number;
    current: number;
    currentSymbol: string | null;
  };
  startBackgroundRefresh: () => Worker | null;
  stopBackgroundRefresh: () => void;
  // New function to refresh Elliott Wave analysis for all stocks
  refreshElliottWaveAnalysis: (options?: { isScheduled?: boolean; ignoreCache?: boolean }) => Promise<boolean>;
}

// Create and export the context
export const DataRefreshContext = createContext<DataRefreshContextType | undefined>(undefined);