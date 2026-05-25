'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormState } from '@/types/application';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  nextField?: ChatReply['nextField'];
}

interface ChatReply {
  message: string;
  nextField: { step: number; stepName: string; fieldKey: string; label: string; question: string } | null;
  suggestedActions: string[];
}

interface Props {
  open: boolean;
  applicationId: string | null;
  token: string | null;
  formState: FormState;
  onNavigateToField?: (field: NonNullable<ChatReply['nextField']>) => void;
  onClose: () => void;
}

export function ChatDrawer({ open, applicationId, token, formState, onNavigateToField, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const introMessage = useMemo<ChatMessage>(() => ({
    id: 'intro',
    role: 'assistant',
    content: applicationId
      ? 'Hi — I can help you complete this small-business funding application one step at a time. Ask me a question, or I can point you to the next missing item.'
      : 'Hi — I can help once your application is started. Begin with your business name, state, email, phone, and EIN or sole proprietorship selection.',
  }), [applicationId]);

  useEffect(() => {
    if (!open || !applicationId) {
      setMessages([introMessage]);
      return;
    }

    setError('');
    api.get<{ success: boolean; data: ChatMessage[] }>(`/api/chat/${applicationId}/history`, token ?? undefined)
      .then((res) => setMessages(res.data.length ? res.data : [introMessage]))
      .catch(() => setMessages([introMessage]));
  }, [open, applicationId, token, introMessage]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (preset?: string) => {
    const message = (preset ?? draft).trim();
    if (!message || loading) return;

    if (!applicationId) {
      setMessages((current) => [
        ...current,
        { id: createLocalId(), role: 'user', content: message },
        { id: createLocalId(), role: 'assistant', content: 'Please start the application first so I can securely track where you left off.' },
      ]);
      setDraft('');
      return;
    }

    setError('');
    setDraft('');
    setMessages((current) => [...current, { id: createLocalId(), role: 'user', content: message }]);
    setLoading(true);

    try {
      const res = await api.post<{ success: boolean; data: ChatReply }>(
        `/api/chat/${applicationId}/message`,
        { message, clientState: buildSafeClientState(formState) },
        token ?? undefined,
      );
      setMessages((current) => [...current, { id: createLocalId(), role: 'assistant', content: res.data.message, nextField: res.data.nextField }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/55 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">AI Funding Assistant</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Application help</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
              For security, identity details like SSN and DOB belong only in the secure form fields — not chat.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/[0.06]">
            Close
          </button>
        </header>

        <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 bg-white/[0.05] text-slate-100'}`}>
                {message.content}
                {message.role === 'assistant' && message.nextField && onNavigateToField && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToField(message.nextField!);
                      onClose();
                    }}
                    className="mt-3 block rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-400/15"
                  >
                    {isSecureIdentityField(message.nextField) ? 'Go to secure verification fields' : `Go to ${message.nextField.stepName}`}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && <p className="text-sm text-slate-400">Assistant is typing…</p>}
        </div>

        <div className="border-t border-white/10 p-4">
          {error && <p className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void sendMessage('What should I do next?')} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/[0.06]">What next?</button>
            <button type="button" onClick={() => void sendMessage('What funding amounts and terms are available?')} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/[0.06]">Funding ranges</button>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={3}
            placeholder="Ask about this funding application…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-slate-500">Sensitive identity info is transmitted through the secure form, not this chat.</p>
            <Button type="button" size="sm" onClick={() => void sendMessage()} disabled={!draft.trim()} loading={loading}>Send</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isSecureIdentityField(field: ChatReply['nextField']): boolean {
  return field?.fieldKey === 'owner.ssn' || field?.fieldKey === 'owner.dateOfBirth';
}

function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSafeClientState(state: FormState) {
  const owner = state.owners[0];
  return {
    applicationId: state.applicationId,
    currentStep: state.currentStep,
    contact: { hasEmail: Boolean(state.contact.email), hasPhone: Boolean(state.contact.phone) },
    business: state.business,
    financial: state.financial,
    loanRequest: state.loanRequest,
    owner: owner ? {
      ...owner,
      ssn: owner.ssn ? 'present' : '',
      dateOfBirth: owner.dateOfBirth ? 'present' : '',
    } : null,
    hasAdditionalOwners: state.hasAdditionalOwners,
    homeAddressSameAsBusiness: state.homeAddressSameAsBusiness,
    ownerHomeSameAsBusiness: state.ownerHomeSameAsBusiness,
  };
}