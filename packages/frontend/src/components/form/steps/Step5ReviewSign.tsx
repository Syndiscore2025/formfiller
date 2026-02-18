'use client';
import { useRef, useEffect, useState } from 'react';
import SignaturePad from 'signature_pad';
import type { FormState } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

const CONSENT_TEXT =
  'By signing below, I certify that all information provided in this application is true, accurate, and complete. ' +
  'I authorize the lender to obtain credit reports, verify all submitted information, and share data with necessary parties. ' +
  'This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) ' +
  'and the Uniform Electronic Transactions Act (UETA). I have read and agree to the terms of this application and understand ' +
  'that interaction data (time on fields, pauses) is monitored for quality and fraud prevention purposes as disclosed in the Privacy Policy.';

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

export function Step5ReviewSign({ state, onBack, onSubmitted, token }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
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
    if (!state.applicationId || !token) { setError('Session error. Please refresh.'); return; }

    setSubmitting(true);
    try {
      const signatureData = padRef.current.toDataURL('image/png');
      const res = await api.post<{ success: boolean; signedAt: string }>(
        `/api/signatures/${state.applicationId}/sign`,
        { signatureData, signerName, signerEmail, consentAcknowledged: true },
        token
      );
      await api.post(`/api/applications/${state.applicationId}/submit`, {}, token);
      onSubmitted(res.signedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const { business, owners, financial, loanRequest } = state;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Review & Sign</h2>
      <p className="text-sm text-gray-500 mb-5">Review your application details below before signing.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5 text-sm">
        <ReviewSection title="Business Information" rows={[
          ['Legal Name', business.legalName], ['DBA', business.dba], ['Entity Type', business.entityType],
          ['Industry', business.industry], ['State of Formation', business.stateOfFormation],
          ['EIN', business.ein ? `***-**-${business.ein.slice(-4)}` : undefined],
          ['Start Date', business.businessStartDate], ['Phone', business.phone], ['Website', business.website],
          ['Address', [business.streetAddress, business.city, business.state, business.zipCode].filter(Boolean).join(', ')],
        ]} />
        {owners.map((o, i) => (
          <ReviewSection key={i} title={`Owner ${i + 1}`} rows={[
            ['Name', `${o.firstName} ${o.lastName}`.trim()], ['Email', o.email], ['Phone', o.phone],
            ['Ownership', o.ownershipPct ? `${o.ownershipPct}%` : undefined], ['DOB', o.dateOfBirth],
            ['Address', [o.streetAddress, o.city, o.state, o.zipCode].filter(Boolean).join(', ')],
          ]} />
        ))}
        <ReviewSection title="Financial Information" rows={[
          ['Annual Revenue', financial.annualRevenue ? `$${Number(financial.annualRevenue).toLocaleString()}` : undefined],
          ['Monthly Revenue', financial.monthlyRevenue ? `$${Number(financial.monthlyRevenue).toLocaleString()}` : undefined],
          ['Bank', financial.bankName], ['Account Type', financial.accountType],
          ['Bankruptcy', financial.bankruptcyHistory === true ? 'Yes' : financial.bankruptcyHistory === false ? 'No' : undefined],
        ]} />
        <ReviewSection title="Loan Request" rows={[
          ['Amount', loanRequest.amountRequested ? `$${Number(loanRequest.amountRequested).toLocaleString()}` : undefined],
          ['Purpose', loanRequest.purpose], ['Term', loanRequest.termPreference], ['Urgency', loanRequest.urgency],
        ]} />
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 mb-5">
        <h3 className="font-semibold text-violet-900 mb-2 text-sm">Electronic Signature Consent</h3>
        <p className="text-xs text-gray-700 leading-relaxed mb-3">{CONSENT_TEXT}</p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)}
            className="mt-0.5 accent-violet-700" />
          <span className="text-xs text-gray-700">I have read and agree to the above consent statement.</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <Input label="Full Name (Signer)" required value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        <Input label="Email Address (Signer)" required type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
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
        <Button type="button" variant="secondary" onClick={onBack} disabled={submitting}>Back</Button>
        <Button type="button" onClick={handleSubmit} loading={submitting} size="lg">
          Submit Application
        </Button>
      </div>
    </div>
  );
}

