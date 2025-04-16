import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, highlightMatch } from '@/utils/formatters';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import { ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import LightweightChart from '@/components/LightweightChart';
import type { StockData, StockHistoricalData, WaveAnalysisResult } from '@/types/shared';
import { fetchStockQuote } from '@/lib/api';

interface StockCardProps {
  stock: StockData;
  historicalData?: any[];
  onSelect?: (symbol: string) => void;
  searchQuery?: string;
}

export const StockCard = ({ stock: initialStock, historicalData = [], onSelect, searchQuery = '' }: StockCardProps & { searchQuery?: string }) => {
  const [stock, setStock] = useState(initialStock);
  const { analyses } = useWaveAnalysis();
  const cacheKey = `${stock.symbol}:1d`;
  const waveAnalysis = analyses[cacheKey] as WaveAnalysisResult | undefined;

  const [chartData, setChartData] = useState<StockHistoricalData[]>([]);
  const [loading, setLoading] = useState(true);
  const { getHistoricalData } = useHistoricalData();
  
  // Get currentWave and waveAnalysis from context
  const currentWave = waveAnalysis?.currentWave;
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Use the context to get historical data
        const historicalData = await getHistoricalData(stock.symbol, '1d');
        if (historicalData.length > 0) {
          setChartData(historicalData.slice(-30)); // Only show last 30 days in mini chart
        }
      } catch (error) {
        console.error(`Error loading data for ${stock.symbol}:`, error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [stock.symbol, getHistoricalData]);
  
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
    // Pass the stock to the onClick handler - we don't need to pass waveAnalysis
    // as it's already in the shared context
    onSelect(stock.symbol);
  };

  const fetchLatestPrice = async () => {
    try {
      const quote = await fetchStockQuote(stock.symbol);
      setStock(prevStock => ({
        ...prevStock,
        regularMarketPrice: quote.regularMarketPrice,
        regularMarketChange: quote.regularMarketChange,
        regularMarketChangePercent: quote.regularMarketChangePercent
      }));
    } catch (error) {
      console.error('Error fetching latest price:', error);
    }
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
            {currentWave && (
              <div className={cn(
                "text-xs mt-1",
                `wave-${currentWave.number}`
              )}>
                Wave {currentWave.number}
              </div>
            )}
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
