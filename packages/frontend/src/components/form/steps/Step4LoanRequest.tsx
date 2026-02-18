'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LoanRequest, LOAN_PURPOSES } from '@/types/application';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAnalytics } from '@/hooks/useAnalytics';

const schema = z.object({
  amountRequested: z.string().refine((v) => Number(v) > 0, 'Amount must be greater than 0'),
  purpose: z.string().min(1, 'Purpose is required'),
  urgency: z.string().min(1, 'Urgency is required'),
  termPreference: z.string().min(1, 'Term preference is required'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  defaultValues: LoanRequest;
  onNext: (data: LoanRequest) => void;
  onBack: () => void;
  isSaving: boolean;
  applicationId: string | null;
  token: string | null;
}

export function Step4LoanRequest({ defaultValues, onNext, onBack, isSaving, applicationId, token }: Props) {
  const { onFocus, onBlur, onKeyDown, trackStep } = useAnalytics(applicationId, token);
  const ap = (name: string) => ({ onFocus: () => onFocus(name), onBlur: () => onBlur(name), onKeyDown: () => onKeyDown(name) });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const onSubmit = (data: FormData) => {
    trackStep(4, 'step_complete');
    onNext(data as LoanRequest);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Loan Request</h2>
      <p className="text-sm text-gray-500 mb-6">Tell us about your funding needs.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Input
          label="Amount Requested"
          required
          type="number"
          min="1000"
          hint="USD — minimum $1,000"
          error={errors.amountRequested?.message}
          {...register('amountRequested')}
          {...ap('amountRequested')}
        />
        <Select
          label="Purpose of Funding"
          required
          error={errors.purpose?.message}
          options={[...LOAN_PURPOSES]}
          {...register('purpose')}
        />
        <Select
          label="Urgency"
          required
          error={errors.urgency?.message}
          options={[
            { value: 'asap', label: 'As soon as possible' },
            { value: '1_week', label: 'Within 1 week' },
            { value: '2_weeks', label: 'Within 2 weeks' },
            { value: '1_month', label: 'Within 1 month' },
            { value: 'flexible', label: 'Flexible' },
          ]}
          {...register('urgency')}
        />
        <Select
          label="Preferred Term Length"
          required
          error={errors.termPreference?.message}
          options={[
            { value: '3_months', label: '3 months' },
            { value: '6_months', label: '6 months' },
            { value: '12_months', label: '12 months' },
            { value: '18_months', label: '18 months' },
            { value: '24_months', label: '24 months' },
            { value: '36_months', label: '36 months' },
          ]}
          {...register('termPreference')}
        />
      </div>

      <div className="flex justify-between mt-8">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="submit" loading={isSaving}>Review & Sign</Button>
      </div>
    </form>
  );
}

