import React from 'react';
import { CandlestickSeries, Chart, ChartCanvas, XAxis, YAxis } from 'react-financial-charts';
import { scaleTime, scaleLinear } from 'd3-scale';
import { StockHistoricalData } from '@/services/yahooFinanceService';

interface CandleStickChartProps {
  data: StockHistoricalData[];
}

export const CandleStickChart: React.FC<CandleStickChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    console.warn('No data provided to CandleStickChart');
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground">
        No chart data available
      </div>
    );
  }

  // Convert Unix timestamps to Date objects
  const chartData = data.map(d => ({
    date: new Date(d.timestamp * 1000), // Convert Unix timestamp to Date
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume
  }));

  // Verify the data is daily
  const isDailyData = chartData.every((d, i) => {
    if (i === 0) return true; // Skip the first item
    const prevDate = chartData[i - 1].date;
    const currentDate = d.date;
    const timeDiff = currentDate.getTime() - prevDate.getTime();
    return timeDiff >= 86400000 && timeDiff <= 86400000 * 2; // 1 day ± buffer
  });

  if (!isDailyData) {
    console.warn('CandleStickChart expects daily data but received a different timeframe');
  }

  const xScale = scaleTime();
  const yScale = scaleLinear();

  const xExtents = [
    chartData[0].date,
    chartData[chartData.length - 1].date
  ];

  return (
    <ChartCanvas
      height={100}
      width={300}
      ratio={3}
      margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
      seriesName="Candles"
      data={chartData}
      xScale={xScale}
      xExtents={xExtents}
    >
      <Chart id={1} yExtents={d => [d.high, d.low]}>
        <XAxis showGridLines />
        <YAxis showGridLines />
        <CandlestickSeries />
      </Chart>
    </ChartCanvas>
  );
}; 