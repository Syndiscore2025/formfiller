'use client';
import { useState, useCallback, useRef } from 'react';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { Step1EINLookup } from './steps/Step1EINLookup';
import { Step2ConfirmBusiness } from './steps/Step2ConfirmBusiness';
import { Step3BusinessDetails } from './steps/Step3BusinessDetails';
import { Step4Revenue } from './steps/Step4Revenue';
import { Step5FundingRequest } from './steps/Step5FundingRequest';
import { Step6OwnerDetails } from './steps/Step6OwnerDetails';
import { Step7AdditionalOwners } from './steps/Step7AdditionalOwners';
import { Step8ReviewSign } from './steps/Step8ReviewSign';
import type { FormState, ContactInfo, BusinessInfo, OwnerInfo, FinancialInfo, LoanRequest } from '@/types/application';
import { api } from '@/lib/api';

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
    businessConfirmed: null,
    owners: [],
    financial: EMPTY_FINANCIAL,
    loanRequest: EMPTY_LOAN,
    hasAdditionalOwners: null,
    isSaving: false,
    lastSaved: null,
  });
  const [lookupSucceeded, setLookupSucceeded] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: nextStep }, token ?? undefined);
    setState((prev) => ({ ...prev, currentStep: nextStep }));
  }, [state.applicationId, token]);

  // Step 1: Contact info + EIN lookup
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

  // Step 2: Confirm auto-populated business
  const handleStep2Confirm = useCallback(async (confirmed: boolean) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, businessConfirmed: confirmed }));
    // If confirmed, skip Step 3 → go to Step 4 (Revenue)
    const nextStep = confirmed ? 4 : 3;
    // Save business info if confirmed
    if (confirmed && state.business.legalName) {
      await saveSection('business', state.business, appId);
    }
    await advanceStep(nextStep);
  }, [state.applicationId, state.business, saveSection, advanceStep]);

  // Step 3: Manual business details (only if not confirmed)
  const handleStep3Next = useCallback(async (data: Partial<BusinessInfo>) => {
    const appId = state.applicationId;
    if (!appId) return;
    const updatedBusiness = { ...state.business, ...data };
    setState((prev) => ({ ...prev, business: updatedBusiness }));
    await saveSection('business', updatedBusiness, appId);
    await advanceStep(4);
  }, [state.applicationId, state.business, saveSection, advanceStep]);

  // Step 4: Revenue
  const handleStep4Next = useCallback(async (financial: FinancialInfo) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, financial }));
    await saveSection('financial', { annualRevenue: financial.annualRevenue }, appId);
    await advanceStep(5);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 5: Funding request
  const handleStep5Next = useCallback(async (loanRequest: LoanRequest) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, loanRequest }));
    await saveSection('loan', loanRequest, appId);
    await advanceStep(6);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 6: Owner details
  const handleStep6Next = useCallback(async (owner: OwnerInfo) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, owners: [owner] }));
    await saveSection('owners', owner, appId);
    await advanceStep(7);
  }, [state.applicationId, saveSection, advanceStep]);

  // Step 7: Additional owners flag
  const handleStep7Next = useCallback(async (hasAdditional: boolean) => {
    const appId = state.applicationId;
    if (!appId) return;
    setState((prev) => ({ ...prev, hasAdditionalOwners: hasAdditional }));
    // Save the flag to backend
    await api.patch(`/api/applications/${appId}`, { hasAdditionalOwners: hasAdditional }, token ?? undefined);
    await advanceStep(8);
  }, [state.applicationId, advanceStep, token]);

  // Auto-populate handler from EIN lookup
  const handleAutoPopulate = useCallback((data: Partial<BusinessInfo>) => {
    setLookupSucceeded(Boolean(data.legalName));
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

  // Determine back step for Step 4 (skip Step 3 if business was confirmed)
  const step4BackStep = state.businessConfirmed ? 2 : 3;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <SaveIndicator isSaving={state.isSaving} lastSaved={state.lastSaved} />
      </div>

      {state.currentStep === 1 && (
        <Step1EINLookup business={state.business} onAutoPopulate={handleAutoPopulate} onNext={handleStep1Next} token={token} />
      )}
      {state.currentStep === 2 && (
        <Step2ConfirmBusiness business={state.business} lookupSucceeded={lookupSucceeded} onConfirm={handleStep2Confirm} />
      )}
      {state.currentStep === 3 && (
        <Step3BusinessDetails business={state.business} onNext={handleStep3Next} onBack={() => setState((p) => ({ ...p, currentStep: 2 }))} />
      )}
      {state.currentStep === 4 && (
        <Step4Revenue financial={state.financial} onNext={handleStep4Next} onBack={() => setState((p) => ({ ...p, currentStep: step4BackStep }))} />
      )}
      {state.currentStep === 5 && (
        <Step5FundingRequest loanRequest={state.loanRequest} onNext={handleStep5Next} onBack={() => setState((p) => ({ ...p, currentStep: 4 }))} />
      )}
      {state.currentStep === 6 && (
        <Step6OwnerDetails owner={state.owners[0] || {} as OwnerInfo} contact={state.contact} onNext={handleStep6Next} onBack={() => setState((p) => ({ ...p, currentStep: 5 }))} />
      )}
      {state.currentStep === 7 && (
        <Step7AdditionalOwners hasAdditionalOwners={state.hasAdditionalOwners} onNext={handleStep7Next} onBack={() => setState((p) => ({ ...p, currentStep: 6 }))} />
      )}
      {state.currentStep === 8 && (
        <Step8ReviewSign state={state} onBack={() => setState((p) => ({ ...p, currentStep: 7 }))} onSubmitted={setSubmittedAt} token={token} />
      )}
    </div>
  );
}

