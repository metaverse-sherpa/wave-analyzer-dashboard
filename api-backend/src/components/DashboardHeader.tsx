import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, Database, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { invalidateCache } from "@/services/yahooFinanceService";
import { clearAllAnalyses } from "@/services/databaseService";
import { toast } from "@/lib/toast";
import { ThemeToggle } from "@/components/ThemeToggle";

interface DashboardHeaderProps {
  onSearch: (query: string) => void;
  onRefresh: () => void;
  onAssetTypeChange: (type: 'stocks' | 'crypto' | 'forex') => void;
  assetType: 'stocks' | 'crypto' | 'forex';
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onSearch,
  onRefresh,
  onAssetTypeChange,
  assetType
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  useEffect(() => {
    onSearch(searchQuery);
  }, [searchQuery, onSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Clear caches
      invalidateCache();
      clearAllAnalyses();
      
      // Refresh data
      await onRefresh();
      
      toast.success('Data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const assetTypeLabels = {
    stocks: 'Stocks',
    crypto: 'Crypto',
    forex: 'Forex'
  };
  
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 w-full">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold mr-4">Wave Analysis Dashboard</h1>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              {assetTypeLabels[assetType]}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onAssetTypeChange('stocks')}>
              Stocks
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAssetTypeChange('crypto')}>
              Cryptocurrency
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAssetTypeChange('forex')}>
              Forex
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <form onSubmit={handleSearch} className="flex-1 sm:w-64">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search symbols..."
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => {
                console.log('Search query:', e.target.value);
                setSearchQuery(e.target.value);
              }}
            />
          </div>
        </form>
        
        <Button 
          variant="outline" 
          size="icon" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
        
        <Button variant="outline" size="icon">
          <Database className="h-4 w-4" />
        </Button>
        
        <ThemeToggle />
      </div>
    </div>
  );
};

export default DashboardHeader;
