'use client';
import { useState, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { api } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { BrandingSection } from './BrandingSection';
import { ThemeSection } from './ThemeSection';
import { IntegrationSection } from './IntegrationSection';
import { DocumentStorageSection } from './DocumentStorageSection';
import { EmailNotificationsSection } from './EmailNotificationsSection';

export interface AdminSettings {
  companyName: string | null;
  legalBusinessName: string | null;
  logoUrl: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  theme: string | null;
  accentColor: string | null;
  surfaceColor: string | null;
  pdfShowContactEmail: boolean;
  pdfShowContactPhone: boolean;
  pdfShowAnnualRevenue: boolean;
  pdfShowAmountRequested: boolean;
  switchboxApiUrl: string | null;
  switchboxApiKeyConfigured: boolean;
  documentStorageProvider: string | null;
  documentStorageEndpoint: string | null;
  documentStorageRegion: string | null;
  documentStorageBucket: string | null;
  documentStoragePrefix: string | null;
  documentStorageAccessKeyId: string | null;
  documentStoragePublicBaseUrl: string | null;
  documentStorageSecretConfigured: boolean;
  // SMTP
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpFromName: string | null;
  smtpPassConfigured: boolean;
  // Email: Abandoned
  emailAbandonedEnabled: boolean;
  emailAbandonedDelayHours: number;
  emailAbandonedSubject: string | null;
  emailAbandonedBody: string | null;
  emailAbandonedIncludeLogo: boolean;
  emailAbandonedIncludeSig: boolean;
  // Email: No banks
  emailNoBanksEnabled: boolean;
  emailNoBanksSubject: string | null;
  emailNoBanksBody: string | null;
  emailNoBanksIncludeLogo: boolean;
  emailNoBanksIncludeSig: boolean;
  // Email: Insufficient banks
  emailInsufficientBanksEnabled: boolean;
  emailMinBankStatements: number;
  emailInsufficientBanksSubject: string | null;
  emailInsufficientBanksBody: string | null;
  emailInsufficientBanksIncludeLogo: boolean;
  emailInsufficientBanksIncludeSig: boolean;
}

interface Props {
  initial: AdminSettings;
  token: string;
  onSaved: (updated: AdminSettings) => void;
}

const MAX_LOGO_BYTES = 512_000; // ~500KB after base64 — keeps DB row reasonable

function blankIfPlaceholderUrl(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === 'https://' || trimmed === 'http://') return null;
  return trimmed;
}

export function SettingsForm({ initial, token, onSaved }: Props) {
  const [form, setForm] = useState<AdminSettings>(initial);
  const [apiKey, setApiKey] = useState(''); // write-only; only sent if non-empty
  const [storageSecret, setStorageSecret] = useState(''); // write-only; only sent if non-empty
  const [smtpPass, setSmtpPass] = useState(''); // write-only; only sent if non-empty
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setTheme } = useTheme(form.theme);

  const update = useCallback(<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleField = (key: keyof AdminSettings) => (e: ChangeEvent<HTMLInputElement>) =>
    update(key, e.target.value as AdminSettings[typeof key]);

  const handleLogoUpload = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      setError(`Logo must be smaller than ${Math.round(MAX_LOGO_BYTES / 1024)}KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        update('logoUrl', reader.result);
        setError(null);
      }
    };
    reader.onerror = () => setError('Failed to read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      // Build payload — never send switchboxApiKeyConfigured (server-derived).
      // Only send switchboxApiKey when the admin actually typed a new value.
      const {
        switchboxApiKeyConfigured: _ignored,
        documentStorageSecretConfigured: _ignoredStorage,
        smtpPassConfigured: _ignoredSmtp,
        ...rest
      } = form;
      const payload: Record<string, unknown> = {
        ...rest,
        websiteUrl: blankIfPlaceholderUrl(rest.websiteUrl),
        switchboxApiUrl: blankIfPlaceholderUrl(rest.switchboxApiUrl),
        documentStorageEndpoint: blankIfPlaceholderUrl(rest.documentStorageEndpoint),
        documentStoragePublicBaseUrl: blankIfPlaceholderUrl(rest.documentStoragePublicBaseUrl),
      };
      if (apiKey.trim()) payload.switchboxApiKey = apiKey.trim();
      if (storageSecret.trim()) payload.documentStorageSecretAccessKey = storageSecret.trim();
      if (smtpPass.trim()) payload.smtpPass = smtpPass.trim();

      const res = await api.patch<{ success: boolean; data: AdminSettings }>(
        '/api/tenant/settings/admin',
        payload,
        token,
      );
      setForm(res.data);
      onSaved(res.data);
      setApiKey('');
      setStorageSecret('');
      setSmtpPass('');
      setSavedMessage('Settings saved.');
      // Apply the saved theme as the active session preference
      if (res.data.theme === 'dark' || res.data.theme === 'light') {
        setTheme(res.data.theme);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <BrandingSection
        form={form}
        update={update}
        onLogoFile={handleLogoUpload}
        onField={handleField}
      />

      <ThemeSection form={form} update={update} />

      <section className="surface-panel p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white">PDF Privacy</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose which merchant details appear on the generated PDF and any signed copy delivered
          to lenders. Defaults to fully visible.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={form.pdfShowContactEmail}
            onChange={(v) => update('pdfShowContactEmail', v)}
            label="Show contact email"
            description="Merchant's email address on the contact info section."
          />
          <Toggle
            checked={form.pdfShowContactPhone}
            onChange={(v) => update('pdfShowContactPhone', v)}
            label="Show contact phone"
            description="Merchant's phone number on the contact info section."
          />
          <Toggle
            checked={form.pdfShowAnnualRevenue}
            onChange={(v) => update('pdfShowAnnualRevenue', v)}
            label="Show annual revenue"
            description="Estimated annual revenue on the funding request section."
          />
          <Toggle
            checked={form.pdfShowAmountRequested}
            onChange={(v) => update('pdfShowAmountRequested', v)}
            label="Show amount requested"
            description="Requested funding amount on the funding request section."
          />
        </div>
      </section>

      <IntegrationSection
        form={form}
        update={update}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />

      <DocumentStorageSection
        form={form}
        update={update}
        storageSecret={storageSecret}
        setStorageSecret={setStorageSecret}
      />

      <EmailNotificationsSection
        form={form}
        update={update}
        smtpPass={smtpPass}
        setSmtpPass={setSmtpPass}
      />

      <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="text-xs text-slate-400">
          {savedMessage && <span className="text-emerald-300">{savedMessage}</span>}
          {error && <span className="text-red-300">{error}</span>}
        </div>
        <Button type="submit" size="lg" loading={saving} disabled={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
