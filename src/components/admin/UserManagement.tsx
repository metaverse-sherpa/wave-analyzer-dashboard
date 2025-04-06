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

  // Toggle admin role
  const toggleAdminRole = async (userId: string, currentRole: string) => {
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
        <div className="flex items-center justify-between">
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
          
          {/* User table */}
          <ScrollArea className="h-[400px] border rounded-md">
            <Table>{/* No whitespace between Table and TableHeader */}
              <TableHeader>
                <TableRow>{/* Keep tags on same line or directly adjacent */}
                  <TableHead className="w-[250px]">User</TableHead>
                  <TableHead className="w-[200px]">Email</TableHead>
                  <TableHead className="w-[100px]">Role</TableHead>
                  <TableHead className="w-[120px]">Last Updated</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {/* Adjacent closing/opening tags */}
              <TableBody>{
                loading ? 
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                    <span className="mt-2 text-sm text-muted-foreground">Loading users...</span>
                  </TableCell>
                </TableRow> : 
                filteredUsers.length === 0 ? 
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <span className="text-muted-foreground">
                      {searchQuery ? 'No users found matching your search' : 'No users found'}
                    </span>
                  </TableCell>
                </TableRow> : 
                /* Map without adding whitespace */
                filteredUsers.map(user => 
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(user)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        {/* Username with fixed tooltip */}
                        <div className="font-medium truncate max-w-[150px] relative">
                          <span className="truncate block hover:text-primary cursor-default" 
                            title={user.username || 'No username'}>
                            {user.username || 'No username'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[150px]"
                          title={user.full_name || 'No name provided'}>
                          {user.full_name || 'No name provided'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="relative">
                      <div className="font-medium text-sm truncate overflow-x-auto no-scrollbar whitespace-nowrap hover:text-primary cursor-default"
                        title={user.email || 'No email available'}>
                        {user.email || 'No email available'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={user.role === 'admin' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`admin-${user.id}`}
                          checked={user.role === 'admin'}
                          disabled={updating === user.id}
                          onCheckedChange={() => toggleAdminRole(user.id, user.role)}
                        />
                        <Label 
                          htmlFor={`admin-${user.id}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          Admin
                        </Label>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>)
              }</TableBody>
            </Table>
          </ScrollArea>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                
                {/* Generate page links */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => 
                    page === 1 || 
                    page === totalPages || 
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  )
                  .map((page, index, array) => (
                    <React.Fragment key={page}>
                      {index > 0 && array[index - 1] !== page - 1 && (
                        <PaginationItem>
                          {/* Fix: Replace disabled prop with className to disable */}
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