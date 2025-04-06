import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MarketOverview from './MarketOverview';
import UserMenu from './UserMenu';

/**
 * Dashboard component - primary overview display showing market data
 */
const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Market Overview</CardTitle>
              <UserMenu />
            </div>
          </CardHeader>
          <CardContent>
            <MarketOverview />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
