'use client';
import { useState } from 'react';
import { FinancialInfo, LoanRequest, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS, TERM_PREFERENCES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';

interface Props {
  financial: FinancialInfo;
  loanRequest: LoanRequest;
  onNext: (financial: FinancialInfo, loanRequest: LoanRequest) => void;
  onBack: () => void;
}

export function Step4Revenue({ financial, loanRequest, onNext, onBack }: Props) {
  const [annualRevenue, setAnnualRevenue] = useState(financial.annualRevenue || '');
  const [amountRequested, setAmountRequested] = useState(loanRequest.amountRequested || '');
  const [purpose, setPurpose] = useState(loanRequest.purpose || '');
  const [urgency, setUrgency] = useState(loanRequest.urgency || '');
  const [termPreference, setTermPreference] = useState(loanRequest.termPreference || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!annualRevenue) errs.annualRevenue = 'Please select your estimated annual revenue';
    if (!amountRequested) errs.amountRequested = 'Please select a funding amount';
    if (!purpose.trim()) errs.purpose = 'Please describe how you will use the funds';
    if (!urgency) errs.urgency = 'Please select when you need the funds';
    if (!termPreference) errs.termPreference = 'Please select your preferred term';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      onNext(
        { annualRevenue },
        { amountRequested, purpose: purpose.trim(), urgency, termPreference }
      );
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Revenue &amp; Funding</h2>
      <p className="text-sm text-gray-500 mb-6">
        Tell us about your business revenue and funding needs.
      </p>

      <div className="space-y-4">
        <Select label="Estimated Annual Revenue" options={ANNUAL_REVENUE_RANGES} value={annualRevenue}
          onChange={(e) => { setAnnualRevenue(e.target.value); setErrors((p) => ({ ...p, annualRevenue: '' })); }}
          error={errors.annualRevenue} required />

        <div className="border-t border-gray-200 pt-4 mt-4" />
        <p className="text-sm font-medium text-gray-700">Funding Request</p>

        <Select label="How much funding do you need?" options={FUNDING_AMOUNT_RANGES} value={amountRequested}
          onChange={(e) => { setAmountRequested(e.target.value); setErrors((p) => ({ ...p, amountRequested: '' })); }}
          error={errors.amountRequested} required />

        <Input label="What will you use the funds for?" placeholder="e.g., inventory purchase, equipment, expansion..."
          value={purpose} onChange={(e) => { setPurpose(e.target.value); setErrors((p) => ({ ...p, purpose: '' })); }}
          error={errors.purpose} />

        <Select label="When do you need the funds?" options={URGENCY_OPTIONS} value={urgency}
          onChange={(e) => { setUrgency(e.target.value); setErrors((p) => ({ ...p, urgency: '' })); }}
          error={errors.urgency} required />

        <Select label="Preferred repayment term" options={TERM_PREFERENCES} value={termPreference}
          onChange={(e) => { setTermPreference(e.target.value); setErrors((p) => ({ ...p, termPreference: '' })); }}
          error={errors.termPreference} required />
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

