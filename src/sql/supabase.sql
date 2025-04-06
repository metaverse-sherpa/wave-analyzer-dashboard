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


-- HARD RESET: Drop everything and create proper schema

-- First, get rid of all existing profiles and triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.profiles;

-- Create the profiles table EXACTLY how Supabase expects it
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  website TEXT,
  
  CONSTRAINT fk_user
    FOREIGN KEY (id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE
);

-- Set RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public profiles are viewable by everyone." 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." 
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Create function to handle new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger (only after the table exists)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT ALL ON public.profiles TO postgres, service_role;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Add a role field to the profiles table
ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';

-- Add index on username for faster lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Modify the handle_new_user function to set a default username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  username_val TEXT;
BEGIN
  -- Extract username from email (part before @)
  username_val := split_part(NEW.email, '@', 1);
  
  -- Make it unique by adding random characters if needed
  username_val := username_val || '_' || substr(md5(random()::text), 1, 6);
  
  -- Insert profile with username
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, username_val);
  
  RETURN NEW;
END;
$$;


-- Create function to handle user deletion
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Delete the profile for the user being deleted
  DELETE FROM public.profiles WHERE id = OLD.id;
  
  RETURN OLD;
END;
$$;

-- Create trigger to execute when a user is deleted
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_deletion();



-- Create a storage bucket for user content
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-content', 'User Content', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for the user-content bucket
-- Using 'name' instead of 'path'
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-content' AND name LIKE 'avatars/%');

CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-content' AND
  name LIKE 'avatars/%' AND
  auth.uid() = SPLIT_PART(name, '-', 1)::uuid
);

CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-content' AND
  name LIKE 'avatars/%' AND
  auth.uid() = SPLIT_PART(name, '-', 1)::uuid
);

CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-content' AND
  name LIKE 'avatars/%' AND
  auth.uid() = SPLIT_PART(name, '-', 1)::uuid
);