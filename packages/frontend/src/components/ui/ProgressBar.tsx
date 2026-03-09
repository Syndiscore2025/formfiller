'use client';
import { STEPS } from '@/types/application';
import { cn } from '@/lib/cn';

interface ProgressBarProps {
  currentStep: number;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const pct = Math.round(((currentStep - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="w-full">
      {/* Step labels */}
      <div className="flex justify-between mb-2">
        {STEPS.map((step) => (
          <div key={step.id} className="flex flex-col items-center flex-1">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all',
                step.id < currentStep && 'border-cyan-300/40 bg-cyan-400/20 text-cyan-100',
                step.id === currentStep && 'border-cyan-300/60 bg-white/10 text-white shadow-[0_0_20px_rgba(34,211,238,0.2)]',
                step.id > currentStep && 'border-white/10 bg-white/[0.03] text-slate-500'
              )}
            >
              {step.id < currentStep ? '✓' : step.id}
            </div>
            <span
              className={cn(
                'text-xs mt-1 font-medium text-center leading-tight hidden sm:block',
                step.id <= currentStep ? 'text-slate-200' : 'text-slate-500'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.9),rgba(96,165,250,0.9))] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">{pct}% complete</span>
        <span className="text-xs text-slate-400">Step {currentStep} of {STEPS.length}</span>
      </div>
    </div>
  );
}

