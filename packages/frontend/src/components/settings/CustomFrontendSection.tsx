'use client';
import { useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import type { AdminSettings } from './SettingsForm';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  frontendKey: string;
  setFrontendKey: (value: string) => void;
  clearFrontendKey: boolean;
  setClearFrontendKey: (value: boolean) => void;
}

function listToText(value: string[] | null): string {
  return (value ?? []).join('\n');
}

function textToList(value: string): string[] | null {
  const list = value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? Array.from(new Set(list)) : null;
}

function TextList({ label, hint, value, onChange, placeholder }: {
  label: string;
  hint: string;
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-100">{label}</label>
      <textarea
        className="w-full rounded-xl border border-white/10 bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
        rows={4}
        value={listToText(value)}
        onChange={(e) => onChange(textToList(e.target.value))}
        placeholder={placeholder}
      />
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

export function CustomFrontendSection({
  form,
  update,
  frontendKey,
  setFrontendKey,
  clearFrontendKey,
  setClearFrontendKey,
}: Props) {
  const configuredText = useMemo(() => {
    if (clearFrontendKey) return 'Key will be removed on save';
    if (form.customFrontendKeyConfigured) return `Key configured (${form.customFrontendKeyPreview ?? 'preview unavailable'})`;
    return 'No public frontend key configured';
  }, [clearFrontendKey, form.customFrontendKeyConfigured, form.customFrontendKeyPreview]);

  return (
    <section className="surface-panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Custom Frontend API</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Allow an approved tenant-hosted UI to call the same FormFiller backend flow. This only
            configures access; submit, signature, document, and delivery validation stay server-side.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <Toggle
            checked={form.customFrontendEnabled}
            onChange={(value) => update('customFrontendEnabled', value)}
            label="Enable custom frontend access"
            description={form.customFrontendEnabled ? 'Configured origins can be used in Phase C.' : 'Hosted /apply remains the default.'}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Input
            label="Public frontend key"
            type="password"
            value={frontendKey}
            onChange={(e) => {
              setFrontendKey(e.target.value);
              if (e.target.value.trim()) setClearFrontendKey(false);
            }}
            placeholder={form.customFrontendKeyConfigured ? 'pk_••••  (key on file)' : 'pk_live_...'}
            hint="Write-only. Paste a new pk_test_ or pk_live_ key to hash/store it; leave blank to keep current key."
            autoComplete="new-password"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {configuredText}
            </span>
            {form.customFrontendKeyConfigured && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setClearFrontendKey(!clearFrontendKey)}>
                {clearFrontendKey ? 'Keep key' : 'Clear key on save'}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 text-xs text-cyan-100">
          <p className="font-semibold text-cyan-50">Security model</p>
          <p className="mt-1 text-cyan-100/90">
            Custom frontends will identify the tenant, send this browser-safe key, and match an allowed Origin.
            Privileged tenant API keys and Switchbox delivery secrets are never exposed to browser code.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextList
          label="Allowed origins"
          value={form.customFrontendAllowedOrigins}
          onChange={(next) => update('customFrontendAllowedOrigins', next)}
          placeholder="https://apply.switchbox.example"
          hint="One origin per line. Use scheme + host only; HTTPS required except localhost."
        />
        <TextList
          label="Allowed redirect URLs"
          value={form.customFrontendAllowedRedirects}
          onChange={(next) => update('customFrontendAllowedRedirects', next)}
          placeholder="https://apply.switchbox.example/complete"
          hint="Optional redirect allowlist for completion/return URLs. One full URL per line."
        />
      </div>
    </section>
  );
}