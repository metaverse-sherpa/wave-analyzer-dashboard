import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StockCard from './StockCard';
import { StockData, fetchTopStocks } from '@/services/yahooFinanceService';
import { WaveAnalysisResult } from "@/utils/elliottWaveAnalysis";
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/lib/toast';
import { X, ChevronLeft, ChevronRight } from 'lucide-react'; // Add these missing Lucide icon imports
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import WaveAnalysis from '@/context/WaveAnalysisContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StockTrendList from './StockTrendList';
import WavePatternChart from './WavePatternChart';
import MarketOverview from './MarketOverview';
import Settings from './Settings'; // Import the new Settings component
import ApiStatusCheck from './ApiStatusCheck'; // Import the new ApiStatusCheck component

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [stockWaves, setStockWaves] = useState<Record<string, WaveAnalysisResult>>({});
  const [filteredStocks, setFilteredStocks] = useState<StockData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [selectedWave, setSelectedWave] = useState<number | 'all'>('all');
  
  const debouncedQuery = useDebounce(searchQuery, 300);
  
  // Add these missing variables and functions
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

  const { analyses, preloadAnalyses } = useWaveAnalysis();
  const { preloadHistoricalData } = useHistoricalData();

  // Use useCallback for functions
  const loadStocks = useCallback(async () => {
    setLoading(true);
    try {
      // Limit the number of stocks to analyze
      const topStocks = await fetchTopStocks();
      setStocks(topStocks.slice(0, 20)); // Only load top 20
      
      // Stagger loading to prevent CPU spikes
      setTimeout(() => {
        preloadHistoricalData(topStocks.slice(0, 20).map(s => s.symbol));
      }, 1000);
      
      setTimeout(() => {
        preloadAnalyses(topStocks.slice(0, 20).map(s => s.symbol));
      }, 2000);
    } catch (error) {
      console.error('Error loading stocks:', error);
      toast.error('Failed to load stocks data');
    } finally {
      setLoading(false);
    }
  }, [preloadAnalyses, preloadHistoricalData]);
  
  // Use a more conservative approach to refresh
  useEffect(() => {
    loadStocks();
    
    // Refresh data only every 5 minutes instead of continuously
    const intervalId = setInterval(() => {
      loadStocks();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [loadStocks]);
  
  // Filter stocks based on search query
  useEffect(() => {
    if (debouncedQuery) {
      const lowerCaseQuery = debouncedQuery.toLowerCase();
      const filtered = stocks.filter(stock => 
        stock.symbol.toLowerCase().includes(lowerCaseQuery) ||
        stock.shortName.toLowerCase().includes(lowerCaseQuery)
      );
      setFilteredStocks(filtered);
      setCurrentPage(1); // Reset to first page when search changes
    } else {
      setFilteredStocks(stocks);
    }
  }, [debouncedQuery, stocks]);

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

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Wave Analyzer Dashboard</h1>
        <Settings /> {/* Add the Settings component here */}
      </div>
      
      <ApiStatusCheck /> {/* Add the ApiStatusCheck component here */}

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
