import { supabase } from '@/lib/supabase';
import * as LZString from 'lz-string';

/**
 * Gets data from Supabase cache with simplified approach
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    // Skip caching for historical data
    if (key.startsWith('historical_data_')) {
      return null;
    }

    const { data, error } = await supabase
      .from('cache')
      .select('data, timestamp, duration')
      .eq('key', key)
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data || !data.data) {
      return null;
    }
    
    // Check if cache has expired
    if (data.duration && Date.now() - data.timestamp > data.duration) {
      return null;
    }
    
    return data.data;
  } catch (error) {
    console.error(`Error getting ${key} from cache:`, error);
    return null;
  }
}

/**
 * Saves data to Supabase cache with simple direct approach
 */
export async function saveToCache<T>(key: string, data: T, duration: number): Promise<void> {
  try {
    // Skip caching for historical data
    if (key.startsWith('historical_data_')) {
      return;
    }

    // Ensure we never send null data to Supabase
    const safeData = data === null || data === undefined ? {} : data;
    
    console.log(`Saving to cache: ${key}`);
    
    const { error } = await supabase
      .from('cache')
      .upsert({
        key,
        data: safeData, // Always provide a non-null value
        timestamp: Date.now(),
        duration,
        is_string: false
      }, { onConflict: 'key' });
    
    if (error) {
      console.error(`Error saving ${key} to cache:`, error);
      throw error;
    }
    
    console.log(`Successfully cached ${key}`);
  } catch (error) {
    console.error(`Error saving ${key} to cache:`, error);
    // Don't re-throw to avoid crashing the app
  }
}

/**
 * Helper function to sanitize data for JSON storage
 * Handles circular references and non-serializable values
 */
function sanitizeForJson(obj: any): any {
  // Handle primitive types directly
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  
  // Create a new object/array to avoid modifying the original
  const seen = new WeakSet();
  
  const sanitize = (value: any): any => {
    // Handle primitive values
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    
    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // Check for circular references
    if (seen.has(value)) {
      return "[Circular Reference]";
    }
    seen.add(value);
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => sanitize(item));
    }
    
    // Handle plain objects
    const result: any = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = sanitize(value[key]);
      }
    }
    return result;
  };
  
  return sanitize(obj);
}

/**
 * Clears expired cache entries
 */
export async function pruneCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('*')
      .not('key', 'like', 'historical_data_%');
      
    if (error) throw error;
    
    if (!data) return;
    
    const now = Date.now();
    const expiredKeys = data
      .filter(item => item.duration && (now - item.timestamp > item.duration))
      .map(item => item.key);
    
    if (expiredKeys.length === 0) return;
    
    const { error: deleteError } = await supabase
      .from('cache')
      .delete()
      .in('key', expiredKeys);
      
    if (deleteError) throw deleteError;
    
    console.log(`Pruned ${expiredKeys.length} expired cache entries`);
  } catch (error) {
    console.error('Error pruning cache:', error);
  }
}

/**
 * Clears all cache entries
 */
export async function clearCache(): Promise<void> {
  try {
    // Delete all non-historical cache entries
    const { error } = await supabase
      .from('cache')
      .delete()
      .not('key', 'like', 'historical_data_%');
      
    if (error) throw error;
    
    console.log('Cache cleared successfully');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Migrate data from localStorage to Supabase
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    console.log('Starting migration from localStorage to Supabase...');
    const keys = [];
    
    // Get all keys from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    
    // Track migration progress
    let migrated = 0;
    let errors = 0;
    
    // Process each key
    for (const key of keys) {
      try {
        // Skip non-data keys
        if (!key.startsWith('historical_data_') && 
            !key.startsWith('compressed_') && 
            !key.startsWith('wave_analysis_')) {
          continue;
        }
        
        console.log(`Migrating: ${key}`);
        const item = localStorage.getItem(key);
        if (!item) continue;
        
        // Handle compressed data differently
        if (key.startsWith('compressed_')) {
          console.log(`Skipping compressed data: ${key} (will be regenerated on demand)`);
          continue; // Skip compressed data - it will be regenerated when needed
        }
        
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(item);
          
          // Always provide data (never null)
          const dataToCache = parsed.data || {};
          
          await saveToCache(key, dataToCache, parsed.duration || 86400000);
          migrated++;
        } catch (parseError) {
          console.warn(`Could not parse ${key} as JSON, skipping:`, parseError);
          errors++;
        }
        
        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error(`Error migrating ${key}:`, e);
        errors++;
      }
    }
    
    console.log(`Migration complete: ${migrated} items migrated, ${errors} errors`);
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

/**
 * Test Supabase connectivity
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    console.log('Testing Supabase connection...');
    
    // Try a simple operation
    const { data, error } = await supabase
      .from('cache')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    
    console.log('Supabase connection test successful:', data);
    return true;
  } catch (error) {
    console.error('Supabase connection test error:', error);
    return false;
  }
}

/**
 * Test anonymous key access
 */
export async function testAnonKeyAccess(): Promise<boolean> {
  try {
    // Try a simple write operation to test RLS policies
    const testKey = `test_${Date.now()}`;
    
    // Try to write
    const { error: writeError } = await supabase
      .from('cache')
      .upsert({
        key: testKey,
        data: { test: true },
        timestamp: Date.now(),
        duration: 60000,
        is_string: false
      });
    
    if (writeError) {
      console.error('Anon key write test failed:', writeError);
      return false;
    }
    
    // Try to read
    const { data, error: readError } = await supabase
      .from('cache')
      .select('*')
      .eq('key', testKey)
      .single();
    
    if (readError) {
      console.error('Anon key read test failed:', readError);
      return false;
    }
    
    // Try to delete
    const { error: deleteError } = await supabase
      .from('cache')
      .delete()
      .eq('key', testKey);
    
    if (deleteError) {
      console.error('Anon key delete test failed:', deleteError);
      return false;
    }
    
    console.log('Anon key access test passed successfully');
    return true;
  } catch (error) {
    console.error('Anon key test error:', error);
    return false;
  }
}

/**
 * Gets all wave analysis data from cache
 */
export async function getAllWaveAnalyses(): Promise<Record<string, any>> {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('key, data')
      .like('key', 'wave_analysis_%');
      
    if (error) throw error;
    
    const result = {};
    if (data) {
      for (const item of data) {
        const key = item.key.replace('wave_analysis_', '');
        result[key] = item.data;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error getting all wave analyses:', error);
    return {};
  }
}

/**
 * Checks if a cached item has expired
 * @param timestamp The timestamp when the item was cached
 * @param duration The duration in milliseconds the item should be valid
 * @returns boolean indicating if the item has expired
 */
export function isCacheExpired(timestamp: number, duration?: number): boolean {
  const now = Date.now();
  const defaultDuration = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  const effectiveDuration = duration || defaultDuration;
  
  return now - timestamp > effectiveDuration;
}

/**
 * Gets data from Supabase cache with validation
 * @param key The cache key
 * @param validateFn Optional function to validate the data before returning
 * @returns The cached data or null if invalid/expired
 */
export async function getFromCacheWithValidation<T>(
  key: string, 
  validateFn?: (data: any) => boolean
): Promise<T | null> {
  try {
    // Query the cache table
    const { data, error } = await supabase
      .from('cache')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error || !data) {
      console.log(`No cache entry found for ${key}`);
      return null;
    }
    
    // Check if the cache has expired
    if (isCacheExpired(data.timestamp, data.duration)) {
      console.log(`Cache expired for ${key} (${new Date(data.timestamp).toLocaleString()})`);
      // Delete the expired cache entry
      await supabase.from('cache').delete().eq('key', key);
      return null;
    }
    
    const cachedData = data.is_string && data.data && data.data.stringData
      ? JSON.parse(data.data.stringData)
      : data.data;
    
    // Validate the data if a validation function was provided
    if (validateFn && !validateFn(cachedData)) {
      console.warn(`Cache data for ${key} failed validation, treating as invalid`);
      // Delete the invalid cache entry
      await supabase.from('cache').delete().eq('key', key);
      return null;
    }
    
    return cachedData as T;
  } catch (error) {
    console.error(`Error retrieving ${key} from cache with validation:`, error);
    return null;
  }
}