import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockData, fetchHistoricalData, StockHistoricalData } from "@/services/yahooFinanceService";
import { analyzeElliottWaves, Wave } from "@/utils/elliottWaveAnalysis";
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired } from "@/services/databaseService";

interface StockCardProps {
  stock: StockData;
  onClick: (stock: StockData) => void;
  searchQuery?: string;
}

const StockCard: React.FC<StockCardProps> = ({ stock, onClick, searchQuery }) => {
  const [chartData, setChartData] = useState<StockHistoricalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWave, setCurrentWave] = useState<Wave | null>(null);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Check if we have a cached analysis
        const cachedAnalysis = retrieveWaveAnalysis(stock.symbol, '1d');
        
        if (cachedAnalysis && !isAnalysisExpired(cachedAnalysis.timestamp)) {
          // Use cached analysis
          setCurrentWave(cachedAnalysis.analysis.currentWave);
          
          // Still need to fetch chart data for display
          const historicalResponse = await fetchHistoricalData(stock.symbol, '1m', '1d');
          setChartData(historicalResponse.historicalData);
        } else {
          // Fetch new data and analyze
          const historicalResponse = await fetchHistoricalData(stock.symbol, '2y', '1d');
          if (historicalResponse.historicalData.length > 0) {
            setChartData(historicalResponse.historicalData.slice(-30)); // Only show last 30 days in mini chart
          } else {
            console.warn(`No historical data found for ${stock.symbol}`);
          }
          
          const analysis = analyzeElliottWaves(historicalResponse.historicalData);
          setCurrentWave(analysis.currentWave);
          
          // Store the analysis
          storeWaveAnalysis(stock.symbol, '1d', analysis);
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
    onClick(stock);
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
      className="stock-card cursor-pointer transition-all duration-300 hover:scale-102"
      onClick={handleCardClick}
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
          </div>
        </div>
        
        {loading ? (
          <div className="mini-chart flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin opacity-70" />
          </div>
        ) : (
          <div className="relative">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chartData.map(d => ({ price: d.close, date: new Date(d.timestamp * 1000) }))}>
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke={chartColor} 
                    strokeWidth={1.5} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground text-sm">No chart data available</div>
            )}
            
            {currentWave && (
              <div className={cn(
                "absolute top-0 right-0 wave-marker",
                `wave-${currentWave.number}`
              )}>
                Wave {currentWave.number}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StockCard;
