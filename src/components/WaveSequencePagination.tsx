import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Wave, FibTarget } from "@/types/shared"; // Make sure this path is correct

interface WaveSequencePaginationProps {
  waves: Wave[];
  invalidWaves?: Wave[]; // Add this to accept invalid waves
  selectedWave: Wave | null;
  currentWave?: Wave;
  fibTargets?: FibTarget[];
  onWaveSelect: (wave: Wave) => void;
}

const WaveSequencePagination: React.FC<WaveSequencePaginationProps> = ({ 
  waves,
  invalidWaves = [], // Add this with a default empty array
  onWaveSelect,
  selectedWave,
  currentWave,
  fibTargets
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const wavesPerPage = 9
  
  // Update the date formatting function to handle either Date objects or timestamps
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    
    try {
      // If it's already a Date object
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      
      // If it's a timestamp number
      if (typeof timestamp === 'number') {
        // Handle both seconds and milliseconds formats
        const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        return new Date(ms).toLocaleDateString();
      }
      
      // If it's an ISO string
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString();
      }
      
      return 'Invalid date';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(price);
  };

  // Update the sorting function to handle Date objects
  const sortedWaves = useMemo(() => {
    return [...waves].sort((a, b) => {
      // Get timestamps in milliseconds for comparison
      const getTimeValue = (timestamp: any): number => {
        if (timestamp instanceof Date) {
          return timestamp.getTime();
        }
        if (typeof timestamp === 'number') {
          return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        }
        if (typeof timestamp === 'string') {
          return new Date(timestamp).getTime();
        }
        return 0;
      };
      
      // Sort by start date descending (newest first)
      return getTimeValue(b.startTimestamp) - getTimeValue(a.startTimestamp);
    });
  }, [waves]);
  
  // First, let's add a function to calculate percentage change
  // Add this before the return statement
  const calculatePercentChange = (target: number, current: number): string => {
    if (!current) return '0%';
    
    const percentChange = ((target - current) / current) * 100;
    const formattedPercent = percentChange.toFixed(1);
    
    return percentChange >= 0 ? `+${formattedPercent}%` : `${formattedPercent}%`;
  };

  // Combine the waves and invalidWaves, sorted by timestamp
  const allWaves = useMemo(() => {
    // Add unique identifiers to each wave for proper React keying
    return [...waves, ...invalidWaves]
      .map((wave, index) => ({
        ...wave,
        // Add a uniqueId property based on available data or fallback to index
        uniqueId: `${wave.number}-${wave.startTimestamp}-${wave.startPrice}-${index}`
      }))
      .sort((a, b) => {
        const aTime = a.startTimestamp || 0;
        const bTime = b.startTimestamp || 0;
        return bTime - aTime; // Newest first
      })
      .slice(0, 10); // Show at most 10 waves
  }, [waves, invalidWaves]);

  const pageCount = Math.ceil(allWaves.length / wavesPerPage);
  const startIndex = currentPage * wavesPerPage;
  const displayedWaves = allWaves.slice(startIndex, startIndex + wavesPerPage);

  return (
    <div className="space-y-4">
      {/* Wave list with integrated Fibonacci targets */}
      <div className="space-y-1">
        {displayedWaves.map((wave) => {
          const isInvalid = !!wave.invalidationTimestamp;
          const isSelected = selectedWave && selectedWave.startTimestamp === wave.startTimestamp;
          const isCurrentWave = currentWave && 
                               wave.number === currentWave.number && 
                               wave.startTimestamp === currentWave.startTimestamp;
          
          return (
            <div key={wave.uniqueId} className="mb-1">
              {/* Wave entry */}
              <div 
                className={`
                  flex justify-between items-center p-2 rounded-md cursor-pointer
                  ${isSelected ? 'bg-primary/20 border border-primary/50' : 'bg-card hover:bg-muted/10'}
                  ${isInvalid ? 'border-red-500/50 border' : ''}
                  ${isCurrentWave && !wave.isComplete ? 'border-green-500/30 border' : ''}
                `}
                onClick={() => onWaveSelect(wave)}
              >
                <div className="flex items-center space-x-2">
                  {isInvalid && (
                    <span className="text-red-500 font-bold">❌</span>
                  )}
                  {isCurrentWave && !wave.isComplete && (
                    <span className="text-green-500 font-bold">🔄</span>
                  )}
                  <span className={`font-medium ${
                    isInvalid ? 'text-red-400' : 
                    (isCurrentWave && !wave.isComplete) ? 'text-green-400' : ''
                  }`}>
                    Wave {wave.number}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(wave.startTimestamp).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  {isInvalid ? (
                    <span className="text-xs text-red-400">
                      {wave.invalidationRule?.split(' ')[0]}...
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      ${wave.startPrice.toFixed(2)} → ${wave.endPrice?.toFixed(2) || 'ongoing'}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Fibonacci targets for current wave */}
              {isCurrentWave && !wave.isComplete && fibTargets && fibTargets.length > 0 && (
                <div className="ml-4 mb-3 mt-1 p-2 border-l-2 border-green-500/30 pl-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Fibonacci Targets for Wave {wave.number}:
                  </div>
                  <div className="space-y-1">
                    {fibTargets
                      .filter(target => !target.label.includes("Wave 3 High"))
                      .map((target, index) => {
                        const percentToTarget = calculatePercentChange(target.price, wave.startPrice);
                        
                        return (
                          <div 
                            key={`fib-${index}`}
                            className="flex justify-between items-center rounded-sm p-1 text-xs"
                          >
                            <span className={`${target.isExtension ? 'text-orange-400' : 'text-blue-400'}`}>
                              {target.label}
                            </span>
                            <div className="flex items-center space-x-1">
                              <span className={`font-medium ${target.isExtension ? 'text-orange-400' : 'text-blue-400'}`}>
                                ${target.price.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {percentToTarget}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div> // Change to closing div which matches the opening div on line 123
          );
        })}
      </div>
      
      {/* Pagination controls remain unchanged */}
      <div className="flex justify-between items-center pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={currentPage === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
          disabled={currentPage === pageCount - 1}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default WaveSequencePagination;