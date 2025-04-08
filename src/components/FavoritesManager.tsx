import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Search } from "lucide-react";
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from "@/components/ui/scroll-area";

interface FavoritesManagerProps {
  onFavoritesChange?: () => void;
}

export const FavoritesManager: React.FC<FavoritesManagerProps> = ({ onFavoritesChange }) => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [newStock, setNewStock] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Create a refresh counter to force reloads
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Add a function to force refresh of favorites
  const refreshFavorites = () => {
    setRefreshCounter(prev => prev + 1);
  };

  // Make loadFavorites public so we can call it from outside
  const loadFavorites = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cache')
        .select('data')
        .eq('key', 'favorite_stocks')
        .single();

      if (error) {
        console.error('Error loading favorites:', error);
        setFavorites([]);
        return;
      }

      if (data && Array.isArray(data.data)) {
        setFavorites(data.data);
      } else {
        setFavorites([]);
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
      toast.error('Failed to load favorite stocks');
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load favorites from Supabase on component mount and when refreshCounter changes
  useEffect(() => {
    loadFavorites();
  }, [refreshCounter]); // Add refreshCounter to the dependency array

  // Listen for custom refresh event from other components
  useEffect(() => {
    const handleRefreshEvent = () => {
      console.log('Favorites refresh event received');
      refreshFavorites();
    };
    
    window.addEventListener('refresh-favorites', handleRefreshEvent);
    
    return () => {
      window.removeEventListener('refresh-favorites', handleRefreshEvent);
    };
  }, []);  // Empty dependency array means this only runs on mount/unmount

  const saveFavorites = async (updatedFavorites: string[]) => {
    try {
      const { error } = await supabase
        .from('cache')
        .upsert({
          key: 'favorite_stocks',
          data: updatedFavorites,
          timestamp: Date.now(),
          duration: 365 * 24 * 60 * 60 * 1000, // Add a 1 year duration
          is_string: false
        }, { onConflict: 'key' });

      if (error) throw error;
      
      setFavorites(updatedFavorites);
      
      // Call the callback if provided to notify parent components
      if (onFavoritesChange) {
        onFavoritesChange();
      }
    } catch (error) {
      console.error('Error saving favorites:', error);
      toast.error('Failed to save favorite stocks');
    }
  };

  const handleAddStock = () => {
    const stockSymbol = newStock.trim().toUpperCase();
    if (!stockSymbol) return;
    
    // Check if stock already exists
    if (favorites.includes(stockSymbol)) {
      toast.info(`${stockSymbol} is already in your favorites`);
      setNewStock(''); // Clear input even when duplicate
      return;
    }
    
    // Add new stock to the beginning of the array (most recent first)
    const updatedFavorites = [stockSymbol, ...favorites];
    saveFavorites(updatedFavorites);
    setNewStock(''); // Clear input field after adding
    toast.success(`Added ${stockSymbol} to favorites`);
    
    // Focus back on input for quick consecutive additions
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleRemoveStock = (stock: string) => {
    const updatedFavorites = favorites.filter(s => s !== stock);
    saveFavorites(updatedFavorites);
    toast.success(`Removed ${stock} from favorites`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddStock();
    }
  };

  // Filter favorites based on search query
  const filteredFavorites = useMemo(() => {
    if (!searchQuery) return favorites;
    const query = searchQuery.trim().toLowerCase();
    return favorites.filter(stock => stock.toLowerCase().includes(query));
  }, [favorites, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Add Stock Input */}
      <div className="flex space-x-2">
        <Input
          ref={inputRef}
          placeholder="Enter stock symbol..."
          value={newStock}
          onChange={(e) => setNewStock(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={handleAddStock} disabled={!newStock.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      
      {/* Add Search Box */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search favorites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8"
        />
        {searchQuery && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {/* Scrollable container for favorites */}
      <ScrollArea className="h-[120px] border rounded-md p-2">
        <div className="flex flex-wrap gap-2 pb-1">
          {isLoading ? (
            <div className="w-full text-center py-4 text-muted-foreground">Loading favorites...</div>
          ) : filteredFavorites.length === 0 ? (
            <div className="w-full text-center py-4 text-muted-foreground">
              {searchQuery ? `No favorites matching "${searchQuery}"` : 'No favorite stocks yet'}
            </div>
          ) : (
            filteredFavorites.map((stock) => (
              <Badge key={stock} variant="secondary" className="flex items-center gap-1 py-1">
                {stock}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-4 w-4 ml-1 hover:bg-destructive/20 rounded-full" 
                  onClick={() => handleRemoveStock(stock)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Add refresh button to manually refresh the list */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={refreshFavorites}
        className="w-full text-xs mt-1"
      >
        Refresh Favorites
      </Button>
    </div>
  );
};

// Export the component instance with the public loadFavorites method
export default FavoritesManager;