'use client';
import { useState } from 'react';
import { BusinessInfo } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Props {
  business: BusinessInfo;
  onNext: (data: Partial<BusinessInfo>) => void;
  onBack: () => void;
}

export function Step3BusinessDetails({ business, onNext, onBack }: Props) {
  const [ein, setEin] = useState(business.ein || '');
  const [phone, setPhone] = useState(business.phone || '');
  const [website, setWebsite] = useState(business.website || '');
  const [dba, setDba] = useState(business.dba || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const formatEin = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length >= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 3) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return digits;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    const einDigits = ein.replace(/\D/g, '');
    if (einDigits && einDigits.length !== 9) {
      errs.ein = 'EIN must be 9 digits';
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length !== 10) {
      errs.phone = 'Phone must be 10 digits';
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
      onNext({
        ein: ein.replace(/\D/g, ''),
        phone: phone.replace(/\D/g, ''),
        website,
        dba,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Business Details</h2>
      <p className="text-sm text-gray-500 mb-6">
        A few more details about your business.
      </p>

      <div className="space-y-4">
        <Input
          label="EIN (optional)"
          placeholder="XX-XXXXXXX"
          value={ein}
          onChange={(e) => setEin(formatEin(e.target.value))}
          error={errors.ein}
          autoComplete="off"
        />
        <Input
          label="Business Phone (optional)"
          placeholder="(555) 555-5555"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          error={errors.phone}
          autoComplete="tel"
        />
        <Input
          label="Website (optional)"
          placeholder="www.example.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          error={errors.website}
          autoComplete="url"
        />
        <Input
          label="DBA / Trade Name (optional)"
          placeholder="Doing business as..."
          value={dba}
          onChange={(e) => setDba(e.target.value)}
          autoComplete="organization"
        />
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

