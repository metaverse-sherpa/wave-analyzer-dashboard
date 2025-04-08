-- SQL commands to set up proper RLS policies for the 'avatars' bucket in Supabase Storage

-- 1. Enable Row Level Security on the storage.objects table if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to upload their own avatars using their user ID in the path
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- 3. Allow users to update their own avatars
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- 4. Allow users to delete their own avatars
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- 5. Allow anyone to view/download avatars (public read access)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
);

-- Note: To run these SQL commands, go to the SQL Editor in your Supabase dashboard
-- and execute these statements.