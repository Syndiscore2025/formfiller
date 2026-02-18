'use client';
import { useRef, useCallback } from 'react';
import { api } from '@/lib/api';

type EventType =
  | 'field_focus' | 'field_blur' | 'field_change'
  | 'typing_pause' | 'field_revisit'
  | 'step_view' | 'step_complete' | 'step_abandon' | 'form_submit';

interface AnalyticsEvent {
  fieldName?: string;
  eventType: EventType;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const PAUSE_THRESHOLD_MS = 3000;
const FLUSH_INTERVAL_MS = 10000;

export function useAnalytics(applicationId: string | null, token: string | null) {
  const queue = useRef<AnalyticsEvent[]>([]);
  const focusTimestamps = useRef<Record<string, number>>({});
  const pauseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const visitCounts = useRef<Record<string, number>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!applicationId || queue.current.length === 0) return;
    const batch = queue.current.splice(0, 100);
    try {
      await api.post(`/api/analytics/${applicationId}/events`, { events: batch }, token ?? undefined);
    } catch {
      // Re-queue on failure (fire-and-forget; do not block form)
      queue.current.unshift(...batch);
    }
  }, [applicationId, token]);

  const track = useCallback((event: AnalyticsEvent) => {
    queue.current.push(event);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, FLUSH_INTERVAL_MS);
  }, [flush]);

  const onFocus = useCallback((fieldName: string) => {
    focusTimestamps.current[fieldName] = Date.now();
    visitCounts.current[fieldName] = (visitCounts.current[fieldName] ?? 0) + 1;
    const eventType: EventType = visitCounts.current[fieldName] > 1 ? 'field_revisit' : 'field_focus';
    track({ fieldName, eventType });
  }, [track]);

  const onBlur = useCallback((fieldName: string) => {
    const start = focusTimestamps.current[fieldName];
    const durationMs = start ? Date.now() - start : undefined;
    if (pauseTimers.current[fieldName]) clearTimeout(pauseTimers.current[fieldName]);
    track({ fieldName, eventType: 'field_blur', durationMs });
  }, [track]);

  const onKeyDown = useCallback((fieldName: string) => {
    if (pauseTimers.current[fieldName]) clearTimeout(pauseTimers.current[fieldName]);
    pauseTimers.current[fieldName] = setTimeout(() => {
      track({ fieldName, eventType: 'typing_pause', metadata: { pauseMs: PAUSE_THRESHOLD_MS } });
    }, PAUSE_THRESHOLD_MS);
  }, [track]);

  const trackStep = useCallback((stepId: number, eventType: 'step_view' | 'step_complete' | 'step_abandon') => {
    track({ eventType, metadata: { stepId } });
    if (eventType === 'step_complete' || eventType === 'step_abandon') flush();
  }, [track, flush]);

  return { onFocus, onBlur, onKeyDown, trackStep, flush };
}

