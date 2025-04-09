import React, { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTelegram } from '@/context/TelegramContext';

interface TelegramLayoutProps {
  children: ReactNode;
  showBackButton?: boolean;
  title?: string;
}

const TelegramLayout: React.FC<TelegramLayoutProps> = ({ 
  children, 
  showBackButton = false,
  title
}) => {
  const { isTelegram, showBackButton: toggleBackButton } = useTelegram();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only show back button when we're not on the home page and showBackButton is true
    if (isTelegram && showBackButton && location.pathname !== '/') {
      toggleBackButton(true);
    } else {
      toggleBackButton(false);
    }

    // Handle back button press
    const handleBackButton = () => {
      navigate(-1);
    };

    // Add event listener for Telegram back button if available
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.onClick(handleBackButton);
    }

    return () => {
      // Cleanup event listener
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.BackButton.offClick(handleBackButton);
      }
    };
  }, [isTelegram, showBackButton, toggleBackButton, navigate, location.pathname]);

  if (!isTelegram) {
    // If not running in Telegram, return children without any Telegram-specific styles
    return <>{children}</>;
  }

  return (
    <div className="tg-layout">
      {/* Telegram-specific styles will be applied */}
      {title && (
        <div className="tg-header">
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
      )}
      <div className="tg-content">
        {children}
      </div>
      
      {/* Fix: Remove jsx and global attributes from style tag */}
      <style>{`
        :root {
          --tg-theme-bg-color: ${window.Telegram?.WebApp?.themeParams?.bg_color || '#ffffff'};
          --tg-theme-text-color: ${window.Telegram?.WebApp?.themeParams?.text_color || '#000000'};
          --tg-theme-hint-color: ${window.Telegram?.WebApp?.themeParams?.hint_color || '#999999'};
          --tg-theme-link-color: ${window.Telegram?.WebApp?.themeParams?.link_color || '#2678b6'};
          --tg-theme-button-color: ${window.Telegram?.WebApp?.themeParams?.button_color || '#2678b6'};
          --tg-theme-button-text-color: ${window.Telegram?.WebApp?.themeParams?.button_text_color || '#ffffff'};
          --tg-theme-secondary-bg-color: ${window.Telegram?.WebApp?.themeParams?.secondary_bg_color || '#f0f0f0'};
        }

        .tg-layout {
          background-color: var(--tg-theme-bg-color);
          color: var(--tg-theme-text-color);
          min-height: 100vh;
          width: 100%;
        }

        .tg-header {
          padding: 1rem;
          text-align: center;
          color: var(--tg-theme-text-color);
        }

        .tg-content {
          padding: 0.5rem;
          height: calc(100vh - 60px);
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default TelegramLayout;