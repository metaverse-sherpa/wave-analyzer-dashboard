import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface Profile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
}

const ProfilePage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    username: '',
    full_name: null,
    avatar_url: null,
    website: null
  });
  
  // Avatar file selection
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  // Load profile data
  useEffect(() => {
    async function loadProfile() {
      try {
        if (!user) return;
        
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url, website')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Error loading profile:', error);
          toast.error('Failed to load profile data');
        } else if (data) {
          setProfile(data);
          if (data.avatar_url) {
            setAvatarPreview(data.avatar_url);
          }
        }
      } catch (error) {
        console.error('Exception loading profile:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadProfile();
  }, [user]);
  
  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    setAvatarFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Upload avatar to Supabase Storage
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    
    try {
      setUploading(true);
      
      // Generate a unique filename
      const fileExt = avatarFile.name.split('.').pop();
      const uniqueId = uuidv4();
      
      // IMPORTANT: Path structure that matches the RLS policy we created
      // Format: user_id/file_name.ext (must have user ID as the folder name)
      const filePath = `${user.id}/${uniqueId}.${fileExt}`;
      
      // Upload to the new 'avatars' bucket instead of 'user-content'
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: avatarFile.type
        });
      
      if (uploadError) {
        console.error('Error uploading avatar:', uploadError);
        toast.error(`Upload failed: ${uploadError.message}`);
        throw uploadError;
      }
      
      // Get public URL from the 'avatars' bucket
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(`Error uploading avatar: ${error?.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploading(false);
    }
  };
  
  // Save profile updates
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('You must be logged in to update your profile');
      return;
    }
    
    try {
      setUpdating(true);
      
      // Upload avatar if there's a new one
      let avatarUrl = profile.avatar_url;
      if (avatarFile) {
        const newAvatarUrl = await uploadAvatar();
        if (newAvatarUrl) {
          avatarUrl = newAvatarUrl;
        }
      }
      
      // Update profile in database
      const { error } = await supabase
        .from('profiles')
        .update({
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: avatarUrl,
          website: profile.website,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (error) {
        if (error.code === '23505' && error.message.includes('username')) {
          toast.error('This username is already taken');
        } else {
          throw error;
        }
      } else {
        // Update local state
        setProfile(prev => ({
          ...prev,
          avatar_url: avatarUrl
        }));
        setAvatarFile(null);
        
        toast.success('Profile updated successfully');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="container max-w-2xl py-10">
      <h1 className="text-3xl font-bold mb-6">Your Profile</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar section */}
        <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-6">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-primary">
              {avatarPreview ? (
                <img 
                  src={avatarPreview} 
                  alt="Profile" 
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-xl uppercase">
                  {profile.username?.charAt(0) || user?.email?.charAt(0) || '?'}
                </div>
              )}
            </Avatar>
            
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="avatar" className="block">Profile Picture</Label>
            <Input
              id="avatar"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="max-w-xs"
            />
            <p className="text-sm text-muted-foreground">
              Upload a square image for best results.
            </p>
          </div>
        </div>
        
        {/* Profile fields */}
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="username">Username*</Label>
            <Input
              id="username"
              name="username"
              value={profile.username || ''}
              onChange={handleChange}
              required
              placeholder="your_username"
            />
            <p className="text-sm text-muted-foreground">
              This appears on your public profile.
            </p>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              name="full_name"
              value={profile.full_name || ''}
              onChange={handleChange}
              placeholder="Your full name"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              value={profile.website || ''}
              onChange={handleChange}
              placeholder="https://yourwebsite.com"
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => window.history.back()}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={updating || uploading}
            >
              {(updating || uploading) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage;