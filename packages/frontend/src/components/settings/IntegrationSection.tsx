'use client';
import { Input } from '@/components/ui/Input';
import type { AdminSettings } from './SettingsForm';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
}

/**
 * Integration credentials for forwarding the signed application package
 * (PDF + bank statements + structured data) to an external lender via API.
 *
 * The Switchbox key is write-only: it's never returned from the server, only
 * a boolean indicating whether one is configured. Submitting an empty value
 * leaves the existing key untouched.
 */
export function IntegrationSection({ form, update, apiKey, setApiKey }: Props) {
  return (
    <section className="surface-panel p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white">API Delivery</h2>
      <p className="mt-1 text-sm text-slate-400">
        Forward signed applications, the generated PDF, and uploaded bank statements to a lender
        endpoint over HTTPS. Leave blank to disable.
      </p>

      <div className="mt-5 grid gap-4">
        <Input
          label="Endpoint URL"
          type="url"
          value={form.switchboxApiUrl ?? ''}
          onChange={(e) => update('switchboxApiUrl', e.target.value)}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (!value || value === 'https://' || value === 'http://') {
              update('switchboxApiUrl', null);
            }
          }}
          hint="POST endpoint provided by the lender or CRM (e.g. https://lender.example.com/intake)."
          placeholder="https://lender.example.com/intake"
        />

        <div>
          <Input
            label="API key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              form.switchboxApiKeyConfigured ? '••••••••  (key on file)' : 'Paste API key'
            }
            hint="Sent as a Bearer token. Leave blank to keep the existing key."
            autoComplete="new-password"
          />
          {form.switchboxApiKeyConfigured && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Key configured
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 text-xs text-cyan-100">
          <p className="font-semibold text-cyan-50">How delivery works</p>
          <p className="mt-1 text-cyan-100/90">
            When the merchant submits the application, we POST a JSON payload containing the
            structured application data, the signed PDF (base64), and any uploaded bank statements
            to your endpoint. Failed deliveries are retried automatically and visible in the
            CrmDelivery log. Privacy toggles above are honored — fields you have hidden from the
            PDF are also omitted from the JSON payload.
          </p>
        </div>
      </div>
    </section>
  );
}
