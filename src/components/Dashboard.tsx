import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StockCard } from './StockCard';
import { Input } from "@/components/ui/input";
import { useDebounce } from '@/hooks/useDebounce';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { toast } from "@/components/ui/use-toast";
import { fetchTopStocks } from '@/services/yahooFinanceService';
import type { StockData } from '@/types/shared';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X, ChevronLeft, ChevronRight } from 'lucide-react'; // Add these missing Lucide icon imports
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import WavePatternChart from './WavePatternChart';
import MarketOverview from './MarketOverview';
import Settings from './Settings'; // Import the new Settings component
import ReversalCandidatesList from '@/components/ReversalCandidatesList'; // Add this import
import type { WaveAnalysisResult } from '@/types/shared';

interface DashboardProps {
  stocks?: StockData[];
  analyses?: Record<string, any>;
  stockWaves?: Record<string, any>;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  stocks: initialStocks = [], 
  analyses = {}, 
  stockWaves = {} 
}) => {
  // Add isLoadingRef to track loading state without causing re-renders
  const isLoadingRef = useRef(false);
  const [stocks, setStocks] = useState<StockData[]>(initialStocks);
  const [filteredStocks, setFilteredStocks] = useState<StockData[]>(initialStocks);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const debouncedQuery = useDebounce(searchQuery, 300);
  
  const { preloadHistoricalData } = useHistoricalData();
  const { preloadAnalyses } = useWaveAnalysis();
  const navigate = useNavigate();
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [selectedWave, setSelectedWave] = useState<number | 'all'>('all');
  
  const itemsPerPageOptions = [
    { value: 12, label: '12' },
    { value: 24, label: '24' },
    { value: 48, label: '48' },
    { value: 96, label: '96' }
  ];
  
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Memoize the filter function to prevent recreating it on every render
  const filterStocks = useCallback((stockList: StockData[], query: string) => {
    const lowerCaseQuery = query.toLowerCase();
    return stockList.filter(stock => 
      stock.symbol.toLowerCase().includes(lowerCaseQuery) ||
      (stock.name || '').toLowerCase().includes(lowerCaseQuery)
    );
  }, []);
  
  // Add this flag at the top of the Dashboard component
  const ENABLE_AUTO_PRELOAD = false; // Set to false to prevent auto-loading data

  const loadStocks = useCallback(async () => {
    if (isLoadingRef.current) return;
    
    isLoadingRef.current = true;
    setLoading(true);
    
    try {
      const data = await fetchTopStocks(100);
      setStocks(data);
      
      // Only preload if the flag is enabled
      if (ENABLE_AUTO_PRELOAD) {
        // Preload data for top 10 stocks - now controlled by flag
        const symbols = data.slice(0, 10).map(stock => stock.symbol);
        await preloadHistoricalData(symbols);
        await preloadAnalyses(symbols);
      }
    } catch (error) {
      console.error('Failed to load stocks:', error);
      toast({
        description: 'Failed to load stocks data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [preloadHistoricalData, preloadAnalyses]);

  // Initial load - use empty dependency array to only run ONCE
  useEffect(() => {
    loadStocks();
    
    // Set up refresh interval
    const intervalId = setInterval(() => {
      loadStocks();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array
  
  // Move loadStocks to a ref to avoid dependency issues
  const loadStocksRef = useRef(loadStocks);
  
  // Update ref when loadStocks changes
  useEffect(() => {
    loadStocksRef.current = loadStocks;
  }, [loadStocks]);
  
  // Handle search filtering in a separate effect
  useEffect(() => {
    if (stocks.length === 0) return;
    
    const filtered = debouncedQuery ? 
      filterStocks(stocks, debouncedQuery) : 
      stocks;
      
    setFilteredStocks(filtered);
    setCurrentPage(1);
  }, [debouncedQuery, stocks, filterStocks]);

  // Filter stocks based on selected wave using the context's analyses
  const filteredStocksByWave = useMemo(() => {
    if (selectedWave === 'all') return filteredStocks;
    
    return filteredStocks.filter(stock => {
      // Check in the context's analyses
      const analysisKey = `${stock.symbol}_1d`;
      const waveAnalysis = analyses[analysisKey] || stockWaves[stock.symbol];
      if (!waveAnalysis || !waveAnalysis.currentWave) return false;
      
      // Compare as strings to handle both number and letter waves
      return String(waveAnalysis.currentWave.number) === String(selectedWave);
    });
  }, [filteredStocks, selectedWave, analyses, stockWaves]);

  // Handle StockCard click
  const handleStockClick = (stock: StockData) => {
    // Navigate to the stock details page
    navigate(`/stocks/${stock.symbol}`);
  };
  
  // Pagination logic remains the same
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredStocksByWave.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredStocksByWave.length / itemsPerPage);

  // Type-safe access to analyses
  const getAnalysis = (symbol: string): WaveAnalysisResult | undefined => {
    return analyses[symbol] || stockWaves[symbol];
  };

  const { analyses: waveAnalyses } = useWaveAnalysis();
  
  // Calculate market sentiment from wave analyses
  const marketSentiment = useMemo(() => {
    const analysisList = Object.values(waveAnalyses);
    
    if (!analysisList || analysisList.length === 0) {
      return {
        count: 0,
        bullish: 0,
        bearish: 0,
        neutral: 0,
        bullishPercentage: 0,
        bearishPercentage: 0,
        neutralPercentage: 0,
        overallSentiment: 'Neutral'
      };
    }
    
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    
    analysisList.forEach(analysis => {
      if (!analysis || !analysis.waves || analysis.waves.length === 0) return;
      
      // Get the latest wave classification
      const latestWave = analysis.waves[analysis.waves.length - 1];
      
      // Check if wave properties exist on the wave object
      if (!latestWave) return;
      
      // Access properties safely using optional chaining
      const waveDegree = (latestWave as any).degree;
      const waveNumber = (latestWave as any).waveNumber || latestWave.number; // Try both property names
      const waveTrend = (latestWave as any).trend;
      
      // Use your app's wave structure to determine sentiment
      if (waveDegree === 'Primary' || waveDegree === 'Intermediate' || waveNumber) {
        // Determine if this is an impulse or corrective wave
        // For numerically labeled waves (1-5 are impulse, a-c are corrective)
        let isImpulseWave = false;
        
        if (typeof waveNumber === 'number') {
          // Numbered waves: 1, 3, 5 are impulse waves
          isImpulseWave = [1, 3, 5].includes(waveNumber);
        } else if (typeof waveNumber === 'string') {
          // If using string numbers or letters, check accordingly
          isImpulseWave = ['1', '3', '5'].includes(waveNumber);
        }
        
        // Determine trend direction (if available)
        const isUptrend = waveTrend === 'up' || waveTrend === true;
        
        // Impulse waves in uptrend are bullish, corrective waves in uptrend are bearish
        // In downtrend, it's reversed
        if ((isUptrend && isImpulseWave) || (!isUptrend && !isImpulseWave)) {
          bullish++;
        } else if ((isUptrend && !isImpulseWave) || (!isUptrend && isImpulseWave)) {
          bearish++;
        } else {
          neutral++;
        }
      } else {
        neutral++;
      }
    });
    
    const total = bullish + bearish + neutral;
    const bullishPercentage = Math.round((bullish / total) * 100) || 0;
    const bearishPercentage = Math.round((bearish / total) * 100) || 0;
    const neutralPercentage = Math.round((neutral / total) * 100) || 0;
    
    // Determine overall sentiment
    let overallSentiment = 'Neutral';
    if (bullishPercentage > 60) overallSentiment = 'Bullish';
    else if (bearishPercentage > 60) overallSentiment = 'Bearish';
    else if (bullishPercentage > bearishPercentage + 10) overallSentiment = 'Slightly Bullish';
    else if (bearishPercentage > bullishPercentage + 10) overallSentiment = 'Slightly Bearish';
    
    return {
      count: total,
      bullish,
      bearish,
      neutral,
      bullishPercentage,
      bearishPercentage,
      neutralPercentage,
      overallSentiment
    };
  }, [waveAnalyses]);

  // Remove the separate Reversal Alerts card since it's now integrated

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Market Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <MarketOverview />
          </CardContent>
        </Card>
      </div>
      
      {/* Additional dashboard sections can remain here */}
    </div>
  );
};

export default Dashboard;
