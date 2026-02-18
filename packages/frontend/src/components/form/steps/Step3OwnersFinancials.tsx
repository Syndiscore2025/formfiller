'use client';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OwnerInfo, FinancialInfo, US_STATES } from '@/types/application';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAnalytics } from '@/hooks/useAnalytics';

const ownerSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(10, 'Valid phone required'),
  ownershipPct: z.string().refine((v) => !v || (Number(v) >= 0 && Number(v) <= 100), 'Must be 0-100'),
  ssn: z.string().regex(/^\d{9}$/, 'SSN must be 9 digits'),
  dateOfBirth: z.string().min(1, 'Required'),
  creditScore: z.string().optional().default(''),
  streetAddress: z.string().min(1, 'Required'),
  streetAddress2: z.string().optional().default(''),
  city: z.string().min(1, 'Required'),
  state: z.string().length(2, 'Select state'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Valid ZIP'),
});

const schema = z.object({
  owners: z.array(ownerSchema).min(1),
  annualRevenue: z.string().min(1, 'Required'),
  monthlyRevenue: z.string().min(1, 'Required'),
  monthlyExpenses: z.string().optional().default(''),
  outstandingDebts: z.string().optional().default(''),
  bankruptcyHistory: z.enum(['true', 'false']),
  bankName: z.string().min(1, 'Required'),
  accountType: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  defaultOwners: OwnerInfo[];
  defaultFinancial: FinancialInfo;
  onNext: (owners: OwnerInfo[], financial: FinancialInfo) => void;
  onBack: () => void;
  isSaving: boolean;
  applicationId: string | null;
  token: string | null;
}

const emptyOwner: Omit<OwnerInfo, 'ownerIndex'> = {
  firstName: '', lastName: '', email: '', phone: '', ownershipPct: '',
  ssn: '', dateOfBirth: '', creditScore: '', streetAddress: '',
  streetAddress2: '', city: '', state: '', zipCode: '',
};

export function Step3OwnersFinancials({ defaultOwners, defaultFinancial, onNext, onBack, isSaving, applicationId, token }: Props) {
  const { onFocus, onBlur, onKeyDown, trackStep } = useAnalytics(applicationId, token);
  const ap = (name: string) => ({ onFocus: () => onFocus(name), onBlur: () => onBlur(name), onKeyDown: () => onKeyDown(name) });

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      owners: defaultOwners.length > 0 ? defaultOwners.map((o) => ({ ...o, bankruptcyHistory: undefined })) : [emptyOwner],
      annualRevenue: defaultFinancial.annualRevenue,
      monthlyRevenue: defaultFinancial.monthlyRevenue,
      monthlyExpenses: defaultFinancial.monthlyExpenses,
      outstandingDebts: defaultFinancial.outstandingDebts,
      bankruptcyHistory: defaultFinancial.bankruptcyHistory === true ? 'true' : 'false',
      bankName: defaultFinancial.bankName,
      accountType: defaultFinancial.accountType,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'owners' });

  const onSubmit = (data: FormData) => {
    trackStep(3, 'step_complete');
    const owners: OwnerInfo[] = data.owners.map((o, i) => ({ ...o, ownerIndex: i + 1 }));
    const financial: FinancialInfo = {
      annualRevenue: data.annualRevenue, monthlyRevenue: data.monthlyRevenue,
      monthlyExpenses: data.monthlyExpenses, outstandingDebts: data.outstandingDebts,
      bankruptcyHistory: data.bankruptcyHistory === 'true',
      bankName: data.bankName, accountType: data.accountType,
    };
    onNext(owners, financial);
  };

  const errs = errors as { owners?: { [k: number]: { [f: string]: { message?: string } } } };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Owner & Financial Information</h2>
      <p className="text-sm text-gray-500 mb-6">SSNs are encrypted and never stored in plain text.</p>

      {fields.map((field, i) => (
        <div key={field.id} className="mb-8 p-5 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">{i === 0 ? 'Owner / Principal Information' : `${i + 1}${i === 1 ? 'nd' : 'rd'} Owner / Principal Information`}</h3>
            {i > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>Remove</Button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="First Name" required error={errs.owners?.[i]?.firstName?.message} {...register(`owners.${i}.firstName`)} {...ap(`owner${i}_firstName`)} />
            <Input label="Last Name" required error={errs.owners?.[i]?.lastName?.message} {...register(`owners.${i}.lastName`)} {...ap(`owner${i}_lastName`)} />
            <Input label="Email Address" required type="email" error={errs.owners?.[i]?.email?.message} {...register(`owners.${i}.email`)} {...ap(`owner${i}_email`)} />
            <Input label="Mobile Phone Number" required type="tel" error={errs.owners?.[i]?.phone?.message} {...register(`owners.${i}.phone`)} {...ap(`owner${i}_phone`)} />
            <Input label="% of Ownership" required type="number" min="0" max="100" error={errs.owners?.[i]?.ownershipPct?.message} {...register(`owners.${i}.ownershipPct`)} {...ap(`owner${i}_ownershipPct`)} />
            <Input label="Social Security Number" required type="password" hint="Encrypted — 9 digits, no dashes" error={errs.owners?.[i]?.ssn?.message} maxLength={9} {...register(`owners.${i}.ssn`)} {...ap(`owner${i}_ssn`)} />
            <Input label="Date of Birth" required type="date" error={errs.owners?.[i]?.dateOfBirth?.message} {...register(`owners.${i}.dateOfBirth`)} />
            <Input label="Estimated Credit Score" error={errs.owners?.[i]?.creditScore?.message} {...register(`owners.${i}.creditScore`)} {...ap(`owner${i}_creditScore`)} />
            <div className="sm:col-span-2"><Input label="Home Address" required error={errs.owners?.[i]?.streetAddress?.message} {...register(`owners.${i}.streetAddress`)} {...ap(`owner${i}_streetAddress`)} /></div>
            <div className="sm:col-span-2"><Input label="Street Address Line 2" {...register(`owners.${i}.streetAddress2`)} /></div>
            <Input label="City" required error={errs.owners?.[i]?.city?.message} {...register(`owners.${i}.city`)} {...ap(`owner${i}_city`)} />
            <Select label="State" required error={errs.owners?.[i]?.state?.message} options={[...US_STATES]} {...register(`owners.${i}.state`)} />
            <Input label="Zip Code" required error={errs.owners?.[i]?.zipCode?.message} {...register(`owners.${i}.zipCode`)} {...ap(`owner${i}_zipCode`)} />
          </div>
        </div>
      ))}

      {fields.length < 4 && (
        <Button type="button" variant="secondary" size="sm" className="mb-6" onClick={() => append(emptyOwner)}>
          + Add Another Owner
        </Button>
      )}

      <div className="p-5 border border-gray-200 rounded-lg bg-gray-50 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4">Financial Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Annual Revenue" required type="number" hint="USD" error={errors.annualRevenue?.message} {...register('annualRevenue')} {...ap('annualRevenue')} />
          <Input label="Monthly Revenue" required type="number" hint="USD" error={errors.monthlyRevenue?.message} {...register('monthlyRevenue')} {...ap('monthlyRevenue')} />
          <Input label="Monthly Expenses" type="number" hint="USD" error={errors.monthlyExpenses?.message} {...register('monthlyExpenses')} {...ap('monthlyExpenses')} />
          <Input label="Outstanding Debts" type="number" hint="USD" error={errors.outstandingDebts?.message} {...register('outstandingDebts')} {...ap('outstandingDebts')} />
          <Select label="Bankruptcy History" required error={errors.bankruptcyHistory?.message}
            options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} {...register('bankruptcyHistory')} />
          <Input label="Bank Name" required error={errors.bankName?.message} {...register('bankName')} {...ap('bankName')} />
          <Select label="Account Type" required error={errors.accountType?.message}
            options={['Checking', 'Savings', 'Business Checking', 'Business Savings']} {...register('accountType')} />
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="submit" loading={isSaving}>Next</Button>
      </div>
    </form>
  );
}

