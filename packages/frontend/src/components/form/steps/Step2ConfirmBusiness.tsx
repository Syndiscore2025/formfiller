'use client';
import { useState, useMemo } from 'react';
import { BusinessInfo, ENTITY_TYPES, US_STATES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface Props {
  business: BusinessInfo;
  homeAddressSameAsBusiness: boolean | null;
  onNext: (data: BusinessInfo, homeAddressSameAsBusiness: boolean) => void;
  onBack: () => void;
}

/* Fields the user already typed on Step 1 — these don't count as "lookup data" */
const STEP1_FIELDS = new Set(['legalName', 'stateOfFormation', 'ein']);

/** Infer entity type from the legal business name */
function inferEntityType(name: string): import('@/types/application').EntityType | '' {
  const n = name.toUpperCase().replace(/[.,]/g, '');
  if (/\bL\.?L\.?C\.?\b/.test(n) || n.includes(' LLC')) return 'LLC';
  if (/\bINC(ORPORATED)?\b/.test(n)) return 'C_CORP';
  if (/\bCORP(ORATION)?\b/.test(n)) return 'C_CORP';
  if (/\bL\.?P\.?\b/.test(n) || /\bPARTNERSHIP\b/.test(n)) return 'PARTNERSHIP';
  return '';
}

/* All editable business fields and their labels */
const FIELD_META: { key: string; label: string; required?: boolean }[] = [
  { key: 'legalName', label: 'Legal Business Name', required: true },
  { key: 'dba', label: 'DBA / Trade Name' },
  { key: 'entityType', label: 'Entity Type' },
  { key: 'stateOfFormation', label: 'State of Formation', required: true },
  { key: 'ein', label: 'EIN', required: true },
  { key: 'businessStartDate', label: 'Business Start Date' },
  { key: 'streetAddress', label: 'Street Address', required: true },
  { key: 'streetAddress2', label: 'Apt / Suite' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'zipCode', label: 'ZIP', required: true },
  { key: 'phone', label: 'Business Phone' },
  { key: 'website', label: 'Website' },
];

export function Step2ConfirmBusiness({ business, homeAddressSameAsBusiness: initialHomeAddr, onNext, onBack }: Props) {
  const src = business.fieldSources || {};

  // Did the APIs actually find anything beyond what the user typed on Step 1?
  const hasLookupData = useMemo(
    () => Object.keys(src).some((k) => !STEP1_FIELDS.has(k)),
    [src],
  );

  // Auto-inferred entity type (computed once from legal name)
  const inferredEntity = useMemo(() => inferEntityType(business.legalName || ''), [business.legalName]);

  // Which fields are populated (have a non-empty value)?
  const populated = useMemo(() => {
    const biz = business as unknown as Record<string, unknown>;
    const set = new Set<string>();
    for (const { key } of FIELD_META) {
      const v = biz[key];
      if (typeof v === 'string' && v.trim()) set.add(key);
    }
    // If entityType was inferred from the legal name, treat it as populated
    if (!set.has('entityType') && inferredEntity) set.add('entityType');
    return set;
  }, [business, inferredEntity]);

  // Which fields still need to be filled in?
  const missingFields = useMemo(
    () => FIELD_META.filter((f) => !populated.has(f.key)),
    [populated],
  );

  // Confirmation mode: user hasn't clicked "Edit" yet
  const [editing, setEditing] = useState(false);
  // When true, show ALL fields (user clicked "Edit"). When false, show only missing fields.
  const [editAll, setEditAll] = useState(false);

  // Editable state for ALL fields (used in form mode)
  const [legalName, setLegalName] = useState(business.legalName || '');
  const [dba, setDba] = useState(business.dba || '');
  // Auto-infer entity type from the legal name if APIs didn't provide it
  const [entityType, setEntityType] = useState(
    business.entityType || inferEntityType(business.legalName || ''),
  );
  const [stateOfFormation, setStateOfFormation] = useState(business.stateOfFormation || '');
  const [ein, setEin] = useState(formatEinDisplay(business.ein || ''));
  const [businessStartDate, setBusinessStartDate] = useState(business.businessStartDate || '');
  const [businessPhone, setBusinessPhone] = useState(business.phone || '');
  const [website, setWebsite] = useState(business.website || '');
  const [streetAddress, setStreetAddress] = useState(business.streetAddress || '');
  const [streetAddress2, setStreetAddress2] = useState(business.streetAddress2 || '');
  const [city, setCity] = useState(business.city || '');
  const [addrState, setAddrState] = useState(business.state || '');
  const [zipCode, setZipCode] = useState(business.zipCode || '');

  // Home address same as business — required on confirmation card
  const [homeAddrSame, setHomeAddrSame] = useState<boolean | null>(initialHomeAddr);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!legalName.trim()) errs.legalName = 'Business name is required';
    if (!stateOfFormation) errs.stateOfFormation = 'State of formation is required';
    const einDigits = ein.replace(/\D/g, '');
    if (!einDigits) errs.ein = 'EIN is required';
    else if (einDigits.length !== 9) errs.ein = 'EIN must be 9 digits';
    if (!streetAddress.trim()) errs.streetAddress = 'Street address is required';
    if (!city.trim()) errs.city = 'City is required';
    if (!addrState) errs.addrState = 'State is required';
    if (!zipCode.trim()) errs.zipCode = 'ZIP code is required';
    const phoneDigits = businessPhone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length !== 10) errs.businessPhone = 'Phone must be 10 digits';
    return errs;
  };

  const buildPayload = (): BusinessInfo => ({
    ...business,
    legalName: legalName.trim(),
    dba: dba.trim(),
    entityType: entityType as BusinessInfo['entityType'],
    stateOfFormation,
    ein: ein.replace(/\D/g, ''),
    businessStartDate,
    phone: businessPhone.replace(/\D/g, ''),
    website: website.trim(),
    streetAddress: streetAddress.trim(),
    streetAddress2: streetAddress2.trim(),
    city: city.trim(),
    state: addrState,
    zipCode: zipCode.trim(),
  });

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try { onNext(buildPayload(), homeAddrSame ?? false); } finally { setSubmitting(false); }
  };

  /* ---------- helper to render a display value for the confirmation card ---------- */
  const displayVal = (key: string): string => {
    const biz = business as unknown as Record<string, unknown>;
    const raw = (biz[key] as string) || '';
    if (key === 'ein') return formatEinDisplay(raw);
    if (key === 'phone') return formatPhoneDisplay(raw);
    if (key === 'entityType') {
      const val = raw || inferredEntity;
      const match = ENTITY_TYPES.find((e) => e.value === val);
      return match ? match.label : val;
    }
    return raw;
  };

  // ─── CONFIRMATION MODE (APIs found data) ───
  if (hasLookupData && !editing) {
    const confirmedFields = FIELD_META.filter((f) => populated.has(f.key));
    const hasBusinessAddr = populated.has('streetAddress') || populated.has('city') || populated.has('state');

    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Is this information correct?</h2>
        <p className="text-sm text-gray-500 mb-6">
          We found the following details about your business.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-3">
          {confirmedFields.map(({ key, label }) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-900 text-right">{displayVal(key)}</span>
            </div>
          ))}
        </div>

        {/* Home address same as business — required before continuing */}
        {hasBusinessAddr && (
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-800 mb-2">
              Is your home address the same as your business address?
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setHomeAddrSame(true); setErrors((p) => ({ ...p, homeAddrSame: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  homeAddrSame === true ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}>Yes</button>
              <button type="button" onClick={() => { setHomeAddrSame(false); setErrors((p) => ({ ...p, homeAddrSame: '' })); }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  homeAddrSame === false ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}>No</button>
            </div>
            {errors.homeAddrSame && <p className="text-xs text-red-600 mt-1">{errors.homeAddrSame}</p>}
          </div>
        )}

        {missingFields.length > 0 && (
          <p className="text-xs text-gray-400 mt-4">
            {missingFields.length} additional field{missingFields.length > 1 ? 's' : ''} will need to be completed on the next screen.
          </p>
        )}

        <div className="flex gap-3 justify-between mt-8">
          <Button variant="secondary" onClick={onBack}>← Back</Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setEditing(true); setEditAll(true); }}>Edit</Button>
            <Button onClick={() => {
              const newErrs: Record<string, string> = {};
              if (hasBusinessAddr && homeAddrSame === null) newErrs.homeAddrSame = 'Please answer this question';
              if (Object.keys(newErrs).length > 0) { setErrors(newErrs); return; }
              if (missingFields.length > 0) { setEditing(true); setEditAll(false); return; }
              const errs = validate();
              if (Object.keys(errs).length > 0) { setEditing(true); setEditAll(false); setErrors(errs); return; }
              onNext(buildPayload(), homeAddrSame ?? false);
            }}>
              Confirm &amp; Continue →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM MODE (no lookup data OR user clicked Edit OR missing fields) ───
  const showAll = editAll || !hasLookupData;
  // In minimal mode, skip streetAddress2 (optional, and showing "Business Address" header for
  // just an apt/suite field is confusing when the address was already confirmed).
  const show = (key: string) => {
    if (!showAll && key === 'streetAddress2') return false;
    return showAll || !populated.has(key);
  };

  const showIdentity = show('legalName') || show('dba');
  const showClassification = show('entityType') || show('stateOfFormation') || show('ein');
  const showDate = show('businessStartDate');
  const showAddress = show('streetAddress') || show('city') || show('state') || show('zipCode') || (showAll && show('streetAddress2'));
  const showContact = show('phone') || show('website');

  // Count visible missing fields (exclude streetAddress2 in minimal mode)
  const visibleMissing = missingFields.filter((f) => show(f.key));

  const title = showAll ? 'Business Details' : 'A few more details needed';
  const subtitle = showAll
    ? 'Please provide the details for your business.'
    : `Just ${visibleMissing.length} field${visibleMissing.length > 1 ? 's' : ''} to go — almost done.`;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-2">{subtitle}</p>

      {/* Progress hint */}
      {!showAll && (
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
          <div className="bg-violet-500 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.round((populated.size / FIELD_META.length) * 100)}%` }} />
        </div>
      )}
      {showAll && <div className="mb-4" />}

      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-5">
        {showIdentity && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {show('legalName') && <Input label="Legal Business Name" required value={legalName}
              onChange={(e) => setLegalName(e.target.value)} error={errors.legalName}
              autoComplete="organization" />}
            {show('dba') && <Input label="DBA / Trade Name" value={dba}
              onChange={(e) => setDba(e.target.value)} placeholder="If different from legal name"
              autoComplete="organization" />}
          </div>
        )}

        {showClassification && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {show('entityType') && <Select label="Entity Type" value={entityType}
              options={ENTITY_TYPES.map((e) => ({ value: e.value, label: e.label }))}
              onChange={(e) => setEntityType(e.target.value)} />}
            {show('stateOfFormation') && <Select label="State of Formation" required value={stateOfFormation}
              options={[...US_STATES]}
              onChange={(e) => setStateOfFormation(e.target.value)} error={errors.stateOfFormation} />}
            {show('ein') && <Input label="EIN" required placeholder="XX-XXXXXXX" value={ein}
              onChange={(e) => setEin(formatEinInput(e.target.value))} error={errors.ein}
              autoComplete="off" />}
          </div>
        )}

        {showDate && <Input label="Business Start Date" type="date" value={businessStartDate}
          onChange={(e) => setBusinessStartDate(e.target.value)} />}

        {showAddress && (<>
          <div className="border-t border-gray-100 pt-4" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Business Address</p>
          {show('streetAddress') && <Input label="Street Address" required value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)} error={errors.streetAddress}
            autoComplete="street-address" />}
          {show('streetAddress2') && <Input label="Apt / Suite" value={streetAddress2}
            onChange={(e) => setStreetAddress2(e.target.value)} autoComplete="address-line2" />}
          <div className="grid grid-cols-3 gap-4">
            {show('city') && <Input label="City" required value={city}
              onChange={(e) => setCity(e.target.value)} error={errors.city}
              autoComplete="address-level2" />}
            {show('state') && <Select label="State" required value={addrState} options={[...US_STATES]}
              onChange={(e) => setAddrState(e.target.value)} error={errors.addrState} />}
            {show('zipCode') && <Input label="ZIP" required value={zipCode}
              onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))} error={errors.zipCode}
              autoComplete="postal-code" />}
          </div>
        </>)}

        {showContact && (<>
          <div className="border-t border-gray-100 pt-4" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {show('phone') && <Input label="Business Phone" value={businessPhone}
              onChange={(e) => setBusinessPhone(formatPhoneInput(e.target.value))} error={errors.businessPhone}
              autoComplete="tel" placeholder="(555) 555-5555" />}
            {show('website') && <Input label="Website" value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="url" placeholder="www.example.com" />}
          </div>
        </>)}

        {/* Home address question is asked ONLY on the confirmation card — not repeated here */}
      </div>

      {!showAll && (
        <button type="button" onClick={() => setEditAll(true)}
          className="text-sm text-violet-600 hover:text-violet-800 hover:underline mt-4 font-medium">
          ✎ Show all fields
        </button>
      )}

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
        <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
      </div>
    </div>
  );
}

function formatEinDisplay(ein: string): string {
  const digits = ein.replace(/\D/g, '');
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function formatEinInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length >= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return digits;
}

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

