'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  hasAdditionalOwners: boolean | null;
  onNext: (hasAdditional: boolean) => void;
  onBack: () => void;
}

export function Step7AdditionalOwners({ hasAdditionalOwners, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<boolean | null>(hasAdditionalOwners);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (selected === null) {
      setError('Please select an option');
      return;
    }
    setSubmitting(true);
    try {
      onNext(selected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Additional Owners</h2>
      <p className="text-sm text-gray-500 mb-6">
        Are there any other owners with 20% or more ownership in the business?
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => { setSelected(true); setError(''); }}
          className={`w-full py-4 px-5 rounded-lg border-2 text-left font-medium transition-colors ${
            selected === true
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          Yes, there are other owners with 20%+ ownership
        </button>
        <button
          type="button"
          onClick={() => { setSelected(false); setError(''); }}
          className={`w-full py-4 px-5 rounded-lg border-2 text-left font-medium transition-colors ${
            selected === false
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          No, I am the only owner with 20%+ ownership
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <p className="text-xs text-gray-400 mt-4">
        If yes, our team will follow up to collect their information separately.
      </p>

      <div className="flex gap-3 justify-between mt-8">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Continue →
        </Button>
      </div>
    </div>
  );
}

