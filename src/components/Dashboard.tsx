import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import WaveAnalysis from '@/context/WaveAnalysisContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StockTrendList from './StockTrendList';
import WavePatternChart from './WavePatternChart';
import MarketOverview from './MarketOverview';
import Settings from './Settings'; // Import the new Settings component
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
  
  // Load stocks only once on mount or when dependencies change
  const loadStocks = useCallback(async () => {
    if (loading) return; // Prevent multiple simultaneous loads
    
    setLoading(true);
    try {
      const data = await fetchTopStocks(100);
      setStocks(data);
      // Only update filtered stocks if no search query is active
      if (!debouncedQuery) {
        setFilteredStocks(data);
      }
      
      // Preload data for top stocks
      const symbols = data.slice(0, 10).map(stock => stock.symbol);
      await preloadHistoricalData(symbols);
      await preloadAnalyses(symbols);
    } catch (error) {
      console.error('Failed to load stocks:', error);
      toast({
        description: 'Failed to load stocks data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [preloadAnalyses, preloadHistoricalData, debouncedQuery]);
  
  // Initial load & refresh timer
  useEffect(() => {
    loadStocks();
    
    // Refresh data every 5 minutes
    const intervalId = setInterval(() => {
      loadStocks();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [loadStocks]);
  
  // Handle search filtering - memoize the filtered results
  useEffect(() => {
    // Skip if stocks aren't loaded yet
    if (stocks.length === 0) return;
    
    const filtered = debouncedQuery ? 
      filterStocks(stocks, debouncedQuery) : 
      stocks;
      
    setFilteredStocks(filtered);
    setCurrentPage(1); // Reset to first page when search changes
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
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Wave Analyzer Dashboard</h1>
        <Settings /> {/* Add the Settings component here */}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Market Overview</CardTitle>
            <CardDescription>Current market trends and key indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <MarketOverview />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock Trends</CardTitle>
            <CardDescription>Key stocks and their Elliott Wave patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <StockTrendList />
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-3">
          <CardHeader>
            <CardTitle>Wave Pattern Analysis</CardTitle>
            <CardDescription>Detailed Elliott Wave patterns for selected stocks</CardDescription>
          </CardHeader>
          <CardContent>
            <WavePatternChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
