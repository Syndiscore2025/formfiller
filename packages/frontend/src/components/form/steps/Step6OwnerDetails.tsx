'use client';
import { useState } from 'react';
import { OwnerInfo, ContactInfo, US_STATES, CREDIT_SCORE_RANGES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface Props {
  owner: OwnerInfo;
  contact: ContactInfo;
  onNext: (data: OwnerInfo) => void;
  onBack: () => void;
}

export function Step6OwnerDetails({ owner, contact, onNext, onBack }: Props) {
  // Pre-fill from contact if owner fields are empty
  const [firstName] = useState(owner.firstName || contact.firstName || '');
  const [lastName] = useState(owner.lastName || contact.lastName || '');
  const [email] = useState(owner.email || contact.email || '');
  const [phone] = useState(owner.phone || contact.phone || '');
  
  const [ownershipPct, setOwnershipPct] = useState(owner.ownershipPct || '');
  const [ssn, setSsn] = useState(owner.ssn || '');
  const [dateOfBirth, setDateOfBirth] = useState(owner.dateOfBirth || '');
  const [creditScore, setCreditScore] = useState(owner.creditScore || '');
  const [streetAddress, setStreetAddress] = useState(owner.streetAddress || '');
  const [streetAddress2, setStreetAddress2] = useState(owner.streetAddress2 || '');
  const [city, setCity] = useState(owner.city || '');
  const [state, setState] = useState(owner.state || '');
  const [zipCode, setZipCode] = useState(owner.zipCode || '');
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const formatSsn = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return digits;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!ownershipPct) errs.ownershipPct = 'Required';
    const ssnDigits = ssn.replace(/\D/g, '');
    if (!ssnDigits) errs.ssn = 'Required';
    else if (ssnDigits.length !== 9) errs.ssn = 'SSN must be 9 digits';
    if (!dateOfBirth) errs.dateOfBirth = 'Required';
    if (!creditScore) errs.creditScore = 'Required';
    if (!streetAddress.trim()) errs.streetAddress = 'Required';
    if (!city.trim()) errs.city = 'Required';
    if (!state) errs.state = 'Required';
    if (!zipCode.trim()) errs.zipCode = 'Required';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      onNext({
        ownerIndex: 0,
        firstName, lastName, email, phone,
        ownershipPct,
        ssn: ssn.replace(/\D/g, ''),
        dateOfBirth,
        creditScore,
        streetAddress: streetAddress.trim(),
        streetAddress2: streetAddress2.trim(),
        city: city.trim(),
        state,
        zipCode: zipCode.trim(),
      });
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
        <Input label="Email" value={email} disabled autoComplete="email" />
        <Input label="Phone" value={phone} disabled autoComplete="tel" />

        <div className="border-t border-gray-200 pt-4 mt-4" />

        <Input label="Ownership %" placeholder="e.g., 51" value={ownershipPct}
          onChange={(e) => setOwnershipPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
          error={errors.ownershipPct} autoComplete="off" />
        <Input label="Social Security Number" placeholder="XXX-XX-XXXX" value={ssn}
          onChange={(e) => setSsn(formatSsn(e.target.value))} error={errors.ssn} autoComplete="off" />
        <Input label="Date of Birth" type="date" value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)} error={errors.dateOfBirth} autoComplete="bday" />
        <Select label="Credit Score" value={creditScore}
          onChange={(e) => setCreditScore(e.target.value)} error={errors.creditScore}>
          <option value="">Select...</option>
          {CREDIT_SCORE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>

        <div className="border-t border-gray-200 pt-4 mt-4" />
        <p className="text-sm font-medium text-gray-700">Home Address</p>
        <Input label="Street Address" value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)} error={errors.streetAddress} autoComplete="street-address" />
        <Input label="Apt / Suite (optional)" value={streetAddress2}
          onChange={(e) => setStreetAddress2(e.target.value)} autoComplete="address-line2" />
        <div className="grid grid-cols-3 gap-4">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} autoComplete="address-level2" />
          <Select label="State" value={state} onChange={(e) => setState(e.target.value)} error={errors.state}>
            <option value="">--</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="ZIP" value={zipCode} onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))} error={errors.zipCode} autoComplete="postal-code" />
        </div>
      </div>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

