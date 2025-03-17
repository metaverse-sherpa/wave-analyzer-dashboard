import { supabase } from '@/lib/supabase';

// Default cache expiry (fallback if settings can't be loaded)
const DEFAULT_CACHE_EXPIRY_DAYS = 7;

/**
 * Checks if a cached item is expired based on global settings
 */
export const isCacheExpired = async (timestamp: number): Promise<boolean> => {
  try {
    // Get the cache expiry setting
    const { data, error } = await supabase
      .from('cache')
      .select('data')
      .eq('key', 'admin_settings')
      .single();
    
    if (error) {
      console.log('No admin settings found, using default cache expiry');
      return isOlderThanDays(timestamp, DEFAULT_CACHE_EXPIRY_DAYS);
    }
    
    const expiryDays = data?.data?.cacheExpiryDays || DEFAULT_CACHE_EXPIRY_DAYS;
    return isOlderThanDays(timestamp, expiryDays);
  } catch (error) {
    console.error('Error checking cache expiry:', error);
    // In case of error, default to using the cache (don't expire)
    return false;
  }
};

/**
 * Helper function to check if a timestamp is older than a certain number of days
 */
export const isOlderThanDays = (timestamp: number, days: number): boolean => {
  const now = Date.now();
  const ageInMs = now - timestamp;
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
  
  return ageInDays > days;
};