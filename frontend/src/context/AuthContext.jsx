import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getTokens, onUnauthorized, setTokens } from '../lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | guest

  const bootstrap = useCallback(async () => {
    if (!getTokens()?.accessToken) {
      setStatus('guest');
      return;
    }
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      setStatus('authenticated');
    } catch {
      setTokens(null);
      setUser(null);
      setStatus('guest');
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setStatus('guest');
    });
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const tokens = getTokens();
    try {
      if (tokens?.refreshToken) {
        await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
      }
    } catch {
      // ignore — we're logging out locally regardless
    }
    setTokens(null);
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
