/**
 * Telegram Mini App Testing Utility
 * 
 * This script helps simulate the Telegram environment for local testing.
 * It creates a mock of the Telegram WebApp object that's normally injected 
 * by the Telegram client.
 */

// Create a mock Telegram WebApp object
window.Telegram = window.Telegram || {};
window.Telegram.WebApp = {
  isExpanded: false,
  initData: "mock_init_data",
  initDataUnsafe: {
    query_id: "mock_query_id",
    user: {
      id: 12345678,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
      language_code: "en"
    },
    auth_date: Math.floor(Date.now() / 1000),
    hash: "mock_hash"
  },
  colorScheme: "light",
  themeParams: {
    bg_color: "#ffffff",
    text_color: "#000000",
    hint_color: "#999999",
    link_color: "#2481cc",
    button_color: "#2481cc",
    button_text_color: "#ffffff"
  },
  
  // Methods
  setHeaderColor: function(color) {
    console.log('Telegram.WebApp.setHeaderColor called with:', color);
  },
  enableClosingConfirmation: function() {
    console.log('Telegram.WebApp.enableClosingConfirmation called');
  },
  disableClosingConfirmation: function() {
    console.log('Telegram.WebApp.disableClosingConfirmation called');
  },
  setBackgroundColor: function(color) {
    console.log('Telegram.WebApp.setBackgroundColor called with:', color);
  },
  expand: function() {
    console.log('Telegram.WebApp.expand called');
    this.isExpanded = true;
  },
  close: function() {
    console.log('Telegram.WebApp.close called');
  },
  showAlert: function(message) {
    console.log('Telegram.WebApp.showAlert called with:', message);
    alert(message);
  },
  showConfirm: function(message, callback) {
    console.log('Telegram.WebApp.showConfirm called with:', message);
    const result = confirm(message);
    if (callback) callback(result);
  },
  openLink: function(url) {
    console.log('Telegram.WebApp.openLink called with:', url);
    window.open(url, '_blank');
  },
  openTelegramLink: function(url) {
    console.log('Telegram.WebApp.openTelegramLink called with:', url);
    window.open(`https://t.me/${url}`, '_blank');
  },
  ready: function() {
    console.log('Telegram.WebApp.ready called');
  },
  isVersionAtLeast: function(version) {
    console.log('Telegram.WebApp.isVersionAtLeast called with:', version);
    return true;
  },
  
  onEvent: function(eventType, callback) {
    console.log('Telegram.WebApp.onEvent subscribed to:', eventType);
    // You could set up actual event listeners here if needed
  },
  offEvent: function(eventType, callback) {
    console.log('Telegram.WebApp.offEvent unsubscribed from:', eventType);
  },
  MainButton: {
    isVisible: false,
    isActive: true,
    isProgressVisible: false,
    text: "CONTINUE",
    
    show: function() {
      this.isVisible = true;
      console.log('MainButton.show called');
    },
    hide: function() {
      this.isVisible = false;
      console.log('MainButton.hide called');
    },
    setText: function(text) {
      this.text = text;
      console.log('MainButton.setText called with:', text);
    },
    onClick: function(callback) {
      console.log('MainButton.onClick handler set');
      this._callback = callback;
    },
    offClick: function(callback) {
      console.log('MainButton.offClick handler removed');
      this._callback = null;
    },
    // For testing purposes
    simulateClick: function() {
      if (this._callback) this._callback();
    }
  }
};

/**
 * Function to initialize the Telegram test environment
 */
export function initTelegramTestEnvironment() {
  console.log('Telegram test environment initialized');
  return window.Telegram.WebApp;
}

/**
 * Function to simulate different Telegram themes
 */
export function switchTelegramTheme(theme) {
  if (theme === 'dark') {
    window.Telegram.WebApp.colorScheme = 'dark';
    window.Telegram.WebApp.themeParams = {
      bg_color: "#212121",
      text_color: "#ffffff",
      hint_color: "#aaaaaa",
      link_color: "#64b5f6",
      button_color: "#64b5f6",
      button_text_color: "#ffffff"
    };
  } else {
    window.Telegram.WebApp.colorScheme = 'light';
    window.Telegram.WebApp.themeParams = {
      bg_color: "#ffffff",
      text_color: "#000000",
      hint_color: "#999999",
      link_color: "#2481cc",
      button_color: "#2481cc",
      button_text_color: "#ffffff"
    };
  }
  
  console.log(`Switched to ${theme} theme`);
  
  // Dispatch an event that can be listened for
  const event = new CustomEvent('telegramThemeChanged', {
    detail: { theme: window.Telegram.WebApp.colorScheme }
  });
  window.dispatchEvent(event);
}

/**
 * How to use this testing utility:
 * 
 * 1. Import this file in your development environment:
 *    import { initTelegramTestEnvironment, switchTelegramTheme } from './utils/telegram-test.js';
 * 
 * 2. Initialize the test environment before your app starts:
 *    const webApp = initTelegramTestEnvironment();
 * 
 * 3. Test various Telegram Mini App interactions:
 *    - webApp.showAlert("Testing alert functionality");
 *    - webApp.MainButton.show();
 *    - webApp.MainButton.setText("SUBMIT");
 *    - switchTelegramTheme('dark');
 *    
 * 4. Simulate MainButton clicks:
 *    webApp.MainButton.simulateClick();
 */