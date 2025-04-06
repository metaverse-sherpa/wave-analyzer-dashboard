export interface Profile {
  id: string;
  updated_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
  role?: string; // If you added the role column
}