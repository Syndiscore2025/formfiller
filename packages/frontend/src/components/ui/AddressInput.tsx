'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { useAnalyticsContext } from '@/hooks/useAnalytics';

interface AddressSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}

interface AddressDetails {
  placeId: string;
  formattedAddress?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface AddressInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  onSelectAddress: (address: AddressDetails) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function AddressInput({
  label,
  value,
  onChange,
  onSelectAddress,
  error,
  hint,
  required,
  className,
  id,
  disabled,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: AddressInputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '_');
  const normalizedValue = value || '';
  const analytics = useAnalyticsContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const skipNextLookupRef = useRef(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }
    if (disabled || normalizedValue.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = { input: normalizedValue.trim() };
        if (coords) {
          params.lat = String(coords.lat);
          params.lng = String(coords.lng);
        }
        const res = await api.get<{ success: boolean; data: AddressSuggestion[] }>('/api/business/autocomplete', undefined, params);
        if (cancelled) return;
        setSuggestions(res.data || []);
        setOpen(Boolean(res.data?.length) && document.activeElement === inputRef.current);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coords, disabled, normalizedValue]);

  const handleSelect = async (suggestion: AddressSuggestion) => {
    try {
      const res = await api.get<{ success: boolean; data: AddressDetails }>('/api/business/place', undefined, { placeId: suggestion.placeId });
      const nextStreet = res.data.streetAddress || suggestion.primaryText;
      skipNextLookupRef.current = true;
      onChange(nextStreet);
      onSelectAddress(res.data);
    } catch {
      skipNextLookupRef.current = true;
      onChange(suggestion.primaryText);
      onSelectAddress({ placeId: suggestion.placeId, streetAddress: suggestion.primaryText });
    } finally {
      setSuggestions([]);
      setOpen(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-semibold text-slate-100">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        suppressHydrationWarning
        value={normalizedValue}
        disabled={disabled}
        className={cn(
          'w-full rounded-xl border border-white/10 bg-slate-950/55 px-3.5 py-3 pr-10 text-sm text-slate-100 shadow-inner shadow-black/10',
          'placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/40',
          'disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-slate-400',
          error && 'border-red-400/60 focus:ring-red-400/30',
          className,
        )}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
          analytics?.onFocus(inputId);
          onFocus?.(e);
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={(e) => {
          analytics?.onBlur(inputId);
          onBlur?.(e);
          blurTimeoutRef.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          analytics?.onKeyDown(inputId);
          onKeyDown?.(e);
          if (e.key === 'Escape') setOpen(false);
        }}
        {...props}
      />
      {loading && <span className="absolute right-3 top-[38px] text-xs text-slate-500">…</span>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {open && suggestions.length > 0 && !disabled && (
        <div className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-1 shadow-[0_18px_50px_rgba(2,8,23,0.55)] backdrop-blur-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.05]"
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(suggestion);
              }}
            >
              <span className="text-sm font-medium text-slate-100">{suggestion.primaryText}</span>
              {suggestion.secondaryText && <span className="text-xs text-slate-400">{suggestion.secondaryText}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}