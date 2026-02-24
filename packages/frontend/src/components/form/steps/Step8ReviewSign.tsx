'use client';
import { useRef, useCallback, useState, useMemo } from 'react';
import type { FormState, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS, TERM_PREFERENCES, CREDIT_SCORE_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';
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
      <h3 className="font-semibold text-violet-800 text-sm border-b border-violet-200 pb-1 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.filter(([, v]) => v).map(([k, v], i) => (
          <div key={`${k}-${i}`} className="contents">
            <span className="text-xs text-gray-500">{k}</span>
            <span className="text-xs text-gray-900 font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Step8ReviewSign({ state, onBack, onSubmitted, token }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signerName, setSignerName] = useState(`${state.contact.firstName} ${state.contact.lastName}`.trim());
  const [signerEmail, setSignerEmail] = useState(state.contact.email || '');
  const [dateSigned, setDateSigned] = useState(todayLocal);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** Format dateSigned (YYYY-MM-DD) to user-friendly MM/DD/YYYY for display */
  const dateSignedDisplay = useMemo(() => {
    const m = dateSigned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : dateSigned;
  }, [dateSigned]);

  const generateSignatureImage = useCallback((name: string): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-dancing-script').trim() || 'cursive';
    ctx.font = `italic 48px ${fontFamily}, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!signerName.trim()) { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) { setError('Please enter a valid email.'); return; }
    if (!consentChecked) { setError('You must acknowledge the consent statement.'); return; }
    if (!state.applicationId) { setError('Session error. Please refresh.'); return; }

    setSubmitting(true);
    try {
      const signatureData = generateSignatureImage(signerName.trim());
      const res = await api.post<{ success: boolean; signedAt: string }>(
        `/api/signatures/${state.applicationId}/sign`,
        { signatureData, signerName, signerEmail, consentAcknowledged: true, marketingConsent: state.contact.tcpaConsent },
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

  const { contact, business, owners } = state;
  const owner = owners[0];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Review & Sign</h2>
      <p className="text-sm text-gray-500 mb-5">Please review your information before signing.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5 text-sm">
        <ReviewSection title="Business" rows={[
          ['Business Name', business.legalName], ['DBA', business.dba],
          ['Entity Type', business.entityType], ['State', business.stateOfFormation],
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

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 mb-5">
        <h3 className="font-semibold text-violet-900 mb-2 text-sm">Electronic Signature Consent</h3>
        <p className="text-xs text-gray-700 leading-relaxed mb-3">{CONSENT_TEXT}</p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 accent-violet-700" />
          <span className="text-xs text-gray-700">I have read and agree to the above consent statement.</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <Input label="Full Name (Signer)" required autoComplete="name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        <Input label="Email Address (Signer)" required type="email" autoComplete="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Signature — 50% width */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Signature</label>
          <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white flex items-center justify-center" style={{ minHeight: 100 }}>
            {signerName.trim() ? (
              <p className="text-4xl text-[#1a1a2e] py-6 select-none italic" style={{ fontFamily: 'var(--font-dancing-script), cursive' }}>
                {signerName.trim()}
              </p>
            ) : (
              <p className="text-gray-400 italic text-sm py-6">Enter your name above to generate signature</p>
            )}
          </div>
          <canvas ref={canvasRef} width={700} height={180} className="hidden" />
        </div>

        {/* Date Signed — 50% width */}
        <div>
          <Input
            label="Date Signed"
            type="date"
            value={dateSigned}
            onChange={(e) => setDateSigned(e.target.value)}
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

