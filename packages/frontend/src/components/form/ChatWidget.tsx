'use client';

import { useState } from 'react';
import type { FormState } from '@/types/application';
import { ChatDrawer } from './ChatDrawer';

interface Props {
  applicationId: string | null;
  token: string | null;
  formState: FormState;
  onNavigateToField?: (field: { step: number; fieldKey: string }) => void;
}

export function ChatWidget({ applicationId, token, formState, onNavigateToField }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[60] rounded-full border border-cyan-300/30 bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300"
        aria-label="Open AI funding assistant"
      >
        💬 Funding Assistant
      </button>
      <ChatDrawer
        open={open}
        applicationId={applicationId}
        token={token}
        formState={formState}
        onNavigateToField={onNavigateToField}
        onClose={() => setOpen(false)}
      />
    </>
  );
}