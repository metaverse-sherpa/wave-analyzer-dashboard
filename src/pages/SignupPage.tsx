import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import { FaGoogle } from 'react-icons/fa';

const SignupPage: React.FC = () => {
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const validatePassword = (pass: string) => {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    
    if (pass.length < minLength) {
      return `Password must be at least ${minLength} characters long`;
    }
    
    if (!hasUppercase) {
      return 'Password must contain at least one uppercase letter';
    }
    
    if (!hasNumber) {
      return 'Password must contain at least one number';
    }
    
    return null;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    
    if (password !== passwordConfirm) {
      toast.error("Passwords don't match");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error, data } = await signUp(email, password);
      
      if (error) {
        toast.error(`Registration failed: ${error.message}`);
      } else {
        toast.success("Account created successfully!");
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      const { error } = await signInWithGoogle();
      
      if (error) {
        toast.error(`Google sign up failed: ${error.message}`);
      }
      // Successful signup will redirect the user
    } catch (error) {
      console.error('Google signup error:', error);
      toast.error('Failed to sign up with Google');
    } finally {
      setGoogleLoading(false);
    }
  };
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">
            Create Account
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sign up to get started with our platform
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum 8 characters with at least one uppercase letter and one number
              </p>
            </div>
            
            <div>
              <label htmlFor="passwordConfirm" className="block text-sm font-medium">
                Confirm Password
              </label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="••••••••"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
              />
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Create Account
          </Button>
        </form>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          type="button"
          className="w-full flex items-center justify-center"
          onClick={handleGoogleSignup}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FaGoogle className="h-4 w-4 mr-2" />
          )}
          Google
        </Button>
        
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;