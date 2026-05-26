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
  onApplyFieldAnswer?: (field: NonNullable<ChatReply['nextField']>, value: string) => boolean;
  onClose: () => void;
}

const PRE_APP_CHAT_KEY = 'formfiller.preApplicationChat.v2';

export function ChatDrawer({ open, applicationId, token, formState, onNavigateToField, onApplyFieldAnswer, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatStopped, setChatStopped] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const introMessage = useMemo<ChatMessage>(() => ({
    id: 'intro',
    role: 'assistant',
    content: 'Hi! I’m your funding assistant. Is there anything you need help with today? I can explain a form field, answer general funding-process questions, or help you pick up where you left off.',
  }), [applicationId]);

  useEffect(() => {
    if (!open) return;

    if (!applicationId) {
      setMessages((current) => current.length ? current : loadPreApplicationMessages(introMessage));
      return;
    }

    setError('');
    api.get<{ success: boolean; data: ChatMessage[] }>(`/api/chat/${applicationId}/history`, token ?? undefined)
      .then((res) => setMessages(res.data.length ? res.data : [introMessage]))
      .catch(() => setMessages([introMessage]));
  }, [open, applicationId, token, introMessage]);

  useEffect(() => {
    if (applicationId || !messages.length || typeof window === 'undefined') return;
    window.localStorage.setItem(PRE_APP_CHAT_KEY, JSON.stringify(messages.slice(-20)));
  }, [applicationId, messages]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (preset?: string) => {
    const message = (preset ?? draft).trim();
    if (!message || loading || chatStopped) return;

    setError('');
    setDraft('');
    const pendingField = lastAssistantField(messages);
    const shouldApply = pendingField && shouldAutoApplyFieldAnswer(pendingField, message);
    const appliedField = shouldApply && onApplyFieldAnswer?.(pendingField, message)
      ? { fieldKey: pendingField.fieldKey, value: message }
      : null;
    setMessages((current) => [...current, { id: createLocalId(), role: 'user', content: message }]);
    setLoading(true);

    try {
      const res = await api.post<{ success: boolean; data: ChatReply }>(
        applicationId ? `/api/chat/${applicationId}/message` : '/api/chat/message',
        { message, clientState: buildSafeClientState(formState, appliedField, messages) },
        token ?? undefined,
      );
      if (!res.data.suggestedActions.length && !res.data.nextField && isOptOutMessage(res.data.message)) {
        setChatStopped(true);
      }
      setMessages((current) => [...current, { id: createLocalId(), role: 'assistant', content: res.data.message, nextField: res.data.nextField }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-24 right-5 z-[70] flex h-[min(720px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl" role="dialog" aria-modal="false">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/80 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">AI Funding Assistant</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
              Live application chat
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Online
              </span>
            </h2>
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
                    suppressHydrationWarning
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
            <button type="button" suppressHydrationWarning onClick={() => void sendMessage('What should I do next?')} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/[0.06]">What next?</button>
            <button type="button" suppressHydrationWarning onClick={() => void sendMessage('Can you explain how funding review works?')} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/[0.06]">Funding review</button>
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
            placeholder={chatStopped ? 'Chat stopped for this session.' : 'Ask about this funding application…'}
            className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
            disabled={chatStopped}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-slate-500">Sensitive identity info is transmitted through the secure form, not this chat.</p>
            <Button type="button" size="sm" onClick={() => void sendMessage()} disabled={!draft.trim() || chatStopped} loading={loading}>Send</Button>
          </div>
        </div>
    </div>
  );
}

function isOptOutMessage(message: string): boolean {
  return message.toLowerCase().includes('i will stop this chat interaction');
}

function isSecureIdentityField(field: ChatReply['nextField']): boolean {
  return field?.fieldKey === 'owner.ssn' || field?.fieldKey === 'owner.dateOfBirth';
}

function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function lastAssistantField(messages: ChatMessage[]): ChatReply['nextField'] {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.nextField)?.nextField ?? null;
}

function shouldAutoApplyFieldAnswer(field: NonNullable<ChatReply['nextField']>, rawValue: string): boolean {
  if (isSecureIdentityField(field)) return false;
  const value = rawValue.trim();
  if (!value || looksLikeQuestionOrObjection(value)) return false;

  switch (field.fieldKey) {
    case 'contact.email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'contact.phone': return value.replace(/[^0-9]/g, '').length >= 10;
    case 'business.ein': return /^\d{2}-?\d{7}$/.test(value) || /sole propriet/i.test(value);
    case 'business.stateOfFormation':
    case 'business.state':
    case 'owner.state': return /^[A-Za-z]{2}$/.test(value) || value.length > 3;
    case 'business.zipCode':
    case 'owner.zipCode': return /^\d{5}(?:-\d{4})?$/.test(value);
    case 'owner.ownershipPct': return /^\d{1,3}(?:\.\d+)?%?$/.test(value);
    case 'financial.annualRevenue':
    case 'loanRequest.amountRequested': return value.length <= 80;
    default: return value.length <= 120;
  }
}

function looksLikeQuestionOrObjection(value: string): boolean {
  const lower = value.toLowerCase();
  if (value.includes('?')) return true;
  return [
    'how ', 'what ', 'why ', 'when ', 'where ', 'who ', 'can ', 'could ', 'should ', 'do i ', 'do you ',
    'is this', 'are you', 'help', 'rate', 'term', 'payment', 'approved', 'qualify', 'legit', 'scam',
    'secure', 'bank statement', 'upload', 'ein?', 'find my ein', 'i don\'t know', 'i dont know',
  ].some((phrase) => lower.startsWith(phrase) || lower.includes(` ${phrase}`));
}

function loadPreApplicationMessages(introMessage: ChatMessage): ChatMessage[] {
  if (typeof window === 'undefined') return [introMessage];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRE_APP_CHAT_KEY) || '[]') as ChatMessage[];
    return Array.isArray(parsed) && parsed.length ? parsed : [introMessage];
  } catch {
    return [introMessage];
  }
}

function buildSafeClientState(state: FormState, appliedField?: { fieldKey: string; value: string } | null, messages: ChatMessage[] = []) {
  const owner = state.owners[0];
  return {
    applicationId: state.applicationId,
    currentStep: state.currentStep,
    appliedField: appliedField || undefined,
    recentAssistantMessages: messages.filter((message) => message.role === 'assistant').slice(-8).map((message) => message.content),
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