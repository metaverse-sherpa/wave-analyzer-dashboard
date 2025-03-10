import React from 'react';
import { Line } from 'recharts';
import { Wave } from "@/utils/elliottWaveAnalysis";
import { StockHistoricalData } from "@/services/yahooFinanceService";

interface WaveLineProps {
  wave: Wave;
  data: StockHistoricalData[];
  color: string;
}

const WaveLine: React.FC<WaveLineProps> = ({ wave, data, color }) => {
  if (!wave || !data || !wave.startTimestamp) return null;
  
  // Find data points based on timestamps
  const startPoint = data.find(d => d.timestamp === wave.startTimestamp);
  const endPoint = wave.endTimestamp 
    ? data.find(d => d.timestamp === wave.endTimestamp)
    : data[data.length - 1];
  
  if (!startPoint || !endPoint) return null;
  
  return (
    <Line
      type="linear"
      dataKey="price"
      stroke={color}
      strokeWidth={2}
      dot={false}
      isAnimationActive={false}
      connectNulls
      data={[
        { timestamp: startPoint.timestamp * 1000, price: wave.startPrice },
        { timestamp: endPoint.timestamp * 1000, price: wave.endPrice || endPoint.close }
      ]}
      name={`Wave ${wave.number}`}
    />
  );
};

export default WaveLine;
