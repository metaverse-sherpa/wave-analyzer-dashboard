import React, { useEffect, useState } from 'react';
import { useTelegram } from '@/context/TelegramContext';
import TelegramLayout from '@/components/layout/TelegramLayout';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
// Fix: Import marketIndexes from the correct path with correct export name
import { marketIndexes } from '@/config/marketIndexes';

const TelegramEntryPoint: React.FC = () => {
  const { isTelegram, isInitialized, expandApp, sendAnalyticsEvent } = useTelegram();
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis(); // Fix: Use available properties from context
  const [loading, setLoading] = useState(true);
  const [popularStocks, setPopularStocks] = useState<Array<{symbol: string, name: string}>>([]);
  
  // Generate trending stocks based on available analyses
  useEffect(() => {
    // Extract stocks from analyses and create a simple list
    const stocksList = Object.keys(analyses).slice(0, 6).map(symbol => ({
      symbol,
      name: symbol // Simple fallback if no name data is available
    }));

    // Use some default stocks if no analyses available
    if (stocksList.length === 0) {
      setPopularStocks([
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corp.' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'META', name: 'Meta Platforms Inc.' },
        { symbol: 'TSLA', name: 'Tesla Inc.' }
      ]);
    } else {
      setPopularStocks(stocksList);
    }
  }, [analyses]);
  
  // Expand the Telegram Mini App to full height
  useEffect(() => {
    if (isTelegram) {
      expandApp();
      // Track page view
      sendAnalyticsEvent('telegram_app_opened');
    }
    
    // Set loading to false after a short delay
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isTelegram, expandApp, sendAnalyticsEvent]);
  
  const handleStockSelect = (symbol: string, name?: string) => {
    // Track stock selection
    sendAnalyticsEvent('stock_selected', { symbol, name });
    navigate(`/stocks/${symbol}`);
  };
  
  const handleIndexSelect = (symbol: string, name?: string) => {
    // Track index selection
    sendAnalyticsEvent('index_selected', { symbol, name });
    navigate(`/stocks/${symbol}`);
  };

  const handleViewDashboard = () => {
    // Track full dashboard view
    sendAnalyticsEvent('view_full_dashboard');
    navigate('/');
  };
  
  if (!isInitialized || loading) {
    return (
      <TelegramLayout>
        <div className="flex items-center justify-center h-[70vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </TelegramLayout>
    );
  }
  
  return (
    <TelegramLayout title="Wave Analyzer">
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Market Indices</h2>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {marketIndexes.slice(0, 4).map((index) => (
            <Button 
              key={index.symbol} 
              variant="outline" 
              className="flex justify-between items-center h-20 p-3"
              onClick={() => handleIndexSelect(index.symbol, index.name)}
            >
              <div className="flex flex-col items-start">
                <span className="font-bold">{index.name}</span>
                <span className="text-sm opacity-70">{index.symbol}</span>
              </div>
              <ArrowRight className="h-4 w-4 opacity-50" />
            </Button>
          ))}
        </div>
        
        <h2 className="text-xl font-bold mb-4">Popular Stocks</h2>
        <div className="grid grid-cols-2 gap-2">
          {popularStocks.map((stock) => (
            <Button 
              key={stock.symbol} 
              variant="outline" 
              className="flex justify-between items-center h-20 p-3"
              onClick={() => handleStockSelect(stock.symbol, stock.name)}
            >
              <div className="flex flex-col items-start">
                <span className="font-bold">{stock.symbol}</span>
                <span className="text-sm opacity-70">{stock.name}</span>
              </div>
              <ArrowRight className="h-4 w-4 opacity-50" />
            </Button>
          ))}
        </div>
        
        <div className="mt-6 text-center">
          <Button 
            variant="default" 
            className="w-full"
            onClick={handleViewDashboard}
          >
            View Full Dashboard
          </Button>
        </div>
      </div>
    </TelegramLayout>
  );
};

export default TelegramEntryPoint;