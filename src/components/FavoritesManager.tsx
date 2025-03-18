import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, X, Loader2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';

interface FavoritesManagerProps {
  onFavoritesChange?: () => void;
}

export const FavoritesManager = ({ onFavoritesChange }: FavoritesManagerProps) => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load favorites from Supabase
  const loadFavorites = async () => {
    try {
      const { data, error } = await supabase
        .from('cache')
        .select('data')
        .eq('key', 'favorite_stocks')
        .single();

      if (error) {
        console.warn('No favorites found:', error);
        return;
      }

      setFavorites(data.data || []);
    } catch (error) {
      console.error('Error loading favorites:', error);
      toast.error('Failed to load favorite stocks');
    }
  };

  // Save favorites to Supabase
  const saveFavorites = async (updatedFavorites: string[]) => {
    try {
      const { error } = await supabase
        .from('cache')
        .upsert({
          key: 'favorite_stocks',
          data: updatedFavorites,
          timestamp: Date.now()
        }, { onConflict: 'key' });

      if (error) throw error;
      
      setFavorites(updatedFavorites);
      onFavoritesChange?.();
    } catch (error) {
      console.error('Error saving favorites:', error);
      toast.error('Failed to save favorite stocks');
    }
  };

  // Add new favorite
  const addFavorite = async () => {
    if (!newSymbol) return;
    
    const symbol = newSymbol.toUpperCase().trim();
    
    if (favorites.includes(symbol)) {
      toast.error('Stock is already in favorites');
      return;
    }

    setIsLoading(true);
    try {
      // Validate symbol exists using Yahoo Finance
      const response = await fetch(`/api/stocks/historical/${symbol}?timeframe=1d`);
      if (!response.ok) {
        throw new Error('Invalid stock symbol');
      }

      const updatedFavorites = [...favorites, symbol];
      await saveFavorites(updatedFavorites);
      setNewSymbol('');
      toast.success(`Added ${symbol} to favorites`);
    } catch (error) {
      toast.error(`Failed to add ${symbol}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Remove favorite
  const removeFavorite = async (symbol: string) => {
    const updatedFavorites = favorites.filter(s => s !== symbol);
    await saveFavorites(updatedFavorites);
    toast.success(`Removed ${symbol} from favorites`);
  };

  // Filter favorites based on search
  const filteredFavorites = favorites.filter(symbol => 
    symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Load favorites on mount
  useEffect(() => {
    loadFavorites();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="Add stock symbol..."
            className="pr-8"
            onKeyPress={(e) => {
              if (e.key === 'Enter') addFavorite();
            }}
          />
        </div>
        <Button 
          onClick={addFavorite}
          disabled={isLoading || !newSymbol}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search favorites..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      <ScrollArea className="h-[200px] border rounded-md p-2">
        {filteredFavorites.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            {favorites.length === 0 
              ? "No favorite stocks added yet" 
              : "No matches found"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFavorites.map(symbol => (
              <div 
                key={symbol}
                className="flex items-center justify-between p-2 hover:bg-accent/5 rounded-md"
              >
                <Badge variant="outline">{symbol}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFavorite(symbol)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};