'use client';
import { useState } from 'react';
import { BusinessInfo, US_STATES } from '@/types/application';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

interface LookupResult {
  found: boolean;
  data?: {
    legalName?: string;
    entityType?: string;
    stateOfFormation?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    registrationDate?: string;
    fieldsPopulated: string[];
  };
  message?: string;
}

interface Props {
  business: BusinessInfo;
  onAutoPopulate: (data: Partial<BusinessInfo>, populated: Record<string, boolean>) => void;
  onNext: () => void;
  onBack: () => void;
  token: string | null;
}

export function Step2EINLookup({ business, onAutoPopulate, onNext, onBack, token }: Props) {
  const [searchName, setSearchName] = useState(business.legalName || '');
  const [searchState, setSearchState] = useState(business.stateOfFormation || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    if (!searchName.trim() || !searchState) {
      setError('Business name and state are required for lookup.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean } & LookupResult>(
        '/api/business/lookup',
        token ?? undefined,
        { businessName: searchName, state: searchState }
      );
      setResult(res);
      if (res.found && res.data) {
        const populated: Record<string, boolean> = {};
        res.data.fieldsPopulated.forEach((f) => { populated[f] = true; });
        onAutoPopulate({
          legalName: res.data.legalName,
          entityType: (res.data.entityType as BusinessInfo['entityType']) || undefined,
          stateOfFormation: res.data.stateOfFormation,
          streetAddress: res.data.streetAddress,
          city: res.data.city,
          state: res.data.state,
          zipCode: res.data.zipCode,
          businessStartDate: res.data.registrationDate,
        }, populated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Business Lookup & Auto-Population</h2>
      <p className="text-sm text-gray-500 mb-6">
        We'll search public business registries using your business name and state to pre-fill your application.
        You can skip this step and enter information manually.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Input
          label="Business Name"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Exact legal business name"
        />
        <Select
          label="State of Formation"
          value={searchState}
          onChange={(e) => setSearchState(e.target.value)}
          options={[...US_STATES]}
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <Button onClick={handleLookup} loading={loading} type="button" variant="secondary">
        🔍 Search Public Records
      </Button>

      {result && (
        <div className={`mt-5 p-4 rounded-lg border ${result.found ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
          {result.found && result.data ? (
            <>
              <p className="font-semibold text-green-800 mb-2">
                ✓ Found! {result.data.fieldsPopulated.length} fields auto-populated.
              </p>
              <ul className="text-sm text-green-700 list-disc list-inside space-y-1">
                {result.data.fieldsPopulated.map((f) => (
                  <li key={f}>{f.replace(/([A-Z])/g, ' $1').trim()}</li>
                ))}
              </ul>
              <p className="text-xs text-green-600 mt-2">Please review and correct any inaccurate fields on the previous step.</p>
            </>
          ) : (
            <p className="text-yellow-800 text-sm">{result.message ?? 'No data found. Please enter your information manually.'}</p>
          )}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onNext}>
          {result?.found ? 'Continue with Auto-filled Data' : 'Skip & Enter Manually'}
        </Button>
      </div>
    </div>
  );
}

