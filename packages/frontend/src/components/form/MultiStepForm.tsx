'use client';
import { useState, useCallback, useRef } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { Step1Business } from './steps/Step1Business';
import { Step2EINLookup } from './steps/Step2EINLookup';
import { Step3OwnersFinancials } from './steps/Step3OwnersFinancials';
import { Step4LoanRequest } from './steps/Step4LoanRequest';
import { Step5ReviewSign } from './steps/Step5ReviewSign';
import type { FormState, BusinessInfo, OwnerInfo, FinancialInfo, LoanRequest } from '@/types/application';
import { api } from '@/lib/api';

const EMPTY_BUSINESS: BusinessInfo = {
  legalName: '', dba: '', entityType: '', industry: '', stateOfFormation: '',
  ein: '', businessStartDate: '', phone: '', website: '',
  streetAddress: '', streetAddress2: '', city: '', state: '', zipCode: '',
  sicCode: '', naicsCode: '',
};
const EMPTY_FINANCIAL: FinancialInfo = {
  annualRevenue: '', monthlyRevenue: '', monthlyExpenses: '', outstandingDebts: '',
  bankruptcyHistory: null, bankName: '', accountType: '',
};
const EMPTY_LOAN: LoanRequest = { amountRequested: '', purpose: '', urgency: '', termPreference: '' };

interface Props { token: string | null; }

export function MultiStepForm({ token }: Props) {
  const [state, setState] = useState<FormState>({
    applicationId: null,
    currentStep: 1,
    business: EMPTY_BUSINESS,
    owners: [],
    financial: EMPTY_FINANCIAL,
    loanRequest: EMPTY_LOAN,
    isSaving: false,
    lastSaved: null,
  });
  const [autoPopulated, setAutoPopulated] = useState<Record<string, boolean>>({});
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensureApplication = useCallback(async (): Promise<string> => {
    if (state.applicationId) return state.applicationId;
    const res = await api.post<{ success: boolean; data: { id: string } }>('/api/applications', {}, token);
    const id = res.data.id;
    setState((prev) => ({ ...prev, applicationId: id }));
    return id;
  }, [state.applicationId, token]);

  const saveSection = useCallback(async (path: string, body: unknown, appId: string) => {
    setState((prev) => ({ ...prev, isSaving: true }));
    try {
      await api.put(`/api/forms/${appId}/${path}`, body, token);
      setState((prev) => ({ ...prev, isSaving: false, lastSaved: new Date().toISOString() }));
    } catch (err) {
      console.error('Save error:', err);
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [token]);

  const advanceStep = useCallback(async (nextStep: number) => {
    if (!state.applicationId) return;
    await api.patch(`/api/applications/${state.applicationId}/step`, { currentStep: nextStep }, token);
    setState((prev) => ({ ...prev, currentStep: nextStep }));
  }, [state.applicationId, token]);

  const handleStep1Next = useCallback(async (business: BusinessInfo) => {
    const appId = await ensureApplication();
    setState((prev) => ({ ...prev, business }));
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveSection('business', { ...business, autoPopulated }, appId), 300);
    await advanceStep(2);
  }, [ensureApplication, saveSection, advanceStep, autoPopulated]);

  const handleStep2Next = useCallback(async () => {
    await advanceStep(3);
  }, [advanceStep]);

  const handleStep3Next = useCallback(async (owners: OwnerInfo[], financial: FinancialInfo) => {
    const appId = await ensureApplication();
    setState((prev) => ({ ...prev, owners, financial }));
    for (const owner of owners) {
      await saveSection('owners', owner, appId);
    }
    await saveSection('financial', {
      ...financial,
      annualRevenue: financial.annualRevenue ? Number(financial.annualRevenue) : undefined,
      monthlyRevenue: financial.monthlyRevenue ? Number(financial.monthlyRevenue) : undefined,
      monthlyExpenses: financial.monthlyExpenses ? Number(financial.monthlyExpenses) : undefined,
      outstandingDebts: financial.outstandingDebts ? Number(financial.outstandingDebts) : undefined,
    }, appId);
    await advanceStep(4);
  }, [ensureApplication, saveSection, advanceStep]);

  const handleStep4Next = useCallback(async (loanRequest: LoanRequest) => {
    const appId = await ensureApplication();
    setState((prev) => ({ ...prev, loanRequest }));
    await saveSection('loan', {
      ...loanRequest,
      amountRequested: loanRequest.amountRequested ? Number(loanRequest.amountRequested) : undefined,
    }, appId);
    await advanceStep(5);
  }, [ensureApplication, saveSection, advanceStep]);

  const handleAutoPopulate = useCallback((data: Partial<BusinessInfo>, populated: Record<string, boolean>) => {
    setAutoPopulated(populated);
    setState((prev) => ({ ...prev, business: { ...prev.business, ...data } }));
  }, []);

  if (submittedAt) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
        <p className="text-gray-600 mb-1">Your application has been received and is under review.</p>
        <p className="text-xs text-gray-400">Signed at: {new Date(submittedAt).toISOString()}</p>
        {state.applicationId && (
          <a
            href={`/api/applications/${state.applicationId}/pdf`}
            className="mt-5 inline-block text-violet-700 underline text-sm"
          >
            Download Signed PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <ProgressBar currentStep={state.currentStep} />
        <div className="flex justify-end mt-1">
          <SaveIndicator isSaving={state.isSaving} lastSaved={state.lastSaved} />
        </div>
      </div>

      {state.currentStep === 1 && (
        <Step1Business
          defaultValues={state.business}
          autoPopulated={autoPopulated}
          onNext={handleStep1Next}
          isSaving={state.isSaving}
          applicationId={state.applicationId}
          token={token}
        />
      )}
      {state.currentStep === 2 && (
        <Step2EINLookup
          business={state.business}
          onAutoPopulate={handleAutoPopulate}
          onNext={handleStep2Next}
          onBack={() => setState((p) => ({ ...p, currentStep: 1 }))}
          token={token}
        />
      )}
      {state.currentStep === 3 && (
        <Step3OwnersFinancials
          defaultOwners={state.owners}
          defaultFinancial={state.financial}
          onNext={handleStep3Next}
          onBack={() => setState((p) => ({ ...p, currentStep: 2 }))}
          isSaving={state.isSaving}
          applicationId={state.applicationId}
          token={token}
        />
      )}
      {state.currentStep === 4 && (
        <Step4LoanRequest
          defaultValues={state.loanRequest}
          onNext={handleStep4Next}
          onBack={() => setState((p) => ({ ...p, currentStep: 3 }))}
          isSaving={state.isSaving}
          applicationId={state.applicationId}
          token={token}
        />
      )}
      {state.currentStep === 5 && (
        <Step5ReviewSign
          state={state}
          onBack={() => setState((p) => ({ ...p, currentStep: 4 }))}
          onSubmitted={setSubmittedAt}
          token={token}
        />
      )}
    </div>
  );
}

