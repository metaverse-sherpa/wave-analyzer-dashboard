// ...existing code...

// Update the fetch bot token function to check for Telegram environment first
const fetchBotToken = async () => {
  // Check if we're running inside Telegram Mini App
  const isTelegramMiniApp = window.Telegram && window.Telegram.WebApp;
  
  if (!isTelegramMiniApp) {
    console.log('Not running in Telegram Mini App - skipping bot token fetch');
    return null;
  }
  
  try {
    // Only proceed with the fetch if we're in Telegram
    const response = await fetch('/api/bot-token');
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