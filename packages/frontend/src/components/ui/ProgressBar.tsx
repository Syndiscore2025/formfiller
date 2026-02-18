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
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                step.id < currentStep && 'bg-violet-700 border-violet-700 text-white',
                step.id === currentStep && 'bg-white border-violet-700 text-violet-700',
                step.id > currentStep && 'bg-white border-gray-300 text-gray-400'
              )}
            >
              {step.id < currentStep ? '✓' : step.id}
            </div>
            <span
              className={cn(
                'text-xs mt-1 font-medium text-center leading-tight hidden sm:block',
                step.id <= currentStep ? 'text-violet-700' : 'text-gray-400'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Bar */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-violet-700 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-500">{pct}% complete</span>
        <span className="text-xs text-gray-500">Step {currentStep} of {STEPS.length}</span>
      </div>
    </div>
  );
}

