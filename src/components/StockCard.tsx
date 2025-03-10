import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockData, fetchHistoricalData, StockHistoricalData } from "@/services/yahooFinanceService";
import { analyzeElliottWaves, Wave, WaveAnalysisResult } from "@/utils/elliottWaveAnalysis";
import { storeWaveAnalysis } from "@/services/databaseService";
import { LightweightChart } from '@/components/LightweightChart';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

interface StockCardProps {
  stock: StockData;
  onClick: (stock: StockData, waveAnalysis?: WaveAnalysisResult) => void;
  searchQuery: string;
}

const StockCard: React.FC<StockCardProps> = ({ stock, onClick, searchQuery }) => {
  const [chartData, setChartData] = useState<StockHistoricalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWave, setCurrentWave] = useState<Wave | null>(null);
  const [waveAnalysis, setWaveAnalysis] = useState<WaveAnalysisResult | null>(null);
  const { getAnalysis } = useWaveAnalysis();
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Try to get analysis from context/cache
        let analysis = await getAnalysis(stock.symbol, '1d');
        
        // If we don't have analysis, fetch new data and analyze
        if (!analysis) {
          const historicalResponse = await fetchHistoricalData(stock.symbol, '1d');
          
          if (historicalResponse.historicalData.length > 0) {
            setChartData(historicalResponse.historicalData.slice(-30)); // Only show last 30 days in mini chart
            
            // Analyze the data
            analysis = analyzeElliottWaves(historicalResponse.historicalData);
            
            // Store the analysis
            storeWaveAnalysis(stock.symbol, '1d', analysis);
          } else {
            console.warn(`No historical data found for ${stock.symbol}`);
          }
        } else {
          // Still need to fetch chart data for display
          const historicalResponse = await fetchHistoricalData(stock.symbol, '1d');
          if (historicalResponse.historicalData.length > 0) {
            setChartData(historicalResponse.historicalData.slice(-30));
          }
        }
        
        if (analysis) {
          setCurrentWave(analysis.currentWave);
          setWaveAnalysis(analysis);
        }
      } catch (error) {
        console.error(`Error loading data for ${stock.symbol}:`, error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [stock.symbol]);
  
  const priceChange = stock.regularMarketChange;
  const priceChangePercent = stock.regularMarketChangePercent;
  const isPositive = priceChange >= 0;
  
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(stock.regularMarketPrice);
  
  const formattedChange = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Math.abs(priceChange));
  
  const formattedPercent = `${Math.abs(priceChangePercent).toFixed(2)}%`;
  
  const chartColor = isPositive ? 'var(--bullish)' : 'var(--bearish)';
  
  const handleCardClick = () => {
    // Pass both the stock and the wave analysis to the onClick handler
    onClick(stock, waveAnalysis || undefined);
  };
  
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    return text.split(regex).map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={index} className="bg-yellow-200">{part}</span>
      ) : (
        part
      )
    );
  };
  
  return (
    <Card 
      className={cn("overflow-hidden hover:shadow-lg transition-shadow", 
        loading ? "opacity-70" : "")} 
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <CardTitle className="text-lg font-semibold">
              {highlightMatch(stock.symbol, searchQuery)}
            </CardTitle>
            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
              {highlightMatch(stock.shortName, searchQuery)}
            </p>
          </div>
          
          <div className="text-right">
            <div className="text-base font-mono font-medium">{formattedPrice}</div>
            <div className={cn(
              "flex items-center justify-end text-xs",
              isPositive ? "text-bullish" : "text-bearish"
            )}>
              {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
              <span>{formattedChange} ({formattedPercent})</span>
            </div>
            <div className={cn(
              "text-xs mt-1",
              `wave-${stock.wave}`
            )}>
              Wave {stock.wave}
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="mini-chart flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin opacity-70" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="mini-chart flex items-center justify-center text-muted-foreground">
            No chart data available
          </div>
        ) : (
          <div className="h-24">
            <LightweightChart data={chartData} />
          </div>
        )}
        {currentWave && (
          <div className="absolute top-2 right-2 px-2 py-1 text-xs bg-background/80 backdrop-blur-sm rounded-md">
            Wave {currentWave.number}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StockCard;
