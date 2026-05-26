import React from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'border border-sky-700 bg-sky-600 text-white shadow-[0_8px_22px_rgba(2,132,199,0.26)] hover:border-sky-800 hover:bg-sky-700',
  secondary: 'border border-white/12 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1] hover:border-white/20',
  ghost: 'border border-transparent bg-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white',
  danger: 'border border-red-600 bg-red-600 text-white hover:bg-red-500 hover:border-red-500',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      data-variant={variant}
      suppressHydrationWarning
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

