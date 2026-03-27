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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function buildDate(year: number, monthIndex: number, day: number) {
  const candidate = new Date(year, monthIndex, day);
  return candidate.getFullYear() === year && candidate.getMonth() === monthIndex && candidate.getDate() === day
    ? candidate
    : null;
}

function parseIsoDate(value?: string | null) {
  const match = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return buildDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseDisplayDate(value?: string | null) {
  const match = (value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return buildDate(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
}

function formatDisplayDate(date?: Date | null) {
  if (!date) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function compareDates(left: Date, right: Date) {
  if (left.getFullYear() !== right.getFullYear()) return left.getFullYear() - right.getFullYear();
  if (left.getMonth() !== right.getMonth()) return left.getMonth() - right.getMonth();
  return left.getDate() - right.getDate();
}

function isSameDay(left: Date, right: Date) {
  return compareDates(left, right) === 0;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function isWithinRange(date: Date, minDate: Date | null, maxDate: Date | null) {
  if (minDate && compareDates(date, minDate) < 0) return false;
  if (maxDate && compareDates(date, maxDate) > 0) return false;
  return true;
}

function clampMonth(date: Date, minDate: Date | null, maxDate: Date | null) {
  const monthStart = startOfMonth(date);
  const minMonth = minDate ? startOfMonth(minDate) : null;
  const maxMonth = maxDate ? startOfMonth(maxDate) : null;
  if (minMonth && compareDates(monthStart, minMonth) < 0) return minMonth;
  if (maxMonth && compareDates(monthStart, maxMonth) > 0) return maxMonth;
  return monthStart;
}

function getCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
}

function sanitizeTypedDate(value: string) {
  const cleaned = value.replace(/[^0-9/]/g, '');
  if (!cleaned.includes('/')) {
    const digits = cleaned.slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  let result = '';
  let segment = 0;
  let segmentLength = 0;

  for (const character of cleaned) {
    if (character === '/') {
      if (segment >= 2 || segmentLength === 0 || result.endsWith('/')) continue;
      result += '/';
      segment += 1;
      segmentLength = 0;
      continue;
    }

    const maxLength = segment === 2 ? 4 : 2;
    if (segmentLength >= maxLength) continue;
    result += character;
    segmentLength += 1;
  }

  return result.slice(0, 10);
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
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const minDate = useMemo(() => parseIsoDate(min), [min]);
  const maxDate = useMemo(() => parseIsoDate(max), [max]);
  const currentYear = new Date().getFullYear();
  const today = useMemo(() => new Date(), []);

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(formatDisplayDate(selectedDate));
  const [internalError, setInternalError] = useState<string>();
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    if (selectedDate) return startOfMonth(selectedDate);
    return clampMonth(today, minDate, maxDate);
  });

  useEffect(() => {
    setInputValue(formatDisplayDate(selectedDate));
    setInternalError(undefined);
    setDisplayedMonth((current) => (selectedDate ? startOfMonth(selectedDate) : clampMonth(current, minDate, maxDate)));
  }, [selectedDate, minDate, maxDate]);

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
    const minYear = minDate?.getFullYear() || 1900;
    const maxYear = maxDate?.getFullYear() || currentYear;
    return Array.from({ length: Math.max(maxYear - minYear + 1, 0) }, (_, index) => String(maxYear - index));
  }, [currentYear, maxDate, minDate]);

  const selectedYear = displayedMonth.getFullYear();
  const selectedMonthIndex = displayedMonth.getMonth();
  const canGoPrev = !minDate || compareDates(addMonths(displayedMonth, -1), startOfMonth(minDate)) >= 0;
  const canGoNext = !maxDate || compareDates(addMonths(displayedMonth, 1), startOfMonth(maxDate)) <= 0;
  const calendarDays = useMemo(() => getCalendarDays(displayedMonth), [displayedMonth]);
  const monthOptions = useMemo(
    () => MONTHS.map((monthLabel, monthIndex) => ({
      value: String(monthIndex),
      label: monthLabel,
      disabled: Boolean(
        (minDate && selectedYear === minDate.getFullYear() && monthIndex < minDate.getMonth()) ||
        (maxDate && selectedYear === maxDate.getFullYear() && monthIndex > maxDate.getMonth()),
      ),
    })),
    [maxDate, minDate, selectedYear]
  );

  const commitDate = (date: Date | null, closePopover = false) => {
    if (!date) {
      setInputValue('');
      setInternalError(undefined);
      if (value) onChange('');
      if (closePopover) setOpen(false);
      return;
    }

    if (!isWithinRange(date, minDate, maxDate)) {
      setInternalError('Enter a valid date');
      return;
    }

    const nextIso = formatIsoDate(date);
    if (nextIso !== value) onChange(nextIso);
    setInputValue(formatDisplayDate(date));
    setDisplayedMonth(startOfMonth(date));
    setInternalError(undefined);
    if (closePopover) setOpen(false);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = sanitizeTypedDate(event.target.value);
    setInputValue(nextValue);
    setInternalError(undefined);

    if (!nextValue) {
      if (value) onChange('');
      return;
    }

    const parsed = parseDisplayDate(nextValue);
    if (parsed && isWithinRange(parsed, minDate, maxDate)) {
      const nextIso = formatIsoDate(parsed);
      if (nextIso !== value) onChange(nextIso);
      setDisplayedMonth(startOfMonth(parsed));
    }
  };

  const handleInputBlur = () => {
    if (!inputValue.trim()) {
      setInternalError(undefined);
      if (value) onChange('');
      return;
    }

    const parsed = parseDisplayDate(inputValue);
    if (!parsed || !isWithinRange(parsed, minDate, maxDate)) {
      setInternalError('Enter a valid date');
      return;
    }

    commitDate(parsed);
  };

  const activeError = internalError || error;

  const triggerClasses = cn(
    'w-full rounded-xl border bg-slate-950/55 px-3.5 py-3 pr-11 text-sm text-slate-100 shadow-inner shadow-black/10',
    'transition focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:border-cyan-300/40',
    disabled && 'cursor-not-allowed bg-white/[0.03] text-slate-400',
    autoPopulated && 'border-cyan-400/30 bg-cyan-400/[0.07]',
    !autoPopulated && 'border-white/10',
    activeError && 'border-red-400/60 focus:ring-red-400/30',
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

      <div className="relative">
        <input
          id={inputId}
          type="text"
          suppressHydrationWarning
          inputMode="numeric"
          placeholder="MM/DD/YYYY"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          value={inputValue}
          onFocus={() => !disabled && setOpen(true)}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className={cn(triggerClasses, 'placeholder:text-slate-500')}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute inset-y-0 right-3 my-auto h-8 w-8 rounded-lg text-slate-400 transition hover:bg-cyan-400/10 hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-500"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1m12 8H5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1zm-1-4H6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1" />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <div className="surface-panel-soft absolute left-0 top-[calc(100%+0.5rem)] z-[70] w-[20rem] max-w-[calc(100vw-2rem)] border border-cyan-400/20 bg-slate-950/85 p-4 shadow-[0_20px_80px_rgba(8,145,178,0.14)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Select date</p>
              <p className="mt-1 text-sm text-slate-300">{inputValue || 'MM/DD/YYYY'}</p>
            </div>
            <button type="button" onClick={() => commitDate(null)} className="text-xs font-medium text-slate-400 transition hover:text-slate-200">
              Clear
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => canGoPrev && setDisplayedMonth((current) => addMonths(current, -1))}
              disabled={!canGoPrev}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">←</span>
            </button>
            <select
              suppressHydrationWarning
              value={String(selectedMonthIndex)}
              onChange={(event) => setDisplayedMonth(clampMonth(new Date(selectedYear, Number(event.target.value), 1), minDate, maxDate))}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              suppressHydrationWarning
              value={String(selectedYear)}
              onChange={(event) => setDisplayedMonth(clampMonth(new Date(Number(event.target.value), selectedMonthIndex, 1), minDate, maxDate))}
              className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => canGoNext && setDisplayedMonth((current) => addMonths(current, 1))}
              disabled={!canGoNext}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((calendarDate) => {
              const inCurrentMonth = isSameMonth(calendarDate, displayedMonth);
              const isSelected = selectedDate ? isSameDay(calendarDate, selectedDate) : false;
              const isToday = isSameDay(calendarDate, today);
              const unavailable = !isWithinRange(calendarDate, minDate, maxDate);

              return (
                <button
                  key={calendarDate.toISOString()}
                  type="button"
                  disabled={unavailable}
                  onClick={() => commitDate(calendarDate, true)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-xl border text-sm transition',
                    unavailable && 'cursor-not-allowed border-transparent text-slate-600',
                    !unavailable && !isSelected && 'border-transparent text-slate-200 hover:border-cyan-300/40 hover:bg-cyan-400/10',
                    !inCurrentMonth && !isSelected && 'text-slate-500',
                    isToday && !isSelected && 'border-cyan-400/30 bg-cyan-400/5 text-cyan-100',
                    isSelected && 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]'
                  )}
                >
                  {calendarDate.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/15">
              Done
            </button>
          </div>
        </div>
      )}

      {hint && !activeError && <p className="text-xs text-slate-400">{hint}</p>}
      {activeError && <p className="text-xs text-red-600">{activeError}</p>}
    </div>
  );
}