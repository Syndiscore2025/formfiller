'use client';

interface SaveIndicatorProps {
  isSaving: boolean;
  lastSaved: string | null;
}

export function SaveIndicator({ isSaving, lastSaved }: SaveIndicatorProps) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-xs text-violet-600">
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Saving...
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="text-xs text-green-600">
        ✓ Saved {new Date(lastSaved).toLocaleTimeString()}
      </span>
    );
  }
  return null;
}

