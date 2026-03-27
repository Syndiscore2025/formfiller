import React from 'react';
import { cn } from '@/lib/cn';
import { useAnalyticsContext } from '@/hooks/useAnalytics';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  autoPopulated?: boolean;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, autoPopulated, required, className, id, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '_');
    const analytics = useAnalyticsContext();
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-100">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
          {autoPopulated && (
            <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Auto-filled
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={inputId}
          suppressHydrationWarning
          className={cn(
            'w-full rounded-xl border bg-slate-950/55 px-3.5 py-3 text-sm text-slate-100 shadow-inner shadow-black/10',
            'placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40',
            'disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-slate-400',
            autoPopulated && 'border-cyan-400/30 bg-cyan-400/[0.07]',
            !autoPopulated && 'border-white/10',
            error && 'border-red-400/60 focus:ring-red-400/30',
            className
          )}
          onFocus={(e) => { analytics?.onFocus(inputId); onFocus?.(e); }}
          onBlur={(e) => { analytics?.onBlur(inputId); onBlur?.(e); }}
          onKeyDown={(e) => { analytics?.onKeyDown(inputId); onKeyDown?.(e); }}
          {...props}
        />
        {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

