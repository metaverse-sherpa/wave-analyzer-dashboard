import React from 'react';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

const DataRefreshStatus: React.FC = () => {
  const { lastRefreshTime, isRefreshing, refreshData } = useDataRefresh();
  
  // Format the last refresh time
  const formatLastRefresh = () => {
    if (!lastRefreshTime) return 'Never';
    
    const date = new Date(lastRefreshTime);
    return date.toLocaleString();
  };
  
  // Calculate and format the next scheduled refresh time
  const formatNextRefresh = () => {
    if (!lastRefreshTime) return 'Upon app start';
    
    const nextRefreshTime = lastRefreshTime + (24 * 60 * 60 * 1000); // 24 hours after last refresh
    const date = new Date(nextRefreshTime);
    return date.toLocaleString();
  };

  // Calculate time remaining until next refresh
  const getTimeRemaining = () => {
    if (!lastRefreshTime) return null;
    
    const now = Date.now();
    const nextRefreshTime = lastRefreshTime + (24 * 60 * 60 * 1000);
    const timeRemaining = nextRefreshTime - now;
    
    if (timeRemaining <= 0) return 'Due now';
    
    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${hours}h ${minutes}m`;
  };

  // Handle manual refresh
  const handleManualRefresh = () => {
    refreshData();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> Data Refresh Status
        </CardTitle>
        <CardDescription>
          Monitor and control the automatic data refresh schedule
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Last Refresh</p>
              <p className="text-sm text-muted-foreground">{formatLastRefresh()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Next Scheduled</p>
              <p className="text-sm text-muted-foreground">{formatNextRefresh()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Time Remaining</p>
              <p className="text-sm text-muted-foreground">{getTimeRemaining() || 'N/A'}</p>
            </div>
          </div>
          
          <div>
            <Button 
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              variant="outline"
              className="w-full"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run Now
                </>
              )}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            The refresh process updates historical data and Elliott wave analyses for common stocks and major indices.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataRefreshStatus;