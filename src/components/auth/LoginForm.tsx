import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from '@/lib/toast';
import { FaGoogle } from 'react-icons/fa';

interface LoginFormProps {
  onSuccess?: () => void;
  onToggleMode?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onToggleMode }) => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await signInWithEmail(email, password);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Signed in successfully!');
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message);
      }
      // Success is handled by the redirect
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-md">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in to your account</h1>
        <p className="text-sm text-muted-foreground">Enter your email below to sign in to your account</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input 
            id="email" 
            type="email" 
            placeholder="name@example.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <Input 
            id="password" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>
      
      <Button 
        variant="outline" 
        type="button" 
        className="w-full" 
        onClick={handleGoogleSignIn}
        disabled={isLoading}
      >
        <FaGoogle className="mr-2 h-4 w-4" />
        Google
      </Button>
      
      <div className="text-center text-sm">
        Don't have an account?{' '}
        <Button variant="link" onClick={onToggleMode} className="p-0 h-auto">
          Sign up
        </Button>
      </div>
    </div>
  );
};

export default LoginForm;