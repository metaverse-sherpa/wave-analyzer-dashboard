import React, { useMemo } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

const WavePatternChart: React.FC = () => {
  const { analyses } = useWaveAnalysis();
  
  // Generate stats about wave patterns in the analyses
  const waveData = useMemo(() => {
    const waveCounts: Record<string | number, number> = { 
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, A: 0, B: 0, C: 0
    };
    
    // Count occurrences of each wave number with null checks
    Object.values(analyses).forEach(analysis => {
      if (analysis && analysis.currentWave && analysis.currentWave.number) {
        const waveNumber = analysis.currentWave.number;
        if (waveCounts[waveNumber] !== undefined) {
          waveCounts[waveNumber]++;
        }
      }
    });
    
    // Convert to array format for PieChart
    return Object.entries(waveCounts)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0);
  }, [analyses]);
  
  // Custom colors for each wave
  const COLORS = [
    '#22d3ee', // Wave 1 - Cyan
    '#a78bfa', // Wave 2 - Purple
    '#22c55e', // Wave 3 - Green
    '#f59e0b', // Wave 4 - Amber
    '#ef4444', // Wave 5 - Red
    '#ec4899', // Wave A - Pink
    '#3b82f6', // Wave B - Blue
    '#a855f7'  // Wave C - Violet
  ];
  
  return (
    <div className="w-full h-72">
      {waveData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={waveData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            >
              {waveData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          No wave data available
        </div>
      )}
    </div>
  );
};

export default WavePatternChart;