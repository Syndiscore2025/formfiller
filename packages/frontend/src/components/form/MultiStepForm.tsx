'use client';
import { useState, useCallback, useEffect } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { BankStatementUpload } from './BankStatementUpload';
import { ChatWidget } from './ChatWidget';
import { CompletionOverlay } from './CompletionOverlay';
import { Step1EINLookup } from './steps/Step1EINLookup';
import { Step2ConfirmBusiness } from './steps/Step2ConfirmBusiness';
import { Step4Revenue } from './steps/Step4Revenue';
import { Step6OwnerDetails } from './steps/Step6OwnerDetails';
import { Step8ReviewSign } from './steps/Step8ReviewSign';
import { INDUSTRIES, type FormState, type ContactInfo, type BusinessInfo, type OwnerInfo, type FinancialInfo, type LoanRequest } from '@/types/application';
import { api } from '@/lib/api';
import { useAnalytics, AnalyticsContext } from '@/hooks/useAnalytics';
import { useTheme } from '@/hooks/useTheme';

interface TenantSettings {
  companyName: string | null;
  legalBusinessName: string | null;
  logoUrl: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  theme: string | null;
  accentColor: string | null;
  surfaceColor: string | null;
  pdfShowContactEmail: boolean;
  pdfShowContactPhone: boolean;
  pdfShowAnnualRevenue: boolean;
  pdfShowAmountRequested: boolean;
  showEstimatedCreditScore: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'default';

const EMPTY_CONTACT: ContactInfo = { firstName: '', lastName: '', email: '', phone: '', tcpaConsent: false };
const EMPTY_BUSINESS: BusinessInfo = {
  legalName: '', dba: '', entityType: '', industry: '', stateOfFormation: '',
  ein: '', businessStartDate: '', phone: '', website: '',
  streetAddress: '', streetAddress2: '', city: '', state: '', zipCode: '',
  sicCode: '', naicsCode: '',
};
const EMPTY_FINANCIAL: FinancialInfo = { annualRevenue: '' };
const EMPTY_LOAN: LoanRequest = { amountRequested: '', urgency: '' };

function isSamePartialBusiness(current: BusinessInfo, draft: Partial<BusinessInfo>): boolean {
  return Object.entries(draft).every(([key, value]) => {
    const currentValue = current[key as keyof BusinessInfo];
    return currentValue === value;
  });
}

function normalizeUsPhoneDigits(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('1')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

interface Props { token: string | null; }

export function MultiStepForm({ token }: Props) {
  const [state, setState] = useState<FormState>({
    applicationId: null,
    currentStep: 1,
    contact: EMPTY_CONTACT,
    business: EMPTY_BUSINESS,

    owners: [],
    financial: EMPTY_FINANCIAL,
    loanRequest: EMPTY_LOAN,
    hasAdditionalOwners: null,
    homeAddressSameAsBusiness: null,
    ownerHomeSameAsBusiness: null,
    isSaving: false,
    lastSaved: null,
  });
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  // Overlay visibility (can be toggled off via the close button).
  const [isComplete, setIsComplete] = useState(false);
  // Sticky finalization flag — flipped true once POST /finalize succeeds and
  // never reset. Drives the progress bar so it stays at 100% even after the
  // merchant dismisses the thank-you overlay.
  const [hasFinalized, setHasFinalized] = useState(false);
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  const [uploadedDocumentsCount, setUploadedDocumentsCount] = useState(0);
  const [aiFocusField, setAiFocusField] = useState<string | null>(null);
  const [aiPageContext, setAiPageContext] = useState<Record<string, unknown> | null>(null);
  // TCPA consent signaled from the AI chat
  const [chatTcpaConsented, setChatTcpaConsented] = useState(false);
  // Stable callback so BankStatementUpload's completion effect isn't torn down
  // on every parent render (which would cancel the 1.2s reveal timer).
  const handleComplete = useCallback(() => {
    // Scroll the underlying page to the top so the fixed, centered overlay
    // appears against the top of the form rather than a half-scrolled view.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
    setHasFinalized(true);
    setIsComplete(true);
  }, []);
  const handleCloseComplete = useCallback(() => setIsComplete(false), []);
  const handleDocumentsCountChange = useCallback((count: number) => {
    setUploadedDocumentsCount(count);
  }, []);

  const handleStep1DraftChange = useCallback((contactDraft: Partial<ContactInfo>, businessDraft: Partial<BusinessInfo>) => {
    setState((prev) => ({
      ...prev,
      contact: { ...prev.contact, ...contactDraft },
      business: { ...prev.business, ...businessDraft },
    }));
  }, []);

  const handleStep2DraftChange = useCallback((businessDraft: Partial<BusinessInfo>, homeAddrSame: boolean | null) => {
    setState((prev) => {
      const nextHomeAddrSame = homeAddrSame === null ? prev.homeAddressSameAsBusiness : homeAddrSame;
      const businessUnchanged = isSamePartialBusiness(prev.business, businessDraft);
      if (businessUnchanged && nextHomeAddrSame === prev.homeAddressSameAsBusiness) return prev;
      return {
        ...prev,
        business: businessUnchanged ? prev.business : { ...prev.business, ...businessDraft },
        homeAddressSameAsBusiness: nextHomeAddrSame,
      };
    });
  }, []);

  const handleStep3DraftChange = useCallback((financial: FinancialInfo, loanRequest: LoanRequest) => {
    setState((prev) => ({ ...prev, financial, loanRequest }));
  }, []);

  const handleStep4DraftChange = useCallback((owner: OwnerInfo, hasAdditionalOwners: boolean | null, ownerHomeSameAsBusiness: boolean) => {
    setState((prev) => ({ ...prev, owners: [owner], hasAdditionalOwners, ownerHomeSameAsBusiness }));
  }, []);

  // Fetch public tenant settings once on mount for branding / redirect URL
  useEffect(() => {
    api.get<{ success: boolean; data: TenantSettings }>('/api/tenant/settings', token ?? undefined)
      .then((res) => setTenantSettings(res.data))
      .catch(() => { /* non-fatal — overlay works without settings */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject CSS custom properties for tenant theming
  useEffect(() => {
    if (!tenantSettings) return;
    const root = document.documentElement;
    if (tenantSettings.accentColor) root.style.setProperty('--color-accent', tenantSettings.accentColor);
    if (tenantSettings.surfaceColor) root.style.setProperty('--color-surface', tenantSettings.surfaceColor);
  }, [tenantSettings]);

  // Apply tenant theme (dark/light). A user override in localStorage wins.
  useTheme(tenantSettings?.theme ?? null);

  // ── Analytics: keystroke tracking, field-level events, abandonment ──
  const analytics = useAnalytics(state.applicationId, token);

  // Track step views whenever step changes
  useEffect(() => {
    analytics.trackStep(state.currentStep, 'step_view');
  }, [state.currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.currentStep !== 2) setAiPageContext(null);
  }, [state.currentStep]);

  // Flush analytics on tab hide / page close (abandonment detection)
  useEffect(() => {
    const handleBeforeUnload = () => {
      analytics.trackStep(state.currentStep, 'step_abandon');
      analytics.flush();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) analytics.flush();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureApplication = useCallback(async (contact?: ContactInfo): Promise<string> => {
    if (state.applicationId) return state.applicationId;
    if (!contact) throw new Error('Contact info required to create application');
    const res = await api.post<{ success: boolean; data: { id: string } }>('/api/applications', {
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      tcpaConsent: contact.tcpaConsent,
    }, token ?? undefined);
    const id = res.data.id;
    setState((prev) => ({ ...prev, applicationId: id }));
    return id;
  }, [state.applicationId, token]);

  const saveSection = useCallback(async (path: string, body: unknown, appId: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, isSaving: true }));
    try {
      await api.put(`/api/forms/${appId}/${path}`, body, token ?? undefined);
      setState((prev) => ({ ...prev, isSaving: false, lastSaved: new Date().toISOString() }));
      return true;
    } catch (err) {
      console.error('Save error:', err);
      setState((prev) => ({ ...prev, isSaving: false }));
      return false;
    }
  }, [token]);

  const advanceStep = useCallback(async (nextStep: number) => {
    if (!state.applicationId) return;
    analytics.trackStep(state.currentStep, 'step_complete');
    await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: nextStep }, token ?? undefined);
    setState((prev) => ({ ...prev, currentStep: nextStep }));
  }, [state.applicationId, state.currentStep, token, analytics]);

  const goBackOneSection = useCallback(async () => {
    const previousStep = Math.max(1, state.currentStep - 1);
    if (previousStep === state.currentStep) return;

    // If the merchant backs up to Step 1 after chat-captured TCPA consent,
    // clear the one-shot signal so Step1 doesn't immediately auto-submit again.
    if (previousStep === 1) setChatTcpaConsented(false);
    setState((prev) => ({ ...prev, currentStep: previousStep }));
    if (!state.applicationId) return;

    try {
      await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: previousStep }, token ?? undefined);
    } catch (err) {
      console.warn('Unable to sync previous step:', err);
    }
  }, [state.applicationId, state.currentStep, token]);

  const handleChatNavigateToField = useCallback(async (field: { step: number; fieldKey: string }) => {
    const targetStep = Math.min(Math.max(field.step, 1), 5);
    setAiFocusField(field.fieldKey);
    setState((prev) => ({ ...prev, currentStep: targetStep }));

    if (!state.applicationId) return;
    try {
      await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: targetStep }, token ?? undefined);
    } catch (err) {
      console.warn('Unable to sync AI navigation step:', err);
    }
  }, [state.applicationId, token]);

  const handleChatFieldAnswer = useCallback((field: { step: number; fieldKey: string }, rawValue: string): boolean => {
    const value = rawValue.trim();
    if (!value || field.fieldKey === 'owner.ssn' || field.fieldKey === 'owner.dateOfBirth') return false;
    const lower = value.toLowerCase();
    if (looksLikeHostileOrProfane(value)) return false;

    if (field.fieldKey === 'contact.tcpaConsent' || field.fieldKey === 'tcpaConsent') {
      const agreed = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'agree', 'agreed', 'i agree',
        'i consent', 'consent', 'absolutely', 'definitely', 'of course', 'sounds good', 'go ahead']
        .some((w) => lower === w || lower.startsWith(w));
      if (!agreed) return false;
      setChatTcpaConsented(true);
      return true;
    }

    const homeBasedAnswer = ['no', 'nope', 'false', 'not home based', 'not home-based'].some((w) => lower === w || lower.includes(w))
      ? false
      : ['yes', 'yeah', 'yep', 'true', 'home based', 'home-based'].some((w) => lower === w || lower.includes(w))
        ? true
        : null;

    const supportedFieldKeys = new Set([
      'business.legalName', 'business.stateOfFormation', 'business.ein', 'business.entityType', 'business.industry',
      'business.businessStartDate', 'business.streetAddress', 'business.city', 'business.state', 'business.zipCode', 'contact.email', 'contact.phone',
      'application.homeBasedBusiness', 'financial.annualRevenue', 'loanRequest.amountRequested', 'owner.firstName',
      'owner.lastName', 'owner.ownershipPct', 'owner.creditScore', 'owner.streetAddress', 'owner.city', 'owner.state', 'owner.zipCode',
    ]);
    if (!supportedFieldKeys.has(field.fieldKey)) return false;
    if (field.fieldKey === 'application.homeBasedBusiness' && homeBasedAnswer === null) return false;
    const normalizedIndustry = field.fieldKey === 'business.industry' ? normalizeIndustryValue(value) : null;
    if (field.fieldKey === 'business.industry' && !normalizedIndustry) return false;

    setState((prev) => {
      const owner = prev.owners[0] || {
        ownerIndex: 0, firstName: '', lastName: '', email: prev.contact.email, phone: prev.contact.phone,
        ownershipPct: '', ssn: '', dateOfBirth: '', creditScore: '', streetAddress: '', streetAddress2: '', city: '', state: '', zipCode: '',
      } as OwnerInfo;

      switch (field.fieldKey) {
        case 'business.legalName': return { ...prev, currentStep: field.step, business: { ...prev.business, legalName: value } };
        case 'business.stateOfFormation': return { ...prev, currentStep: field.step, business: { ...prev.business, stateOfFormation: value.toUpperCase() } };
        case 'business.ein': return { ...prev, currentStep: field.step, business: { ...prev.business, ein: value.replace(/[^0-9-]/g, '') } };
        case 'business.entityType': return { ...prev, currentStep: field.step, business: { ...prev.business, entityType: value as BusinessInfo['entityType'] } };
        case 'business.industry': return { ...prev, currentStep: field.step, business: { ...prev.business, industry: normalizedIndustry || value } };
        case 'business.businessStartDate': return { ...prev, currentStep: field.step, business: { ...prev.business, businessStartDate: value } };
        case 'business.streetAddress': return { ...prev, currentStep: field.step, business: { ...prev.business, streetAddress: value } };
        case 'business.city': return { ...prev, currentStep: field.step, business: { ...prev.business, city: value } };
        case 'business.state': return { ...prev, currentStep: field.step, business: { ...prev.business, state: value.toUpperCase() } };
        case 'business.zipCode': return { ...prev, currentStep: field.step, business: { ...prev.business, zipCode: value } };
        case 'contact.email': return { ...prev, currentStep: field.step, contact: { ...prev.contact, email: value } };
        case 'contact.phone': return { ...prev, currentStep: field.step, contact: { ...prev.contact, phone: value } };
        case 'application.homeBasedBusiness': {
          return { ...prev, currentStep: field.step, homeAddressSameAsBusiness: homeBasedAnswer ?? false };
        }
        case 'financial.annualRevenue': return { ...prev, currentStep: field.step, financial: { ...prev.financial, annualRevenue: value } };
        case 'loanRequest.amountRequested': return { ...prev, currentStep: field.step, loanRequest: { ...prev.loanRequest, amountRequested: value } };
        case 'owner.firstName': return { ...prev, currentStep: field.step, owners: [{ ...owner, firstName: value }] };
        case 'owner.lastName': return { ...prev, currentStep: field.step, owners: [{ ...owner, lastName: value }] };
        case 'owner.ownershipPct': return { ...prev, currentStep: field.step, owners: [{ ...owner, ownershipPct: value.replace(/[^0-9.]/g, '') }] };
        case 'owner.creditScore': return { ...prev, currentStep: field.step, owners: [{ ...owner, creditScore: value.slice(0, 40) }] };
        case 'owner.streetAddress': return { ...prev, currentStep: field.step, owners: [{ ...owner, streetAddress: value }] };
        case 'owner.city': return { ...prev, currentStep: field.step, owners: [{ ...owner, city: value }] };
        case 'owner.state': return { ...prev, currentStep: field.step, owners: [{ ...owner, state: value.toUpperCase() }] };
        case 'owner.zipCode': return { ...prev, currentStep: field.step, owners: [{ ...owner, zipCode: value }] };
        default: return prev;
      }
    });

    return true;
  }, []);

  // Step 1: Contact + Business Identity + EIN + Lookup → Step 2
  const handleStep1Next = useCallback(async (contact: ContactInfo) => {
    const appId = await ensureApplication(contact);
    const prefilledOwner: OwnerInfo = {
      ownerIndex: 0, firstName: '', lastName: '',
      email: contact.email, phone: contact.phone,
      ownershipPct: '', ssn: '', dateOfBirth: '', creditScore: '',
      streetAddress: '', streetAddress2: '', city: '', state: '', zipCode: '',
    };
    setState((prev) => ({ ...prev, contact, owners: [prefilledOwner], currentStep: 2 }));
    await api.patch(`/api/applications/${appId}/step`, { currentStep: 2 }, token ?? undefined);
  }, [ensureApplication, token]);

  // Step 2: Compiled Business Details → Step 3
  const handleStep2Next = useCallback(async (businessData: BusinessInfo, homeAddrSame: boolean) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, business: businessData, homeAddressSameAsBusiness: homeAddrSame }));
    const ok = await saveSection('business', businessData, appId);
    if (!ok) {
      alert('We could not save your business information. Please double-check the form and try again.');
      return;
    }
    await api.patch(`/api/applications/${appId}`, { homeBasedBusiness: homeAddrSame }, token ?? undefined);
    await advanceStep(3);
  }, [state.applicationId, saveSection, advanceStep, token]);

  // Step 3: Revenue + Funding → Step 4
  const handleStep3Next = useCallback(async (financial: FinancialInfo, loanRequest: LoanRequest) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, financial, loanRequest }));
    const ok1 = await saveSection('financial', { annualRevenue: financial.annualRevenue }, appId);
    const ok2 = await saveSection('loan', loanRequest, appId);
    if (!ok1 || !ok2) {
      alert('We could not save your financial information. Please try again.');
      return;
    }
    await advanceStep(4);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 4: Owner Details + Additional Owners → Step 5
  const handleStep4Next = useCallback(async (owner: OwnerInfo, hasAdditional: boolean | null, ownerHomeSameAsBusiness: boolean) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, owners: [owner], hasAdditionalOwners: hasAdditional, ownerHomeSameAsBusiness }));
    const ok = await saveSection('owners', owner, appId);
    if (!ok) {
      alert('We could not save the owner details. Please try again.');
      return;
    }
    await api.patch(`/api/applications/${appId}`, { hasAdditionalOwners: hasAdditional, ownerHomeSameAsBusiness }, token ?? undefined);
    await advanceStep(5);
  }, [state.applicationId, saveSection, advanceStep, token]);

  // Auto-populate handler from business lookup
  const handleAutoPopulate = useCallback((data: Partial<BusinessInfo>) => {
    const normalizedData = {
      ...data,
      ...(data.phone !== undefined ? { phone: normalizeUsPhoneDigits(data.phone) } : {}),
    };
    const now = new Date().toISOString();
    const fieldSources = normalizedData.fieldSources || {};
    const memory = Object.fromEntries(
      Object.keys(normalizedData)
        .filter((key) => !['fieldSources', 'autoPopulated'].includes(key))
        .map((key) => [key, {
          autoFilled: true,
          source: fieldSources[key] || 'form',
          editedByMerchant: false,
          skipped: false,
          updatedAt: now,
        }])
    );
    setState((prev) => ({
      ...prev,
      business: {
        ...prev.business,
        ...normalizedData,
        autoPopulated: { ...(prev.business.autoPopulated || {}), ...memory },
      },
    }));
  }, []);

  const [pdfDownloading, setPdfDownloading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!state.applicationId) return;
    setPdfDownloading(true);
    try {
      const headers: HeadersInit = { 'x-tenant-slug': TENANT_SLUG };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/applications/${state.applicationId}/pdf`, { headers });
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `application-${state.applicationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Unable to download PDF. Please try again.');
    } finally {
      setPdfDownloading(false);
    }
  }, [state.applicationId, token]);

  if (submittedAt) {
    return state.applicationId ? (
      <>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full max-w-2xl">
            {/* Bank statements is intentionally not a visible step in the bar
                (would deter merchants from finishing). Before final submit we
                sit on "Review & Sign" with sub-progress walking 80% → 97%.
                Once /finalize succeeds (hasFinalized=true) we jump past the
                last visible step so all five circles show ✓ and the bar fills
                to 100% — and stays there even after the overlay is dismissed. */}
            <ProgressBar
              currentStep={hasFinalized ? 6 : 5}
              subProgress={hasFinalized ? 0 : Math.min(uploadedDocumentsCount / 4, 1) * 0.85}
            />
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <span aria-hidden="true">✓</span> {hasFinalized ? 'Application submitted' : 'Application signed'}
          </span>
        </div>
        <BankStatementUpload
          applicationId={state.applicationId}
          submittedAt={submittedAt}
          token={token}
          pdfDownloading={pdfDownloading}
          onDownloadPdf={handleDownloadPdf}
          onComplete={handleComplete}
          onDocumentsCountChange={handleDocumentsCountChange}
        />
        {isComplete && (
          <CompletionOverlay
            ownerFirstName={state.contact.firstName || undefined}
            companyName={tenantSettings?.companyName ?? null}
            websiteUrl={tenantSettings?.websiteUrl ?? null}
            supportEmail={tenantSettings?.supportEmail ?? null}
            onClose={handleCloseComplete}
          />
        )}
        <ChatWidget applicationId={state.applicationId} token={token} formState={state} pageContext={aiPageContext} onNavigateToField={handleChatNavigateToField} onApplyFieldAnswer={handleChatFieldAnswer} />
      </>
    ) : null;
  }

  return (
    <AnalyticsContext.Provider value={analytics}>
      <div>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full max-w-2xl">
            <ProgressBar currentStep={state.currentStep} />
          </div>
          <SaveIndicator isSaving={state.isSaving} lastSaved={state.lastSaved} />
        </div>

        {state.currentStep === 1 && (
          <Step1EINLookup business={state.business} contact={state.contact} onAutoPopulate={handleAutoPopulate} onNext={handleStep1Next} token={token} onDraftChange={handleStep1DraftChange} chatTcpaConsentSignal={chatTcpaConsented} />
        )}
        {state.currentStep === 2 && (
          <Step2ConfirmBusiness business={state.business} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            onNext={handleStep2Next} onBack={() => void goBackOneSection()} onDraftChange={handleStep2DraftChange} onAiPageContextChange={setAiPageContext} />
        )}
        {state.currentStep === 3 && (
          <Step4Revenue financial={state.financial} loanRequest={state.loanRequest} onNext={handleStep3Next} onBack={() => void goBackOneSection()} onDraftChange={handleStep3DraftChange} />
        )}
        {state.currentStep === 4 && (
          <Step6OwnerDetails owner={state.owners[0] || {} as OwnerInfo} contact={state.contact} business={state.business}
            hasAdditionalOwners={state.hasAdditionalOwners} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            aiFocusField={aiFocusField} onAiFocusHandled={() => setAiFocusField(null)}
            showEstimatedCreditScore={tenantSettings?.showEstimatedCreditScore ?? true}
            onNext={handleStep4Next} onBack={() => void goBackOneSection()} onDraftChange={handleStep4DraftChange} />
          )}
        {state.currentStep === 5 && (
          <Step8ReviewSign
            state={state}
            privacy={tenantSettings ? {
              showContactEmail: tenantSettings.pdfShowContactEmail,
              showContactPhone: tenantSettings.pdfShowContactPhone,
              showAnnualRevenue: tenantSettings.pdfShowAnnualRevenue,
              showAmountRequested: tenantSettings.pdfShowAmountRequested,
              showEstimatedCreditScore: tenantSettings.showEstimatedCreditScore,
            } : undefined}
            onBack={() => void goBackOneSection()}
            onSubmitted={setSubmittedAt}
            token={token}
          />
        )}
        <ChatWidget applicationId={state.applicationId} token={token} formState={state} pageContext={aiPageContext} onNavigateToField={handleChatNavigateToField} onApplyFieldAnswer={handleChatFieldAnswer} />
      </div>
    </AnalyticsContext.Provider>
  );
}

function looksLikeHostileOrProfane(value: string): boolean {
  const lower = value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [
    /\bf+u+c+k+\b/i,
    /\bshit+\b/i,
    /\bass+hole\b/i,
    /\bbitch+\b/i,
    /\bcunt+\b/i,
    /\bdick+\b/i,
    /\bmotherf/i,
    /\bshut up\b/i,
    /\bgo away\b/i,
    /\bleave me alone\b/i,
    /\bnot interested\b/i,
  ].some((pattern) => pattern.test(lower));
}

function normalizeIndustryValue(value: string): string | null {
  const lower = value.trim().toLowerCase();
  return INDUSTRIES.find((industry) => industry.toLowerCase() === lower) || null;
}

