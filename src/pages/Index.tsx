import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../components/Dashboard';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

const Index = () => {
  const navigate = useNavigate();
  const { loadAllAnalysesFromSupabase } = useWaveAnalysis();

  useEffect(() => {
    // Load wave analyses when the Index component mounts
    // This is still useful for the Dashboard
    loadAllAnalysesFromSupabase();
  }, [loadAllAnalysesFromSupabase]);
  
  return (
    <main>
      <Dashboard />
    </main>
  );
};

export default Index;
