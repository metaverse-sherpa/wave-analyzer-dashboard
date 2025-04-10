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
  sendMessage: (chatId: string|number, text: string) => Promise<any>;
  setCommands: (commands: BotCommand[]) => Promise<boolean>;
  handleGroupMessage: (message: any) => void;
}

// Bot command interface
interface BotCommand {
  command: string;
  description: string;
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
  sendMessage: async () => ({}),
  setCommands: async () => false,
  handleGroupMessage: () => {},
});

interface TelegramProviderProps {
  children: ReactNode;
  botToken?: string; // Optional bot token for group chat functionality
}

export const TelegramProvider: React.FC<TelegramProviderProps> = ({ children, botToken }) => {
  const [isTelegram, setIsTelegram] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [token, setToken] = useState<string | null>(null);

  // Bot API base URL
  const BOT_API_BASE = 'https://api.telegram.org/bot';

  // First, try to load the token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        // Try to get token from props first
        if (botToken) {
          console.log("Using bot token from props");
          setToken(botToken);
          return;
        }

        // Otherwise try to fetch from environment
        console.log("Trying to fetch bot token from API");
        const response = await fetch('/api/get-telegram-token');
        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            console.log("Successfully retrieved bot token from API");
            setToken(data.token);
          } else {
            console.error("API response didn't contain token");
          }
        } else {
          console.error("Failed to fetch bot token from API:", await response.text());
        }
      } catch (error) {
        console.error("Error loading Telegram bot token:", error);
      }
    };

    fetchToken();
  }, [botToken]);

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

    // Set up bot commands if token is available
    if (token) {
      setDefaultBotCommands();
    }
  }, [token]); // Changed dependency to token instead of botToken

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

  // Bot functionality for group chats
  const sendMessage = async (chatId: string|number, text: string) => {
    if (!token) {
      console.error('Bot token not available');
      return null;
    }

    try {
      const response = await fetch(`${BOT_API_BASE}${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
      return null;
    }
  };

  const setCommands = async (commands: BotCommand[]): Promise<boolean> => {
    if (!token) {
      console.error('Bot token not available');
      return false;
    }

    try {
      const response = await fetch(`${BOT_API_BASE}${token}/setMyCommands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commands })
      });

      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('Error setting commands:', error);
      return false;
    }
  };

  // Set default commands for the bot
  const setDefaultBotCommands = async () => {
    const defaultCommands: BotCommand[] = [
      { command: '/start', description: 'Start the bot' },
      { command: '/help', description: 'Show help information' },
      { command: '/analyze', description: 'Analyze the current chart' },
    ];

    await setCommands(defaultCommands);
  };

  // Handle incoming group messages
  const handleGroupMessage = (message: any) => {
    if (!message || !token) return;

    // Extract chat ID and message text
    const chatId = message.chat?.id;
    const messageText = message.text;
    const userId = message.from?.id;

    if (!chatId || !messageText) return;

    // Process commands
    if (messageText.startsWith('/')) {
      const command = messageText.split(' ')[0].toLowerCase();
      
      switch (command) {
        case '/start':
          sendMessage(chatId, 'Hello! I am the Wave Analyzer bot. Use /help to see available commands.');
          break;
        case '/help':
          sendMessage(chatId, 'Available commands:\n/start - Start the bot\n/help - Show this help message\n/analyze - Analyze the current chart');
          break;
        case '/analyze':
          sendMessage(chatId, 'To analyze a chart, please use the Wave Analyzer Mini App.');
          break;
        default:
          sendMessage(chatId, 'Unknown command. Use /help to see available commands.');
      }
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
    sendMessage,
    setCommands,
    handleGroupMessage,
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