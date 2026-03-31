'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
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

interface StatementUploadPlan {
  id: string;
  file: File;
  statementMonth: string;
}

interface UploadActivityEntry {
  id: string;
  fileName: string;
  sizeBytes: number;
  statementMonth: string;
  status: 'queued' | 'uploading' | 'uploaded' | 'error';
  message: string;
}

interface BankHelpResult {
  bankName: string;
  bankUrl?: string;
  instructions: string;
  cached: boolean;
  sourcePages: string[];
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function BankStatementUpload({
  applicationId,
  token,
  pdfDownloading,
  onDownloadPdf,
}: Props) {
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [uploadActivity, setUploadActivity] = useState<UploadActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadingQueue, setUploadingQueue] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  const [bankHelpLoading, setBankHelpLoading] = useState(false);
  const [bankHelpError, setBankHelpError] = useState('');
  const [bankHelpResult, setBankHelpResult] = useState<BankHelpResult | null>(null);

  const requiredMonths = useMemo(() => getRequiredStatementMonths(), []);
  const uploadedCount = documents.length;

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

  const handleSelectedFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || uploadingQueue) return;

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

    const uploadSlots = getNextUploadSlots(documents, validFiles.length);

    await uploadPlans(
      validFiles.map((file, index) => ({
        id: createQueuedFileId(),
        file,
        statementMonth: uploadSlots[index],
      }))
    );
  };

  const uploadPlans = async (plans: StatementUploadPlan[]) => {
    setError('');
    setNotice('');

    if (!plans.length) {
      setError('Add one or more PDF statements first.');
      return;
    }

    setUploadingQueue(true);
    setUploadActivity(
      plans.map((plan) => ({
        id: plan.id,
        fileName: plan.file.name,
        sizeBytes: plan.file.size,
        statementMonth: plan.statementMonth,
        status: 'queued',
        message: 'Queued for upload.',
      }))
    );

    const uploaded: ApplicationDocument[] = [];
    const failures: string[] = [];

    for (const plan of plans) {
      setUploadActivity((current) => current.map((entry) => (
        entry.id === plan.id
          ? { ...entry, status: 'uploading', message: 'Uploading…' }
          : entry
      )));

      try {
        const fileData = await readFileAsDataUrl(plan.file);
        const res = await api.post<{ success: boolean; data: ApplicationDocument }>(
          `/api/applications/${applicationId}/documents`,
          {
            statementMonth: plan.statementMonth,
            fileName: plan.file.name,
            mimeType: plan.file.type || 'application/pdf',
            fileData,
          },
          token ?? undefined
        );

        uploaded.push(res.data);
        setUploadActivity((current) => current.map((entry) => (
          entry.id === plan.id
            ? { ...entry, status: 'uploaded', message: 'Uploaded successfully.' }
            : entry
        )));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        failures.push(`${plan.file.name}: ${message}`);
        setUploadActivity((current) => current.map((entry) => (
          entry.id === plan.id
            ? { ...entry, status: 'error', message }
            : entry
        )));
      }
    }

    if (uploaded.length > 0) {
      setDocuments((current) => sortDocuments([...uploaded, ...current]));
      setNotice(buildUploadSuccessNotice(plans, uploaded.length));
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
        { bankName },
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {requiredMonths.map(({ value, label }) => (
              <span
                key={value}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold tracking-[0.12em] text-slate-300"
              >
                {label}
              </span>
            ))}
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              {uploadedCount} received
            </span>
          </div>

        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Upload bank statement PDFs</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                <input
                  ref={filePickerRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void handleSelectedFiles(input.files);
                    input.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => filePickerRef.current?.click()}
                  disabled={uploadingQueue}
                >
                  {uploadingQueue ? 'Uploading…' : 'Select PDFs'}
                </Button>
              </div>
            </div>

            {uploadActivity.length > 0 ? (
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {uploadActivity.map((item) => {
                  const statusClasses = getUploadStatusClasses(item.status);
                  const statusLabel = getUploadStatusLabel(item.status);

                  return (
                    <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-medium text-slate-100">{item.fileName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatBytes(item.sizeBytes)} • PDF file
                        </p>
                        <p className="mt-2 break-words text-xs text-slate-300">{item.message}</p>
                      </div>
                      <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', statusClasses)}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-10 text-center text-sm text-slate-400">
                No upload in progress. Select any statement PDFs the merchant wants to send and we will upload them automatically.
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Files received</h3>
              <p className="mt-1 text-sm text-slate-400">This is the raw list of PDFs the merchant has sent so far.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              {uploadedCount} total
            </span>
          </div>

          {documents.length > 0 ? (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {documents.map((document) => (
                <div key={document.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-medium text-slate-100">{document.fileName}</p>
                    <p className="mt-1 break-all text-sm text-slate-400">
                      {formatBytes(document.sizeBytes)} • Received {formatTimestamp(document.updatedAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    Received
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-10 text-center text-sm text-slate-400">
              No statement PDFs have been received yet.
            </div>
          )}
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
                setBankHelpResult(null);
              }}
              placeholder="Enter your bank name"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="button" loading={bankHelpLoading} disabled={!bankQuery.trim()} onClick={() => void handleBankHelpLookup()}>
                Find statement download steps
              </Button>
            </div>

            <p className="text-xs leading-5 text-slate-500">
              Limited to 2 lookups per application every 24 hours. First-time lookups may take a few seconds while we check the bank&apos;s public site.
            </p>

            {bankHelpError && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{bankHelpError}</p>}

            {bankHelpResult && (
              <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 pr-3 sm:p-5 sm:pr-4">
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
                {bankHelpResult.sourcePages.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Checked pages</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bankHelpResult.sourcePages.map((sourcePage) => (
                        <a
                          key={sourcePage}
                          href={sourcePage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
                        >
                          {sourcePage}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
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
  return [...documents].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildUploadSuccessNotice(
  plans: StatementUploadPlan[],
  uploadedCount: number
): string {
  return uploadedCount === 1
    ? `${plans[0]?.file.name || '1 file'} uploaded successfully.`
    : `${uploadedCount} files uploaded successfully.`;
}

function getNextUploadSlots(documents: ApplicationDocument[], count: number): string[] {
  const used = new Set(documents.map((document) => document.statementMonth));
  const slots: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - 1);

  while (slots.length < count) {
    const slot = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    if (!used.has(slot)) {
      slots.push(slot);
      used.add(slot);
    }
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return slots;
}

function getUploadStatusClasses(status: UploadActivityEntry['status']): string {
  switch (status) {
    case 'uploaded':
      return 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
    case 'uploading':
      return 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-200';
    case 'error':
      return 'border border-red-400/30 bg-red-500/10 text-red-200';
    default:
      return 'border border-white/10 bg-white/[0.04] text-slate-300';
  }
}

function getUploadStatusLabel(status: UploadActivityEntry['status']): string {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'uploading':
      return 'Uploading';
    case 'error':
      return 'Error';
    default:
      return 'Waiting';
  }
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