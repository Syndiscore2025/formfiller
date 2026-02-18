'use client';
import { useState } from 'react';
import { LoanRequest, FUNDING_AMOUNT_RANGES, URGENCY_OPTIONS, TERM_PREFERENCES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';

interface Props {
  loanRequest: LoanRequest;
  onNext: (data: LoanRequest) => void;
  onBack: () => void;
}

export function Step5FundingRequest({ loanRequest, onNext, onBack }: Props) {
  const [amountRequested, setAmountRequested] = useState(loanRequest.amountRequested || '');
  const [purpose, setPurpose] = useState(loanRequest.purpose || '');
  const [urgency, setUrgency] = useState(loanRequest.urgency || '');
  const [termPreference, setTermPreference] = useState(loanRequest.termPreference || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!amountRequested) errs.amountRequested = 'Please select a funding amount';
    if (!purpose.trim()) errs.purpose = 'Please describe how you will use the funds';
    if (!urgency) errs.urgency = 'Please select when you need the funds';
    if (!termPreference) errs.termPreference = 'Please select your preferred term';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      onNext({ amountRequested, purpose: purpose.trim(), urgency, termPreference });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Funding Request</h2>
      <p className="text-sm text-gray-500 mb-6">
        Tell us about your funding needs.
      </p>

      <div className="space-y-4">
        <Select
          label="How much funding do you need?"
          value={amountRequested}
          onChange={(e) => { setAmountRequested(e.target.value); setErrors((p) => ({ ...p, amountRequested: '' })); }}
          error={errors.amountRequested}
        >
          <option value="">Select an amount...</option>
          {FUNDING_AMOUNT_RANGES.map((range) => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </Select>

        <Input
          label="What will you use the funds for?"
          placeholder="e.g., inventory purchase, equipment, expansion..."
          value={purpose}
          onChange={(e) => { setPurpose(e.target.value); setErrors((p) => ({ ...p, purpose: '' })); }}
          error={errors.purpose}
        />

        <Select
          label="When do you need the funds?"
          value={urgency}
          onChange={(e) => { setUrgency(e.target.value); setErrors((p) => ({ ...p, urgency: '' })); }}
          error={errors.urgency}
        >
          <option value="">Select timing...</option>
          {URGENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>

        <Select
          label="Preferred repayment term"
          value={termPreference}
          onChange={(e) => { setTermPreference(e.target.value); setErrors((p) => ({ ...p, termPreference: '' })); }}
          error={errors.termPreference}
        >
          <option value="">Select a term...</option>
          {TERM_PREFERENCES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Continue →
        </Button>
      </div>
    </div>
  );
}

