import React, { useState, useEffect, useCallback, createContext } from 'react';
import { getUser, signIn as sendSignInRequest } from '../api/auth';
import { setToken } from '../api/client';
import type { User, AuthContextType } from '../types';

const AuthContext = createContext<AuthContextType>({ loading: false } as AuthContextType);

function AuthProvider(props: React.PropsWithChildren<unknown>) {
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async function () {
      const result = await getUser();
      if (result.isOk) {
        setUser(result.data);
      }

      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await sendSignInRequest(email, password);
    if (result.isOk) {
      setUser(result.data);
    }

    return result;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(undefined);
  }, []);


  return (
    <AuthContext.Provider value={{ user, signIn, signOut, loading }} {...props} />
  );
}

export {
  AuthProvider,
  AuthContext,
};
