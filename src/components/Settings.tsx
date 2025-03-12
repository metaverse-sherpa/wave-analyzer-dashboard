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
import { topStockSymbols } from '@/services/yahooFinanceService';

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
      const stocks = topStockSymbols.slice(0, 30); // Analyze top 30 stocks
      
      toast({
        title: "Starting Analysis Refresh",
        description: `Analyzing ${stocks.length} stocks...`,
      });
      
      // Process in batches of 5
      for (let i = 0; i < stocks.length; i += 5) {
        const batch = stocks.slice(i, i + 5);
        
        try {
          for (const symbol of batch) {
            localStorage.removeItem(`wave_analysis_${symbol}_1d`);
            await new Promise(r => setTimeout(r, 500));
            await getAnalysis(symbol, '1d', true);
          }
          // Small delay between batches
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Failed to analyze batch: ${batch.join(', ')}`, err);
        }
      }
      
      toast({
        title: "Analysis Refreshed",
        description: `Successfully analyzed ${stocks.length} stocks.`,
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