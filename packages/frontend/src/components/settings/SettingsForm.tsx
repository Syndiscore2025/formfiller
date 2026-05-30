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
import { CustomFrontendSection } from './CustomFrontendSection';

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
  showEstimatedCreditScore: boolean;
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
  emailAbandonedDelayMinutes: number;
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
  // Custom tenant frontend / headless API
  customFrontendEnabled: boolean;
  customFrontendKeyPreview: string | null;
  customFrontendKeyConfigured: boolean;
  customFrontendAllowedOrigins: string[] | null;
  customFrontendAllowedRedirects: string[] | null;
  // AI chat agent
  aiChatEnabled: boolean;
  aiPersonaName: string | null;
  aiSystemPromptOverride: string | null;
  aiEligibilityRules: unknown | null;
  aiModel: string | null;
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
  const [frontendKey, setFrontendKey] = useState(''); // write-only; only sent if non-empty
  const [clearFrontendKey, setClearFrontendKey] = useState(false);
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
        customFrontendKeyConfigured: _ignoredFrontendKey,
        aiEligibilityRules: _ignoredAiEligibilityRules,
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
      if (frontendKey.trim()) payload.customFrontendPublicKey = frontendKey.trim();
      if (clearFrontendKey) payload.customFrontendClearPublicKey = true;

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
      setFrontendKey('');
      setClearFrontendKey(false);
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
          <Toggle
            checked={form.showEstimatedCreditScore}
            onChange={(v) => update('showEstimatedCreditScore', v)}
            label="Show credit score"
            description="Adds the owner credit score to the merchant app, signed review, PDF, and delivery payload."
          />
        </div>
      </section>

      <IntegrationSection
        form={form}
        update={update}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />

      <CustomFrontendSection
        form={form}
        update={update}
        frontendKey={frontendKey}
        setFrontendKey={setFrontendKey}
        clearFrontendKey={clearFrontendKey}
        setClearFrontendKey={setClearFrontendKey}
      />

      <DocumentStorageSection
        form={form}
        update={update}
        storageSecret={storageSecret}
        setStorageSecret={setStorageSecret}
      />

      <section className="surface-panel p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-white">AI Funding Assistant</h2>
        <p className="mt-1 text-sm text-slate-400">
          Control the live chat assistant shown to merchants during the application.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Toggle
            checked={form.aiChatEnabled}
            onChange={(v) => update('aiChatEnabled', v)}
            label="Enable AI chat"
            description="When off, merchants cannot use the live application chat assistant."
          />
          <Input
            label="Assistant name"
            value={form.aiPersonaName ?? ''}
            onChange={handleField('aiPersonaName')}
            placeholder="Funding Assistant"
            hint="This is the name/persona the AI uses in chat."
          />
          <Input
            label="AI model"
            value={form.aiModel ?? ''}
            onChange={handleField('aiModel')}
            placeholder="gpt-4o"
            hint="Leave as configured unless Switchbox instructs otherwise."
          />
          <div className="sm:col-span-2">
            <label htmlFor="ai_system_prompt_override" className="text-sm font-semibold text-slate-100">
              System prompt override
            </label>
            <textarea
              id="ai_system_prompt_override"
              value={form.aiSystemPromptOverride ?? ''}
              onChange={(e) => update('aiSystemPromptOverride', e.target.value)}
              rows={5}
              placeholder="Optional tenant-specific assistant instructions. Leave blank to use the platform default."
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 shadow-inner shadow-black/10 placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            />
            <p className="mt-1 text-xs text-slate-400">
              Optional. Use this for tenant-specific tone or instructions; core compliance and disqualification guardrails still apply.
            </p>
          </div>
        </div>
      </section>

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
