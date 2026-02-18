import React from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  autoPopulated?: boolean;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, autoPopulated, required, className, id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '_');
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-semibold text-gray-800">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
          {autoPopulated && (
            <span className="ml-2 text-xs font-normal text-violet-700 bg-violet-100 rounded px-1 py-0.5">
              Auto-filled
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2.5 text-sm text-gray-900',
            'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500',
            autoPopulated && 'border-violet-300 bg-violet-50',
            !autoPopulated && 'border-gray-300',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

