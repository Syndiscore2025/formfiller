'use client';
import { useState } from 'react';
import { FinancialInfo, LoanRequest, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

interface Props {
  financial: FinancialInfo;
  loanRequest: LoanRequest;
  onNext: (financial: FinancialInfo, loanRequest: LoanRequest) => void;
  onBack: () => void;
}

export function Step4Revenue({ financial, loanRequest, onNext, onBack }: Props) {
  const [annualRevenue, setAnnualRevenue] = useState(financial.annualRevenue || '');
  const [amountRequested, setAmountRequested] = useState(loanRequest.amountRequested || '');
  const [urgency, setUrgency] = useState(loanRequest.urgency || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!annualRevenue) errs.annualRevenue = 'Please select your estimated annual revenue';
    if (!amountRequested) errs.amountRequested = 'Please select a funding amount';
    if (!urgency) errs.urgency = 'Please select when you need the funds';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      onNext(
        { annualRevenue },
        { amountRequested, urgency }
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

        <Select label="How much funding do you need?" options={FUNDING_AMOUNT_RANGES} value={amountRequested}
          onChange={(e) => { setAmountRequested(e.target.value); setErrors((p) => ({ ...p, amountRequested: '' })); }}
          error={errors.amountRequested} required />

        <Select label="When do you need the funds?" options={URGENCY_OPTIONS} value={urgency}
          onChange={(e) => { setUrgency(e.target.value); setErrors((p) => ({ ...p, urgency: '' })); }}
          error={errors.urgency} required />
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

