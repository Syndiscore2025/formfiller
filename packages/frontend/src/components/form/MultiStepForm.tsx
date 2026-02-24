'use client';
import { useState, useCallback, useEffect } from 'react';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { Step1EINLookup } from './steps/Step1EINLookup';
import { Step2ConfirmBusiness } from './steps/Step2ConfirmBusiness';
import { Step4Revenue } from './steps/Step4Revenue';
import { Step6OwnerDetails } from './steps/Step6OwnerDetails';
import { Step8ReviewSign } from './steps/Step8ReviewSign';
import type { FormState, ContactInfo, BusinessInfo, OwnerInfo, FinancialInfo, LoanRequest } from '@/types/application';
import { api } from '@/lib/api';
import { useAnalytics, AnalyticsContext } from '@/hooks/useAnalytics';

const EMPTY_CONTACT: ContactInfo = { firstName: '', lastName: '', email: '', phone: '', tcpaConsent: false };
const EMPTY_BUSINESS: BusinessInfo = {
  legalName: '', dba: '', entityType: '', industry: '', stateOfFormation: '',
  ein: '', businessStartDate: '', phone: '', website: '',
  streetAddress: '', streetAddress2: '', city: '', state: '', zipCode: '',
  sicCode: '', naicsCode: '',
};
const EMPTY_FINANCIAL: FinancialInfo = { annualRevenue: '' };
const EMPTY_LOAN: LoanRequest = { amountRequested: '', purpose: '', urgency: '', termPreference: '' };

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

  const saveSection = useCallback(async (path: string, body: unknown, appId: string) => {
    setState((prev) => ({ ...prev, isSaving: true }));
    try {
      await api.put(`/api/forms/${appId}/${path}`, body, token ?? undefined);
      setState((prev) => ({ ...prev, isSaving: false, lastSaved: new Date().toISOString() }));
    } catch (err) {
      console.error('Save error:', err);
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [token]);

  const advanceStep = useCallback(async (nextStep: number) => {
    if (!state.applicationId) return;
    analytics.trackStep(state.currentStep, 'step_complete');
    await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: nextStep }, token ?? undefined);
    setState((prev) => ({ ...prev, currentStep: nextStep }));
  }, [state.applicationId, state.currentStep, token, analytics]);

  // Step 1: Contact + Business Identity + EIN + Lookup → Step 2
  const handleStep1Next = useCallback(async (contact: ContactInfo) => {
    const appId = await ensureApplication(contact);
    const prefilledOwner: OwnerInfo = {
      ownerIndex: 0, firstName: contact.firstName, lastName: contact.lastName,
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
    await saveSection('business', businessData, appId);
    await advanceStep(3);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 3: Revenue + Funding → Step 4
  const handleStep3Next = useCallback(async (financial: FinancialInfo, loanRequest: LoanRequest) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, financial, loanRequest }));
    await saveSection('financial', { annualRevenue: financial.annualRevenue }, appId);
    await saveSection('loan', loanRequest, appId);
    await advanceStep(4);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 4: Owner Details + Additional Owners → Step 5
  const handleStep4Next = useCallback(async (owner: OwnerInfo, hasAdditional: boolean | null) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, owners: [owner], hasAdditionalOwners: hasAdditional }));
    await saveSection('owners', owner, appId);
    await api.patch(`/api/applications/${appId}`, { hasAdditionalOwners: hasAdditional }, token ?? undefined);
    await advanceStep(5);
  }, [state.applicationId, saveSection, advanceStep, token]);

  // Auto-populate handler from business lookup
  const handleAutoPopulate = useCallback((data: Partial<BusinessInfo>) => {
    setState((prev) => ({ ...prev, business: { ...prev.business, ...data } }));
  }, []);

  if (submittedAt) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Submitted!</h2>
        <p className="text-gray-600 mb-1">Your request has been received and is under review.</p>
        <p className="text-xs text-gray-400">Signed at: {new Date(submittedAt).toISOString()}</p>
        {state.applicationId && (
          <a href={`/api/applications/${state.applicationId}/pdf`} className="mt-5 inline-block text-violet-700 underline text-sm">
            Download Signed PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <AnalyticsContext.Provider value={analytics}>
      <div>
        <div className="flex justify-end mb-4">
          <SaveIndicator isSaving={state.isSaving} lastSaved={state.lastSaved} />
        </div>

        {state.currentStep === 1 && (
          <Step1EINLookup business={state.business} onAutoPopulate={handleAutoPopulate} onNext={handleStep1Next} token={token} />
        )}
        {state.currentStep === 2 && (
          <Step2ConfirmBusiness business={state.business} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            onNext={handleStep2Next} onBack={() => setState((p) => ({ ...p, currentStep: 1 }))} />
        )}
        {state.currentStep === 3 && (
          <Step4Revenue financial={state.financial} loanRequest={state.loanRequest} onNext={handleStep3Next} onBack={() => setState((p) => ({ ...p, currentStep: 2 }))} />
        )}
        {state.currentStep === 4 && (
          <Step6OwnerDetails owner={state.owners[0] || {} as OwnerInfo} contact={state.contact} business={state.business}
            hasAdditionalOwners={state.hasAdditionalOwners} homeAddressSameAsBusiness={state.homeAddressSameAsBusiness}
            onNext={handleStep4Next} onBack={() => setState((p) => ({ ...p, currentStep: 3 }))} />
          )}
        {state.currentStep === 5 && (
          <Step8ReviewSign state={state} onBack={() => setState((p) => ({ ...p, currentStep: 4 }))} onSubmitted={setSubmittedAt} token={token} />
        )}
      </div>
    </AnalyticsContext.Provider>
  );
}

