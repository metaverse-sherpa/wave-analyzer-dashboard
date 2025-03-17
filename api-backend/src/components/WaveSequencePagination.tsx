import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Wave, FibTarget } from "@/types/shared"; // Make sure this path is correct

interface WaveSequencePaginationProps {
  waves: Wave[];
  onWaveSelect: (wave: Wave) => void;
  selectedWave: Wave | null;
  currentWave: Wave | null; // Add this prop
  fibTargets: FibTarget[]; // Add this prop
}

const WaveSequencePagination: React.FC<WaveSequencePaginationProps> = ({ 
  waves,
  onWaveSelect,
  selectedWave,
  currentWave, // Add this
  fibTargets   // Add this
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
  
  const pageCount = Math.ceil(sortedWaves.length / wavesPerPage);
  const startIndex = currentPage * wavesPerPage;
  const displayedWaves = sortedWaves.slice(startIndex, startIndex + wavesPerPage);

  // First, let's add a function to calculate percentage change
  // Add this before the return statement
  const calculatePercentChange = (target: number, current: number): string => {
    if (!current) return '0%';
    
    const percentChange = ((target - current) / current) * 100;
    const formattedPercent = percentChange.toFixed(1);
    
    return percentChange >= 0 ? `+${formattedPercent}%` : `${formattedPercent}%`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {displayedWaves.map((wave, index) => {
          // Use startTimestamp for comparison instead of id
          const isSelected = selectedWave && wave.startTimestamp === selectedWave.startTimestamp;
          const isCurrent = currentWave && wave.startTimestamp === currentWave.startTimestamp;
          
          return (
            <div key={`${wave.number}-${wave.startTimestamp}`}>
              <div 
                className={`px-3 py-2 rounded-lg border flex items-center justify-between text-sm 
                  ${wave.type === 'impulse' ? 'border-green-500/20' : 'border-red-500/20'}
                  ${isSelected 
                    ? 'bg-primary/20 border-2 border-yellow-400' 
                    : 'hover:bg-accent/50 cursor-pointer transition-colors'}`}
                onClick={() => onWaveSelect(wave)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-medium ${
                    wave.type === 'impulse' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    Wave {wave.number}
                    {isCurrent && <span className="ml-1 text-primary animate-pulse">•</span>}
                  </span>
                  <span className={`text-muted-foreground ${isSelected ? 'font-medium' : ''}`}>
                    {formatDate(wave.startTimestamp)} ({formatPrice(wave.startPrice!)})
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className={`text-muted-foreground ${isSelected ? 'font-medium' : ''}`}>
                    {formatDate(wave.endTimestamp)} ({formatPrice(wave.endPrice!)})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(wave.startTimestamp)} - {wave.endTimestamp ? formatDate(wave.endTimestamp) : 'Present'}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  wave.type === 'impulse' 
                    ? 'bg-green-500/10 text-green-500' 
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {wave.type}
                </span>
              </div>
              
              {/* Fibonacci Targets Table - Only show for current wave */}
              {isCurrent && (
                <div className="mt-2 mb-4 pl-4 pr-2 py-3 bg-secondary/30 rounded-lg border border-border/50">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Fibonacci {wave.type === 'impulse' ? 'Extension' : 'Retracement'} Targets:
                  </h4>
                  
                  {/* Filter relevant targets */}
                  {(() => {
                    const relevantTargets = fibTargets.filter(target => {
                      const currentPrice = wave.endPrice || 0;
                      if (wave.type === 'impulse') {
                        return target.price > currentPrice;
                      } else {
                        return target.price < currentPrice;
                      }
                    });
                    
                    // If no targets are left, all have been met
                    if (relevantTargets.length === 0 && fibTargets.length > 0) {
                      return (
                        <div className="py-2 px-1">
                          <div className="flex items-center gap-2 text-sm text-amber-500 font-medium">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                              <line x1="12" y1="9" x2="12" y2="13"></line>
                              <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            All targets met. Likely reversal point.
                          </div>
                        </div>
                      );
                    }
                    
                    // Otherwise show the targets
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {relevantTargets.map((target, i) => {
                          const percentChange = calculatePercentChange(target.price, wave.endPrice || 0);
                          
                          return (
                            <div 
                              key={`${target.label}-${i}`} 
                              className="flex items-center gap-2"
                            >
                              <span className={`${target.isExtension ? 'text-purple-400' : 'text-blue-400'} min-w-[40px]`}>
                                {target.label}:
                              </span>
                              <span className={`font-medium ${
                                target.price > (wave.endPrice || 0) ? 'text-bullish' : 'text-bearish'
                              }`}>
                                {formatPrice(target.price)}
                              </span>
                              <span className={`ml-1 text-xs ${
                                percentChange.startsWith('+') ? 'text-green-400' : 'text-red-400'
                              }`}>
                                ({percentChange})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
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