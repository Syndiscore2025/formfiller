'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { BANK_HELP_ENTRIES, type BankHelpEntry } from '@/data/bankHelp';
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

interface QueuedStatementFile {
  id: string;
  file: File;
  statementMonth: string;
}

interface BankHelpResult {
  bankName: string;
  bankUrl?: string;
  instructions: string;
  cached: boolean;
  sourcePages: string[];
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DEFAULT_BANK_RESULTS = 10;

export function BankStatementUpload({
  applicationId,
  submittedAt,
  token,
  pdfDownloading,
  onDownloadPdf,
}: Props) {
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [queuedFiles, setQueuedFiles] = useState<QueuedStatementFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadingQueue, setUploadingQueue] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  const [bankHelpLoading, setBankHelpLoading] = useState(false);
  const [bankHelpError, setBankHelpError] = useState('');
  const [bankHelpResult, setBankHelpResult] = useState<BankHelpResult | null>(null);

  const requiredMonths = useMemo(() => getRequiredStatementMonths(), []);
  const documentsByMonth = useMemo(
    () => new Map(documents.map((document) => [document.statementMonth, document])),
    [documents]
  );
  const queuedMonthCounts = useMemo(() => {
    const counts = new Map<string, number>();
    queuedFiles.forEach((item) => {
      counts.set(item.statementMonth, (counts.get(item.statementMonth) || 0) + 1);
    });
    return counts;
  }, [queuedFiles]);
  const uploadedCount = requiredMonths.filter(({ value }) => documentsByMonth.has(value)).length;
  const isComplete = uploadedCount === requiredMonths.length;
  const missingMonths = requiredMonths.filter(({ value }) => !documentsByMonth.has(value));
  const bankQueryNormalized = bankQuery.trim().toLowerCase();

  const filteredBanks = useMemo(() => {
    if (!bankQueryNormalized) return BANK_HELP_ENTRIES.slice(0, DEFAULT_BANK_RESULTS);
    return BANK_HELP_ENTRIES.filter(({ name, instructions, url }) => {
      const haystack = `${name} ${instructions} ${url}`.toLowerCase();
      return haystack.includes(bankQueryNormalized);
    });
  }, [bankQueryNormalized]);

  const matchedBank = useMemo(
    () => BANK_HELP_ENTRIES.find((entry) => entry.name.toLowerCase() === bankQueryNormalized),
    [bankQueryNormalized]
  );
  const suggestedBank = bankQueryNormalized ? (matchedBank ?? filteredBanks[0] ?? null) : null;

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

  const handleQueueFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;

    setError('');
    setNotice('');

    const incomingFiles = Array.from(fileList);
    const rejectedFiles: string[] = [];
    const validFiles = incomingFiles.filter((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const validSize = file.size <= MAX_PDF_BYTES;

      if (!isPdf) {
        rejectedFiles.push(`${file.name}: PDF files only`);
        return false;
      }

      if (!validSize) {
        rejectedFiles.push(`${file.name}: over 10MB`);
        return false;
      }

      return true;
    });

    if (rejectedFiles.length > 0) {
      setError(`Some files were skipped: ${rejectedFiles.join(' • ')}`);
    }

    if (!validFiles.length) return;

    setQueuedFiles((current) => {
      const reservedMonths = new Set([
        ...Array.from(documentsByMonth.keys()),
        ...current.map((item) => item.statementMonth),
      ]);

      const unassignedMonths = requiredMonths
        .map((month) => month.value)
        .filter((month) => !reservedMonths.has(month));

      const nextEntries = validFiles.map((file, index) => ({
        id: createQueuedFileId(),
        file,
        statementMonth: unassignedMonths[index] ?? requiredMonths[index % requiredMonths.length]?.value ?? requiredMonths[0].value,
      }));

      return [...current, ...nextEntries];
    });
  };

  const handleUploadQueuedFiles = async () => {
    setError('');
    setNotice('');

    if (!queuedFiles.length) {
      setError('Add one or more PDF statements first.');
      return;
    }

    const duplicateMonths = Array.from(queuedMonthCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([statementMonth]) => requiredMonths.find((month) => month.value === statementMonth)?.label || statementMonth);

    if (duplicateMonths.length) {
      setError(`Each queued file must be mapped to a different month. Duplicate assignments: ${duplicateMonths.join(', ')}.`);
      return;
    }

    setUploadingQueue(true);
    const uploaded: Array<{ queueId: string; document: ApplicationDocument }> = [];
    const failures: string[] = [];

    for (const item of queuedFiles) {
      try {
        const fileData = await readFileAsDataUrl(item.file);
        const res = await api.post<{ success: boolean; data: ApplicationDocument }>(
          `/api/applications/${applicationId}/documents`,
          {
            statementMonth: item.statementMonth,
            fileName: item.file.name,
            mimeType: item.file.type || 'application/pdf',
            fileData,
          },
          token ?? undefined
        );

        uploaded.push({ queueId: item.id, document: res.data });
      } catch (err) {
        const label = requiredMonths.find((month) => month.value === item.statementMonth)?.label || item.statementMonth;
        failures.push(`${item.file.name} (${label}): ${err instanceof Error ? err.message : 'Upload failed'}`);
      }
    }

    if (uploaded.length > 0) {
      setDocuments((current) => {
        const uploadedMonths = new Set(uploaded.map(({ document }) => document.statementMonth));
        return sortDocuments([
          ...current.filter((document) => !uploadedMonths.has(document.statementMonth)),
          ...uploaded.map(({ document }) => document),
        ]);
      });
      setQueuedFiles((current) => current.filter((item) => !uploaded.some(({ queueId }) => queueId === item.id)));
      setNotice(uploaded.length === 1 ? '1 statement uploaded successfully.' : `${uploaded.length} statements uploaded successfully.`);
    }

    if (failures.length > 0) {
      setError(failures.join(' • '));
    }

    setUploadingQueue(false);
  };

  const handleBankHelpLookup = async () => {
    const bankName = bankQuery.trim();
    if (!bankName) {
      setBankHelpError('Enter your business bank name first.');
      return;
    }

    setBankHelpLoading(true);
    setBankHelpError('');
    setBankHelpResult(null);
    try {
      const res = await api.post<{ success: boolean; data: BankHelpResult }>(
        `/api/applications/${applicationId}/bank-help`,
        {
          bankName,
          bankUrl: suggestedBank?.url ?? '',
        },
        token ?? undefined
      );
      setBankHelpResult(res.data);
    } catch (err) {
      setBankHelpError(err instanceof Error ? err.message : 'Unable to retrieve bank download instructions right now.');
    } finally {
      setBankHelpLoading(false);
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
          <p className="mt-3 text-sm text-slate-400">
            As of today, we need: <span className="font-medium text-slate-200">{requiredMonths.map((month) => month.label).join(', ')}</span>.
          </p>
        </div>

        <Button type="button" variant="secondary" onClick={() => void onDownloadPdf()} disabled={pdfDownloading}>
          {pdfDownloading ? 'Downloading…' : 'Download Signed PDF'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_320px]">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {requiredMonths.map(({ value, label }) => {
              const received = documentsByMonth.has(value);
              return (
                <span
                  key={value}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold tracking-[0.12em]',
                    received
                      ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : 'border border-white/10 bg-white/[0.04] text-slate-300'
                  )}
                >
                  {label} • {received ? 'Received' : 'Needed'}
                </span>
              );
            })}
          </div>

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
              : 'Add one or more PDFs below, review the month assignments, then send the queue in one batch.'}
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Submission notes</p>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
            <li>• PDF statements only</li>
            <li>• Up to 10MB per statement</li>
            <li>• Last 4 completed monthly statements</li>
            <li>• Same business bank account for all 4 uploads</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Application signed {formatTimestamp(submittedAt)}.
          </p>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Batch statement upload</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Add as many statement PDFs as you have, then match each file to the correct month and upload everything together.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              ref={filePickerRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                handleQueueFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" onClick={() => filePickerRef.current?.click()}>
              Add PDFs
            </Button>
            <Button type="button" loading={uploadingQueue} disabled={!queuedFiles.length} onClick={() => void handleUploadQueuedFiles()}>
              Upload queued files
            </Button>
          </div>
        </div>

        {queuedFiles.length > 0 ? (
          <div className="mt-5 space-y-3">
            {queuedFiles.map((item) => {
              const duplicateAssignment = (queuedMonthCounts.get(item.statementMonth) || 0) > 1;
              const replacingExisting = documentsByMonth.has(item.statementMonth);

              return (
                <div key={item.id} className="grid gap-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4 lg:grid-cols-[minmax(0,1.35fr)_240px_auto] lg:items-end">
                  <div>
                    <p className="font-medium text-slate-100">{item.file.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatBytes(item.file.size)} • PDF statement queued</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Assign to month
                    </label>
                    <select
                      value={item.statementMonth}
                      onChange={(event) => {
                        const nextMonth = event.target.value;
                        setQueuedFiles((current) => current.map((entry) => (
                          entry.id === item.id ? { ...entry, statementMonth: nextMonth } : entry
                        )));
                      }}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40"
                    >
                      {requiredMonths.map((month) => (
                        <option key={month.value} value={month.value}>
                          {month.label}{documentsByMonth.has(month.value) ? ' — received already' : ''}
                        </option>
                      ))}
                    </select>
                    {duplicateAssignment && <p className="mt-2 text-xs text-amber-300">Another queued file is already assigned to this month.</p>}
                    {!duplicateAssignment && replacingExisting && <p className="mt-2 text-xs text-cyan-200">Uploading this file will replace the PDF already on file for this month.</p>}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setQueuedFiles((current) => current.filter((entry) => entry.id !== item.id))}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-10 text-center text-sm text-slate-400">
            No PDFs queued yet. Add the statements for {missingMonths.map((month) => month.label).join(', ') || 'the required months'} and send them together.
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Received statements</h3>
              <p className="mt-1 text-sm text-slate-400">We will keep checking this list until all 4 required months are on file.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              {uploadedCount}/{requiredMonths.length}
            </span>
          </div>

          <div className="space-y-3">
            {requiredMonths.map(({ value, label }) => {
              const document = documentsByMonth.get(value);
              return (
                <div key={value} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-100">{label}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {document ? `${document.fileName} • ${formatBytes(document.sizeBytes)} • Updated ${formatTimestamp(document.updatedAt)}` : 'No PDF received yet for this month.'}
                    </p>
                  </div>
                  <span className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                    document ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/[0.04] text-slate-300'
                  )}>
                    {document ? 'Received' : 'Needed'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <details className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Having a hard time uploading?</h3>
              <p className="mt-1 text-sm text-slate-400">
                Tell us your business bank and we&apos;ll try to find where statement downloads live. Limited to 2 lookups per application every 24 hours.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Help
            </span>
          </summary>

          <div className="mt-5 space-y-4">
            <Input
              label="Business bank name"
              value={bankQuery}
              onChange={(event) => {
                setBankQuery(event.target.value);
                setBankHelpError('');
              }}
              placeholder="Start typing your bank name"
            />

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Popular banks</p>
              <div className="space-y-2">
                {filteredBanks.length > 0 ? (
                  filteredBanks.slice(0, DEFAULT_BANK_RESULTS).map((bank) => (
                    <BankSuggestionRow
                      key={bank.name}
                      bank={bank}
                      onUse={() => {
                        setBankQuery(bank.name);
                        setBankHelpError('');
                      }}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                    No bank matches that search yet. Try a broader name like <span className="text-slate-200">Chase</span> or <span className="text-slate-200">Bank of America</span>.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" loading={bankHelpLoading} onClick={() => void handleBankHelpLookup()}>
                Find statement download steps
              </Button>
              {suggestedBank?.url && (
                <a
                  href={suggestedBank.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/15"
                >
                  Open bank site
                </a>
              )}
            </div>

            <p className="text-xs leading-5 text-slate-500">
              We use the bank name and, when available, the public website from our bank directory. If we do not have a site match yet, the guidance may be more general.
            </p>

            {bankHelpError && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{bankHelpError}</p>}

            {bankHelpResult && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-white">{bankHelpResult.bankName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
                      {bankHelpResult.cached ? 'Saved help result' : 'Fresh bank help result'}
                    </p>
                  </div>
                  {bankHelpResult.bankUrl && (
                    <a
                      href={bankHelpResult.bankUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/15"
                    >
                      Open official site
                    </a>
                  )}
                </div>
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-200">{bankHelpResult.instructions}</p>
              </div>
            )}
          </div>
        </details>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading uploaded statements…</p>}
    </div>
  );
}

function BankSuggestionRow({ bank, onUse }: { bank: BankHelpEntry; onUse: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-100">{bank.name}</p>
        <p className="mt-1 text-sm text-slate-400">{bank.instructions}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onUse}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
        >
          Use bank
        </button>
        <a
          href={bank.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/15"
        >
          Open site
        </a>
      </div>
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

function createQueuedFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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