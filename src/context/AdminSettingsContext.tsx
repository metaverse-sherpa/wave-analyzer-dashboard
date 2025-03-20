// Create a new file: src/context/AdminSettingsContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AdminSettings {
  chartPaddingDays: number;
  // Add other global settings as needed
}

interface AdminSettingsContextType {
  settings: AdminSettings;
  isLoading: boolean;
}

const defaultSettings: AdminSettings = {
  chartPaddingDays: 20, // Default value
};

const AdminSettingsContext = createContext<AdminSettingsContextType>({
  settings: defaultSettings,
  isLoading: true,
});

export const useAdminSettings = () => useContext(AdminSettingsContext);

export const AdminSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from('cache')
          .select('data')
          .eq('key', 'admin_settings')
          .single();

        if (!error && data?.data) {
          setSettings({
            ...defaultSettings,
            ...data.data,
          });
        }
      } catch (error) {
        console.error('Error loading admin settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  return (
    <AdminSettingsContext.Provider value={{ settings, isLoading }}>
      {children}
    </AdminSettingsContext.Provider>
  );
};