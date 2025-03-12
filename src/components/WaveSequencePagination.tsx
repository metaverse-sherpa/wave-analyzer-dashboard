import { Wave } from '@/types/waves';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface WaveSequencePaginationProps {
  waves: Wave[];
  itemsPerPage?: number;
}

const WaveSequencePagination = ({ 
  waves, 
  itemsPerPage = 5 
}: WaveSequencePaginationProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  // Sort waves by timestamp in descending order (most recent first)
  const sortedWaves = [...waves].sort((a, b) => 
    (b.endTimestamp || 0) - (a.endTimestamp || 0)
  );
  
  const totalPages = Math.ceil(sortedWaves.length / itemsPerPage);
  const currentWaves = sortedWaves.slice(
    currentPage * itemsPerPage, 
    (currentPage + 1) * itemsPerPage
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {currentWaves.map((wave, index) => (
          <Badge 
            key={`${wave.number}-${wave.startTimestamp}`}
            variant={wave.isImpulse ? "default" : "secondary"}
            className="text-sm"
          >
            Wave {wave.number} 
            {wave.isComplete ? '✓' : '...'}
          </Badge>
        ))}
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          
          <span className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default WaveSequencePagination;