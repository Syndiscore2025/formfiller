'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  autoPopulated?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
}

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];

function parseIsoDate(value?: string | null) {
  const match = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

function daysInMonth(year: string, month: string) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function formatDisplay(month: string, day: string, year: string) {
  return `${month || 'MM'}/${day || 'DD'}/${year || 'YYYY'}`;
}

function getAllowedMonths(year: string, minDate: ReturnType<typeof parseIsoDate>, maxDate: ReturnType<typeof parseIsoDate>) {
  if (!year) return MONTHS;
  const minMonth = minDate?.year === year ? Number(minDate.month) : 1;
  const maxMonth = maxDate?.year === year ? Number(maxDate.month) : 12;
  return MONTHS.filter((month) => Number(month.value) >= minMonth && Number(month.value) <= maxMonth);
}

function getAllowedDays(year: string, month: string, minDate: ReturnType<typeof parseIsoDate>, maxDate: ReturnType<typeof parseIsoDate>) {
  if (!year || !month) return [] as string[];
  const lastDay = daysInMonth(year, month);
  const minDay = minDate?.year === year && minDate.month === month ? Number(minDate.day) : 1;
  const maxDay = maxDate?.year === year && maxDate.month === month ? Number(maxDate.day) : lastDay;
  return Array.from({ length: Math.max(maxDay - minDay + 1, 0) }, (_, index) => String(minDay + index).padStart(2, '0'));
}

export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  autoPopulated,
  disabled,
  min,
  max,
  id,
}: DateFieldProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '_');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const parsedValue = useMemo(() => parseIsoDate(value), [value]);
  const minDate = useMemo(() => parseIsoDate(min), [min]);
  const maxDate = useMemo(() => parseIsoDate(max), [max]);
  const currentYear = new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(parsedValue?.month || '');
  const [day, setDay] = useState(parsedValue?.day || '');
  const [year, setYear] = useState(parsedValue?.year || '');

  useEffect(() => {
    setMonth(parsedValue?.month || '');
    setDay(parsedValue?.day || '');
    setYear(parsedValue?.year || '');
  }, [parsedValue]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const yearOptions = useMemo(() => {
    const minYear = Number(minDate?.year || '1900');
    const maxYear = Number(maxDate?.year || String(currentYear));
    return Array.from({ length: Math.max(maxYear - minYear + 1, 0) }, (_, index) => String(maxYear - index));
  }, [currentYear, maxDate?.year, minDate?.year]);

  const monthOptions = useMemo(() => getAllowedMonths(year, minDate, maxDate), [year, minDate, maxDate]);
  const dayOptions = useMemo(() => getAllowedDays(year, month, minDate, maxDate), [year, month, minDate, maxDate]);

  const syncValue = (nextYear: string, nextMonth: string, nextDay: string) => {
    const nextValue = nextYear && nextMonth && nextDay ? `${nextYear}-${nextMonth}-${nextDay}` : '';
    if (nextValue !== value) onChange(nextValue);
  };

  const updateParts = (next: { year?: string; month?: string; day?: string }) => {
    let nextYear = next.year ?? year;
    let nextMonth = next.month ?? month;
    let nextDay = next.day ?? day;

    const allowedMonths = getAllowedMonths(nextYear, minDate, maxDate).map((option) => option.value);
    if (nextMonth && !allowedMonths.includes(nextMonth)) nextMonth = '';

    const allowedDays = getAllowedDays(nextYear, nextMonth, minDate, maxDate);
    if (nextDay && !allowedDays.includes(nextDay)) nextDay = '';

    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);
    syncValue(nextYear, nextMonth, nextDay);
  };

  const triggerClasses = cn(
    'flex w-full items-center justify-between rounded-xl border bg-slate-950/55 px-3.5 py-3 text-left text-sm shadow-inner shadow-black/10',
    'transition focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40',
    disabled && 'cursor-not-allowed bg-white/[0.03] text-slate-400',
    autoPopulated && 'border-cyan-400/30 bg-cyan-400/[0.07]',
    !autoPopulated && 'border-white/10',
    error && 'border-red-400/60 focus:ring-red-400/30',
  );

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-semibold text-slate-100">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
        {autoPopulated && (
          <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Auto-filled
          </span>
        )}
      </label>

      <button
        id={inputId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClasses}
      >
        <span className={cn(month && day && year ? 'text-slate-100' : 'text-slate-500')}>
          {formatDisplay(month, day, year)}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-slate-400">
          <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1m12 8H5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1zm-1-4H6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="surface-panel-soft absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] border border-cyan-400/20 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Select date</p>
              <p className="mt-1 text-sm text-slate-300">{formatDisplay(month, day, year)}</p>
            </div>
            <button type="button" onClick={() => updateParts({ year: '', month: '', day: '' })} className="text-xs font-medium text-slate-400 transition hover:text-slate-200">
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Month</span>
              <select value={month} onChange={(e) => updateParts({ month: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40">
                <option value="">MM</option>
                {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Day</span>
              <select value={day} onChange={(e) => updateParts({ day: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40">
                <option value="">DD</option>
                {dayOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Year</span>
              <select value={year} onChange={(e) => updateParts({ year: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40">
                <option value="">YYYY</option>
                {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/15">
              Done
            </button>
          </div>
        </div>
      )}

      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}