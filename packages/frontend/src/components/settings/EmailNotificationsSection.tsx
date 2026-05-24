'use client';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import type { AdminSettings } from './SettingsForm';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  smtpPass: string;
  setSmtpPass: (value: string) => void;
}

function TemplateCard({
  title,
  description,
  enabledKey,
  subjectKey,
  bodyKey,
  logoKey,
  sigKey,
  form,
  update,
  extraFields,
}: {
  title: string;
  description: string;
  enabledKey: keyof AdminSettings;
  subjectKey: keyof AdminSettings;
  bodyKey: keyof AdminSettings;
  logoKey: keyof AdminSettings;
  sigKey: keyof AdminSettings;
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  extraFields?: React.ReactNode;
}) {
  const enabled = Boolean(form[enabledKey]);
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => update(enabledKey, v as AdminSettings[typeof enabledKey])}
          label=""
        />
      </div>
      {enabled && (
        <div className="mt-4 grid gap-3">
          {extraFields}
          <Input
            label="Subject"
            value={(form[subjectKey] as string) ?? ''}
            onChange={(e) => update(subjectKey, e.target.value as AdminSettings[typeof subjectKey])}
            placeholder="Email subject line"
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Body</label>
            <textarea
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
              rows={5}
              value={(form[bodyKey] as string) ?? ''}
              onChange={(e) => update(bodyKey, e.target.value as AdminSettings[typeof bodyKey])}
              placeholder="Write your message here. Use {firstName}, {companyName} as placeholders."
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Available placeholders: {'{firstName}'}, {'{companyName}'}, {'{applicationUrl}'}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              checked={Boolean(form[logoKey])}
              onChange={(v) => update(logoKey, v as AdminSettings[typeof logoKey])}
              label="Include logo"
              description="Embed your company logo at the top of the email."
            />
            <Toggle
              checked={Boolean(form[sigKey])}
              onChange={(v) => update(sigKey, v as AdminSettings[typeof sigKey])}
              label="Include signature"
              description="Add company name, email, and phone as a footer."
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function EmailNotificationsSection({ form, update, smtpPass, setSmtpPass }: Props) {
  return (
    <section className="surface-panel p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white">Email Notifications</h2>
      <p className="mt-1 text-sm text-slate-400">
        Automatically follow up with merchants based on application status. Configure your SMTP
        server below, then enable and customise each email template.
      </p>

      {/* SMTP configuration */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input
          label="SMTP host"
          value={form.smtpHost ?? ''}
          onChange={(e) => update('smtpHost', e.target.value)}
          placeholder="smtp.sendgrid.net"
          hint="Hostname of your outbound SMTP server."
        />
        <Input
          label="SMTP port"
          type="number"
          value={form.smtpPort != null ? String(form.smtpPort) : ''}
          onChange={(e) => update('smtpPort', e.target.value ? Number(e.target.value) : null)}
          placeholder="587"
          hint="587 for STARTTLS · 465 for SSL"
        />
        <Input
          label="SMTP username"
          value={form.smtpUser ?? ''}
          onChange={(e) => update('smtpUser', e.target.value)}
          placeholder="apikey"
        />
        <div>
          <Input
            label="SMTP password"
            type="password"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            placeholder={form.smtpPassConfigured ? '••••••••  (password on file)' : 'Enter SMTP password'}
            hint="Leave blank to keep the existing password."
            autoComplete="new-password"
          />
          {form.smtpPassConfigured && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Password configured
            </p>
          )}
        </div>
        <Input
          label="From address"
          type="email"
          value={form.smtpFrom ?? ''}
          onChange={(e) => update('smtpFrom', e.target.value)}
          placeholder="noreply@example.com"
        />
        <Input
          label="From name"
          value={form.smtpFromName ?? ''}
          onChange={(e) => update('smtpFromName', e.target.value)}
          placeholder="Switchbox Funding"
        />
        <div className="sm:col-span-2">
          <Toggle
            checked={form.smtpSecure}
            onChange={(v) => update('smtpSecure', v)}
            label="Use SSL/TLS (port 465)"
            description="Enable for implicit TLS. Leave off for STARTTLS (port 587)."
          />
        </div>
      </div>

      {/* Email templates */}
      <div className="mt-6 grid gap-4">
        <TemplateCard
          title="Abandoned application"
          description="Sent when a merchant starts the form but does not complete it after a period of inactivity."
          enabledKey="emailAbandonedEnabled"
          subjectKey="emailAbandonedSubject"
          bodyKey="emailAbandonedBody"
          logoKey="emailAbandonedIncludeLogo"
          sigKey="emailAbandonedIncludeSig"
          form={form}
          update={update}
          extraFields={
            <Input
              label="Delay (hours)"
              type="number"
              value={String(form.emailAbandonedDelayHours ?? 24)}
              onChange={(e) => update('emailAbandonedDelayHours', Number(e.target.value))}
              hint="Hours of inactivity before sending."
            />
          }
        />

        <TemplateCard
          title="No bank statements uploaded"
          description="Sent when a merchant completes and submits the application but uploads zero bank statements."
          enabledKey="emailNoBanksEnabled"
          subjectKey="emailNoBanksSubject"
          bodyKey="emailNoBanksBody"
          logoKey="emailNoBanksIncludeLogo"
          sigKey="emailNoBanksIncludeSig"
          form={form}
          update={update}
        />

        <TemplateCard
          title="Insufficient bank statements"
          description="Sent when a merchant submits with fewer than the required number of bank statements."
          enabledKey="emailInsufficientBanksEnabled"
          subjectKey="emailInsufficientBanksSubject"
          bodyKey="emailInsufficientBanksBody"
          logoKey="emailInsufficientBanksIncludeLogo"
          sigKey="emailInsufficientBanksIncludeSig"
          form={form}
          update={update}
          extraFields={
            <Input
              label="Minimum bank statements required"
              type="number"
              value={String(form.emailMinBankStatements ?? 3)}
              onChange={(e) => update('emailMinBankStatements', Number(e.target.value))}
              hint="Trigger email when uploaded count is below this number. Placeholders: {uploadedCount}, {requiredCount}."
            />
          }
        />
      </div>
    </section>
  );
}
