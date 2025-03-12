import React, { useState, useContext } from 'react';
import { Settings as SettingsIcon, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import WaveAnalysis from '@/context/WaveAnalysisContext';
import { useKillSwitch } from '@/context/KillSwitchContext';

const Settings: React.FC = () => {
  const { toast } = useToast();
  const { getAnalysis } = WaveAnalysis.useWaveAnalysis();
  const { killSwitch } = useKillSwitch();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [open, setOpen] = useState(false);

  // Function to clear local storage cache for wave analysis
  const clearWaveAnalysisCache = async () => {
    setIsRefreshing(true);
    try {
      // Clear all wave analysis related items from local storage
      const keys = Object.keys(localStorage);
      let count = 0;
      
      for (const key of keys) {
        if (key.includes('wave_analysis')) {
          localStorage.removeItem(key);
          count++;
        }
      }
      
      // Show success message
      toast({
        title: "Cache Cleared",
        description: `Successfully cleared ${count} cached wave analyses.`,
        duration: 3000,
      });
      
      // Close the dialog
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear cache. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      console.error('Error clearing cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Function to force refresh wave analysis for current stocks in view
  const refreshCurrentAnalysis = async () => {
    setIsRefreshing(true);
    try {
      const currentStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
      
      toast({
        title: "Starting Analysis Refresh",
        description: "Please wait while we refresh the analysis...",
      });
      
      // Process one stock at a time
      for (const symbol of currentStocks) {
        try {
          // Clear cache for this symbol
          localStorage.removeItem(`wave_analysis_${symbol}_1d`);
          
          // Add a small delay before analysis
          await new Promise(r => setTimeout(r, 500));
          
          // Force refresh analysis
          await getAnalysis(symbol, '1d', true);
          console.log(`Successfully refreshed analysis for ${symbol}`);
        } catch (err) {
          console.error(`Failed to refresh ${symbol}:`, err);
        }
      }
      
      toast({
        title: "Analysis Refreshed",
        description: `Successfully refreshed analysis for ${currentStocks.length} stocks.`,
      });
      
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh analysis. Please try again.",
        variant: "destructive",
      });
      console.error('Error refreshing analysis:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 rounded-full">
          <SettingsIcon className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure application settings and perform maintenance tasks.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Cache Management</h4>
            <p className="text-sm text-muted-foreground">
              Elliott Wave analysis results are cached to improve performance. 
              You can refresh the analysis if you want updated results.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <Button 
                onClick={refreshCurrentAnalysis}
                disabled={isRefreshing} 
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? "Refreshing..." : "Refresh Current Analysis"}
              </Button>
              <Button 
                onClick={clearWaveAnalysisCache}
                disabled={isRefreshing} 
                variant="outline"
              >
                Clear All Cached Analysis
              </Button>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Settings;