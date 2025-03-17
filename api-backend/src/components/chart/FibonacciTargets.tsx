import React from 'react';
import { ReferenceLine } from 'recharts';
import { FibTarget } from "@/utils/elliottWaveAnalysis";
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

interface FibonacciTargetsProps {
  fibTargets: FibTarget[];
}

const FibonacciTargets: React.FC<FibonacciTargetsProps> = ({ fibTargets }) => {
  const { analyses, getAnalysis } = useWaveAnalysis();

  return (
    <>
      {fibTargets.map((target, index) => (
        <ReferenceLine
          key={`fib-${index}`}
          y={target.price}
          stroke={target.isExtension ? "#9c27b0" : "#3f51b5"}
          strokeDasharray="3 3"
          strokeOpacity={0.6}
          label={{
            position: 'right',
            value: `${target.label}`,
            fill: target.isExtension ? "#9c27b0" : "#3f51b5",
            fontSize: 10
          }}
        />
      ))}
    </>
  );
};

export default FibonacciTargets;
