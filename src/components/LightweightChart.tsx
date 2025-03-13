import React, { useRef, useEffect } from 'react';
// Import the necessary types
import { createChart, ColorType } from 'lightweight-charts';
import type { StockHistoricalData } from '@/types/shared';

interface LightweightChartProps {
  data: StockHistoricalData[];
  height?: number;
}

const LightweightChart: React.FC<LightweightChartProps> = ({ data, height = 300 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (chartContainerRef.current && data.length > 0) {
      // Create the chart with proper options
      const chart = createChart(chartContainerRef.current, {
        height,
        layout: {
          background: { 
            type: ColorType.Solid, // Use the enum instead of string literal
            color: 'transparent' 
          },
          textColor: '#DDD',
        },
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.2)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.2)' }
        }
      });
      
      // Use type assertion for the series creation
      // This handles different versions of lightweight-charts
      const series = (chart as any).addCandlestickSeries ? 
        (chart as any).addCandlestickSeries({
          upColor: '#4CAF50',
          downColor: '#F44336',
          borderVisible: false,
          wickUpColor: '#4CAF50',
          wickDownColor: '#F44336'
        }) : 
        // For newer versions, use the proper type
        chart.addSeries({
          type: 'candlestick',
          upColor: '#4CAF50',
          downColor: '#F44336',
          borderVisible: false,
          wickUpColor: '#4CAF50',
          wickDownColor: '#F44336'
        } as any);
      
      // Format data for the chart
      const formattedData = data.map(d => ({
        time: d.timestamp / 1000, // Convert to seconds if needed
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close
      }));
      
      series.setData(formattedData);
      
      return () => {
        chart.remove();
      };
    }
  }, [data, height]);
  
  return (
    <div ref={chartContainerRef} style={{ width: '100%' }} />
  );
};

export default LightweightChart;