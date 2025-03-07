import React, { useEffect, useState } from 'react';
import { checkBackendHealth } from '../services/yahooFinanceService';
import { Loader2 } from 'lucide-react';

const Home: React.FC = () => {
  const [isBackendReady, setIsBackendReady] = useState(false);

  useEffect(() => {
    let isMounted = true; // Track if component is still mounted
    let timeout: NodeJS.Timeout;

    const checkBackend = async () => {
      try {
        const isReady = await checkBackendHealth();
        if (isMounted) {
          if (isReady) {
            setIsBackendReady(true);
          } else {
            // Retry after 2 seconds if not ready
            timeout = setTimeout(checkBackend, 2000);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error checking backend health:', error);
          timeout = setTimeout(checkBackend, 2000);
        }
      }
    };

    // Initial check
    checkBackend();

    // Timeout for connection failure
    const connectionTimeout = setTimeout(() => {
      if (isMounted && !isBackendReady) {
        alert('Failed to connect to backend. Please try again later.');
      }
    }, 30000); // 30 seconds timeout

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      clearTimeout(connectionTimeout);
    };
  }, []); // Empty dependency array ensures this runs only once

  if (!isBackendReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Connecting to backend server...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Your normal home page content */}
    </div>
  );
};

export default Home; 