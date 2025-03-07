import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import StockCard from './StockCard';
import { fetchTopStocks, StockData } from '@/services/yahooFinanceService';

const Dashboard: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<StockData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Calculate pagination values
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredStocks.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredStocks.length / itemsPerPage);

  // Update the itemsPerPageOptions array to ensure unique keys
  const itemsPerPageOptions = [
    { value: 20, label: '20' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: filteredStocks.length, label: 'All' }
  ].filter((option, index, self) => 
    // Remove duplicates by checking if the value already exists
    self.findIndex(o => o.value === option.value) === index
  );

  // Fetch stocks on component mount
  useEffect(() => {
    const loadStocks = async () => {
      const stocks = await fetchTopStocks();
      setStocks(stocks);
      setFilteredStocks(stocks);
    };
    loadStocks();
  }, []);

  // Update filtered stocks when debounced query changes
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

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

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
            onClick={(selectedStock) => {
              // Handle stock selection
            }}
            searchQuery={searchQuery}
          />
        ))}
      </div>

      {/* Update pagination controls to only show when not showing all items */}
      {itemsPerPage < filteredStocks.length && (
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