import React from 'react';
import { cn } from '@/lib/cn';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[] | readonly string[];
  error?: string;
  required?: boolean;
  autoPopulated?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, required, autoPopulated, className, id, ...props }, ref) => {
    const selectId = id || label.toLowerCase().replace(/\s+/g, '_');
    const normalised: SelectOption[] = options.map((o) =>
      typeof o === 'string' ? { value: o, label: o } : o
    );
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-semibold text-gray-800">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
          {autoPopulated && (
            <span className="ml-2 text-xs font-normal text-violet-700 bg-violet-100 rounded px-1 py-0.5">
              Auto-filled
            </span>
          )}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2.5 text-sm text-gray-900',
            'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500',
            autoPopulated && 'border-violet-300 bg-violet-50',
            !autoPopulated && 'border-gray-300',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
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

