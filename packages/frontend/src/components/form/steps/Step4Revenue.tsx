'use client';
import { useState } from 'react';
import { FinancialInfo, ANNUAL_REVENUE_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

interface Props {
  financial: FinancialInfo;
  onNext: (data: FinancialInfo) => void;
  onBack: () => void;
}

export function Step4Revenue({ financial, onNext, onBack }: Props) {
  const [annualRevenue, setAnnualRevenue] = useState(financial.annualRevenue || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!annualRevenue) {
      errs.annualRevenue = 'Please select your estimated annual revenue';
    }
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
      onNext({ annualRevenue });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Revenue</h2>
      <p className="text-sm text-gray-500 mb-6">
        What is your estimated annual revenue?
      </p>

      <div className="space-y-4">
        <Select
          label="Estimated Annual Revenue"
          value={annualRevenue}
          onChange={(e) => {
            setAnnualRevenue(e.target.value);
            setErrors({});
          }}
          error={errors.annualRevenue}
        >
          <option value="">Select a range...</option>
          {ANNUAL_REVENUE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
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

