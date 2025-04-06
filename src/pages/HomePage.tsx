import React from 'react';
import { useAuth } from '@/context/AuthContext';

const HomePage = () => {
  const { user } = useAuth();
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Welcome, {user?.email}</h2>
        <p className="text-muted-foreground">
          This is your Wave Analyzer Dashboard home page. You can add your main dashboard content here.
        </p>
      </div>
    </div>
  );
};

export default HomePage;