import React, { useState, createContext } from 'react';
import type { NavigationContextType } from '../types';


const NavigationContext = createContext<NavigationContextType>({} as NavigationContextType);

function NavigationProvider(props: React.PropsWithChildren<unknown>) {
  const [navigationData, setNavigationData] = useState({ currentPath: '' });

  return (
    <NavigationContext.Provider
      value={{ navigationData, setNavigationData }}
      {...props}
    />
  );
}

export {
  NavigationProvider,
  NavigationContext,
}
