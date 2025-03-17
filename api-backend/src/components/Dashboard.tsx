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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Market Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <MarketOverview />
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Reversal Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <ReversalCandidatesList />
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Retain other sections of the dashboard */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Stocks</CardTitle>
            <div className="flex items-center gap-2">
              {/* Existing controls for stocks section */}
            </div>
          </CardHeader>
          <CardContent>
            {/* Existing stock listing content */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
