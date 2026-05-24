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
  /** Called once the merchant has explicitly submitted (POST /finalize succeeded). */
  onComplete?: () => void;
  /** Called whenever the uploaded statement count changes (used to drive the parent progress bar). */
  onDocumentsCountChange?: (count: number) => void;
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

const REQUIRED_STATEMENTS = 4;

export function BankStatementUpload({
  applicationId,
  token,
  pdfDownloading,
  onDownloadPdf,
  onComplete,
  onDocumentsCountChange,
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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onDocumentsCountChangeRef = useRef(onDocumentsCountChange);

  // Keep the latest callbacks in refs so the effects below are not
  // re-run (and their timers/work cancelled) whenever the parent re-renders
  // and passes new function identities.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onDocumentsCountChangeRef.current = onDocumentsCountChange;
  }, [onDocumentsCountChange]);

  const requiredMonths = useMemo(() => getRequiredStatementMonths(), []);
  const uploadedCount = documents.length;

  // Push the latest uploaded count up to the parent so it can drive the
  // top-level progress bar without React Context.
  useEffect(() => {
    onDocumentsCountChangeRef.current?.(uploadedCount);
  }, [uploadedCount]);

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
      setUploadActivity((current) => current.filter((entry) => entry.status === 'error'));
    } else {
      setUploadActivity([]);
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

  const handleFinalSubmit = async () => {
    if (submitting || submitted) return;
    if (uploadedCount === 0) {
      setError('Please upload at least one bank statement PDF before submitting.');
      return;
    }
    if (uploadedCount < REQUIRED_STATEMENTS) {
      const confirmed = window.confirm(
        `We typically need ${REQUIRED_STATEMENTS} bank statements but only see ${uploadedCount}. Submit anyway?`
      );
      if (!confirmed) return;
    }

    setError('');
    setSubmitting(true);
    try {
      await api.post<{ success: boolean }>(
        `/api/applications/${applicationId}/finalize`,
        {},
        token ?? undefined
      );
      setSubmitted(true);
      // Short delay so the merchant sees the "Submitted" state flip before the overlay appears.
      setTimeout(() => onCompleteRef.current?.(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bank-upload-page surface-panel-soft space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-200">
            <span aria-hidden="true">✨</span> Final Step
          </div>
          <h2 className="mb-2 text-2xl font-bold text-white">
            You&apos;re almost done — just upload your 4 most recent bank statements
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            This is the last thing we need. Please upload the last 4 completed monthly bank statement PDFs for your primary business account and we&apos;ll take it from there.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            As of today, we need: <span className="font-medium text-slate-200">{requiredMonths.map((month) => month.label).join(', ')}</span>.
          </p>
        </div>

        <Button type="button" variant="secondary" onClick={() => void onDownloadPdf()} disabled={pdfDownloading}>
          {pdfDownloading ? 'Downloading…' : 'Download Signed PDF'}
        </Button>
      </div>

      <div className="bank-upload-card rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Bank statement PDFs</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Upload statements here. Once a file is uploaded, it appears in this same list — no duplicate received section.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                {uploadedCount} uploaded
              </span>
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

          {uploadActivity.length > 0 || documents.length > 0 ? (
            <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {uploadActivity.map((item) => {
                const statusClasses = getUploadStatusClasses(item.status);
                const statusLabel = getUploadStatusLabel(item.status);

                return (
                  <div key={item.id} className="bank-file-card flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-start sm:justify-between">
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

              {documents.map((document) => (
                <div key={document.id} className="bank-file-card flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-medium text-slate-100">{document.fileName}</p>
                    <p className="mt-1 break-all text-sm text-slate-400">
                      {formatBytes(document.sizeBytes)} • Uploaded {formatTimestamp(document.updatedAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    Uploaded
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bank-empty-card rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-10 text-center text-sm text-slate-400">
              No bank statements uploaded yet. Select any statement PDFs the merchant wants to send and we will upload them automatically.
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <div className="bank-submit-panel rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-white">
              {submitted ? 'Application submitted ✓' : 'Ready to submit?'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {submitted
                ? 'Your application and bank statements were handed off to our underwriting team.'
                : uploadedCount === 0
                  ? `Upload at least one bank statement above, then click submit. We typically need ${REQUIRED_STATEMENTS}.`
                  : uploadedCount < REQUIRED_STATEMENTS
                    ? `You\u2019ve uploaded ${uploadedCount} of ${REQUIRED_STATEMENTS} recommended statements. You can submit now or add more first.`
                    : `${uploadedCount} statements uploaded. Click submit to officially send your application to underwriting.`}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void handleFinalSubmit()}
            disabled={submitting || submitted || uploadedCount === 0 || uploadingQueue}
            loading={submitting}
            className="shrink-0"
          >
            {submitted ? 'Submitted' : 'Submit Application'}
          </Button>
        </div>
      </div>

      <details className="need-help-panel rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
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
            <div className="bank-help-result rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 sm:p-5">
              {/* Header row */}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300">
                    How to download your statements
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">{bankHelpResult.bankName}</p>
                </div>
                {bankHelpResult.bankUrl && (
                  <a
                    href={bankHelpResult.bankUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/15"
                  >
                    Open official site ↗
                  </a>
                )}
              </div>

              {/* Structured instructions */}
              <BankInstructions text={bankHelpResult.instructions} />
            </div>
          )}
        </div>
      </details>

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


interface ParsedInstructions {
  intro: string;
  steps: string[];
  tip: string;
}

function parseBankInstructions(raw: string): ParsedInstructions {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .trim();

  // Pull a trailing "Tip: ..." (case-insensitive) out first so it doesn't get
  // pulled into the last step when everything is jumbled onto a single line.
  let body = normalized;
  let tip = '';
  const tipMatch = body.match(/(^|\s)tip\s*:\s*([^\n]+?)\s*$/i);
  if (tipMatch && tipMatch.index !== undefined) {
    tip = tipMatch[2].trim();
    body = body.slice(0, tipMatch.index).trim();
  }

  // Split on "N." markers regardless of whether they are at the start of a
  // line or inline ("...account. 2. Open..."). The split keeps the marker so
  // we can detect the first piece (intro, before "1.").
  const segments = body.split(/(?=(?:^|\s)\d+\.\s)/);
  let intro = '';
  const steps: string[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const stepMatch = trimmed.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (stepMatch) {
      steps.push(stepMatch[2].replace(/\s+/g, ' ').trim());
    } else if (!intro) {
      intro = trimmed.replace(/\s+/g, ' ').trim();
    } else {
      // Stray text before steps were detected — append to intro.
      intro = `${intro} ${trimmed.replace(/\s+/g, ' ').trim()}`.trim();
    }
  }

  return { intro, steps, tip };
}

function BankInstructions({ text }: { text: string }) {
  const { intro, steps, tip } = parseBankInstructions(text);

  if (steps.length === 0) {
    // Fallback: render as preserved-whitespace paragraph so the user still
    // sees something readable even if parsing fails.
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{text.trim()}</p>
    );
  }

  return (
    <div className="space-y-4">
      {intro && <p className="text-sm leading-6 text-slate-200">{intro}</p>}

      <ol className="space-y-2.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3 text-sm leading-6 text-slate-200">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-semibold text-cyan-200">
              {index + 1}
            </span>
            <span className="flex-1">{step}</span>
          </li>
        ))}
      </ol>

      {tip && (
        <div className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5 text-xs leading-5 text-amber-100">
          <span className="font-semibold uppercase tracking-[0.15em] text-amber-300">Tip</span>
          <span className="flex-1">{tip}</span>
        </div>
      )}
    </div>
  );
}