// Create a new file: src/context/KillSwitchContext.tsx
import React, { createContext, useState, useContext } from 'react';

type KillSwitchContextType = {
  killSwitch: boolean;
  setKillSwitch: React.Dispatch<React.SetStateAction<boolean>>;
};

export const KillSwitchContext = createContext<KillSwitchContextType>({
  killSwitch: false,
  setKillSwitch: () => {},
});

export const KillSwitchProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [killSwitch, setKillSwitch] = useState(false);
  
  return (
    <KillSwitchContext.Provider value={{ killSwitch, setKillSwitch }}>
      {children}
    </KillSwitchContext.Provider>
  );
};

export const useKillSwitch = () => useContext(KillSwitchContext);