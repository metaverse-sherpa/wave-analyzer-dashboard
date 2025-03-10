import React, { useState, useEffect, useMemo } from 'react';
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

  // Load stocks when component mounts
  useEffect(() => {
    const loadStocks = async () => {
      try {
        const stockData = await fetchTopStocks();
        setStocks(stockData);
        setFilteredStocks(stockData);
      } catch (error) {
        console.error('Error loading stocks:', error);
        toast.error('Failed to load stocks');
      } finally {
        setLoading(false);
      }
    };
    
    loadStocks();
  }, []);
  
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

  const { analyses } = useWaveAnalysis();
  
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

  // Handle StockCard click including wave analysis
  const handleStockClick = (stock: StockData, waveAnalysis?: WaveAnalysisResult) => {
    // Store the wave analysis if provided
    if (waveAnalysis) {
      setStockWaves(prev => ({
        ...prev,
        [stock.symbol]: waveAnalysis
      }));
    }
    
    navigate(`/stocks/${stock.symbol}`);
  };
  
  // Pagination logic remains the same
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredStocksByWave.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredStocksByWave.length / itemsPerPage);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-full max-w-md">
          <Input
            type="text"
            placeholder="Search by symbol or company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selectedWave.toString()}
            onValueChange={(value) => setSelectedWave(value === 'all' ? 'all' : Number(value))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Wave" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Waves</SelectItem>
              <SelectItem value="1">Wave 1</SelectItem>
              <SelectItem value="2">Wave 2</SelectItem>
              <SelectItem value="3">Wave 3</SelectItem>
              <SelectItem value="4">Wave 4</SelectItem>
              <SelectItem value="5">Wave 5</SelectItem>
              <SelectItem value="A">Wave A</SelectItem>
              <SelectItem value="B">Wave B</SelectItem>
              <SelectItem value="C">Wave C</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Items per page:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
            className="border rounded-md p-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {itemsPerPageOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {currentItems.map(stock => (
          <StockCard
            key={stock.symbol}
            stock={stock}
            onClick={handleStockClick}
            searchQuery={searchQuery}
          />
        ))}
      </div>

      {itemsPerPage < filteredStocksByWave.length && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;