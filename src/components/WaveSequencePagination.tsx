import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Wave } from "@/types/waves";

interface WaveSequencePaginationProps {
  waves: Wave[];
  onWaveSelect?: (wave: Wave) => void;
}

const WaveSequencePagination: React.FC<WaveSequencePaginationProps> = ({ 
  waves,
  onWaveSelect 
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const wavesPerPage = 5;
  const pageCount = Math.ceil(waves.length / wavesPerPage);
  
  const startIndex = currentPage * wavesPerPage;
  const displayedWaves = waves.slice(startIndex, startIndex + wavesPerPage);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(price);
  };

  return (
    <div className="space-y-4">
      {/* Wave List */}
      <div className="space-y-1">
        {displayedWaves.map((wave, index) => (
          <div 
            key={`${wave.number}-${wave.startTimestamp}`}
            className={`px-3 py-2 rounded-lg border flex items-center justify-between text-sm 
              ${wave.type === 'impulse' ? 'border-green-500/20' : 'border-red-500/20'}
              hover:bg-accent/50 cursor-pointer transition-colors`}
            onClick={() => onWaveSelect?.(wave)}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <span className={`font-medium ${
                wave.type === 'impulse' ? 'text-green-500' : 'text-red-500'
              }`}>
                Wave {wave.number}
              </span>
              <span className="text-muted-foreground">
                {formatDate(wave.startTimestamp)} ({formatPrice(wave.startPrice!)})
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">
                {formatDate(wave.endTimestamp)} ({formatPrice(wave.endPrice!)})
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
        ))}
      </div>

      {/* Pagination Controls */}
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