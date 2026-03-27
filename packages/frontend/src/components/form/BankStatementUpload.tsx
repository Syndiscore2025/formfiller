'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { BANK_HELP_ENTRIES } from '@/data/bankHelp';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ApplicationDocument {
  id: string;
  statementMonth: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  applicationId: string;
  submittedAt: string;
  token: string | null;
  pdfDownloading: boolean;
  onDownloadPdf: () => Promise<void>;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function BankStatementUpload({
  applicationId,
  submittedAt,
  token,
  pdfDownloading,
  onDownloadPdf,
}: Props) {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingMonth, setUploadingMonth] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState('');

  const requiredMonths = useMemo(() => getRequiredStatementMonths(), []);
  const documentsByMonth = useMemo(
    () => new Map(documents.map((document) => [document.statementMonth, document])),
    [documents]
  );
  const uploadedCount = requiredMonths.filter(({ value }) => documentsByMonth.has(value)).length;
  const isComplete = uploadedCount === requiredMonths.length;

  const filteredBanks = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    if (!query) return BANK_HELP_ENTRIES;
    return BANK_HELP_ENTRIES.filter(({ name, instructions, url }) => {
      const haystack = `${name} ${instructions} ${url}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [bankSearch]);

  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<{ success: boolean; data: ApplicationDocument[] }>(
          `/api/applications/${applicationId}/documents`,
          token ?? undefined
        );
        setDocuments(sortDocuments(res.data));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load uploaded statements.');
      } finally {
        setLoading(false);
      }
    };

    void loadDocuments();
  }, [applicationId, token]);

  const handleUpload = async (statementMonth: string, file: File) => {
    setError('');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Please upload PDF bank statements only.');
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      setError('Each PDF must be 10MB or smaller.');
      return;
    }

    setUploadingMonth(statementMonth);
    try {
      const fileData = await readFileAsDataUrl(file);
      const res = await api.post<{ success: boolean; data: ApplicationDocument }>(
        `/api/applications/${applicationId}/documents`,
        {
          statementMonth,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileData,
        },
        token ?? undefined
      );

      setDocuments((current) => {
        const next = current.filter((document) => document.statementMonth !== statementMonth);
        next.push(res.data);
        return sortDocuments(next);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploadingMonth(null);
    }
  };

  return (
    <div className="surface-panel-soft space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200">
            Documents Required
          </div>
          <h2 className="mb-2 text-2xl font-bold text-white">Upload your 4 most recent bank statements</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            We cannot proceed until they are received. Please upload the last 4 completed monthly bank statement PDFs for your primary business account.
          </p>
          <p className="mt-2 text-xs text-slate-500">Signed at: {new Date(submittedAt).toISOString()}</p>
        </div>

        <Button type="button" variant="secondary" onClick={() => void onDownloadPdf()} disabled={pdfDownloading}>
          {pdfDownloading ? 'Downloading…' : 'Download Signed PDF'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">Statement progress</p>
              <p className="text-xs text-slate-400">{uploadedCount} of {requiredMonths.length} monthly PDFs received</p>
            </div>
            <span className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]',
              isComplete ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border border-amber-400/25 bg-amber-400/10 text-amber-200'
            )}>
              {isComplete ? 'Complete' : 'Pending'}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.95),rgba(96,165,250,0.95))] transition-all" style={{ width: `${(uploadedCount / requiredMonths.length) * 100}%` }} />
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {isComplete
              ? 'Thanks — all 4 statements have been received and your file can continue moving forward.'
              : 'Upload each month below. You can replace a file anytime by uploading a newer PDF for that month.'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Accepted files</p>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
            <li>• PDF statements only</li>
            <li>• Up to 10MB per statement</li>
            <li>• Last 4 completed monthly statements</li>
            <li>• Same business bank account for all 4 uploads</li>
          </ul>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {requiredMonths.map(({ value, label }) => {
          const document = documentsByMonth.get(value);
          const isUploading = uploadingMonth === value;

          return (
            <div key={value} className={cn(
              'rounded-[24px] border p-5 transition',
              document ? 'border-cyan-400/25 bg-cyan-400/[0.05]' : 'border-white/10 bg-white/[0.03]'
            )}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-white">{label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">Statement month</p>
                  {document ? (
                    <div className="mt-3 space-y-1 text-sm text-slate-300">
                      <p className="font-medium text-slate-100">{document.fileName}</p>
                      <p className="text-xs text-slate-400">{formatBytes(document.sizeBytes)} • Updated {formatTimestamp(document.updatedAt)}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No PDF uploaded yet for this month.</p>
                  )}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                    document ? 'border border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border border-white/10 bg-white/[0.04] text-slate-300'
                  )}>
                    {document ? 'Received' : 'Needed'}
                  </span>

                  <input
                    ref={(element) => { fileInputs.current[value] = element; }}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(value, file);
                      event.target.value = '';
                    }}
                  />

                  <Button
                    type="button"
                    variant={document ? 'secondary' : 'primary'}
                    loading={isUploading}
                    onClick={() => fileInputs.current[value]?.click()}
                  >
                    {document ? 'Replace PDF' : 'Upload PDF'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Having a hard time uploading?</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Search for your bank below. We&apos;ve preloaded common banks and quick instructions so you can find where statements usually live online.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <Input
              label="Search banks"
              value={bankSearch}
              onChange={(event) => setBankSearch(event.target.value)}
              placeholder="Start typing a bank name"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filteredBanks.length > 0 ? (
            filteredBanks.map((bank) => (
              <div key={bank.name} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-100">{bank.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{bank.instructions}</p>
                  </div>
                  <a
                    href={bank.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/15"
                  >
                    Open site
                  </a>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400 md:col-span-2">
              No bank matches that search yet. Try a broader name like <span className="text-slate-200">Chase</span> or <span className="text-slate-200">Bank of America</span>.
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading uploaded statements…</p>}
    </div>
  );
}

function getRequiredStatementMonths(): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - 1);

  for (let index = 0; index < 4; index += 1) {
    const monthDate = new Date(cursor);
    months.push({
      value: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      label: monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return months;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected PDF.'));
    reader.readAsDataURL(file);
  });
}

function sortDocuments(documents: ApplicationDocument[]): ApplicationDocument[] {
  return [...documents].sort((left, right) => right.statementMonth.localeCompare(left.statementMonth));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}