import React, { useState, useEffect } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { toast } from '@/components/ui/use-toast';

// Remove the direct useNavigate import
// import { useNavigate } from 'react-router-dom';

const AnalysisStatusTracker: React.FC = () => {
  const { analysisEvents } = useWaveAnalysis();
  const [processedEvents, setProcessedEvents] = useState<Set<number>>(new Set());
  
  // Don't use navigation hooks here
  // const navigate = useNavigate();
  
  // Track analysis events with useEffect
  useEffect(() => {
    // Process any new events we haven't seen before
    const newEvents = analysisEvents.filter(event => !processedEvents.has(event.timestamp));
    
    if (newEvents.length > 0) {
      const newProcessed = new Set(processedEvents);
      
      // Process each new event
      newEvents.forEach(event => {
        newProcessed.add(event.timestamp);
        
        // Show toast notification for completed analyses
        if (event.status === 'completed') {
          toast({
            description: `Analysis completed for ${event.symbol}`,
            // Use window.location instead of navigate for global use
            action: (
              <button 
                onClick={() => {
                  window.location.href = `/stock/${event.symbol}`;
                }}
                className="bg-primary text-white px-3 py-1 rounded-md text-xs"
              >
                View
              </button>
            )
          });
        } 
        // Show error notification
        else if (event.status === 'error') {
          toast({
            variant: "destructive",
            description: `Analysis error for ${event.symbol}: ${event.message || 'Unknown error'}`
          });
        }
      });
      
      // Update the processed events
      setProcessedEvents(newProcessed);
    }
  }, [analysisEvents, processedEvents]);
  
  // This component doesn't render anything visible
  return null;
};

export default AnalysisStatusTracker;