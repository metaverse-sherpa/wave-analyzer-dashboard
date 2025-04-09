import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MarketOverview from './MarketOverview';
import UserMenu from './UserMenu';
import TelegramLayout from './layout/TelegramLayout';
import { useTelegram } from '@/context/TelegramContext';

/**
 * Dashboard component - primary overview display showing market data
 */
const Dashboard: React.FC = () => {
  const { isTelegram } = useTelegram();

  const dashboardContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Market Overview</CardTitle>
              {!isTelegram && <UserMenu />}
            </div>
          </CardHeader>
          <CardContent>
            <MarketOverview />
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // If in Telegram, wrap with TelegramLayout
  if (isTelegram) {
    return (
      <TelegramLayout title="Wave Analyzer">
        {dashboardContent}
      </TelegramLayout>
    );
  }

  // Otherwise, return the regular content
  return dashboardContent;
};

export default Dashboard;
