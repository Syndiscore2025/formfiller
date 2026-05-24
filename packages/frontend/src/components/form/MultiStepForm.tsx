'use client';
import { useState, useCallback, useEffect } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { BankStatementUpload } from './BankStatementUpload';
import { CompletionOverlay } from './CompletionOverlay';
import { Step1EINLookup } from './steps/Step1EINLookup';
import { Step2ConfirmBusiness } from './steps/Step2ConfirmBusiness';
import { Step4Revenue } from './steps/Step4Revenue';
import { Step6OwnerDetails } from './steps/Step6OwnerDetails';
import { Step8ReviewSign } from './steps/Step8ReviewSign';
import type { FormState, ContactInfo, BusinessInfo, OwnerInfo, FinancialInfo, LoanRequest } from '@/types/application';
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

    setState((prev) => ({ ...prev, currentStep: previousStep }));
    if (!state.applicationId) return;

    try {
      await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: previousStep }, token ?? undefined);
    } catch (err) {
      console.warn('Unable to sync previous step:', err);
    }
  }, [state.applicationId, state.currentStep, token]);

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
    await advanceStep(3);
  }, [state.applicationId, saveSection, advanceStep]);

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
  const handleStep4Next = useCallback(async (owner: OwnerInfo, hasAdditional: boolean | null) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, owners: [owner], hasAdditionalOwners: hasAdditional }));
    const ok = await saveSection('owners', owner, appId);
    if (!ok) {
      alert('We could not save the owner details. Please try again.');
      return;
    }
    await api.patch(`/api/applications/${appId}`, { hasAdditionalOwners: hasAdditional }, token ?? undefined);
    await advanceStep(5);
  }, [state.applicationId, saveSection, advanceStep, token]);

  // Auto-populate handler from business lookup
  const handleAutoPopulate = useCallback((data: Partial<BusinessInfo>) => {
    setState((prev) => ({ ...prev, business: { ...prev.business, ...data } }));
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
          <Step1EINLookup business={state.business} onAutoPopulate={handleAutoPopulate} onNext={handleStep1Next} token={token} />
        )}
        {state.currentStep === 2 && (
          <Step2ConfirmBusiness business={state.business} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            onNext={handleStep2Next} onBack={() => void goBackOneSection()} />
        )}
        {state.currentStep === 3 && (
          <Step4Revenue financial={state.financial} loanRequest={state.loanRequest} onNext={handleStep3Next} onBack={() => void goBackOneSection()} />
        )}
        {state.currentStep === 4 && (
          <Step6OwnerDetails owner={state.owners[0] || {} as OwnerInfo} contact={state.contact} business={state.business}
            hasAdditionalOwners={state.hasAdditionalOwners} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            onNext={handleStep4Next} onBack={() => void goBackOneSection()} />
          )}
        {state.currentStep === 5 && (
          <Step8ReviewSign
            state={state}
            privacy={tenantSettings ? {
              showContactEmail: tenantSettings.pdfShowContactEmail,
              showContactPhone: tenantSettings.pdfShowContactPhone,
              showAnnualRevenue: tenantSettings.pdfShowAnnualRevenue,
              showAmountRequested: tenantSettings.pdfShowAmountRequested,
            } : undefined}
            onBack={() => void goBackOneSection()}
            onSubmitted={setSubmittedAt}
            token={token}
          />
        )}
      </div>
    </AnalyticsContext.Provider>
  );
}

