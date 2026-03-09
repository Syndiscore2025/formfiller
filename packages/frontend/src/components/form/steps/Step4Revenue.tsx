'use client';
import { useState } from 'react';
import { useAnalyticsContext } from '@/hooks/useAnalytics';
import { cn } from '@/lib/cn';
import { FinancialInfo, LoanRequest, ANNUAL_REVENUE_RANGES, FUNDING_AMOUNT_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';

type ChoiceOption = {
  value: string;
  label: string;
};

interface ChoiceGroupProps {
  fieldId: string;
  label: string;
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function ChoiceGroup({ fieldId, label, options, value, onChange, error, required }: ChoiceGroupProps) {
  const analytics = useAnalyticsContext();

  return (
    <section className="surface-panel-soft flex h-full flex-col gap-4 p-4 sm:p-5">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Select one</p>
        <label className="text-sm font-semibold text-slate-100">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      </div>

      <div role="radiogroup" aria-label={label} aria-required={required || undefined} className="grid gap-2">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onFocus={() => analytics?.onFocus(fieldId)}
              onBlur={() => analytics?.onBlur(fieldId)}
              onClick={() => {
                analytics?.onKeyDown(fieldId);
                onChange(option.value);
              }}
              className={cn(
                'group w-full rounded-2xl border px-3.5 py-3 text-left transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-cyan-300/40',
                selected
                  ? 'border-cyan-300/60 bg-cyan-400/[0.12] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.18)]'
                  : 'border-white/10 bg-slate-950/55 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]'
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0 rounded-full border transition-colors duration-200',
                    selected
                      ? 'border-cyan-200 bg-cyan-300 shadow-[0_0_0_3px_rgba(34,211,238,0.18)]'
                      : 'border-white/20 bg-transparent group-hover:border-white/35'
                  )}
                />
                <span className="text-sm font-medium leading-5">{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}

interface Props {
  financial: FinancialInfo;
  loanRequest: LoanRequest;
  onNext: (financial: FinancialInfo, loanRequest: LoanRequest) => void;
  onBack: () => void;
}

export function Step4Revenue({ financial, loanRequest, onNext, onBack }: Props) {
  const [annualRevenue, setAnnualRevenue] = useState(financial.annualRevenue || '');
  const [amountRequested, setAmountRequested] = useState(loanRequest.amountRequested || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!annualRevenue) errs.annualRevenue = 'Please select your estimated annual revenue';
    if (!amountRequested) errs.amountRequested = 'Please select a funding amount';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      onNext(
        { annualRevenue },
        { amountRequested, urgency: '' }
      );
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-white">Revenue &amp; Funding</h2>
      <p className="mb-6 text-sm text-slate-400">
        Tell us about your business revenue and funding needs.
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <ChoiceGroup
          fieldId="estimated_annual_revenue"
          label="Estimated Annual Revenue"
          options={ANNUAL_REVENUE_RANGES}
          value={annualRevenue}
          onChange={(nextValue) => {
            setAnnualRevenue(nextValue);
            setErrors((p) => ({ ...p, annualRevenue: '' }));
          }}
          error={errors.annualRevenue}
          required
        />

        <ChoiceGroup
          fieldId="funding_needed"
          label="Funding Needed"
          options={FUNDING_AMOUNT_RANGES}
          value={amountRequested}
          onChange={(nextValue) => {
            setAmountRequested(nextValue);
            setErrors((p) => ({ ...p, amountRequested: '' }));
          }}
          error={errors.amountRequested}
          required
        />
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

