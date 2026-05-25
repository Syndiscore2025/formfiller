'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'default';
const CONFIRM_PHRASE = 'EXPORT_FULL_SSN_DOB';

export default function PrivateConsolePage() {
  const { token, role, loading } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canExportSensitive = !includeSensitive || confirmation === CONFIRM_PHRASE;

  const handleDownload = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || role !== 'super_admin' || !canExportSensitive) return;
    setError('');
    setSuccess('');
    setDownloading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-slug': TENANT_SLUG,
        },
        body: JSON.stringify({
          report: 'lead_export',
          startDate,
          endDate,
          includeSensitive,
          confirmSensitive: includeSensitive ? confirmation : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Unable to generate file.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `merchant-file-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess('CSV download started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate file.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <main className="min-h-screen py-10"><div className="surface-shell text-sm text-slate-400">Loading…</div></main>;

  if (!token || role !== 'super_admin') {
    return (
      <main className="min-h-screen py-10">
        <div className="surface-shell">
          <section className="surface-panel max-w-2xl p-8">
            <span className="surface-kicker">Restricted</span>
            <h1 className="mt-3 text-3xl font-semibold text-white">Access required</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Sign in with the authorized owner account to continue.</p>
            <Link href="/login?redirect=/mycba/0c7f2e9a5b184d6f/portal/91a3d8e0c4b7" className="mt-6 inline-flex rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
              Go to login
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10">
      <div className="surface-shell">
        <header className="mb-8 max-w-3xl">
          <span className="surface-kicker">Owner Console</span>
          <h1 className="mt-3 text-3xl font-semibold text-white">Private File Download</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Generate a cross-tenant CSV from the primary database. Date filters use application creation date.</p>
        </header>

        <form onSubmit={handleDownload} className="surface-panel max-w-3xl space-y-6 p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
            <input type="checkbox" checked={includeSensitive} onChange={(e) => setIncludeSensitive(e.target.checked)} className="mt-1 h-4 w-4" />
            <span>Include full SSN and DOB in this export. Use only when required and keep the downloaded CSV protected.</span>
          </label>

          {includeSensitive && (
            <Input label={`Type ${CONFIRM_PHRASE} to confirm`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} error={confirmation && confirmation !== CONFIRM_PHRASE ? 'Confirmation phrase does not match.' : undefined} autoComplete="off" />
          )}

          {error && <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          {success && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-5 text-slate-500">The CSV is streamed live and not stored by the app. Rows are de-duplicated by email, then phone, then business identity.</p>
            <Button type="submit" loading={downloading} disabled={!canExportSensitive}>Download CSV</Button>
          </div>
        </form>
      </div>
    </main>
  );
}