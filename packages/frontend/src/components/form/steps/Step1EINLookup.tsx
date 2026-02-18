'use client';
import { useState } from 'react';
import { BusinessInfo, ContactInfo, US_STATES } from '@/types/application';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

interface LookupResult {
  found: boolean;
  data?: {
    legalName?: string;
    entityType?: string;
    stateOfFormation?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    registrationDate?: string;
    sicCode?: string;
    naicsCode?: string;
    fieldsPopulated: string[];
  };
  message?: string;
}

interface Props {
  business: BusinessInfo;
  onAutoPopulate: (data: Partial<BusinessInfo>, populated: Record<string, boolean>) => void;
  onNext: (contact: ContactInfo) => Promise<void>;
  token: string | null;
}

const TCPA_TEXT =
  'By clicking "Continue", I consent to be contacted about my funding request via phone, email, or text message. Standard message and data rates may apply. This consent is not required to receive funding.';

export function Step1EINLookup({ business, onAutoPopulate, onNext, token }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tcpaConsent, setTcpaConsent] = useState(false);
  const [searchName, setSearchName] = useState(business.legalName || '');
  const [searchState, setSearchState] = useState(business.stateOfFormation || '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Valid email is required';
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) errs.phone = 'Valid 10-digit phone is required';
    if (!searchName.trim()) errs.searchName = 'Business name is required';
    if (!searchState) errs.searchState = 'State of formation is required';
    if (!tcpaConsent) errs.tcpaConsent = 'You must agree to continue';
    return errs;
  };

  const handleNext = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      // Auto-trigger EIN lookup on Continue (if not already done)
      if (!result && searchName.trim() && searchState) {
        try {
          const res = await api.get<{ success: boolean } & LookupResult>(
            '/api/business/lookup',
            token ?? undefined,
            { businessName: searchName, state: searchState }
          );
          setResult(res);
          if (res.found && res.data) {
            const populated: Record<string, boolean> = {};
            res.data.fieldsPopulated.forEach((f) => { populated[f] = true; });
            onAutoPopulate({
              legalName: res.data.legalName,
              entityType: (res.data.entityType as BusinessInfo['entityType']) || undefined,
              stateOfFormation: res.data.stateOfFormation,
              streetAddress: res.data.streetAddress,
              city: res.data.city,
              state: res.data.state,
              zipCode: res.data.zipCode,
              businessStartDate: res.data.registrationDate,
              sicCode: res.data.sicCode,
              naicsCode: res.data.naicsCode,
            }, populated);
          }
        } catch {
          // Lookup failed silently — continue anyway
        }
      }
      await onNext({ firstName, lastName, email, phone, tcpaConsent });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Let&apos;s Get Started</h2>
      <p className="text-sm text-gray-500 mb-6">
        Tell us a bit about yourself and your business so we can pre-fill your information.
      </p>

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Input label="First Name" required autoComplete="given-name" value={firstName}
          onChange={(e) => setFirstName(e.target.value)} error={errors.firstName} />
        <Input label="Last Name" required autoComplete="family-name" value={lastName}
          onChange={(e) => setLastName(e.target.value)} error={errors.lastName} />
        <Input label="Email Address" required type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Phone Number" required type="tel" autoComplete="tel" value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" error={errors.phone} />
      </div>

      {/* Business Lookup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-3">
        <Input label="Business Legal Name" required autoComplete="organization" value={searchName}
          onChange={(e) => setSearchName(e.target.value)} placeholder="Exact legal business name" error={errors.searchName} />
        <Select label="State of Formation" required value={searchState}
          onChange={(e) => setSearchState(e.target.value)} options={[...US_STATES]} error={errors.searchState} />
      </div>

      {/* TCPA Consent */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={tcpaConsent} onChange={(e) => setTcpaConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
          <span className="text-xs text-gray-600">{TCPA_TEXT}</span>
        </label>
        {errors.tcpaConsent && <p className="text-xs text-red-600 mt-1 ml-7">{errors.tcpaConsent}</p>}
      </div>

      <div className="flex justify-end mt-6">
        <Button type="button" onClick={handleNext} loading={submitting}>
          Continue →
        </Button>
      </div>
    </div>
  );
}

