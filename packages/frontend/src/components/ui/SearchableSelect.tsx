'use client';

import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { useAnalyticsContext } from '@/hooks/useAnalytics';

interface SearchableSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  autoPopulated?: boolean;
  id?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Start typing to search',
  error,
  hint,
  required,
  autoPopulated,
  id,
  disabled,
}: SearchableSelectProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '_');
  const analytics = useAnalyticsContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return [...options];
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedQuery]);

  const selectOption = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    analytics?.onKeyDown(inputId);

    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setQuery('');
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    }
  };

  const inputValue = isOpen ? (query || value) : value;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-semibold text-slate-100">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
        {autoPopulated && (
          <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Auto-filled
          </span>
        )}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          suppressHydrationWarning
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            'w-full rounded-xl border bg-slate-950/55 px-3.5 py-3 pr-11 text-sm text-slate-100 shadow-inner shadow-black/10',
            'placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40',
            'disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-slate-400',
            autoPopulated && 'border-cyan-400/30 bg-cyan-400/[0.07]',
            !autoPopulated && 'border-white/10',
            error && 'border-red-400/60 focus:ring-red-400/30'
          )}
          onFocus={(event) => {
            analytics?.onFocus(inputId);
            setIsOpen(true);
            event.currentTarget.select();
          }}
          onBlur={() => analytics?.onBlur(inputId)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={isOpen ? 'Close options' : 'Open options'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-200"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setIsOpen((current) => !current);
            if (isOpen) setQuery('');
          }}
        >
          <span className={cn('text-xs transition-transform', isOpen && 'rotate-180')}>▼</span>
        </button>
      </div>

      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_18px_50px_rgba(2,8,23,0.75)] backdrop-blur-xl">
          <div className="max-h-64 overflow-y-auto py-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm text-slate-200 transition',
                    index === highlightedIndex && 'bg-cyan-400/10 text-white',
                    option === value && 'text-cyan-200'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <span>{option}</span>
                  {option === value && <span className="text-xs uppercase tracking-[0.2em] text-cyan-300">Selected</span>}
                </button>
              ))
            ) : (
              <div className="px-3.5 py-3 text-sm text-slate-400">No matching options found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}