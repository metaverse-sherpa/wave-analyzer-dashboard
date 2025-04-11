import React from 'react';
import ApiStatus from './ApiStatusCheck';
import { VersionDisplay } from './ui/VersionDisplay';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
      
      {/* API Status indicator and version display */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        <ApiStatus />
        <VersionDisplay />
      </div>
    </div>
  );
};

export default Layout;