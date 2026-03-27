'use client';
import { useRef, useCallback, useState, useMemo, useEffect, type PointerEvent } from 'react';
import type { FormState, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS, CREDIT_SCORE_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

/** Return today's date as YYYY-MM-DD in the user's local timezone. */
function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ── formatting helpers ── */
/** EIN: 88-1610629 */
function fmtEin(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : v;
}
/** SSN: 041-76-1371 */
function fmtSsn(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v;
}
/** Phone: (860) 202-6706 — handles 10 or 11 digit (leading 1 stripped) */
function fmtPhone(v?: string): string | undefined {
  if (!v) return undefined;
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
}
/** Date: YYYY-MM-DD → MM-DD-YYYY */
function fmtDate(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : v;
}

const CONSENT_TEXT =
  'By signing below, I certify that all information provided is true, accurate, and complete. ' +
  'I authorize the lender to conduct a soft credit inquiry, verify all submitted information, and share data with necessary parties. ' +
  'This electronic signature is legally binding under the ESIGN Act and UETA.';

interface Props {
  state: FormState;
  onBack: () => void;
  onSubmitted: (signedAt: string) => void;
  token: string | null;
}

function ReviewSection({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 border-b border-white/10 pb-2 text-sm font-semibold text-cyan-200">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.filter(([, v]) => v).map(([k, v], i) => (
          <div key={`${k}-${i}`} className="contents">
            <span className="text-xs text-slate-400">{k}</span>
            <span className="text-xs font-medium text-slate-100">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Step8ReviewSign({ state, onBack, onSubmitted, token }: Props) {
  const owner = state.owners[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signerName, setSignerName] = useState(`${owner?.firstName || state.contact.firstName} ${owner?.lastName || state.contact.lastName}`.trim());
  const [signerEmail, setSignerEmail] = useState(owner?.email || state.contact.email || '');
  const [dateSigned, setDateSigned] = useState(todayLocal);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [hasSignature, setHasSignature] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'auto' | 'drawn' | 'cleared'>('auto');
  const drawingRef = useRef<{ isDrawing: boolean; last?: { x: number; y: number } }>({ isDrawing: false });

  /** Format dateSigned (YYYY-MM-DD) to user-friendly MM/DD/YYYY for display */
  const dateSignedDisplay = useMemo(() => {
    const m = dateSigned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : dateSigned;
  }, [dateSigned]);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // white background so the resulting PNG isn't transparent
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // pen defaults
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas]);

  const applyTypedSignature = useCallback((name: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    resetCanvas();

    // Draw a script-like typed signature from the signer name.
    // Uses system fonts only (no custom font downloads) for reliability.
    const paddingX = 22;
    const maxWidth = canvas.width - paddingX * 2;
    const y = Math.round(canvas.height * 0.62);

    // Start large and scale down to fit.
    let fontSize = 80;
    const fontFamily = '"Segoe Script", "Brush Script MT", cursive';
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'alphabetic';

    const safeName = name.trim();
    if (!safeName) return;

    for (let i = 0; i < 6; i++) {
      ctx.font = `${fontSize}px ${fontFamily}`;
      const w = ctx.measureText(safeName).width;
      if (w <= maxWidth || fontSize <= 28) break;
      fontSize = Math.max(28, Math.floor((fontSize * maxWidth) / w));
    }

    ctx.font = `${fontSize}px ${fontFamily}`;
    const textW = ctx.measureText(safeName).width;
    const x = Math.max(paddingX, Math.round((canvas.width - textW) / 2));
    ctx.fillText(safeName, x, y);

    setHasSignature(true);
  }, [resetCanvas]);

  // Auto-populate typed signature from the auto-filled signer name.
  useEffect(() => {
    if (signatureMode !== 'auto') return;
    if (!signerName.trim()) return;
    applyTypedSignature(signerName);
    setHasSignature(true);
  }, [applyTypedSignature, signatureMode, signerName]);



  const pointFromEvent = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const p = pointFromEvent(e);
    if (!canvas || !ctx || !p) return;

    if (signatureMode !== 'drawn') setSignatureMode('drawn');
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current.isDrawing = true;
    drawingRef.current.last = p;

    // draw a tiny dot so taps count as a signature
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    setHasSignature(true);
  }, [pointFromEvent, signatureMode]);

  const onPointerMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current.isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const p = pointFromEvent(e);
    const last = drawingRef.current.last;
    if (!canvas || !ctx || !p || !last) return;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawingRef.current.last = p;
    setHasSignature(true);
  }, [pointFromEvent]);

  const endStroke = useCallback((e?: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    drawingRef.current.isDrawing = false;
    drawingRef.current.last = undefined;
  }, []);

  const getSignatureDataUrl = useCallback((): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!signerName.trim()) { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) { setError('Please enter a valid email.'); return; }
    if (!consentChecked) { setError('You must acknowledge the consent statement.'); return; }
    if (!state.applicationId) { setError('Session error. Please refresh.'); return; }
    if (!hasSignature) {
      // If we're in auto mode and the name exists, generate the typed signature on-demand.
      if (signatureMode === 'auto' && signerName.trim()) {
        applyTypedSignature(signerName);
        setHasSignature(true);
      } else {
        setError('Please add your signature in the signature box.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const signatureData = getSignatureDataUrl();
      const res = await api.post<{ success: boolean; signedAt: string }>(
        `/api/signatures/${state.applicationId}/sign`,
        { signatureData, signerName, signerEmail, consentAcknowledged: true, marketingConsent: true },
        token ?? undefined
      );
      await api.post(`/api/applications/${state.applicationId}/submit`, {}, token ?? undefined);
      onSubmitted(res.signedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const { contact, business } = state;

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold text-white">Review & Sign</h2>
      <p className="mb-5 text-sm text-slate-400">Please review your information before signing.</p>

      <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm">
        <ReviewSection title="Business" rows={[
          ['Business Name', business.legalName], ['DBA', business.dba],
          ['Entity Type', business.entityType], ['State', business.stateOfFormation],
          ['Industry', business.industry], ['SIC', business.sicCode], ['NAICS', business.naicsCode],
          ['EIN', fmtEin(business.ein || undefined)],
          ['Business Start Date', fmtDate(business.businessStartDate)],
          ['Phone', fmtPhone(business.phone)], ['Website', business.website],
          ['Address', business.streetAddress],
          ['City', business.city],
          ['State', business.state],
          ['Zip', business.zipCode],
        ]} />
        {owner && <ReviewSection title="Owner" rows={[
          ['Name', `${owner.firstName} ${owner.lastName}`.trim()],
          ['SSN', fmtSsn(owner.ssn)],
          ['Ownership', owner.ownershipPct ? `${owner.ownershipPct}%` : undefined],
          ['DOB', fmtDate(owner.dateOfBirth)],
        ]} />}
        {owner && <ReviewSection title="Home Address" rows={[
          ['Address', owner.streetAddress],
          ['City', owner.city],
          ['State', owner.state],
          ['Zip', owner.zipCode],
        ]} />}
        <ReviewSection title="Contact Information" rows={[
          ['Email', contact.email], ['Phone', fmtPhone(contact.phone)],
        ]} />
      </div>

      <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.08] p-4">
        <h3 className="mb-2 text-sm font-semibold text-cyan-100">Electronic Signature Consent</h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-300">{CONSENT_TEXT}</p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 accent-cyan-300" />
          <span className="text-xs text-slate-300">I have read and agree to the above consent statement.</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <Input label="Full Name (Signer)" required autoComplete="name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        <Input label="Email Address (Signer)" required type="email" autoComplete="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Signature — 50% width */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-100">Signature</label>
          <div className="overflow-hidden rounded-xl border-2 border-white/10 bg-slate-950/70" style={{ minHeight: 100 }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={180}
              className="w-full h-[100px]"
              style={{ touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={() => endStroke()}
            />
          </div>

        </div>

        {/* Date Signed — 50% width */}
        <div>
          <DateField
            label="Date Signed"
            value={dateSigned}
            onChange={setDateSigned}
            disabled
            autoPopulated
            hint="Recorded at submission time."
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button type="button" onClick={handleSubmit} loading={submitting} size="lg">Submit</Button>
      </div>
    </div>
  );
}

