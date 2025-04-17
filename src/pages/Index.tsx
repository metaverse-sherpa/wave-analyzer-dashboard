import React, { useEffect, useRef } from 'react';
import Dashboard from '../components/Dashboard';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

const Index = () => {
  const { loadCacheTableData, isDataLoaded } = useWaveAnalysis();
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    // Only load data if it hasn't been loaded before and isn't already loaded
    if (!dataLoadedRef.current && !isDataLoaded) {
      console.log('Initial wave analysis data load from Index component');
      loadCacheTableData();
      dataLoadedRef.current = true;
    }
  }, [loadCacheTableData, isDataLoaded]);
  
  return (
    <main>
      <Dashboard />
    </main>
  );
};

export default Index;
