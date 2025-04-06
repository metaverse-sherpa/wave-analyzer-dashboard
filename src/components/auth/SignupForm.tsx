import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from '@/lib/toast';
import { FaGoogle } from 'react-icons/fa';

interface SignupFormProps {
  onSuccess?: () => void;
  onToggleMode?: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onSuccess, onToggleMode }) => {
  const { signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await signUp(email, password);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Check your email for the confirmation link');
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign up');
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
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">Enter your email below to create your account</p>
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
          <Label htmlFor="password">Password</Label>
          <Input 
            id="password" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input 
            id="confirmPassword" 
            type="password" 
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Create Account'}
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
        Already have an account?{' '}
        <Button variant="link" onClick={onToggleMode} className="p-0 h-auto">
          Sign in
        </Button>
      </div>
    </div>
  );
};

export default SignupForm;