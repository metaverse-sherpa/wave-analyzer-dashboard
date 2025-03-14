-- Create a table for caching data
-- Check your table definition in Supabase SQL editor
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,  -- Must be JSONB type to store JSON
  timestamp BIGINT NOT NULL,
  duration BIGINT NOT NULL,
  compressed BOOLEAN DEFAULT FALSE
);

-- Run this in the Supabase SQL Editor to add the is_string column if it doesn't exist
ALTER TABLE cache ADD COLUMN IF NOT EXISTS is_string BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_cache_timestamp ON cache (timestamp);

-- Enable RLS (Row Level Security)
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations" ON cache FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon operations" ON cache FOR ALL TO anon
  USING (true) WITH CHECK (true);



 -- Update the database function to handle parameters better
CREATE OR REPLACE FUNCTION upsert_cache_item(
  p_key TEXT,
  p_data JSONB,
  p_timestamp BIGINT,
  p_duration BIGINT,
  p_is_string BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Insert with default empty JSON if p_data is NULL
  INSERT INTO cache (key, data, timestamp, duration, is_string)
  VALUES (
    p_key, 
    COALESCE(p_data, '{}'::jsonb), 
    p_timestamp, 
    p_duration, 
    p_is_string
  )
  ON CONFLICT (key) 
  DO UPDATE SET 
    data = COALESCE(p_data, '{}'::jsonb),
    timestamp = p_timestamp,
    duration = p_duration,
    is_string = p_is_string
  RETURNING to_jsonb(cache.*) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;