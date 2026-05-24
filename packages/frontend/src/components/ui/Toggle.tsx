import React from 'react';
import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Accessible iOS-style toggle. Click anywhere on the row flips the state. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition',
        'hover:border-cyan-300/30 hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-cyan-300/40',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span className="flex-1">
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        {description && <span className="mt-1 block text-xs text-slate-400">{description}</span>}
      </span>
      <span
        className={cn(
          'mt-0.5 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-cyan-400/80' : 'bg-slate-700/60',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
