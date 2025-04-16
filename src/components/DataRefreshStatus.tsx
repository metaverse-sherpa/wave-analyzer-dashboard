import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { Badge } from '@/components/ui/badge';

// Add prop interface to allow external control of the refresh state
interface DataRefreshStatusProps {
  isRefreshing?: boolean;
}

const DataRefreshStatus: React.FC<DataRefreshStatusProps> = ({ isRefreshing: externalIsRefreshing }) => {
  const { lastRefreshTime, isRefreshing: contextIsRefreshing, refreshData } = useDataRefresh();
  
  // Use external isRefreshing prop if provided, otherwise use the context value
  const isRefreshing = externalIsRefreshing !== undefined ? externalIsRefreshing : contextIsRefreshing;
  
  // Format the last refresh time nicely
  const formatRefreshTime = () => {
    if (!lastRefreshTime) return 'Never';
    
    // Format date
    const date = new Date(lastRefreshTime);
    const formattedDate = date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    // Format time
    const formattedTime = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `${formattedDate} at ${formattedTime}`;
  };
  
  // Calculate time until next refresh
  const getNextRefreshTime = () => {
    if (!lastRefreshTime) return 'Unknown';
    
    const nextRefreshTimestamp = lastRefreshTime + (24 * 60 * 60 * 1000); // 24 hours after last refresh
    const now = Date.now();
    
    // If next refresh is in the past, it's due now
    if (nextRefreshTimestamp < now) {
      return 'Due now';
    }
    
    const timeRemaining = nextRefreshTimestamp - now;
    const hoursRemaining = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutesRemaining = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${hoursRemaining}h ${minutesRemaining}m`;
  };
  
  // Handle manual refresh button click
  const handleRefresh = async () => {
    await refreshData();
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> Data Updates
        </CardTitle>
        <CardDescription>Last refreshed {formatRefreshTime()}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Next: {getNextRefreshTime()}</span>
          </div>
          <Button 
            onClick={handleRefresh} 
            size="sm" 
            variant="outline" 
            disabled={isRefreshing}>
              {isRefreshing ? 'Updating...' : 'Update Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataRefreshStatus;