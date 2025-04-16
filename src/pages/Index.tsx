import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../components/Dashboard';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

const Index = () => {
  const navigate = useNavigate();
  const { loadCacheTableData } = useWaveAnalysis();

  useEffect(() => {
    // Updated to use loadCacheTableData
    loadCacheTableData();
  }, [loadCacheTableData]);
  
  return (
    <main>
      <Dashboard />
    </main>
  );
};

export default Index;
