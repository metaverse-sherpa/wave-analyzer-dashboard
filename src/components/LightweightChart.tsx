import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import { CandlestickSeries } from 'lightweight-charts';
import { StockHistoricalData } from '@/services/yahooFinanceService';

interface LightweightChartProps {
  data: StockHistoricalData[];
}

export const LightweightChart: React.FC<LightweightChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Initialize the chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        textColor: 'white',
        background: { type: 'solid', color: 'transparent' },
      },
      watermark: {
        visible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 100,
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Format data for the chart
    const chartData = data.map(d => ({
      time: d.timestamp / 1000, // Convert to seconds
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    // Set the data
    candlestickSeries.setData(chartData);

    // Fit the chart to the data
    chart.timeScale().fitContent();

    // Cleanup on unmount
    return () => {
      chart.remove();
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return <div ref={chartContainerRef} className="h-24 w-full" />;
}; 