import React, { createContext, useContext, useState } from 'react';

interface PreviewContextType {
  isPreviewMode: boolean;
  setPreviewMode: (value: boolean) => void;
}

const PreviewContext = createContext<PreviewContextType>({
  isPreviewMode: false,
  setPreviewMode: () => {},
});

export const usePreview = () => useContext(PreviewContext);

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPreviewMode, setPreviewMode] = useState(false);
  
  return (
    <PreviewContext.Provider value={{ isPreviewMode, setPreviewMode }}>
      {children}
    </PreviewContext.Provider>
  );
};