'use client';
import { useRef, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { AdminSettings } from './SettingsForm';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  onLogoFile: (file: File) => void;
  onField: (key: keyof AdminSettings) => (e: ChangeEvent<HTMLInputElement>) => void;
}

export function BrandingSection({ form, update, onLogoFile, onField }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="surface-panel p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white">Branding</h2>
      <p className="mt-1 text-sm text-slate-400">
        Identifies your organization on the application PDF and within the merchant form header.
      </p>

      {/* Logo upload + preview */}
      <div className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/55">
          {form.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">No logo</span>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-100">Tenant logo</p>
          <p className="mt-1 text-xs text-slate-400">
            PNG, JPEG, WebP, or SVG. Embedded directly in the PDF header. Max 500KB.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLogoFile(file);
                e.target.value = ''; // allow re-selecting the same file
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              {form.logoUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {form.logoUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => update('logoUrl', null)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Company info fields */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Input
          label="Company name"
          value={form.companyName ?? ''}
          onChange={onField('companyName')}
          hint="Display name shown in the PDF header and form."
        />
        <Input
          label="Legal business name"
          value={form.legalBusinessName ?? ''}
          onChange={onField('legalBusinessName')}
          hint="Legal entity name shown in the PDF footer."
        />
        <Input
          label="Company email"
          type="email"
          value={form.companyEmail ?? ''}
          onChange={onField('companyEmail')}
        />
        <Input
          label="Company phone"
          value={form.companyPhone ?? ''}
          onChange={onField('companyPhone')}
        />
        <Input
          label="Company address"
          value={form.companyAddress ?? ''}
          onChange={onField('companyAddress')}
          className="sm:col-span-2"
        />
        <Input
          label="Website URL"
          type="url"
          value={form.websiteUrl ?? ''}
          onChange={onField('websiteUrl')}
          hint="Where merchants are redirected after completing the application."
        />
        <Input
          label="Support email"
          type="email"
          value={form.supportEmail ?? ''}
          onChange={onField('supportEmail')}
          hint="Shown on the completion screen as a contact fallback."
        />
      </div>
    </section>
  );
}
