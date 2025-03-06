
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StockCard from '@/components/StockCard';
import DashboardHeader from '@/components/DashboardHeader';
import { fetchTopStocks, StockData } from '@/services/yahooFinanceService';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetType, setAssetType] = useState<'stocks' | 'crypto' | 'forex'>('stocks');
  
  useEffect(() => {
    loadStocks();
  }, [assetType]);
  
  useEffect(() => {
    // Filter stocks based on search query
    if (!searchQuery.trim()) {
      setFilteredStocks(stocks);
      return;
    }
    
    const query = searchQuery.toLowerCase().trim();
    const filtered = stocks.filter(stock => 
      stock.symbol.toLowerCase().includes(query) || 
      stock.shortName.toLowerCase().includes(query)
    );
    
    setFilteredStocks(filtered);
  }, [stocks, searchQuery]);
  
  const loadStocks = async () => {
    try {
      setLoading(true);
      
      // In a real implementation, we'd have different endpoints for each asset type
      let data: StockData[] = [];
      
      if (assetType === 'stocks') {
        data = await fetchTopStocks(100);
      } else if (assetType === 'crypto') {
        toast.info('Cryptocurrency data is coming soon');
        // Placeholder - would fetch crypto in real implementation
        data = [];
      } else if (assetType === 'forex') {
        toast.info('Forex data is coming soon');
        // Placeholder - would fetch forex in real implementation
        data = [];
      }
      
      setStocks(data);
      setFilteredStocks(data);
    } catch (error) {
      console.error('Error loading stocks:', error);
      toast.error('Failed to load market data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = async () => {
    await loadStocks();
  };
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };
  
  const handleAssetTypeChange = (type: 'stocks' | 'crypto' | 'forex') => {
    if (type !== assetType) {
      setAssetType(type);
    }
  };
  
  const handleStockClick = (stock: StockData) => {
    navigate(`/stock/${stock.symbol}`);
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      <DashboardHeader 
        onSearch={handleSearch}
        onRefresh={handleRefresh}
        onAssetTypeChange={handleAssetTypeChange}
        assetType={assetType}
      />
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50" />
          <p className="mt-4 text-muted-foreground">Loading market data...</p>
        </div>
      ) : filteredStocks.length > 0 ? (
        <div className="financial-grid">
          {filteredStocks.map(stock => (
            <StockCard 
              key={stock.symbol} 
              stock={stock} 
              onClick={handleStockClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground">No data found</p>
          {searchQuery && (
            <p className="mt-2 text-sm text-muted-foreground">
              No results for "{searchQuery}". Try a different search term.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
