import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Fix: Remove incorrect WebApp import
// Using window.Telegram.WebApp directly instead

interface TelegramContextType {
  isTelegram: boolean;
  telegramUser: {
    id?: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    languageCode?: string;
  } | null;
  isInitialized: boolean;
  showBackButton: (show: boolean) => void;
  closeWebApp: () => void;
  openLink: (url: string) => void;
  showAlert: (message: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
  expandApp: () => void;
  sendAnalyticsEvent: (eventName: string, eventData?: Record<string, any>) => void;
}

// Create context with default values
const TelegramContext = createContext<TelegramContextType>({
  isTelegram: false,
  telegramUser: null,
  isInitialized: false,
  showBackButton: () => {},
  closeWebApp: () => {},
  openLink: () => {},
  showAlert: () => {},
  showConfirm: async () => false,
  expandApp: () => {},
  sendAnalyticsEvent: () => {},
});

interface TelegramProviderProps {
  children: ReactNode;
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({ children }) => {
  const [isTelegram, setIsTelegram] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);

  useEffect(() => {
    // Check if we're running inside Telegram
    const initTelegram = async () => {
      try {
        // Try to initialize Telegram WebApp
        if (window.Telegram && window.Telegram.WebApp) {
          const webApp = window.Telegram.WebApp;
          
          // Initialize the WebApp
          webApp.ready();
          
          // Get user data
          const user = webApp.initDataUnsafe?.user || null;
          setTelegramUser(user);
          
          setIsTelegram(true);
          setIsInitialized(true);
          
          // Set viewport and expand to fullscreen
          webApp.expand();
          
          console.log('Telegram Mini App initialized', { user });
        } else {
          console.log('Not running in Telegram Mini App');
          setIsTelegram(false);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Error initializing Telegram Mini App:', error);
        setIsTelegram(false);
        setIsInitialized(true);
      }
    };

    initTelegram();
  }, []);

  // Helper functions to interact with Telegram WebApp
  const showBackButton = (show: boolean) => {
    if (!isTelegram) return;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.isVisible = show;
    }
  };

  const closeWebApp = () => {
    if (!isTelegram) return;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.close();
    }
  };

  const openLink = (url: string) => {
    if (!isTelegram) {
      window.open(url, '_blank');
      return;
    }
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(url);
    }
  };

  const showAlert = (message: string) => {
    if (!isTelegram) {
      alert(message);
      return;
    }
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(message);
    }
  };

  const showConfirm = async (message: string): Promise<boolean> => {
    if (!isTelegram) {
      return window.confirm(message);
    }
    
    return new Promise((resolve) => {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(message, (confirmed) => {
          resolve(confirmed);
        });
      } else {
        resolve(false);
      }
    });
  };

  const expandApp = () => {
    if (!isTelegram) return;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
    }
  };

  const sendAnalyticsEvent = (eventName: string, eventData: Record<string, any> = {}) => {
    if (!isTelegram) {
      console.log(`Analytics event [${eventName}]:`, eventData);
      return;
    }

    try {
      // Add some default data to every event
      const enrichedEventData = {
        ...eventData,
        timestamp: new Date().toISOString(),
        user_id: telegramUser?.id || 'unknown',
        platform: 'telegram'
      };
      
      // Send to Telegram's analytics if available
      if (window.Telegram?.WebApp?.sendData) {
        const eventString = JSON.stringify({ 
          event: eventName, 
          data: enrichedEventData 
        });
        window.Telegram.WebApp.sendData(eventString);
      }
      
      // Log analytics in development
      console.log(`Analytics event [${eventName}]:`, enrichedEventData);
    } catch (error) {
      console.error('Error sending analytics event:', error);
    }
  };

  const value = {
    isTelegram,
    telegramUser,
    isInitialized,
    showBackButton,
    closeWebApp,
    openLink,
    showAlert,
    showConfirm,
    expandApp,
    sendAnalyticsEvent,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};

// Hook to use the Telegram context
export const useTelegram = (): TelegramContextType => {
  const context = useContext(TelegramContext);
  
  if (context === undefined) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }
  
  return context;
};

// Type definition for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}