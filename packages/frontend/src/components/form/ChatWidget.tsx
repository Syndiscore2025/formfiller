'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormState } from '@/types/application';
import { ChatDrawer } from './ChatDrawer';

interface Props {
  applicationId: string | null;
  token: string | null;
  formState: FormState;
  submittedAt?: string | null;
  pageContext?: Record<string, unknown> | null;
  onNavigateToField?: (field: { step: number; fieldKey: string }) => void;
  onApplyFieldAnswer?: (field: { step: number; fieldKey: string }, value: string) => boolean;
  onDisqualified?: (message: string) => void;
}

export function ChatWidget({ applicationId, token, formState, submittedAt, pageContext, onNavigateToField, onApplyFieldAnswer, onDisqualified }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
        submittedAt={submittedAt}
        pageContext={pageContext}
        onNavigateToField={onNavigateToField}
        onApplyFieldAnswer={onApplyFieldAnswer}
        onDisqualified={onDisqualified}
        onClose={() => setOpen(false)}
      />
    </>,
    document.body,
  );
}