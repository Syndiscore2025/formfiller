'use client';
import { useRef, useEffect, useState } from 'react';
import SignaturePad from 'signature_pad';
import type { FormState, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS, TERM_PREFERENCES, CREDIT_SCORE_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

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
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
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
  const padRef = useRef<SignaturePad | null>(null);
  const [signerName, setSignerName] = useState(`${state.contact.firstName} ${state.contact.lastName}`.trim());
  const [signerEmail, setSignerEmail] = useState(state.contact.email || '');
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (canvasRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, { backgroundColor: 'rgb(255,255,255)' });
    }
    return () => { padRef.current?.off(); };
  }, []);

  const clearSignature = () => padRef.current?.clear();

  const handleSubmit = async () => {
    setError('');
    if (!signerName.trim()) { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) { setError('Please enter a valid email.'); return; }
    if (!padRef.current || padRef.current.isEmpty()) { setError('Please provide your signature.'); return; }
    if (!consentChecked) { setError('You must acknowledge the consent statement.'); return; }
    if (!state.applicationId) { setError('Session error. Please refresh.'); return; }

    setSubmitting(true);
    try {
      const signatureData = padRef.current.toDataURL('image/png');
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

  const { contact, business, owners, financial, loanRequest, hasAdditionalOwners } = state;
  const owner = owners[0];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Review & Sign</h2>
      <p className="text-sm text-gray-500 mb-5">Please review your information before signing.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5 text-sm">
        <ReviewSection title="Business" rows={[
          ['Business Name', business.legalName], ['DBA', business.dba],
          ['Entity Type', business.entityType], ['State', business.stateOfFormation],
          ['EIN', business.ein || undefined],
          ['Business Start Date', business.businessStartDate],
          ['Phone', business.phone], ['Website', business.website],
          ['Address', [business.streetAddress, business.city, business.state, business.zipCode].filter(Boolean).join(', ')],
        ]} />
        {owner && <ReviewSection title="Owner" rows={[
          ['Name', `${owner.firstName} ${owner.lastName}`.trim()],
          ['SSN', owner.ssn],
          ['Ownership', owner.ownershipPct ? `${owner.ownershipPct}%` : undefined],
          ['DOB', owner.dateOfBirth],
        ]} />}
        {owner && <ReviewSection title="Home Address" rows={[
          ['Address', [owner.streetAddress, owner.city, owner.state, owner.zipCode].filter(Boolean).join(', ')],
        ]} />}
        <ReviewSection title="Contact Information" rows={[
          ['Email', contact.email], ['Phone', contact.phone],
        ]} />
        <ReviewSection title="Revenue" rows={[['Estimated Annual Revenue', financial.annualRevenue]]} />
        <ReviewSection title="Additional Owners" rows={[
          ['Has Other Owners (20%+)', hasAdditionalOwners === true ? 'Yes' : hasAdditionalOwners === false ? 'No' : 'Not specified'],
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

      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-800 mb-2">Signature <span className="text-red-500">*</span></label>
        <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
          <canvas ref={canvasRef} width={700} height={180} className="w-full touch-none" />
        </div>
        <button type="button" onClick={clearSignature} className="text-xs text-violet-600 hover:underline mt-1">Clear signature</button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button type="button" onClick={handleSubmit} loading={submitting} size="lg">Submit</Button>
      </div>
    </div>
  );
}

