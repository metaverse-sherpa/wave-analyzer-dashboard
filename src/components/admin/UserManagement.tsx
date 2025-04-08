import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, RefreshCw, UserCheck, UserMinus, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';

interface User {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
  email?: string; // May be available from auth.users join
}

const UserManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_SIZE = 10;

  // Load users from Supabase
  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      // First get the total count
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      
      // Calculate pagination
      const total = count || 0;
      setTotalUsers(total);
      setTotalPages(Math.ceil(total / PAGE_SIZE));
      
      // Get the actual data for the current page
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      // Fetch profiles with pagination
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .range(from, to)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Use our simpler function to get emails
      try {
        // Get user IDs to lookup
        const userIds = data.map(user => user.id);
        
        // Call our simpler function
        const { data: emailData, error: emailError } = await supabase
          .rpc('admin_get_user_emails', { user_ids: userIds });
        
        if (emailError) throw emailError;
        
        // Create a map of IDs to emails
        const emailMap = new Map();
        if (emailData) {
          emailData.forEach(item => {
            if (item && item.user_id && item.email) {
              emailMap.set(item.user_id, item.email);
            }
          });
        }
        
        // Join the data
        const usersWithEmail = data.map(user => ({
          ...user,
          email: emailMap.get(user.id) || 'No email access'
        }));
        
        setUsers(usersWithEmail);
        applySearch(usersWithEmail, searchQuery);
        
        toast.success(`Loaded ${usersWithEmail.length} users with emails`);
      } catch (emailErr) {
        console.warn('Could not fetch emails:', emailErr);
        // Fallback - just show users without emails
        const usersWithoutEmail = data.map(user => ({
          ...user,
          email: 'Email not available'
        }));
        
        setUsers(usersWithoutEmail);
        applySearch(usersWithoutEmail, searchQuery);
        
        toast.success(`Loaded ${data.length} users (without emails)`);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Apply search filter
  const applySearch = (userList: User[], query: string) => {
    if (!query.trim()) {
      setFilteredUsers(userList);
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = userList.filter(user => 
      (user.username && user.username.toLowerCase().includes(lowerQuery)) ||
      (user.full_name && user.full_name.toLowerCase().includes(lowerQuery)) ||
      (user.email && user.email.toLowerCase().includes(lowerQuery)) ||
      (user.id && user.id.toLowerCase().includes(lowerQuery))
    );
    
    setFilteredUsers(filtered);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    applySearch(users, query);
  };

  // Add a function to check if this is the current user
  const isCurrentUser = (userId: string) => {
    return user?.id === userId;
  };

  // Toggle admin role
  const toggleAdminRole = async (userId: string, currentRole: string) => {
    // Prevent admins from removing their own admin status
    if (isCurrentUser(userId) && currentRole === 'admin') {
      toast.error("You cannot remove your own admin status");
      return;
    }

    setUpdating(userId);
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId ? { ...user, role: newRole } : user
        )
      );
      
      setFilteredUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId ? { ...user, role: newRole } : user
        )
      );
      
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      console.error('Error updating user role:', error);
      toast.error('Failed to update user role');
    } finally {
      setUpdating(null);
    }
  };

  // Load users on component mount
  useEffect(() => {
    loadUsers(1);
  }, []);

  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadUsers(page);
  };

  // Get the initials for avatar fallback
  const getInitials = (user: User) => {
    if (user.full_name) {
      return user.full_name.split(' ')
        .map(name => name[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    
    return user.email ? user.email[0].toUpperCase() : 'U';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xl">User Management</CardTitle>
            <CardDescription>
              Manage user roles and permissions ({totalUsers} total users)
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => loadUsers(currentPage)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users by name, email or ID..." 
              className="pl-8"
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
          
          {/* User list - redesigned for mobile */}
          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-24 p-8">
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm text-muted-foreground">Loading users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center p-8">
                <span className="text-muted-foreground">
                  {searchQuery ? 'No users found matching your search' : 'No users found'}
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map(user => (
                  <div 
                    key={user.id} 
                    className="border rounded-md p-3 hover:border-primary transition-colors"
                  >
                    <div className="flex flex-row justify-between items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-9 w-9 hidden sm:flex">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate" title={user.username || 'No username'}>
                            {user.username || 'No username'}
                          </div>
                          <div className="text-sm truncate text-muted-foreground" title={user.email || 'No email available'}>
                            {user.email || 'No email available'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1 rounded-full">
                          <Checkbox
                            id={`admin-${user.id}`}
                            className="h-5 w-5"
                            checked={user.role === 'admin'}
                            disabled={updating === user.id || (isCurrentUser(user.id) && user.role === 'admin')}
                            onCheckedChange={() => toggleAdminRole(user.id, user.role)}
                          />
                          <Label 
                            htmlFor={`admin-${user.id}`}
                            className={`text-sm font-medium select-none ${isCurrentUser(user.id) && user.role === 'admin' ? 'text-muted-foreground' : 'cursor-pointer'}`}
                          >
                            Admin
                            {isCurrentUser(user.id) && user.role === 'admin' && (
                              <span className="ml-1 text-xs text-muted-foreground hidden sm:inline">(you)</span>
                            )}
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          
          {/* Pagination - simplified for mobile */}
          {totalPages > 1 && (
            <Pagination className="pt-2">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                
                {/* Show limited page numbers on mobile */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => 
                    page === 1 || 
                    page === totalPages || 
                    page === currentPage ||
                    (window.innerWidth > 640 && (page === currentPage - 1 || page === currentPage + 1))
                  )
                  .map((page, index, array) => (
                    <React.Fragment key={page}>
                      {index > 0 && array[index - 1] !== page - 1 && (
                        <PaginationItem className="hidden sm:flex">
                          <span className="px-4 py-2 text-sm text-muted-foreground">...</span>
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink 
                          isActive={page === currentPage}
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    </React.Fragment>
                  ))
                }
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserManagement;