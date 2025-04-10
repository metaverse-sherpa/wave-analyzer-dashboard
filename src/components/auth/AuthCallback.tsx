import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { handleAuthCallback, user } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        setIsProcessing(true);
        // Get the hash or search portion of the URL to extract tokens
        const hashParams = window.location.hash || window.location.search;
        //console.log("Processing auth callback with params:", hashParams);
        
        // Handle the auth callback
        const result = await handleAuthCallback();
        //console.log("Auth callback result:", result);
        
        if (result.error) {
          setError(result.error);
        } else {
          // Successful sign-in, redirect to home or intended path
          navigate('/');
        }
      } catch (err) {
        console.error("Error processing auth callback:", err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      } finally {
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [navigate, handleAuthCallback]);

  // If user is already authenticated, redirect to home
  useEffect(() => {
    if (user && !isProcessing) {
      navigate('/');
    }
  }, [user, navigate, isProcessing]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="p-6 max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Authentication Error</h1>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/login')}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      <p className="mt-4 text-gray-700 dark:text-gray-300">Completing your sign-in...</p>
    </div>
  );
};

export default AuthCallback;