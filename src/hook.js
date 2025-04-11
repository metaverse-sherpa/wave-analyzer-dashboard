// ...existing code...

// Add a function to check if we're running in Telegram
const isRunningInTelegram = () => {
  return window.Telegram && window.Telegram.WebApp;
};

// Modify the token fetching method
const fetchBotToken = async () => {
  // Only attempt to fetch the bot token if we're in Telegram
  if (!isRunningInTelegram()) {
    console.log('Not fetching bot token: Not running in Telegram Mini App');
    return null;
  }
  
  try {
    const response = await fetch('/api/get-bot-token');
    const data = await response.json();
    
    if (data.status === 'error') {
      console.error('Failed to fetch bot token from API:', data);
      return null;
    }
    
    return data.token;
  } catch (error) {
    console.error('Failed to fetch bot token from API:', error);
    return null;
  }
};

// ...existing code...