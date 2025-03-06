
import React from 'react';
import { ReferenceLine, Label } from 'recharts';
import { Wave, FibTarget } from "@/utils/elliottWaveAnalysis";
import { StockHistoricalData } from "@/services/yahooFinanceService";

interface FibonacciTargetsProps {
  fibTargets: FibTarget[];
  currentWave: Wave;
  data: StockHistoricalData[];
}

const FibonacciTargets: React.FC<FibonacciTargetsProps> = ({ 
  fibTargets, 
  currentWave, 
  data 
}) => {
  if (!currentWave || !data || fibTargets.length === 0) return null;
  
  return (
    <>
      {fibTargets.map((target, index) => {
        const startPoint = data.find(d => d.timestamp === currentWave.startTimestamp);
        if (!startPoint) return null;
        
        return (
          <ReferenceLine
            key={`fib-${index}`}
            y={target.price}
            stroke={target.isExtension ? "#F59E0B" : "#60A5FA"}
            strokeDasharray={target.isExtension ? "3 3" : undefined}
            strokeWidth={1}
          >
            <Label
              value={`${target.label} (${target.price.toFixed(2)})`}
              position="right"
              fill={target.isExtension ? "#F59E0B" : "#60A5FA"}
              fontSize={10}
            />
          </ReferenceLine>
        );
      })}
    </>
  );
};

export default FibonacciTargets;
