'use client';
import { useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'formfiller_theme';
const THEME_ATTRIBUTE = 'data-theme';

/** Apply the given theme to the <html> element. Safe to call SSR (no-op). */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}

/**
 * Resolve and apply the active UI theme.
 *
 * Resolution order (highest priority first):
 *   1. User override saved to localStorage (set via toggle)
 *   2. Tenant default passed in via props
 *   3. `'dark'` fallback
 *
 * The `tenantTheme` arg is typically fetched from `GET /api/tenant/settings`.
 * Pass `null` while loading so we don't flash the wrong theme.
 */
export function useTheme(tenantTheme?: string | null): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  clearOverride: () => void;
} {
  const [theme, setThemeState] = useState<Theme>('dark');

  // Initial mount: read user override from localStorage and apply immediately
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        setThemeState(stored);
        applyTheme(stored);
        return;
      }
    } catch {
      // localStorage unavailable — fall through
    }
    if (tenantTheme === 'dark' || tenantTheme === 'light') {
      setThemeState(tenantTheme);
      applyTheme(tenantTheme);
    } else {
      applyTheme('dark');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When tenantTheme arrives later (after fetch) and no user override is set,
  // adopt the tenant default.
  useEffect(() => {
    if (!tenantTheme) return;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return;
    } catch {
      // ignore
    }
    if (tenantTheme === 'dark' || tenantTheme === 'light') {
      setThemeState(tenantTheme);
      applyTheme(tenantTheme);
    }
  }, [tenantTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setThemeState(next);
    applyTheme(next);
  }, []);

  const clearOverride = useCallback(() => {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // ignore
    }
    const fallback: Theme = tenantTheme === 'light' ? 'light' : 'dark';
    setThemeState(fallback);
    applyTheme(fallback);
  }, [tenantTheme]);

  return { theme, setTheme, clearOverride };
}
