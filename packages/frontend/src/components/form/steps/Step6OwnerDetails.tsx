'use client';
import { useEffect, useRef, useState } from 'react';
import { OwnerInfo, ContactInfo, BusinessInfo, US_STATES, ESTIMATED_CREDIT_SCORE_OPTIONS } from '@/types/application';
import { AddressInput } from '@/components/ui/AddressInput';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { useAnalyticsContext } from '@/hooks/useAnalytics';

interface Props {
  owner: OwnerInfo;
  contact: ContactInfo;
  business: BusinessInfo;
  hasAdditionalOwners: boolean | null;
  homeAddressSameAsBusiness: boolean | null;
  aiFocusField?: string | null;
  onAiFocusHandled?: () => void;
  showEstimatedCreditScore?: boolean;
  onNext: (owner: OwnerInfo, hasAdditionalOwners: boolean | null, ownerHomeSameAsBusiness: boolean) => void;
  onBack: () => void;
  onDraftChange?: (owner: OwnerInfo, hasAdditionalOwners: boolean | null, ownerHomeSameAsBusiness: boolean) => void;
}

export function Step6OwnerDetails({ owner, contact, business, hasAdditionalOwners: initialHasAdditional, homeAddressSameAsBusiness, aiFocusField, onAiFocusHandled, showEstimatedCreditScore = true, onNext, onBack, onDraftChange }: Props) {
  const analytics = useAnalyticsContext();
  const [firstName, setFirstName] = useState(owner.firstName || contact.firstName || '');
  const [lastName, setLastName] = useState(owner.lastName || contact.lastName || '');
  const email = owner.email || contact.email || '';
  const phone = owner.phone || contact.phone || '';

  const [ownershipPct, setOwnershipPct] = useState(owner.ownershipPct || '');
  const [creditScore, setCreditScore] = useState(owner.creditScore || '');
  const [ssn, setSsn] = useState(owner.ssn || '');
  const [isItin, setIsItin] = useState(false);
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
  // Tracks the owner values we last pushed UP via onDraftChange, so the sync-down
  // effect can ignore prop changes that are just our own draft echoing back. Without
  // this, browser autofill firing rapid events makes name/address fields flicker.
  const lastPushedOwnerRef = useRef<Record<string, string>>({});

  // Keep editable local state in sync when the AI/chat updates parent form state,
  // but ignore our own echoes and never overwrite what the user is actively typing.
  useEffect(() => {
    const pushed = lastPushedOwnerRef.current;
    const isEcho = (key: string, propVal: string) => pushed[key] !== undefined && pushed[key] === propVal;
    if (!isEcho('firstName', owner.firstName || '')) setFirstName((prev) => (prev === (owner.firstName || '') ? prev : owner.firstName || ''));
    if (!isEcho('lastName', owner.lastName || '')) setLastName((prev) => (prev === (owner.lastName || '') ? prev : owner.lastName || ''));
    if (!isEcho('ownershipPct', owner.ownershipPct || '')) setOwnershipPct((prev) => (prev === (owner.ownershipPct || '') ? prev : owner.ownershipPct || ''));
    if (!isEcho('creditScore', owner.creditScore || '')) setCreditScore((prev) => (prev === (owner.creditScore || '') ? prev : owner.creditScore || ''));
    if (owner.streetAddress && !isEcho('streetAddress', owner.streetAddress)) setStreetAddress((prev) => (prev === owner.streetAddress ? prev : owner.streetAddress));
    if (owner.streetAddress2 && !isEcho('streetAddress2', owner.streetAddress2)) setStreetAddress2((prev) => (prev === owner.streetAddress2 ? prev : owner.streetAddress2));
    if (owner.city && !isEcho('city', owner.city)) setCity((prev) => (prev === owner.city ? prev : owner.city));
    if (owner.state && !isEcho('state', owner.state)) setState((prev) => (prev === owner.state ? prev : owner.state));
    if (owner.zipCode && !isEcho('zipCode', owner.zipCode)) setZipCode((prev) => (prev === owner.zipCode ? prev : owner.zipCode));
  }, [owner.firstName, owner.lastName, owner.ownershipPct, owner.creditScore, owner.streetAddress, owner.streetAddress2, owner.city, owner.state, owner.zipCode]);

  const pct = Number(ownershipPct);
  const showAdditionalQuestion = !(pct >= 81 && pct <= 100);

  const hasBusinessAddress = !!(business.streetAddress || business.city || business.state || business.zipCode);

  useEffect(() => {
    if (showVerification) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const fieldToFocus = aiFocusField === 'owner.dateOfBirth'
          ? document.getElementById('owner_date_of_birth')
          : ssnInputRef.current;
        fieldToFocus?.focus();
        fieldToFocus?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (aiFocusField === 'owner.ssn' || aiFocusField === 'owner.dateOfBirth') onAiFocusHandled?.();
      });
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showVerification, aiFocusField, onAiFocusHandled]);

  useEffect(() => {
    if (aiFocusField !== 'owner.ssn' && aiFocusField !== 'owner.dateOfBirth') return;
    setShowVerification(true);
  }, [aiFocusField]);

  useEffect(() => {
    if (!showVerification) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setShowVerification(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showVerification, submitting]);

  useEffect(() => {
    // Remember the raw values we just pushed up so the sync-down effect can tell
    // our own echo apart from a genuine external (lookup/AI) change and avoid flicker.
    lastPushedOwnerRef.current = {
      firstName, lastName, ownershipPct, creditScore, streetAddress, streetAddress2, city, state, zipCode,
    };
    onDraftChange?.({
      ownerIndex: owner.ownerIndex ?? 0,
      firstName,
      lastName,
      email,
      phone,
      ownershipPct,
      ssn,
      dateOfBirth,
      creditScore: showEstimatedCreditScore ? creditScore : '',
      streetAddress,
      streetAddress2,
      city,
      state,
      zipCode,
    }, hasAdditional, sameAsBusiness);
  }, [owner.ownerIndex, showEstimatedCreditScore, creditScore, firstName, lastName, email, phone, ownershipPct, ssn, dateOfBirth, streetAddress, streetAddress2, city, state, zipCode, hasAdditional, sameAsBusiness, onDraftChange]);

  const handleSameAsBusinessChange = (checked: boolean) => {
    setSameAsBusiness(checked);
    analytics?.track({
      eventType: 'toggle_selected',
      fieldName: 'application.ownerHomeSameAsBusiness',
      metadata: { value: checked, label: 'Same as business address' },
    });
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

  const parseIsoDate = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return parsed.getFullYear() === Number(match[1]) && parsed.getMonth() === Number(match[2]) - 1 && parsed.getDate() === Number(match[3])
      ? parsed
      : null;
  };

  const isAtLeast18 = (value: string) => {
    const dob = parseIsoDate(value);
    if (!dob) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eighteenthBirthday = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
    return eighteenthBirthday <= today;
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
    const taxIdLabel = isItin ? 'ITIN' : 'SSN';
    if (!ssnDigits) errs.ssn = 'Required';
    else if (ssnDigits.length !== 9) errs.ssn = `${taxIdLabel} must be 9 digits`;
    else if (isItin && !ssnDigits.startsWith('9')) errs.ssn = 'ITIN must begin with 9';
    if (!dateOfBirth) errs.dateOfBirth = 'Required';
    else if (!parseIsoDate(dateOfBirth)) errs.dateOfBirth = 'Enter a valid date of birth';
    else if (!isAtLeast18(dateOfBirth)) errs.dateOfBirth = 'Applicant must be at least 18 years old to apply.';
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
        ownershipPct, ssn: ssn.replace(/\D/g, ''), dateOfBirth,
        creditScore: showEstimatedCreditScore ? creditScore.trim() : '',
        streetAddress: streetAddress.trim(), streetAddress2: streetAddress2.trim(),
        city: city.trim(), state, zipCode: zipCode.trim(),
      };
      if (!streetAddress2.trim()) {
        analytics?.track({ eventType: 'field_skipped', fieldName: 'owner.streetAddress2', metadata: { optional: true } });
      }
      // If ownership >= 81%, force no additional owners
      const additionalFlag = showAdditionalQuestion ? hasAdditional : false;
      onNext(ownerData, additionalFlag, sameAsBusiness);
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Ownership %" required placeholder="e.g., 51" value={ownershipPct}
            onChange={(e) => setOwnershipPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
            error={errors.ownershipPct} autoComplete="off" />
          {showEstimatedCreditScore && (
            <>
              <Input
                label="Credit Score"
                placeholder="Select or type estimate"
                value={creditScore}
                onChange={(e) => setCreditScore(e.target.value.slice(0, 40))}
                list="estimated-credit-score-options"
                autoComplete="off"
              />
              <datalist id="estimated-credit-score-options">
                {ESTIMATED_CREDIT_SCORE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </>
          )}
        </div>

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
          <div className="owner-verification-card surface-panel-soft border border-cyan-400/20 bg-slate-950/95 p-7 shadow-[0_24px_90px_rgba(2,12,27,0.72),0_0_0_1px_rgba(34,211,238,0.08)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Identity check</p>
                <h3 id="owner-verification-title" className="mt-2 text-2xl font-semibold text-white">Owner Verification</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Enter your {isItin ? 'ITIN' : 'Social Security Number'} and Date of Birth to verify your identity before continuing.
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

            <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50">
              For your protection, enter SSN and Date of Birth only in these secure form fields — not in chat.
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="owner_ssn" className="text-sm font-semibold text-slate-100">
                    {isItin ? 'ITIN' : 'Social Security Number'} <span className="text-red-500">*</span>
                  </label>
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100">
                    <input
                      type="checkbox"
                      checked={isItin}
                      onChange={(e) => { setIsItin(e.target.checked); setSsn(''); }}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-slate-950 text-cyan-300 accent-cyan-400"
                    />
                    Use ITIN instead
                  </label>
                </div>
                <input
                  ref={ssnInputRef}
                  id="owner_ssn"
                  suppressHydrationWarning
                  placeholder="XXX-XX-XXXX"
                  value={ssn}
                  onChange={(e) => setSsn(formatSsn(e.target.value))}
                  autoComplete="off"
                  className={cn(
                    'w-full rounded-xl border bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 shadow-inner shadow-black/10',
                    'placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40',
                    errors.ssn ? 'border-red-400/60 focus:ring-red-400/30' : 'border-white/10'
                  )}
                />
                {errors.ssn && <p className="text-xs text-red-600">{errors.ssn}</p>}
              </div>
              <DateField id="owner_date_of_birth" label="Date of Birth" required value={dateOfBirth}
                onChange={setDateOfBirth} error={errors.dateOfBirth} yearOrder="asc" />
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

