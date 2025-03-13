import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StockCard } from '@/components/StockCard';
import DashboardHeader from '@/components/DashboardHeader';
import { fetchTopStocks, StockData } from '@/services/yahooFinanceService';
import { toast } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import Dashboard from '../components/Dashboard';

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
    <main>
      <Dashboard />
    </main>
  );
};

export default Index;
