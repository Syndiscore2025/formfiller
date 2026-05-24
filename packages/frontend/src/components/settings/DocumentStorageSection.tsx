'use client';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import type { AdminSettings } from './SettingsForm';

interface Props {
  form: AdminSettings;
  update: <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => void;
  storageSecret: string;
  setStorageSecret: (value: string) => void;
}

export function DocumentStorageSection({ form, update, storageSecret, setStorageSecret }: Props) {
  const enabled = form.documentStorageProvider === 's3';

  return (
    <section className="surface-panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Document Storage</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Store signed application PDFs and bank statements in a tenant-owned S3-compatible
            bucket such as DigitalOcean Spaces, AWS S3, or Switchbox&apos;s AWS bucket.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Toggle
            checked={enabled}
            onChange={(value) => update('documentStorageProvider', value ? 's3' : 'database')}
            label="Use object storage"
            description={enabled ? 'Documents are written to your bucket.' : 'Fallback: database bytes.'}
          />
        </div>
      </div>

      {enabled && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input
            label="Endpoint URL"
            type="url"
            value={form.documentStorageEndpoint ?? ''}
            onChange={(e) => update('documentStorageEndpoint', e.target.value)}
            placeholder="https://nyc3.digitaloceanspaces.com"
            hint="S3-compatible endpoint. For AWS use https://s3.us-east-1.amazonaws.com."
          />
          <Input
            label="Region"
            value={form.documentStorageRegion ?? ''}
            onChange={(e) => update('documentStorageRegion', e.target.value)}
            placeholder="nyc3"
          />
          <Input
            label="Bucket name"
            value={form.documentStorageBucket ?? ''}
            onChange={(e) => update('documentStorageBucket', e.target.value)}
            placeholder="switchbox-applications"
          />
          <Input
            label="Key prefix"
            value={form.documentStoragePrefix ?? ''}
            onChange={(e) => update('documentStoragePrefix', e.target.value)}
            placeholder="tenants/"
            hint="Optional. Tenant slug and application ID are added automatically."
          />
          <Input
            label="Access key ID"
            value={form.documentStorageAccessKeyId ?? ''}
            onChange={(e) => update('documentStorageAccessKeyId', e.target.value)}
            autoComplete="off"
          />
          <Input
            label="Secret access key"
            type="password"
            value={storageSecret}
            onChange={(e) => setStorageSecret(e.target.value)}
            placeholder={form.documentStorageSecretConfigured ? '••••••••  (secret on file)' : 'Paste secret key'}
            hint="Write-only. Leave blank to keep the existing secret."
            autoComplete="new-password"
          />
          <Input
            label="Public/CDN base URL"
            type="url"
            value={form.documentStoragePublicBaseUrl ?? ''}
            onChange={(e) => update('documentStoragePublicBaseUrl', e.target.value)}
            placeholder="https://cdn.example.com"
            hint="Optional. Keep blank for private buckets."
            className="sm:col-span-2"
          />
        </div>
      )}
    </section>
  );
}