import React, { useContext, useEffect } from 'react';
import { NavigationContext } from './navigation';

const useNavigation = () => useContext(NavigationContext);

function withNavigationWatcher(Component: React.ElementType, path: string) {
  const WrappedComponent = function (props: Record<string, unknown>) {
    const { setNavigationData } = useNavigation();

    useEffect(() => {
      setNavigationData!({ currentPath: path });
    }, [setNavigationData]);

    return <Component {...props} />;
  }
  return <WrappedComponent />;
}

export {
  useNavigation,
  withNavigationWatcher
}
