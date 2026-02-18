'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BusinessInfo, ENTITY_TYPES, INDUSTRIES, US_STATES } from '@/types/application';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAnalytics } from '@/hooks/useAnalytics';

const schema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  dba: z.string().optional().default(''),
  entityType: z.string().min(1, 'Entity type is required'),
  industry: z.string().min(1, 'Industry is required'),
  stateOfFormation: z.string().length(2, 'Select a state'),
  ein: z.string().regex(/^\d{9}$/, 'EIN must be 9 digits').optional().or(z.literal('')),
  businessStartDate: z.string().min(1, 'Start date is required'),
  phone: z.string().min(10, 'Valid phone required'),
  website: z.string().optional().default(''),
  streetAddress: z.string().min(1, 'Address required'),
  streetAddress2: z.string().optional().default(''),
  city: z.string().min(1, 'City required'),
  state: z.string().length(2, 'Select a state'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Valid ZIP required'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  defaultValues: BusinessInfo;
  autoPopulated: Record<string, boolean>;
  onNext: (data: BusinessInfo) => void;
  isSaving: boolean;
  applicationId: string | null;
  token: string | null;
}

export function Step1Business({ defaultValues, autoPopulated, onNext, isSaving, applicationId, token }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { onFocus, onBlur, onKeyDown, trackStep } = useAnalytics(applicationId, token);

  const analyticsProps = (name: string) => ({
    onFocus: () => onFocus(name),
    onBlur: () => onBlur(name),
    onKeyDown: () => onKeyDown(name),
  });

  const onSubmit = (data: FormData) => {
    trackStep(1, 'step_complete');
    onNext({ ...defaultValues, ...data, entityType: data.entityType as BusinessInfo['entityType'], autoPopulated });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Business Information</h2>
      <p className="text-sm text-gray-500 mb-6">Tell us about your business. Fields marked with <span className="text-violet-600 font-medium">Auto-filled</span> were retrieved from public records.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Input label="Business Legal Name" required error={errors.legalName?.message} placeholder="EX: ABC Towing, LLC"
          autoPopulated={autoPopulated.legalName} {...register('legalName')} {...analyticsProps('legalName')} />
        <Input label="DBA (Doing Business As)" error={errors.dba?.message} {...register('dba')} {...analyticsProps('dba')} />
        <Select label="Legal Entity" required error={errors.entityType?.message}
          options={ENTITY_TYPES} autoPopulated={autoPopulated.entityType} {...register('entityType')} />
        <Select label="Industry" required error={errors.industry?.message}
          options={[...INDUSTRIES]} {...register('industry')} />
        <Select label="State of Formation" required error={errors.stateOfFormation?.message}
          options={[...US_STATES]} autoPopulated={autoPopulated.stateOfFormation} {...register('stateOfFormation')} />
        <Input label="Federal Tax ID (EIN)" hint="EIN — Must be 9 digits" error={errors.ein?.message}
          placeholder="XXXXXXXXX" maxLength={9} autoPopulated={autoPopulated.ein} {...register('ein')} {...analyticsProps('ein')} />
        <Input label="Business Start Date" required type="date" error={errors.businessStartDate?.message}
          autoPopulated={autoPopulated.businessStartDate} {...register('businessStartDate')} />
        <Input label="Business Phone Number" required type="tel" error={errors.phone?.message}
          {...register('phone')} {...analyticsProps('phone')} />
        <Input label="Website" type="url" error={errors.website?.message}
          placeholder="https://" {...register('website')} {...analyticsProps('website')} />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold text-gray-800 mb-3">Business Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <Input label="Street Address" required error={errors.streetAddress?.message}
              autoPopulated={autoPopulated.streetAddress} {...register('streetAddress')} {...analyticsProps('streetAddress')} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Street Address Line 2" error={errors.streetAddress2?.message}
              {...register('streetAddress2')} {...analyticsProps('streetAddress2')} />
          </div>
          <Input label="City" required error={errors.city?.message}
            autoPopulated={autoPopulated.city} {...register('city')} {...analyticsProps('city')} />
          <Select label="State" required error={errors.state?.message}
            options={[...US_STATES]} autoPopulated={autoPopulated.state} {...register('state')} />
          <Input label="Zip Code" required error={errors.zipCode?.message}
            autoPopulated={autoPopulated.zipCode} {...register('zipCode')} {...analyticsProps('zipCode')} />
        </div>
      </div>

      <div className="flex justify-end mt-8 gap-3">
        <Button type="submit" size="lg" loading={isSaving}>Next</Button>
      </div>
    </form>
  );
}

