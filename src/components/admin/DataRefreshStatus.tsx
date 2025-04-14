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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Automatic Data Refresh
        </CardTitle>
        <CardDescription>
          Data is automatically refreshed every 24 hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="grid grid-cols-2">
            <span className="text-sm text-muted-foreground">Last refresh:</span>
            <span className="text-sm font-medium">{formatLastRefresh()}</span>
          </div>
          <div className="grid grid-cols-2">
            <span className="text-sm text-muted-foreground">Next scheduled:</span>
            <span className="text-sm font-medium">{formatNextRefresh()}</span>
          </div>
          <div className="grid grid-cols-2">
            <span className="text-sm text-muted-foreground">Time remaining:</span>
            <span className="text-sm font-medium">{getTimeRemaining()}</span>
          </div>
          
          <div className="pt-4">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full" 
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Now
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataRefreshStatus;