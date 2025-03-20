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

  // Load favorites from Supabase on component mount
  useEffect(() => {
    loadFavorites();
  }, []);

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
      onFavoritesChange?.();
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
            <div className="text-sm text-muted-foreground p-2">Loading favorites...</div>
          ) : filteredFavorites.length === 0 ? (
            <div className="text-sm text-muted-foreground p-2">
              {favorites.length === 0 
                ? "No favorites added yet" 
                : `No results found for "${searchQuery}"`}
            </div>
          ) : (
            filteredFavorites.map(stock => (
              <Badge key={stock} variant="secondary" className="group">
                {stock}
                <button 
                  onClick={() => handleRemoveStock(stock)}
                  className="ml-1 rounded-full hover:bg-muted p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};