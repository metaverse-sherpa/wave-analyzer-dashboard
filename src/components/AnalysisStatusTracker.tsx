// First, create a new file: src/components/AnalysisStatusTracker.tsx
import React, { useEffect, useState } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

const AnalysisStatusTracker: React.FC = () => {
  const [activeCount, setActiveCount] = useState(0);
  const { analysisEvents } = useWaveAnalysis();

  useEffect(() => {
    const handleAnalysisStart = () => {
      setActiveCount(prev => prev + 1);
    };

    const handleAnalysisComplete = () => {
      setActiveCount(prev => Math.max(0, prev - 1));
    };

    const handleAnalysisError = () => {
      setActiveCount(prev => Math.max(0, prev - 1));
    };

    // Add event listeners
    analysisEvents.addEventListener('analysisStart', handleAnalysisStart);
    analysisEvents.addEventListener('analysisComplete', handleAnalysisComplete);
    analysisEvents.addEventListener('analysisError', handleAnalysisError);
    analysisEvents.addEventListener('complete', handleAnalysisComplete);

    // Cleanup
    return () => {
      analysisEvents.removeEventListener('analysisStart', handleAnalysisStart);
      analysisEvents.removeEventListener('analysisComplete', handleAnalysisComplete);
      analysisEvents.removeEventListener('analysisError', handleAnalysisError);
      analysisEvents.removeEventListener('complete', handleAnalysisComplete);
    };
  }, [analysisEvents]);

  if (activeCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 px-4 rounded-full text-sm z-50 flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></div>
      <span>AnalysisStatusTracker: {activeCount} analyses loaded</span>
    </div>
  );
};

export default AnalysisStatusTracker;