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
  primary: 'border border-cyan-400/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(59,130,246,0.4)_45%,rgba(15,23,42,0.88))] text-white shadow-[0_10px_30px_rgba(34,211,238,0.18)] hover:border-cyan-300/60 hover:brightness-110',
  secondary: 'border border-white/12 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1] hover:border-white/20',
  ghost: 'border border-transparent bg-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white',
  danger: 'border border-red-400/40 bg-red-500/20 text-red-50 hover:bg-red-500/30 hover:border-red-300/50',
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

