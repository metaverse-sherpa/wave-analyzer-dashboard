import React from 'react';

// Declare the APP_VERSION that's defined in vite.config.ts
declare const APP_VERSION: string;

export const VersionDisplay: React.FC = () => {
  return (
    <div className="text-xs text-muted-foreground opacity-70 select-none">
      v{APP_VERSION}
    </div>
  );
};