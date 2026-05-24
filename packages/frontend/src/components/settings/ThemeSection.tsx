'use client';
import { useEffect } from 'react';
import type { AdminSettings } from './SettingsForm';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
}

const DEFAULT_ACCENT = '#22d3ee';
const DEFAULT_SURFACE = '#0f172a';

export function ThemeSection({ form, update }: Props) {
  const { setTheme } = useTheme(form.theme);

  // Live-preview the theme picker without waiting for save.
  useEffect(() => {
    if (form.theme === 'dark' || form.theme === 'light') {
      setTheme(form.theme);
    }
  }, [form.theme, setTheme]);

  return (
    <section className="surface-panel p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white">Theme</h2>
      <p className="mt-1 text-sm text-slate-400">
        Choose the default appearance for the merchant form and admin console. Picks a base mode
        and lets you override the accent color.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Mode
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((mode) => {
              const active = (form.theme ?? 'dark') === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update('theme', mode)}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? 'border-cyan-300/60 bg-cyan-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                  }`}
                >
                  {mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Accent color
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="color"
              value={form.accentColor ?? DEFAULT_ACCENT}
              onChange={(e) => update('accentColor', e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
              aria-label="Accent color"
            />
            <input
              type="text"
              value={form.accentColor ?? ''}
              onChange={(e) => update('accentColor', e.target.value)}
              placeholder={DEFAULT_ACCENT}
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Used for highlights, links, and CTAs.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Surface color
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="color"
              value={form.surfaceColor ?? DEFAULT_SURFACE}
              onChange={(e) => update('surfaceColor', e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
              aria-label="Surface color"
            />
            <input
              type="text"
              value={form.surfaceColor ?? ''}
              onChange={(e) => update('surfaceColor', e.target.value)}
              placeholder={DEFAULT_SURFACE}
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Optional override for panel backgrounds.</p>
        </div>
      </div>
    </section>
  );
}
