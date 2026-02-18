'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface AuthState {
  token: string | null;
  role: string | null;
  tenantId: string | null;
}

const AUTH_KEY = 'formfiller_auth';

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({ token: null, role: null, tenantId: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored) setAuth(JSON.parse(stored) as AuthState);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug: string) => {
    const res = await api.post<AuthState & { success: boolean }>(
      '/api/auth/login',
      { email, password, tenantSlug }
    );
    const state: AuthState = { token: res.token, role: res.role, tenantId: res.tenantId };
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
    setAuth(state);
    return state;
  }, []);

  const register = useCallback(async (
    email: string, password: string, tenantSlug: string, tenantName?: string
  ) => {
    const res = await api.post<AuthState & { success: boolean }>(
      '/api/auth/register',
      { email, password, tenantSlug, tenantName }
    );
    const state: AuthState = { token: res.token, role: res.role, tenantId: res.tenantId };
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
    setAuth(state);
    return state;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setAuth({ token: null, role: null, tenantId: null });
  }, []);

  return { ...auth, loading, login, register, logout };
}

