'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BusinessInfo, ENTITY_TYPES, INDUSTRIES, US_STATES, getIndustryCodes, type FieldMemory } from '@/types/application';
import { useAnalyticsContext } from '@/hooks/useAnalytics';
import { AddressInput } from '@/components/ui/AddressInput';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';

interface Props {
  business: BusinessInfo;
  homeAddressSameAsBusiness: boolean | null;
  onNext: (data: BusinessInfo, homeAddressSameAsBusiness: boolean) => Promise<void>;
  onBack: () => void;
  onDraftChange?: (data: Partial<BusinessInfo>, homeAddressSameAsBusiness: boolean | null) => void;
}

/* Fields the user already typed on Step 1 — these don't count as "lookup data" */
const STEP1_FIELDS = new Set(['legalName', 'stateOfFormation', 'ein']);
const TOLL_FREE_PREFIXES = new Set(['800', '888', '877', '866', '855', '844', '833', '822']);

/** Infer entity type from the legal business name */
function inferEntityType(name: string): import('@/types/application').EntityType | '' {
  const n = name.toUpperCase().replace(/[.,]/g, '');
  if (/\bL\.?L\.?C\.?\b/.test(n) || n.includes(' LLC')) return 'LLC';
  if (/\bINC(ORPORATED)?\b/.test(n)) return 'C_CORP';
  if (/\bCORP(ORATION)?\b/.test(n)) return 'C_CORP';
  if (/\bL\.?P\.?\b/.test(n) || /\bPARTNERSHIP\b/.test(n)) return 'PARTNERSHIP';
  return '';
}

function normalizeUsPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('1')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

function isTollFreePhone(value: string): boolean {
  const digits = normalizeUsPhoneDigits(value);
  return digits.length === 10 && TOLL_FREE_PREFIXES.has(digits.slice(0, 3));
}

/* All editable business fields and their labels */
const FIELD_META: { key: string; label: string; required?: boolean }[] = [
  { key: 'legalName', label: 'Legal Business Name', required: true },
  { key: 'dba', label: 'DBA / Trade Name' },
  { key: 'entityType', label: 'Entity Type' },
  { key: 'industry', label: 'Industry', required: true },
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

export function Step2ConfirmBusiness({ business, homeAddressSameAsBusiness: initialHomeAddr, onNext, onBack, onDraftChange }: Props) {
  const analytics = useAnalyticsContext();
  const src = business.fieldSources || {};
  const partialBusinessStartYear = getPartialBusinessStartYear(business.businessStartDate);
  const normalizedBusinessStartDate = normalizeBusinessStartDateInput(business.businessStartDate);

  // Did the APIs actually find anything beyond what the user typed on Step 1?
  const hasLookupData = useMemo(
    () => Object.keys(src).some((k) => !STEP1_FIELDS.has(k)),
    [src],
  );

  // Auto-inferred entity type (computed once from legal name)
  const inferredEntity = useMemo(() => inferEntityType(business.legalName || ''), [business.legalName]);

  // Which fields are populated (have a non-empty value)?
  const filledFields = useMemo(() => {
    const biz = business as unknown as Record<string, unknown>;
    const set = new Set<string>();
    for (const { key } of FIELD_META) {
      const v = biz[key];
      if (key === 'industry' && typeof v === 'string' && !normalizeIndustryValue(v)) continue;
      if (typeof v === 'string' && v.trim()) set.add(key);
    }
    // If entityType was inferred from the legal name, treat it as populated
    if (!set.has('entityType') && inferredEntity) set.add('entityType');
    return set;
  }, [business, inferredEntity]);

  const completedFields = useMemo(() => {
    const set = new Set(filledFields);
    if (partialBusinessStartYear) set.delete('businessStartDate');
    return set;
  }, [filledFields, partialBusinessStartYear]);
  const initiallyCompletedFieldsRef = useRef(completedFields);

  // Which fields still need to be filled in?
  const missingFields = useMemo(
    () => FIELD_META.filter((f) => !completedFields.has(f.key)),
    [completedFields],
  );

  // Confirmation mode: user hasn't clicked "Edit" yet
  const [editing, setEditing] = useState(false);
  // When true, show ALL fields (user clicked "Edit"). When false, show only missing fields.
  const [editAll, setEditAll] = useState(false);

  // Editable state for ALL fields (used in form mode)
  const [legalName, setLegalName] = useState(business.legalName || '');
  const [dba, setDba] = useState(business.dba || '');
  // Auto-infer entity type from the legal name if APIs didn't provide it
  const [entityType, setEntityType] = useState<BusinessInfo['entityType']>(
    business.entityType || inferEntityType(business.legalName || ''),
  );
  const [industry, setIndustry] = useState(normalizeIndustryValue(business.industry));
  const [stateOfFormation, setStateOfFormation] = useState(business.stateOfFormation || '');
  const [ein, setEin] = useState(formatEinDisplay(business.ein || ''));
  const [businessStartDate, setBusinessStartDate] = useState(normalizedBusinessStartDate);
  const [businessPhone, setBusinessPhone] = useState(formatPhoneInput(business.phone || ''));
  const [website, setWebsite] = useState(business.website || '');
  const [streetAddress, setStreetAddress] = useState(business.streetAddress || '');
  const [streetAddress2, setStreetAddress2] = useState(business.streetAddress2 || '');
  const [city, setCity] = useState(business.city || '');
  const [addrState, setAddrState] = useState(business.state || '');
  const [zipCode, setZipCode] = useState(business.zipCode || '');

  // Home based business — null means not yet answered
  const [homeAddrSame, setHomeAddrSame] = useState<boolean>(initialHomeAddr ?? false);
  const [homeAddrSameAnswered, setHomeAddrSameAnswered] = useState<boolean>(initialHomeAddr !== null);
  const [googlePlaceAutofill, setGooglePlaceAutofill] = useState<Record<string, string>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showTollFreeModal, setShowTollFreeModal] = useState(false);

  const selectedIndustryCodes = useMemo(() => getIndustryCodes(industry), [industry]);
  // Tracks the business prop values we last pushed UP via onDraftChange, so the
  // sync-down effect can ignore prop changes that are just our own draft echoing
  // back (which otherwise causes the phone field to reformat mid-typing/flicker).
  const lastPushedBusinessRef = useRef<Record<string, string>>({});

  // Keep editable local state in sync when the AI/chat updates parent form state.
  // Without this, a field can be marked "completed" and disappear before the
  // local input state receives the value the AI just applied.
  useEffect(() => {
    // Ignore any field whose incoming prop value matches what we last pushed up:
    // that's just our own draft echoing back, and re-applying it mid-typing is
    // what makes the phone/address fields flicker.
    const pushed = lastPushedBusinessRef.current;
    const isEcho = (key: string, rawPropValue: string) => pushed[key] !== undefined && pushed[key] === rawPropValue;
    const isPhoneEcho = (rawPropValue: string) => pushed.phone !== undefined && pushed.phone === normalizeUsPhoneDigits(rawPropValue);

    const nextPhone = formatPhoneInput(business.phone || '');
    const nextEin = formatEinDisplay(business.ein || '');
    const nextStartDate = normalizeBusinessStartDateInput(business.businessStartDate);
    const nextIndustry = normalizeIndustryValue(business.industry);
    if (!isEcho('legalName', business.legalName || '')) setLegalName((prev) => (prev === (business.legalName || '') ? prev : business.legalName || ''));
    if (!isEcho('dba', business.dba || '')) setDba((prev) => (prev === (business.dba || '') ? prev : business.dba || ''));
    if (!isEcho('entityType', business.entityType || '')) setEntityType((prev) => (prev === (business.entityType || inferEntityType(business.legalName || '')) ? prev : business.entityType || inferEntityType(business.legalName || '')));
    if (!isEcho('industry', business.industry || '')) setIndustry((prev) => (prev === nextIndustry ? prev : nextIndustry));
    if (!isEcho('stateOfFormation', business.stateOfFormation || '')) setStateOfFormation((prev) => (prev === (business.stateOfFormation || '') ? prev : business.stateOfFormation || ''));
    if (!isEcho('ein', business.ein || '')) setEin((prev) => (prev === nextEin ? prev : nextEin));
    if (!isEcho('businessStartDate', business.businessStartDate || '')) setBusinessStartDate((prev) => (prev === nextStartDate ? prev : nextStartDate));
    if (!isPhoneEcho(business.phone || '')) setBusinessPhone((prev) => (prev === nextPhone ? prev : nextPhone));
    if (!isEcho('website', business.website || '')) setWebsite((prev) => (prev === (business.website || '') ? prev : business.website || ''));
    if (!isEcho('streetAddress', business.streetAddress || '')) setStreetAddress((prev) => (prev === (business.streetAddress || '') ? prev : business.streetAddress || ''));
    if (!isEcho('streetAddress2', business.streetAddress2 || '')) setStreetAddress2((prev) => (prev === (business.streetAddress2 || '') ? prev : business.streetAddress2 || ''));
    if (!isEcho('city', business.city || '')) setCity((prev) => (prev === (business.city || '') ? prev : business.city || ''));
    if (!isEcho('state', business.state || '')) setAddrState((prev) => (prev === (business.state || '') ? prev : business.state || ''));
    if (!isEcho('zipCode', business.zipCode || '')) setZipCode((prev) => (prev === (business.zipCode || '') ? prev : business.zipCode || ''));
  }, [business.legalName, business.dba, business.entityType, business.industry, business.stateOfFormation, business.ein, business.businessStartDate, business.phone, business.website, business.streetAddress, business.streetAddress2, business.city, business.state, business.zipCode]);

  useEffect(() => {
    setHomeAddrSame(initialHomeAddr ?? false);
    setHomeAddrSameAnswered(initialHomeAddr !== null);
  }, [initialHomeAddr]);

  useEffect(() => {
    const draft: Partial<BusinessInfo> = {
      legalName,
      dba,
      entityType,
      industry,
      stateOfFormation,
      ein: ein.replace(/\D/g, ''),
      businessStartDate,
      phone: normalizeUsPhoneDigits(businessPhone),
      website,
      streetAddress,
      streetAddress2,
      city,
      state: addrState,
      zipCode,
      sicCode: selectedIndustryCodes?.sicCode || '',
      naicsCode: selectedIndustryCodes?.naicsCode || '',
    };
    // Remember the raw values we just pushed up so the sync-down effect can tell
    // our own echo apart from a genuine external (lookup/AI) change.
    lastPushedBusinessRef.current = draft as Record<string, string>;
    onDraftChange?.(draft, homeAddrSameAnswered ? homeAddrSame : null);
  }, [legalName, dba, entityType, industry, stateOfFormation, ein, businessStartDate, businessPhone, website, streetAddress, streetAddress2, city, addrState, zipCode, selectedIndustryCodes, homeAddrSameAnswered, homeAddrSame, onDraftChange]);

  const displayIndustryCodes = useMemo(() => {
    const mapped = getIndustryCodes(normalizeIndustryValue(business.industry) || industry);
    return {
      sicCode: business.sicCode || mapped?.sicCode || '',
      naicsCode: business.naicsCode || mapped?.naicsCode || '',
    };
  }, [business.industry, business.naicsCode, business.sicCode, industry]);

  useEffect(() => {
    if (!showTollFreeModal) return;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setShowTollFreeModal(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTollFreeModal, submitting]);

  const handleBusinessAddressSelect = (address: {
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }) => {
    setStreetAddress(address.streetAddress || '');
    setCity(address.city || '');
    setAddrState(address.state || '');
    setZipCode(address.zipCode || '');
    setGooglePlaceAutofill({
      streetAddress: address.streetAddress || '',
      city: address.city || '',
      state: address.state || '',
      zipCode: address.zipCode || '',
    });
    analytics?.track({
      eventType: 'field_autofill',
      fieldName: 'business.address',
      metadata: { source: 'google_places', fields: ['streetAddress', 'city', 'state', 'zipCode'] },
    });
  };

  const setHomeBasedBusiness = (nextValue: boolean) => {
    setHomeAddrSame(nextValue);
    setHomeAddrSameAnswered(true);
    analytics?.track({
      eventType: 'toggle_selected',
      fieldName: 'application.homeBasedBusiness',
      metadata: { value: nextValue, label: 'Home Based Business' },
    });
  };

  const isSoleProp = entityType === 'SOLE_PROPRIETORSHIP';

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!legalName.trim()) errs.legalName = 'Business name is required';
    if (!normalizeIndustryValue(industry)) errs.industry = 'Select an industry from the list';
    if (!stateOfFormation) errs.stateOfFormation = 'State of formation is required';
    if (!isSoleProp) {
      const einDigits = ein.replace(/\D/g, '');
      if (!einDigits) errs.ein = 'EIN is required';
      else if (einDigits.length !== 9) errs.ein = 'EIN must be 9 digits';
    }
    if (!streetAddress.trim()) errs.streetAddress = 'Street address is required';
    if (!city.trim()) errs.city = 'City is required';
    if (!addrState) errs.addrState = 'State is required';
    if (!zipCode.trim()) errs.zipCode = 'ZIP code is required';
    const phoneDigits = businessPhone.replace(/\D/g, '');
    if (phoneDigits) {
      const normalizedDigits = normalizeUsPhoneDigits(businessPhone);
      if (normalizedDigits.length !== 10) {
        errs.businessPhone = 'Phone must be 10 digits';
      }
    }
    return errs;
  };

  const buildPayload = (): BusinessInfo => {
    const values: Record<string, string> = {
      legalName: legalName.trim(),
      dba: dba.trim(),
      entityType: entityType as string,
      industry: industry.trim(),
      stateOfFormation,
      ein: ein.replace(/\D/g, ''),
      businessStartDate,
      phone: normalizeUsPhoneDigits(businessPhone),
      website: website.trim(),
      streetAddress: streetAddress.trim(),
      streetAddress2: streetAddress2.trim(),
      city: city.trim(),
      state: addrState,
      zipCode: zipCode.trim(),
      sicCode: selectedIndustryCodes?.sicCode || '',
      naicsCode: selectedIndustryCodes?.naicsCode || '',
    };
    const autoPopulated = buildFieldMemory(business, values, googlePlaceAutofill);
    return { ...business, ...values, entityType: values.entityType as BusinessInfo['entityType'], autoPopulated };
  };

  const openTollFreeModal = () => {
    setErrors((prev) => {
      if (!prev.businessPhone) return prev;
      const next = { ...prev };
      delete next.businessPhone;
      return next;
    });
    setShowTollFreeModal(true);
  };

  const closeTollFreeModal = () => setShowTollFreeModal(false);

  const handleTollFreeModalAction = () => {
    setShowTollFreeModal(false);
    setEditing(true);
    setEditAll(true);
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (isTollFreePhone(businessPhone)) { openTollFreeModal(); return; }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      trackFieldMemory(payload.autoPopulated, analytics);
      await onNext(payload, homeAddrSame ?? false);
    } finally { setSubmitting(false); }
  };

  const tollFreeModal = (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 transition-all duration-300 ease-out ${
          showTollFreeModal
            ? 'bg-slate-950/75 opacity-100 backdrop-blur-[3px]'
            : 'pointer-events-none bg-slate-950/0 opacity-0'
        }`}
        onClick={closeTollFreeModal}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="toll-free-modal-title"
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
          showTollFreeModal ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
          <div className="surface-panel-soft border border-amber-400/20 bg-slate-950/95 p-7 shadow-[0_24px_90px_rgba(2,12,27,0.72),0_0_0_1px_rgba(251,191,36,0.08)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Phone number needed</p>
                <h3 id="toll-free-modal-title" className="mt-2 text-2xl font-semibold text-white">We can’t accept a toll-free number</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
                  Please enter your local business phone number with the area code first. Do not include <strong className="text-slate-200">+1</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTollFreeModal}
                disabled={submitting}
                className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                aria-label="Close toll-free number notice"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path fill="currentColor" d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06" />
                </svg>
              </button>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={closeTollFreeModal} disabled={submitting}>Back</Button>
              <Button onClick={handleTollFreeModalAction} disabled={submitting}>Edit phone number</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

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
    const confirmedFields = FIELD_META.filter((f) => filledFields.has(f.key));
    const hasBusinessAddr = filledFields.has('streetAddress') || filledFields.has('city') || filledFields.has('state');

    return (
      <div className="relative">
        {tollFreeModal}

        <div className={`transition duration-300 ${showTollFreeModal ? 'pointer-events-none select-none blur-[1px] saturate-50' : ''}`}>
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Business match found</p>
              <h2 className="text-2xl font-bold tracking-tight text-white">Is this information correct?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Review the details we found. Edit anything that is missing or incorrect before continuing.
              </p>
            </div>
            <span className="surface-pill shrink-0">Step 2 review</span>
          </div>

          <div className="business-confirm-card rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-white">Business details</p>
                <p className="mt-1 text-xs text-slate-400">Pulled from business lookup and merchant entry.</p>
              </div>
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                {confirmedFields.length} fields
              </span>
            </div>

            <div className="grid gap-2">
            {confirmedFields.map(({ key, label }) => (
              <Fragment key={key}>
                <div className="business-confirm-row flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-100 sm:text-right">{displayVal(key)}</span>
                </div>
                {key === 'industry' && displayIndustryCodes.sicCode && (
                  <div className="business-confirm-row flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-slate-400">SIC</span>
                    <span className="font-semibold text-slate-100 sm:text-right">{displayIndustryCodes.sicCode}</span>
                  </div>
                )}
                {key === 'industry' && displayIndustryCodes.naicsCode && (
                  <div className="business-confirm-row flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-slate-400">NAICS</span>
                    <span className="font-semibold text-slate-100 sm:text-right">{displayIndustryCodes.naicsCode}</span>
                  </div>
                )}
              </Fragment>
            ))}
            </div>

            {/* Home Based Business — visually separated, Yes/No buttons */}
            {hasBusinessAddr && (
              <div className="mt-4 border-t border-white/10 pt-5">
                <p className="mb-1 text-sm font-semibold text-slate-200">Home Based Business?</p>
                <p className="mb-4 text-xs text-slate-400">Does the primary owner operate this business from their home address?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHomeBasedBusiness(true)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                      homeAddrSameAnswered && homeAddrSame
                        ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
                    }`}
                  >
                    ✓ Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeBasedBusiness(false)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                      homeAddrSameAnswered && !homeAddrSame
                        ? 'border-rose-400/50 bg-rose-400/10 text-rose-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
                    }`}
                  >
                    ✗ No
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-between mt-8">
            <Button variant="secondary" onClick={onBack}>← Back</Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setEditing(true); setEditAll(true); }}>Edit</Button>
              <Button disabled={submitting} loading={submitting} onClick={async () => {
                if (missingFields.length > 0) { setEditing(true); setEditAll(false); return; }
                const errs = validate();
                if (Object.keys(errs).length > 0) { setEditing(true); setEditAll(false); setErrors(errs); return; }
                if (isTollFreePhone(businessPhone)) { openTollFreeModal(); return; }
                setSubmitting(true);
                try {
	                  const payload = buildPayload();
	                  trackFieldMemory(payload.autoPopulated, analytics);
	                  await onNext(payload, homeAddrSame);
                } finally {
                  setSubmitting(false);
                }
              }}>
                Confirm &amp; Continue →
              </Button>
            </div>
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
    // In minimal mode, hide fields that were already completed when this step
    // opened. If the AI fills a missing field while the merchant is watching,
    // keep it visible so the value does not appear to vanish.
    return showAll || !initiallyCompletedFieldsRef.current.has(key);
  };

  const showIdentity = show('legalName') || show('dba');
  const showClassification = show('entityType') || show('industry') || show('stateOfFormation') || show('ein');
  const showDate = show('businessStartDate');
  const showAddress = show('streetAddress') || show('city') || show('state') || show('zipCode') || (showAll && show('streetAddress2'));
  const showContact = show('phone') || show('website');

  // Count visible missing fields (exclude streetAddress2 in minimal mode)
  const visibleMissing = missingFields.filter((f) => show(f.key));

  const title = showAll ? 'Business Details' : 'A few more details needed';
  const subtitle = 'Please provide the details for your business.';

  return (
    <div className="relative">
      {tollFreeModal}

      <div className={`transition duration-300 ${showTollFreeModal ? 'pointer-events-none select-none blur-[1px] saturate-50' : ''}`}>
        <h2 className="mb-1 text-xl font-bold text-white">{title}</h2>
        <p className="mb-2 text-sm text-slate-400">{subtitle}</p>

        {/* Progress hint */}
        {!showAll && (
          <div className="mb-6 h-1.5 w-full rounded-full bg-white/[0.06]">
            <div className="h-1.5 rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.95),rgba(96,165,250,0.95))] transition-all"
              style={{ width: `${Math.round((completedFields.size / FIELD_META.length) * 100)}%` }} />
          </div>
        )}
        {showAll && <div className="mb-4" />}

        <div className="space-y-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {show('entityType') && <Select label="Entity Type" value={entityType}
                options={ENTITY_TYPES.map((e) => ({ value: e.value, label: e.label }))}
                onChange={(e) => setEntityType(e.target.value as BusinessInfo['entityType'])} />}
              {show('industry') && (
                <div className="space-y-2">
                  <SearchableSelect
                    label="Industry"
                    required
                    value={industry}
                    options={INDUSTRIES}
                    onChange={setIndustry}
                    error={errors.industry}
                    hint="Search the list to select the closest industry."
                  />
                  {selectedIndustryCodes && (
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                      SIC {selectedIndustryCodes.sicCode} • NAICS {selectedIndustryCodes.naicsCode}
                    </div>
                  )}
                </div>
              )}
              {show('stateOfFormation') && <Select label="State of Formation" required value={stateOfFormation}
                options={[...US_STATES]}
                onChange={(e) => setStateOfFormation(e.target.value)} error={errors.stateOfFormation} />}
              {show('ein') && <Input label="EIN" required={!isSoleProp} placeholder={isSoleProp ? 'N/A — Sole Proprietorship' : 'XX-XXXXXXX'} value={isSoleProp ? '' : ein}
                onChange={(e) => setEin(formatEinInput(e.target.value))} error={errors.ein}
                autoComplete="off" disabled={isSoleProp} />}
            </div>
          )}

          {showDate && (
            <div className="space-y-3">
              {partialBusinessStartYear && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 text-sm text-slate-300">
                  We found the start year as <span className="font-semibold text-slate-100">{partialBusinessStartYear}</span>. Please confirm the exact month and day.
                </div>
              )}
              <DateField label="Business Start Date" value={businessStartDate}
                onChange={setBusinessStartDate}
                min={partialBusinessStartYear ? `${partialBusinessStartYear}-01-01` : undefined}
                max={partialBusinessStartYear ? `${partialBusinessStartYear}-12-31` : undefined}
                hint={partialBusinessStartYear ? `Calendar starts at January 1, ${partialBusinessStartYear}.` : undefined} />
            </div>
          )}

          {showAddress && (<>
            <div className="border-t border-white/10 pt-4" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business Address</p>
            {show('streetAddress') && <AddressInput label="Street Address" required value={streetAddress}
              onChange={setStreetAddress} onSelectAddress={handleBusinessAddressSelect} error={errors.streetAddress}
              autoComplete="street-address" placeholder="Start typing your business address" />}
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
            <div className="border-t border-white/10 pt-4" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
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
            className="mt-4 text-sm font-medium text-cyan-300 transition hover:text-cyan-200 hover:underline">
            ✎ Show all fields
          </button>
        )}

        <div className="flex gap-3 justify-between mt-8">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>← Back</Button>
          <Button onClick={handleSubmit} loading={submitting}>Continue →</Button>
        </div>
      </div>
    </div>
  );
}

function buildFieldMemory(
  initialBusiness: BusinessInfo,
  values: Record<string, string>,
  googlePlaceAutofill: Record<string, string>,
): Record<string, boolean | FieldMemory> {
  const now = new Date().toISOString();
  const memory: Record<string, boolean | FieldMemory> = { ...(initialBusiness.autoPopulated || {}) };
  const initial = initialBusiness as unknown as Record<string, unknown>;

  for (const [key, existing] of Object.entries(memory)) {
    if (!isFieldMemory(existing) || !existing.autoFilled) continue;
    const before = String(initial[key] ?? '').trim();
    const after = String(values[key] ?? '').trim();
    if (before && after && before !== after) {
      memory[key] = { ...existing, editedByMerchant: true, updatedAt: now };
    }
  }

  for (const [key, selectedValue] of Object.entries(googlePlaceAutofill)) {
    if (!selectedValue) continue;
    const currentValue = String(values[key] ?? '').trim();
    memory[key] = {
      autoFilled: true,
      source: 'google_places',
      editedByMerchant: currentValue !== selectedValue.trim(),
      skipped: false,
      updatedAt: now,
    };
  }

  for (const key of ['dba', 'entityType', 'businessStartDate', 'phone', 'website', 'streetAddress2']) {
    if (!String(values[key] ?? '').trim()) {
      const existing = memory[key];
      memory[key] = isFieldMemory(existing)
        ? { ...existing, skipped: true, updatedAt: now }
        : { skipped: true, source: 'merchant', updatedAt: now };
    }
  }

  return memory;
}

function trackFieldMemory(
  memory: Record<string, boolean | FieldMemory> | undefined,
  analytics: ReturnType<typeof useAnalyticsContext>,
) {
  if (!memory || !analytics) return;
  for (const [fieldName, value] of Object.entries(memory)) {
    if (!isFieldMemory(value)) continue;
    if (value.editedByMerchant) {
      analytics.track({ eventType: 'field_autofill_edited', fieldName: `business.${fieldName}`, metadata: { source: value.source } });
    }
    if (value.skipped) {
      analytics.track({ eventType: 'field_skipped', fieldName: `business.${fieldName}`, metadata: { source: value.source } });
    }
  }
}

function isFieldMemory(value: unknown): value is FieldMemory {
  return typeof value === 'object' && value !== null;
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
  const digits = normalizeUsPhoneDigits(value);
  if (digits.length >= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return digits;
}

function formatPhoneDisplay(value: string): string {
  const digits = normalizeUsPhoneDigits(value);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

function normalizeIndustryValue(value: string | null | undefined): string {
  const lower = (value || '').trim().toLowerCase();
  return INDUSTRIES.find((industry) => industry.toLowerCase() === lower) || '';
}

function getPartialBusinessStartYear(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

function normalizeBusinessStartDateInput(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

