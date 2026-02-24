'use client';
import { useState } from 'react';
import { OwnerInfo, ContactInfo, BusinessInfo, US_STATES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

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
  const [firstName] = useState(owner.firstName || contact.firstName || '');
  const [lastName] = useState(owner.lastName || contact.lastName || '');
  const [email] = useState(owner.email || contact.email || '');
  const [phone] = useState(owner.phone || contact.phone || '');

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const pct = Number(ownershipPct);
  const showAdditionalQuestion = !(pct >= 81 && pct <= 100);

  const hasBusinessAddress = !!(business.streetAddress || business.city || business.state || business.zipCode);

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

  const formatSsn = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return digits;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!ownershipPct) errs.ownershipPct = 'Required';
    else {
      const p = Number(ownershipPct);
      if (p < 1 || p > 100) errs.ownershipPct = 'Must be 1-100';
    }
    const ssnDigits = ssn.replace(/\D/g, '');
    if (!ssnDigits) errs.ssn = 'Required';
    else if (ssnDigits.length !== 9) errs.ssn = 'SSN must be 9 digits';
    if (!dateOfBirth) errs.dateOfBirth = 'Required';
    if (!streetAddress.trim()) errs.streetAddress = 'Required';
    if (!city.trim()) errs.city = 'Required';
    if (!state) errs.state = 'Required';
    if (!zipCode.trim()) errs.zipCode = 'Required';
    if (showAdditionalQuestion && hasAdditional === null) errs.hasAdditional = 'Please select an option';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      const ownerData: OwnerInfo = {
        ownerIndex: 0, firstName, lastName, email, phone,
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
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Owner Details</h2>
      <p className="text-sm text-gray-500 mb-6">Tell us about yourself as the primary owner.</p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name" value={firstName} disabled autoComplete="given-name" />
          <Input label="Last Name" value={lastName} disabled autoComplete="family-name" />
        </div>

        <div className="border-t border-gray-200 pt-4 mt-4" />

        <Input label="Ownership %" required placeholder="e.g., 51" value={ownershipPct}
          onChange={(e) => setOwnershipPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
          error={errors.ownershipPct} autoComplete="off" />
        <Input label="Social Security Number" required placeholder="XXX-XX-XXXX" value={ssn}
          onChange={(e) => setSsn(formatSsn(e.target.value))} error={errors.ssn} autoComplete="off" />
        <Input label="Date of Birth" required type="date" value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)} error={errors.dateOfBirth} autoComplete="bday" />

        <div className="border-t border-gray-200 pt-4 mt-4" />
        <p className="text-sm font-medium text-gray-700">Home Address</p>

        {/* If user already chose "same as business" on Step 2, show a compact summary */}
        {addrFromBiz ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
            <p className="text-sm text-violet-700 font-medium mb-1">✓ Same as business address</p>
            <p className="text-xs text-gray-600">{streetAddress}{streetAddress2 ? `, ${streetAddress2}` : ''}, {city}, {state} {zipCode}</p>
            <button type="button" onClick={() => { setSameAsBusiness(false); }}
              className="text-xs text-violet-600 hover:underline mt-1">Enter a different address</button>
          </div>
        ) : (<>
          {hasBusinessAddress && !addrFromBiz && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={sameAsBusiness}
                onChange={(e) => handleSameAsBusinessChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
              Same as business address
            </label>
          )}
          <Input label="Street Address" required value={streetAddress}
            onChange={(e) => { if (!sameAsBusiness) setStreetAddress(e.target.value); }}
            error={errors.streetAddress} autoComplete="street-address" disabled={sameAsBusiness} />
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
            <div className="border-t border-gray-200 pt-4 mt-4" />
            <p className="text-sm font-medium text-gray-700">
              Are there any other owners with 20% or more ownership?
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setHasAdditional(true); setErrors((p) => ({ ...p, hasAdditional: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  hasAdditional === true ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}>Yes</button>
              <button type="button" onClick={() => { setHasAdditional(false); setErrors((p) => ({ ...p, hasAdditional: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  hasAdditional === false ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}>No</button>
            </div>
            {errors.hasAdditional && <p className="text-xs text-red-600">{errors.hasAdditional}</p>}
            <p className="text-xs text-gray-400">
              If yes, our team will follow up to collect their information separately.
            </p>
          </>
        )}
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

