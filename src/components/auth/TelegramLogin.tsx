import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext'; 
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { toast } from "@/lib/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

enum TelegramAuthStep {
  INITIAL = 'initial',
  LOGIN = 'login',
  VERIFY = 'verify',
  REGISTER = 'register',
  COMPLETE = 'complete',
  LINK_EXISTING = 'link_existing'  // New step for linking existing accounts
}

const TelegramLogin: React.FC = () => {
  const { user, signIn, signUp } = useAuth();
  const { isTelegram, telegramUser } = useTelegram();
  const [step, setStep] = useState<TelegramAuthStep>(TelegramAuthStep.INITIAL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<string>('login');
  
  useEffect(() => {
    // If we already have a user, no need for login flow
    if (user) {
      return;
    }
    
    // Only proceed with Telegram login if we're in the Telegram app and have user data
    if (isTelegram && telegramUser) {
      checkTelegramUserStatus();
    }
  }, [isTelegram, telegramUser, user]);

  // Check if this Telegram user is already linked to an account
  const checkTelegramUserStatus = async () => {
    if (!telegramUser?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Check if this Telegram ID is already linked and verified
      const { data: telegramLink, error } = await supabase
        .from('telegram_users')
        .select('user_id, is_verified')
        .eq('telegram_id', telegramUser.id)
        .single();
      
      if (error) {
        // No existing link found, show the login screen
        console.log('No existing Telegram link found, going to login step');
        setStep(TelegramAuthStep.LOGIN);
      } else if (telegramLink && !telegramLink.is_verified) {
        // Link exists but needs verification
        console.log('Telegram link found but needs verification');
        setStep(TelegramAuthStep.VERIFY);
      } else {
        // Link exists and is verified - but we'd still need a session
        // The user should be automatically logged in via AuthContext useEffect
        console.log('Telegram link exists and is verified');
        setStep(TelegramAuthStep.COMPLETE);
      }
    } catch (err) {
      console.error('Error checking Telegram user status:', err);
      setError('Failed to check Telegram authentication status');
      setStep(TelegramAuthStep.LOGIN);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // First try to sign in with the provided credentials
      const { error } = await signIn(email, password);
      
      if (error) {
        setError(`Login failed: ${error.message}`);
        return;
      }
      
      // If login successful and we have a Telegram user, link the accounts
      if (telegramUser?.id) {
        await linkTelegramAccount();
      }
    } catch (err) {
      setError('An unexpected error occurred during login');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Create a new account
      const { error, data } = await signUp(email, password);
      
      if (error) {
        setError(`Registration failed: ${error.message}`);
        return;
      }
      
      // If registration successful and we have a Telegram user, link the accounts
      if (data?.user && telegramUser?.id) {
        await linkTelegramAccount(data.user.id);
        toast.success('Account created! Please verify your email and then enter the verification code sent to your Telegram.');
        setStep(TelegramAuthStep.VERIFY);
      }
    } catch (err) {
      setError('An unexpected error occurred during registration');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  const linkTelegramAccount = async (userId?: string) => {
    if (!telegramUser?.id) return;
    
    try {
      // Get the current user ID if not provided
      const currentUserId = userId || user?.id;
      if (!currentUserId) {
        throw new Error('No user ID available for linking');
      }
      
      // Link the Telegram account to the user
      const { data, error } = await supabase.rpc(
        'link_telegram_account',
        { 
          p_telegram_id: telegramUser.id.toString(),
          p_user_id: currentUserId,
          p_verification_required: true
        }
      );
      
      if (error) throw error;
      
      toast.success('We sent a verification code to your Telegram. Please check your messages.');
      setStep(TelegramAuthStep.VERIFY);
      
    } catch (err) {
      console.error('Error linking Telegram account:', err);
      toast.error('Failed to link Telegram account');
      throw err;
    }
  };

  const handleLinkExistingAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Try to sign in with the provided credentials
      const { error: signInError } = await signIn(email, password);
      
      if (signInError) {
        setError(`Login failed: ${signInError.message}`);
        setLoading(false);
        return;
      }
      
      // If login successful, link the Telegram account
      toast.success('Successfully signed in! Linking your Telegram account...');
      
      // We need to fetch the user data after login
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !currentUser) {
        throw new Error('Failed to retrieve user data after login');
      }
      
      // Link the Telegram account with the user's ID
      await linkTelegramAccount(currentUser.id);
      
    } catch (err) {
      console.error('Error linking existing account:', err);
      setError('Failed to link account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!telegramUser?.id || !verificationCode) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.rpc(
        'verify_telegram_account',
        {
          p_telegram_id: telegramUser.id.toString(),
          p_verification_code: verificationCode
        }
      );
      
      if (error) throw error;
      
      if (data === true) {
        toast.success('Telegram account verified successfully!');
        setStep(TelegramAuthStep.COMPLETE);
        // Refresh the page to update authentication state
        window.location.reload();
      } else {
        setError('Invalid verification code');
      }
    } catch (err) {
      console.error('Error verifying Telegram account:', err);
      setError('Failed to verify Telegram account');
    } finally {
      setLoading(false);
    }
  };

  // Switch to account linking mode
  const switchToLinkExisting = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setStep(TelegramAuthStep.LINK_EXISTING);
  };

  // Switch to login/register mode
  const switchToLoginMode = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setStep(TelegramAuthStep.LOGIN);
  };

  // Render login form with tabs
  const renderAuthForm = () => (
    <Tabs defaultValue="login" value={authTab} onValueChange={setAuthTab} className="w-full">
      <TabsList className="grid grid-cols-2 w-full mb-4">
        <TabsTrigger value="login">Login</TabsTrigger>
        <TabsTrigger value="register">Sign Up</TabsTrigger>
      </TabsList>
      
      <TabsContent value="login" className="space-y-4">
        <form onSubmit={handleLogin}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email"
                type="email" 
                placeholder="you@example.com"
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </div>
        </form>
      </TabsContent>
      
      <TabsContent value="register" className="space-y-4">
        <form onSubmit={handleRegister}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <Input 
                id="register-email"
                type="email" 
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <Input 
                id="register-password"
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Sign Up'
              )}
            </Button>
          </div>
        </form>
      </TabsContent>
    </Tabs>
  );

  const renderVerificationForm = () => (
    <form onSubmit={handleVerification} className="space-y-4">
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          Please enter the 6-digit verification code that was sent to your Telegram account.
        </p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="code">Verification Code</Label>
        <Input 
          id="code"
          type="text" 
          placeholder="123456"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          required
          className="text-center text-xl tracking-widest"
          maxLength={6}
        />
      </div>
      
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          'Verify'
        )}
      </Button>
    </form>
  );

  // Account linking form
  const renderLinkExistingForm = () => (
    <form onSubmit={handleLinkExistingAccount} className="space-y-4">
      <div className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-lg p-3 mb-3 text-sm">
        <LinkIcon className="h-4 w-4 flex-shrink-0" />
        <p>Link your existing account with your Telegram identity</p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="link-email">Email</Label>
        <Input 
          id="link-email"
          type="email" 
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="link-password">Password</Label>
        <Input 
          id="link-password"
          type="password" 
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Linking Account...
          </>
        ) : (
          'Link My Account'
        )}
      </Button>
      
      <Button 
        type="button" 
        variant="outline" 
        className="w-full" 
        onClick={switchToLoginMode}
      >
        Back to Login Options
      </Button>
    </form>
  );

  const renderGoogleAuthWarning = () => (
    <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-lg p-3 text-sm mb-4 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <p>Google Sign-In is not available within the Telegram app due to browser restrictions. Please use email/password login instead.</p>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case TelegramAuthStep.INITIAL:
        return (
          <div className="flex justify-center items-center p-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        );
        
      case TelegramAuthStep.LOGIN:
      case TelegramAuthStep.REGISTER:
        return (
          <>
            {renderGoogleAuthWarning()}
            {renderAuthForm()}
            
            {/* Add link to connect existing account */}
            <div className="mt-6 pt-4 border-t text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Already have an account created with Google?
              </p>
              <Button 
                variant="outline" 
                onClick={switchToLinkExisting}
                className="w-full"
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                Link Existing Account
              </Button>
            </div>
          </>
        );
      
      case TelegramAuthStep.LINK_EXISTING:
        return renderLinkExistingForm();
        
      case TelegramAuthStep.VERIFY:
        return renderVerificationForm();
        
      case TelegramAuthStep.COMPLETE:
        return (
          <div className="text-center p-4">
            <p>Authentication completed! You should be redirected shortly...</p>
            <Loader2 className="h-6 w-6 animate-spin mx-auto mt-4" />
          </div>
        );
    }
  };

  // If we aren't in a Telegram environment or already have a user, don't show this component
  if (!isTelegram || !telegramUser || user) {
    return null;
  }

  return (
    <div className="flex justify-center items-center min-h-[60vh] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign In to Wave Analyzer</CardTitle>
          <CardDescription>
            Link your Telegram account to access Wave Analyzer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 mb-4 text-sm">
              {error}
            </div>
          )}
          
          {renderStepContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export default TelegramLogin;