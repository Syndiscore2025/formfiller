import React from 'react';
import { cn } from '@/lib/cn';
import { useAnalyticsContext } from '@/hooks/useAnalytics';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[] | readonly SelectOption[] | readonly string[];
  error?: string;
  required?: boolean;
  autoPopulated?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, required, autoPopulated, className, id, onFocus, onBlur, onChange, ...props }, ref) => {
    const selectId = id || label.toLowerCase().replace(/\s+/g, '_');
    const analytics = useAnalyticsContext();
    const normalised: SelectOption[] = options.map((o) =>
      typeof o === 'string' ? { value: o, label: o } : o
    );
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-semibold text-slate-100">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
          {autoPopulated && (
            <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Auto-filled
            </span>
          )}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full rounded-xl border bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 shadow-inner shadow-black/10',
            'focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40',
            'disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-slate-400',
            autoPopulated && 'border-cyan-400/30 bg-cyan-400/[0.07]',
            !autoPopulated && 'border-white/10',
            error && 'border-red-400/60 focus:ring-red-400/30',
            className
          )}
          onFocus={(e) => { analytics?.onFocus(selectId); onFocus?.(e); }}
          onBlur={(e) => { analytics?.onBlur(selectId); onBlur?.(e); }}
          onChange={(e) => { analytics?.onKeyDown(selectId); onChange?.(e); }}
          {...props}
        >
          <option value="">Please Select</option>
          {normalised.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

