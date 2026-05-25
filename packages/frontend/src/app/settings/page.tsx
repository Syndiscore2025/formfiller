'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import { SettingsForm, type AdminSettings } from '@/components/settings/SettingsForm';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Apply theme from current settings (after load) so admins see live previews.
  useTheme(settings?.theme ?? null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: AdminSettings }>('/api/tenant/settings/admin')
      .then((res) => setSettings(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'));
  }, []);

  return (
    <main className="min-h-screen py-10">
      <div className="surface-shell">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="surface-kicker">Tenant Admin</span>
            <h1 className="mt-3 text-3xl font-semibold text-white">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Configure branding, PDF privacy, and lender-delivery integrations for this workspace.
              Changes apply to every application created under this tenant going forward.
            </p>
          </div>
          <a
            href="/apply"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/[0.08]"
          >
            View merchant form →
          </a>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!settings && !error && (
          <p className="text-sm text-slate-400">Loading settings…</p>
        )}

        {settings && (
          <SettingsForm
            initial={settings}
            onSaved={(updated) => setSettings(updated)}
          />
        )}
      </div>
    </main>
  );
}
