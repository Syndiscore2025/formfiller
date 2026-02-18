'use client';
import { useState } from 'react';
import { BusinessInfo } from '@/types/application';
import { Button } from '@/components/ui/Button';

interface Props {
  business: BusinessInfo;
  lookupSucceeded: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function Step2ConfirmBusiness({ business, lookupSucceeded, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleResponse = async (confirmed: boolean) => {
    setSubmitting(true);
    try {
      onConfirm(confirmed);
    } finally {
      setSubmitting(false);
    }
  };

  // If lookup didn't find anything, go straight to manual entry
  if (!lookupSucceeded || !business.legalName) {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Business Information</h2>
        <p className="text-sm text-gray-500 mb-6">
          We couldn&apos;t find your business in public records. Let&apos;s enter the details manually.
        </p>
        <div className="flex justify-end">
          <Button onClick={() => handleResponse(false)} loading={submitting}>
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Is this your business?</h2>
      <p className="text-sm text-gray-500 mb-6">
        We found the following information. Please confirm if this is correct.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
        <InfoRow label="Business Name" value={business.legalName} />
        {business.entityType && <InfoRow label="Entity Type" value={formatEntityType(business.entityType)} />}
        {business.streetAddress && (
          <InfoRow 
            label="Address" 
            value={`${business.streetAddress}${business.city ? `, ${business.city}` : ''}${business.state ? `, ${business.state}` : ''} ${business.zipCode || ''}`} 
          />
        )}
        {business.stateOfFormation && <InfoRow label="State of Formation" value={business.stateOfFormation} />}
        {business.businessStartDate && <InfoRow label="Registration Date" value={business.businessStartDate} />}
        {business.sicCode && <InfoRow label="SIC Code" value={business.sicCode} />}
        {business.naicsCode && <InfoRow label="NAICS Code" value={business.naicsCode} />}
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={() => handleResponse(false)} disabled={submitting}>
          No, let me edit
        </Button>
        <Button onClick={() => handleResponse(true)} loading={submitting}>
          Yes, this is correct
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function formatEntityType(type: string): string {
  const map: Record<string, string> = {
    LLC: 'LLC',
    C_CORP: 'C Corporation',
    S_CORP: 'S Corporation',
    SOLE_PROPRIETORSHIP: 'Sole Proprietorship',
    PARTNERSHIP: 'Partnership',
    NON_PROFIT: 'Non-Profit',
    OTHER: 'Other',
  };
  return map[type] || type;
}

