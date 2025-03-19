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

-- Make sure RLS is enabled
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow authenticated operations" ON cache;
DROP POLICY IF EXISTS "Allow anon operations" ON cache;

-- Create policies that allow anonymous and authenticated users to access the cache table
CREATE POLICY "Allow anon read" ON cache 
  FOR SELECT USING (true);

CREATE POLICY "Allow anon write" ON cache 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon update" ON cache 
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete" ON cache 
  FOR DELETE USING (true);


-- Add rate limiting to protect your Supabase project
CREATE OR REPLACE FUNCTION rate_limit_cache_operations()
RETURNS TRIGGER AS $$
DECLARE
  recent_ops INTEGER;
BEGIN
  -- Count operations from this IP in the last minute
  SELECT COUNT(*) INTO recent_ops FROM cache_audit 
  WHERE ip_address = current_setting('request.headers')::json->>'x-forwarded-for' 
  AND operation_time > NOW() - INTERVAL '1 minute';
  
  -- If too many operations, block
  IF recent_ops > 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
  
  -- Log this operation
  INSERT INTO cache_audit (operation, ip_address)
  VALUES (TG_OP, current_setting('request.headers')::json->>'x-forwarded-for');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TABLE profiles (
    id bigint primary key generated always as identity,
    user_id uuid references auth.users(id) on delete cascade,
    role text,
    created_at timestamp with time zone default now()
);

CREATE POLICY "Users can view their own profile"
ON profiles
FOR SELECT
USING (user_id = auth.uid());


CREATE POLICY "Admins can access all profiles"
ON profiles
FOR SELECT
USING (role = 'admin');