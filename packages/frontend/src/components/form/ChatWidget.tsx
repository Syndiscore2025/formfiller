'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormState } from '@/types/application';
import { ChatDrawer } from './ChatDrawer';

interface Props {
  applicationId: string | null;
  token: string | null;
  formState: FormState;
  pageContext?: Record<string, unknown> | null;
  onNavigateToField?: (field: { step: number; fieldKey: string }) => void;
  onApplyFieldAnswer?: (field: { step: number; fieldKey: string }, value: string) => boolean;
  autoOpen?: boolean;
}

export function ChatWidget({ applicationId, token, formState, pageContext, onNavigateToField, onApplyFieldAnswer, autoOpen }: Props) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Auto-open when parent signals it (e.g. step 2 with Google data)
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        suppressHydrationWarning
        className="fixed bottom-5 right-5 z-[60] rounded-full border border-cyan-300/30 bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300"
        aria-label="Open AI funding assistant"
      >
        💬 Need help? Chat now
      </button>
      <ChatDrawer
        open={open}
        applicationId={applicationId}
        token={token}
        formState={formState}
        pageContext={pageContext}
        onNavigateToField={onNavigateToField}
        onApplyFieldAnswer={onApplyFieldAnswer}
        onClose={() => setOpen(false)}
      />
    </>,
    document.body,
  );
}