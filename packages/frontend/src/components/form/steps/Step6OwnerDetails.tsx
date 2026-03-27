'use client';
import { useEffect, useRef, useState } from 'react';
import { OwnerInfo, ContactInfo, BusinessInfo, US_STATES } from '@/types/application';
import { AddressInput } from '@/components/ui/AddressInput';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';

interface Props {
  owner: OwnerInfo;
  contact: ContactInfo;
  business: BusinessInfo;
  hasAdditionalOwners: boolean | null;
  homeAddressSameAsBusiness: boolean | null;
  onNext: (owner: OwnerInfo, hasAdditionalOwners: boolean | null) => void;
  onBack: () => void;
}

export function Step6OwnerDetails({ owner, contact, business, hasAdditionalOwners: initialHasAdditional, homeAddressSameAsBusiness, onNext, onBack }: Props) {
  const [firstName, setFirstName] = useState(owner.firstName || contact.firstName || '');
  const [lastName, setLastName] = useState(owner.lastName || contact.lastName || '');
  const email = owner.email || contact.email || '';
  const phone = owner.phone || contact.phone || '';

  const [ownershipPct, setOwnershipPct] = useState(owner.ownershipPct || '');
  const [ssn, setSsn] = useState(owner.ssn || '');
  const [dateOfBirth, setDateOfBirth] = useState(owner.dateOfBirth || '');
  // If user said home=business on Step 2, pre-fill from business address
  const addrFromBiz = homeAddressSameAsBusiness === true;
  const [streetAddress, setStreetAddress] = useState(addrFromBiz ? (business.streetAddress || '') : (owner.streetAddress || ''));
  const [streetAddress2, setStreetAddress2] = useState(addrFromBiz ? (business.streetAddress2 || '') : (owner.streetAddress2 || ''));
  const [city, setCity] = useState(addrFromBiz ? (business.city || '') : (owner.city || ''));
  const [state, setState] = useState(addrFromBiz ? (business.state || '') : (owner.state || ''));
  const [zipCode, setZipCode] = useState(addrFromBiz ? (business.zipCode || '') : (owner.zipCode || ''));
  const [hasAdditional, setHasAdditional] = useState<boolean | null>(initialHasAdditional);

  const [sameAsBusiness, setSameAsBusiness] = useState(addrFromBiz);
  const [showVerification, setShowVerification] = useState(Boolean(owner.ssn || owner.dateOfBirth));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const ssnInputRef = useRef<HTMLInputElement>(null);

  const pct = Number(ownershipPct);
  const showAdditionalQuestion = !(pct >= 81 && pct <= 100);

  const hasBusinessAddress = !!(business.streetAddress || business.city || business.state || business.zipCode);

  useEffect(() => {
    if (showVerification) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => ssnInputRef.current?.focus());
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showVerification]);

  useEffect(() => {
    if (!showVerification) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setShowVerification(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showVerification, submitting]);

  const handleSameAsBusinessChange = (checked: boolean) => {
    setSameAsBusiness(checked);
    if (checked) {
      setStreetAddress(business.streetAddress || '');
      setStreetAddress2(business.streetAddress2 || '');
      setCity(business.city || '');
      setState(business.state || '');
      setZipCode(business.zipCode || '');
    } else {
      setStreetAddress(''); setStreetAddress2(''); setCity(''); setState(''); setZipCode('');
    }
  };

  const handleHomeAddressSelect = (address: {
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }) => {
    setStreetAddress(address.streetAddress || '');
    setCity(address.city || '');
    setState(address.state || '');
    setZipCode(address.zipCode || '');
  };

  const formatSsn = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return digits;
  };

  const validateOwnerDetails = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'Required';
    if (!lastName.trim()) errs.lastName = 'Required';
    if (!ownershipPct) errs.ownershipPct = 'Required';
    else {
      const p = Number(ownershipPct);
      if (p < 1 || p > 100) errs.ownershipPct = 'Must be 1-100';
    }
    if (!streetAddress.trim()) errs.streetAddress = 'Required';
    if (!city.trim()) errs.city = 'Required';
    if (!state) errs.state = 'Required';
    if (!zipCode.trim()) errs.zipCode = 'Required';
    if (showAdditionalQuestion && hasAdditional === null) errs.hasAdditional = 'Please select an option';
    return errs;
  };

  const validateVerification = () => {
    const errs: Record<string, string> = {};
    const ssnDigits = ssn.replace(/\D/g, '');
    if (!ssnDigits) errs.ssn = 'Required';
    else if (ssnDigits.length !== 9) errs.ssn = 'SSN must be 9 digits';
    if (!dateOfBirth) errs.dateOfBirth = 'Required';
    return errs;
  };

  const revealVerification = () => {
    const detailErrs = validateOwnerDetails();
    if (Object.keys(detailErrs).length > 0) {
      setErrors(detailErrs);
      return;
    }
    setErrors({});
    setShowVerification(true);
  };

  const closeVerification = () => {
    setShowVerification(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.ssn;
      delete next.dateOfBirth;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!showVerification) {
      revealVerification();
      return;
    }

    const detailErrs = validateOwnerDetails();
    if (Object.keys(detailErrs).length > 0) {
      setErrors(detailErrs);
      setShowVerification(false);
      return;
    }

    const verificationErrs = validateVerification();
    if (Object.keys(verificationErrs).length > 0) {
      setErrors(verificationErrs);
      return;
    }

    setSubmitting(true);
    try {
      const ownerData: OwnerInfo = {
        ownerIndex: 0, firstName: firstName.trim(), lastName: lastName.trim(), email, phone,
        ownershipPct, ssn: ssn.replace(/\D/g, ''), dateOfBirth, creditScore: '',
        streetAddress: streetAddress.trim(), streetAddress2: streetAddress2.trim(),
        city: city.trim(), state, zipCode: zipCode.trim(),
      };
      // If ownership >= 81%, force no additional owners
      const additionalFlag = showAdditionalQuestion ? hasAdditional : false;
      onNext(ownerData, additionalFlag);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 transition-all duration-300 ease-out',
          showVerification ? 'bg-slate-950/75 opacity-100 backdrop-blur-[3px]' : 'pointer-events-none bg-slate-950/0 opacity-0'
        )}
        onClick={closeVerification}
      />

      <div className={cn('transition duration-300', showVerification && 'pointer-events-none select-none blur-[1px] saturate-50')}>
        <h2 className="mb-2 text-xl font-bold text-white">Owner Details</h2>
        <p className="mb-6 text-sm text-slate-400">Tell us about yourself as the primary owner.</p>

        <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="First Name" required autoComplete="given-name" value={firstName}
            onChange={(e) => setFirstName(e.target.value)} error={errors.firstName} />
          <Input label="Last Name" required autoComplete="family-name" value={lastName}
            onChange={(e) => setLastName(e.target.value)} error={errors.lastName} />
        </div>

        <Input label="Ownership %" required placeholder="e.g., 51" value={ownershipPct}
          onChange={(e) => setOwnershipPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
          error={errors.ownershipPct} autoComplete="off" />

        {/* Home Address — hidden entirely when user already said "same as business" on Step 2 */}
        {!addrFromBiz && (<>
          <div className="mt-4 border-t border-white/10 pt-4" />
          <p className="text-sm font-medium text-slate-200">Home Address</p>

          {hasBusinessAddress && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={sameAsBusiness}
                onChange={(e) => handleSameAsBusinessChange(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-white/20 bg-slate-950 text-cyan-300" />
              Same as business address
            </label>
          )}
          <AddressInput label="Street Address" required value={streetAddress}
            onChange={(value) => { if (!sameAsBusiness) setStreetAddress(value); }}
            onSelectAddress={handleHomeAddressSelect} error={errors.streetAddress}
            autoComplete="street-address" disabled={sameAsBusiness}
            placeholder="Start typing your home address" />
          <Input label="Apt / Suite (optional)" value={streetAddress2}
            onChange={(e) => { if (!sameAsBusiness) setStreetAddress2(e.target.value); }}
            autoComplete="address-line2" disabled={sameAsBusiness} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="City" required value={city}
              onChange={(e) => { if (!sameAsBusiness) setCity(e.target.value); }}
              error={errors.city} autoComplete="address-level2" disabled={sameAsBusiness} />
            <Select label="State" required value={state} options={[...US_STATES]}
              onChange={(e) => { if (!sameAsBusiness) setState(e.target.value); }}
              error={errors.state} disabled={sameAsBusiness} />
            <Input label="ZIP" required value={zipCode}
              onChange={(e) => { if (!sameAsBusiness) setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5)); }}
              error={errors.zipCode} autoComplete="postal-code" disabled={sameAsBusiness} />
          </div>
        </>)}

        {/* Additional Owners — hidden when ownership >= 81% */}
        {showAdditionalQuestion && (
          <>
            <div className="mt-4 border-t border-white/10 pt-4" />
            <p className="text-sm font-medium text-slate-200">
              Are there any other owners with 20% or more ownership?
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setHasAdditional(true); setErrors((p) => ({ ...p, hasAdditional: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  hasAdditional === true ? 'border-cyan-300/50 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                }`}>Yes</button>
              <button type="button" onClick={() => { setHasAdditional(false); setErrors((p) => ({ ...p, hasAdditional: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  hasAdditional === false ? 'border-cyan-300/50 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                }`}>No</button>
            </div>
            {errors.hasAdditional && <p className="text-xs text-red-600">{errors.hasAdditional}</p>}
            <p className="text-xs text-slate-500">
              If yes, our team will follow up to collect their information separately.
            </p>
          </>
        )}

        </div>

        <div className="flex gap-3 justify-between mt-8">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Proceed to verification →
          </Button>
        </div>
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-verification-title"
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300',
          showVerification ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="surface-panel-soft border border-cyan-400/20 bg-slate-950/95 p-7 shadow-[0_24px_90px_rgba(2,12,27,0.72),0_0_0_1px_rgba(34,211,238,0.08)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Identity check</p>
                <h3 id="owner-verification-title" className="mt-2 text-2xl font-semibold text-white">Owner Verification</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Enter your Social Security Number and Date of Birth to verify your identity before continuing.
                </p>
              </div>
              <button
                type="button"
                onClick={closeVerification}
                disabled={submitting}
                className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                aria-label="Close verification"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path fill="currentColor" d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input ref={ssnInputRef} label="Social Security Number" required placeholder="XXX-XX-XXXX" value={ssn}
                onChange={(e) => setSsn(formatSsn(e.target.value))} error={errors.ssn} autoComplete="off" />
              <DateField label="Date of Birth" required value={dateOfBirth}
                onChange={setDateOfBirth} error={errors.dateOfBirth} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={closeVerification} disabled={submitting}>← Back to details</Button>
              <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

