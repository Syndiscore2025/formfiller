'use client';
import { useState } from 'react';
import { BusinessInfo, DataSource } from '@/types/application';
import { Button } from '@/components/ui/Button';

interface Props {
  business: BusinessInfo;
  lookupSucceeded: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function Step2ConfirmBusiness({ business, lookupSucceeded, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const fieldSources = business.fieldSources || {};

  // Count fields from each source
  const sourceCount = Object.values(fieldSources).reduce(
    (acc, source) => {
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    },
    {} as Record<DataSource, number>
  );

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
      <p className="text-sm text-gray-500 mb-4">
        We found the following information. Please confirm if this is correct.
      </p>

      {/* Source summary badges */}
      <div className="flex gap-2 mb-4">
        {sourceCount.opencorporates && (
          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            {sourceCount.opencorporates} from Public Records
          </span>
        )}
        {sourceCount.google_places && (
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            {sourceCount.google_places} from Google
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
        <InfoRow label="Business Name" value={business.legalName} source={fieldSources.legalName} />
        {business.entityType && <InfoRow label="Entity Type" value={formatEntityType(business.entityType)} source={fieldSources.entityType} />}
        {business.streetAddress && (
          <InfoRow
            label="Address"
            value={`${business.streetAddress}${business.city ? `, ${business.city}` : ''}${business.state ? `, ${business.state}` : ''} ${business.zipCode || ''}`}
            source={fieldSources.streetAddress}
          />
        )}
        {business.phone && <InfoRow label="Phone" value={formatPhone(business.phone)} source={fieldSources.phone} />}
        {business.website && <InfoRow label="Website" value={business.website} source={fieldSources.website} />}
        {business.stateOfFormation && <InfoRow label="State of Formation" value={business.stateOfFormation} source={fieldSources.stateOfFormation} />}
        {business.businessStartDate && <InfoRow label="Registration Date" value={business.businessStartDate} source={fieldSources.registrationDate} />}
        {business.sicCode && <InfoRow label="SIC Code" value={business.sicCode} source={fieldSources.sicCode} />}
        {business.naicsCode && <InfoRow label="NAICS Code" value={business.naicsCode} source={fieldSources.naicsCode} />}
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

function InfoRow({ label, value, source }: { label: string; value: string; source?: DataSource }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
        {source && <SourceBadge source={source} />}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: DataSource }) {
  if (source === 'opencorporates') {
    return <span className="w-2 h-2 bg-blue-500 rounded-full" title="Public Records" />;
  }
  if (source === 'google_places') {
    return <span className="w-2 h-2 bg-green-500 rounded-full" title="Google" />;
  }
  return null;
}

function formatPhone(phone: string): string {
  // Format 10-digit phone as (XXX) XXX-XXXX
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
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

