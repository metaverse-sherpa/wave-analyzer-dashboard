import { supabase } from '@/lib/supabase';
import * as LZString from 'lz-string';

/**
 * Gets data from Supabase cache with simplified approach
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    // Query the cache table
    const { data, error } = await supabase
      .from('cache')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    // Check if the cache has expired
    if (data.timestamp && Date.now() - data.timestamp > data.duration) {
      console.log(`Cache expired for ${key}`);
      // Delete the expired cache entry
      await supabase.from('cache').delete().eq('key', key);
      return null;
    }
    
    // Handle string data (historical data)
    if (data.is_string && data.data && data.data.stringData) {
      try {
        return JSON.parse(data.data.stringData) as T;
      } catch (e) {
        console.error(`Error parsing string data for ${key}:`, e);
        return null;
      }
    }
    
    // Regular data
    return data.data as T;
  } catch (error) {
    console.error(`Error retrieving ${key} from cache:`, error);
    return null;
  }
}

/**
 * Saves data to Supabase cache with simple direct approach
 */
export async function saveToCache<T>(key: string, data: T, duration: number): Promise<void> {
  try {
    // Ensure we never send null data to Supabase
    const safeData = data === null || data === undefined ? {} : data;
    
    console.log(`Saving to cache: ${key}`);
    
    // Skip RPC call which is causing errors and use direct upsert
    const { error } = await supabase
      .from('cache')
      .upsert({
        key,
        data: safeData, // Always provide a non-null value
        timestamp: Date.now(),
        duration,
        is_string: key.includes('historical_data_')
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
    const now = Date.now();
    
    // Get expired entries
    // An entry is expired if its timestamp + duration < current time
    const { data: expiredEntries, error: fetchError } = await supabase
      .from('cache')
      .select('key')
      .lt('timestamp', now - 3600000); // Fetch entries at least 1 hour old - removed .execute()
    
    if (fetchError) throw fetchError;
    
    // Now check each entry against its own duration
    const keysToDelete: string[] = [];
    
    if (expiredEntries) {
      for (const entry of expiredEntries) {
        const { data: fullEntry } = await supabase
          .from('cache')
          .select('*')
          .eq('key', entry.key)
          .single();
        
        if (fullEntry && (now > fullEntry.timestamp + fullEntry.duration)) {
          keysToDelete.push(entry.key);
        }
      }
    }
    
    // Delete the expired entries
    if (keysToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('cache')
        .delete()
        .in('key', keysToDelete);
      
      if (deleteError) throw deleteError;
      
      console.log(`Pruned ${keysToDelete.length} expired cache entries`);
    } else {
      console.log('No expired cache entries found');
    }
  } catch (error) {
    console.error('Error pruning cache:', error);
  }
}

/**
 * Clears all cache entries
 */
export async function clearCache(): Promise<void> {
  try {
    const { error } = await supabase
      .from('cache')
      .delete()
      .neq('key', '');
    
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