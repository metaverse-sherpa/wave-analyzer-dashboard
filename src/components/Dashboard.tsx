import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import StockCard from './StockCard';
import { fetchTopStocks } from '@/services/yahooFinanceService';

const Dashboard: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<StockData[]>([]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Search query changed:', e.target.value);
    setSearchQuery(e.target.value);
  };

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
    } else {
      setFilteredStocks(stocks);
    }
  }, [debouncedQuery, stocks]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="relative w-full max-w-md mb-6">
        <Input
          type="text"
          placeholder="Search by symbol or company name..."
          value={searchQuery}
          onChange={handleSearchChange}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredStocks.map(stock => (
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
    </div>
  );
};

export default Dashboard; 