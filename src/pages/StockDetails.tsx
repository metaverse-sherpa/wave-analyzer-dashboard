import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge"; // Add this import
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import StockDetailChart from "@/components/StockDetailChart";
import AIAnalysis from "@/components/AIAnalysis";
import { 
  fetchHistoricalData, 
  StockHistoricalData, 
  StockData, 
  fetchTopStocks 
} from "@/services/yahooFinanceService";
import { 
  analyzeElliottWaves, 
  WaveAnalysisResult 
} from "@/utils/elliottWaveAnalysis";
import { 
  storeWaveAnalysis, 
  retrieveWaveAnalysis, 
  isAnalysisExpired 
} from "@/services/databaseService";
import { toast } from "@/lib/toast";
import ErrorBoundary from '@/components/ErrorBoundary';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import SimpleCandlestickChart from '@/components/SimpleCandlestickChart';
import WaveAnalysis from '@/context/WaveAnalysisContext';
import WaveSequencePagination from '@/components/WaveSequencePagination';
import { Card, CardContent } from "@/components/ui/card";

interface StockDetailsProps {
  stock?: StockData;
}

const defaultStock: StockData = {
  symbol: '',
  shortName: '',
  regularMarketPrice: 0,
  regularMarketChange: 0,
  regularMarketChangePercent: 0,
  regularMarketVolume: 0,
  averageVolume: 0,
  marketCap: 0,
  fiftyTwoWeekLow: 0,
  fiftyTwoWeekHigh: 0,
};

const StockDetails: React.FC<StockDetailsProps> = ({ stock = defaultStock }) => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [analysis, setAnalysis] = useState<WaveAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { getAnalysis } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData();
  
  useEffect(() => {
    const loadData = async () => {
      if (!symbol) return;
      
      try {
        setLoading(true);
        
        // Get stock info
        const stocks = await fetchTopStocks();
        const stock = stocks.find(s => s.symbol === symbol);
        
        if (stock) {
          setStockData(stock);
        } else {
          toast.error(`Stock ${symbol} not found`);
          navigate('/');
          return;
        }
        
        // Load both historical data and wave analysis in parallel
        const [historicalData, waveAnalysis] = await Promise.all([
          getHistoricalData(symbol, '1d'),
          getAnalysis(symbol, '1d')
        ]);
        
        // Set historical data
        setHistoricalData(historicalData);
        
        // Set wave analysis if available
        if (waveAnalysis) {
          setAnalysis(waveAnalysis);
        } else {
          // Only show error if we have historical data but no analysis
          if (historicalData.length > 0) {
            toast.error(`Could not analyze waves for ${symbol}`);
          }
        }
      } catch (error) {
        console.error(`Error loading data for ${symbol}:`, error);
        toast.error(`Failed to load data for ${symbol}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [symbol, navigate, getAnalysis, getHistoricalData]);
  
  const handleBackClick = () => {
    navigate('/');
  };
  
  if (!symbol) {
    return <div>Invalid stock symbol</div>;
  }
  
  const regularMarketPrice = stockData?.regularMarketPrice || 0;
  const regularMarketChange = stockData?.regularMarketChange || 0;
  const regularMarketChangePercent = stockData?.regularMarketChangePercent || 0;
  
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(regularMarketPrice);
  
  const formattedChange = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Math.abs(regularMarketChange));
  
  const formattedPercent = `${Math.abs(regularMarketChangePercent).toFixed(2)}%`;
  
  const isPositive = regularMarketChange >= 0;
  
  return (
    <ErrorBoundary>
      <div className="container mx-auto px-4 py-6">
        {/* Header with back button and stock info */}
        <div className="flex items-center justify-between mb-6">
          <Button 
            variant="ghost" 
            className="mb-6 flex items-center gap-2"
            onClick={handleBackClick}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        {/* Main content area */}
        <div className="space-y-6">
          {/* Chart section */}
          <div className="bg-card rounded-lg p-6">
            {loading ? (
              <Skeleton className="w-full h-[500px]" />
            ) : analysis ? (
              <StockDetailChart
                symbol={symbol}
                data={historicalData}
                waves={analysis.waves}
                currentWave={analysis.currentWave}
                fibTargets={analysis.fibTargets}
              />
            ) : null}
          </div>

          {/* Analysis sections in two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Elliott Wave Analysis */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Elliott Wave Analysis</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Wave Sequence</h4>
                    <Badge variant="outline">
                      {analysis?.waves.length || 0} waves detected
                    </Badge>
                  </div>
                  
                  {analysis && <WaveSequencePagination waves={analysis.waves} />}
                </div>
              </CardContent>
            </Card>

            {/* AI Analysis */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
                {analysis && (
                  <AIAnalysis 
                    symbol={symbol}
                    analysis={analysis}
                    historicalData={historicalData}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default StockDetails;
