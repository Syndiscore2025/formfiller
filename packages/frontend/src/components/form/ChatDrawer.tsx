'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { INDUSTRIES, type FormState } from '@/types/application';
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
  disqualified?: boolean;
  disqualificationCode?: string;
}

interface Props {
  open: boolean;
  applicationId: string | null;
  token: string | null;
  formState: FormState;
  submittedAt?: string | null;
  pageContext?: Record<string, unknown> | null;
  onNavigateToField?: (field: NonNullable<ChatReply['nextField']>) => void;
  onApplyFieldAnswer?: (field: NonNullable<ChatReply['nextField']>, value: string) => boolean;
  onDisqualified?: (message: string) => void;
  onClose: () => void;
}

const PRE_APP_CHAT_KEY = 'formfiller.preApplicationChat.v2';

// Static per-page guidance posted into the chat as the merchant moves through
// the application. Keyed by step number; the bank-statements page (post-sign)
// has its own message below. Each page is announced at most once per session.
const STEP_GUIDE_MESSAGES: Record<number, string> = {
  1: 'Welcome! Let\'s get you started. Enter your name, email, and mobile number, then your EIN or legal business name and we\'ll look up your business details for you. I\'m right here if you have any questions along the way.',
  2: 'Great start! Next, take a quick look at the business details we found. If anything looks off, just click the Edit button to fix it. One quick question to answer before continuing: is this a home-based business?',
  3: 'You\'re doing great! Now let\'s talk numbers. Pick your approximate annual revenue and how much funding you\'re looking for. Not sure which range fits? Just ask me.',
  4: 'Almost there! Next up is the owner\'s information. Quick security note: enter SSN and date of birth only in the secure form fields, never in this chat.',
  5: 'Home stretch! Give everything a quick once-over, then check the authorization box and sign. Happy to answer any last questions before you sign.',
};

const BANK_UPLOAD_GUIDE_MESSAGE =
  'You did it! Just one last step: upload your business bank statements as PDFs, then click Submit Application to wrap things up. If you have questions about which statements to upload, ask away.';

export function ChatDrawer({ open, applicationId, token, formState, submittedAt, pageContext, onNavigateToField, onApplyFieldAnswer, onDisqualified, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatStopped, setChatStopped] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const chatSessionIdRef = useRef(createLocalId());
  // Keep a stable ref to formState so we can read it inside effects without adding it to deps
  const formStateRef = useRef(formState);
  useEffect(() => { formStateRef.current = formState; });

  const introMessage = useMemo<ChatMessage>(() => ({
    id: 'intro',
    role: 'assistant',
    content: 'Hi there! I\'ll be right here with you while you complete the application. If you ever get stuck, just ask and I\'ll point you to the exact field or button you need.',
  }), []);

  useEffect(() => {
    if (!open) return;

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PRE_APP_CHAT_KEY);
    }

    // Seed the intro only when the conversation is empty. Never wipe existing
    // history — the chat must persist across the Step 1 → Step 2 transition
    // (when the applicationId is first created) and all later step changes.
    setMessages((current) => current.length ? current : [introMessage]);
  }, [open, introMessage]);

  // Pages already announced in chat (once per session). The Step 2 AI
  // transition below claims 'step-2' so the static fallback never duplicates it.
  const announcedPagesRef = useRef<Set<string>>(new Set());

  // When the application is created and the merchant lands on Step 2
  // (Confirm Business), inject one assistant transition message that asks them
  // to confirm the lookup results, use Edit if anything is off, and answer the
  // home-based business question — but only if the chat was already in use.
  const transitionRequestedRef = useRef(false);
  useEffect(() => {
    if (!open || !applicationId || transitionRequestedRef.current) return;
    if (formState.currentStep !== 2) return;
    if (announcedPagesRef.current.has('step-2')) return;
    if (!messages.some((message) => message.role === 'user')) return;
    transitionRequestedRef.current = true;
    announcedPagesRef.current.add('step-2');

    setLoading(true);
    api.post<{ success: boolean; data: ChatReply }>(
      `/api/chat/${applicationId}/post-consent-transition`,
      { clientState: buildSafeClientState(formStateRef.current, pageContext, chatSessionIdRef.current, null, messages) },
      token ?? undefined,
    ).then((res) => {
      if (res.data.disqualified) {
        setChatStopped(true);
        onDisqualified?.(res.data.message);
      }
      setMessages((current) => [...current, { id: createLocalId(), role: 'assistant', content: res.data.message, nextField: res.data.nextField }]);
    }).catch(() => {
      // Non-fatal: the merchant can keep chatting normally.
    }).finally(() => {
      setLoading(false);
    });
  }, [open, applicationId, formState.currentStep, messages, pageContext, token, onDisqualified]);

  // Follow the merchant: whenever they land on a new page with the chat open
  // (or open the chat mid-application), post that page's static guidance once.
  // Runs after the Step 2 AI transition effect so it never double-announces.
  useEffect(() => {
    if (!open || chatStopped) return;
    const pageKey = submittedAt ? 'bank-upload' : `step-${formState.currentStep}`;
    if (announcedPagesRef.current.has(pageKey)) return;
    const guide = submittedAt ? BANK_UPLOAD_GUIDE_MESSAGE : STEP_GUIDE_MESSAGES[formState.currentStep];
    if (!guide) return;
    announcedPagesRef.current.add(pageKey);
    setMessages((current) => [...current, { id: createLocalId(), role: 'assistant', content: guide }]);
  }, [open, chatStopped, submittedAt, formState.currentStep]);

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

    // Consent is a transition action. Keep it to one clean assistant message
    // instead of calling the API and then also injecting the Step 2 greeting.
    if (appliedField?.fieldKey === 'tcpaConsent' || appliedField?.fieldKey === 'contact.tcpaConsent') {
      return;
    }

    setLoading(true);

    try {
      const res = await api.post<{ success: boolean; data: ChatReply }>(
        applicationId ? `/api/chat/${applicationId}/message` : '/api/chat/message',
        { message, clientState: buildSafeClientState(formState, pageContext, chatSessionIdRef.current, appliedField, messages) },
        token ?? undefined,
      );
      if (!res.data.suggestedActions.length && !res.data.nextField && isOptOutMessage(res.data.message)) {
        setChatStopped(true);
      }
      if (res.data.disqualified) {
        setChatStopped(true);
        onDisqualified?.(res.data.message);
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
              For security, identity details like SSN and DOB belong only in the secure form fields, not chat.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/[0.06]">
            Close
          </button>
        </header>

        <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 bg-white/[0.05] text-slate-100'}`}>
                {message.content}
              </div>
            </div>
          ))}
          {loading && <p className="text-sm text-slate-400">Assistant is typing…</p>}
        </div>

        <div className="border-t border-white/10 p-4">
          {error && <p className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
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
  if (looksLikeHostileOrProfane(value)) return false;
  if (looksLikeMerchantContextNote(value)) return false;

  switch (field.fieldKey) {
    case 'tcpaConsent': {
      const lower = value.toLowerCase();
      return ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'agree', 'agreed', 'i agree', 'i consent',
        'consent', 'absolutely', 'definitely', 'of course', 'sounds good', 'go ahead'].some(
          (w) => lower === w || lower.startsWith(w),
        );
    }
    case 'application.homeBasedBusiness': {
      const lower = value.toLowerCase();
      return ['yes', 'yeah', 'yep', 'true', 'home based', 'home-based', 'no', 'nope', 'false', 'not home based', 'not home-based']
        .some((w) => lower === w || lower.includes(w));
    }
    case 'contact.email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'contact.phone': return value.replace(/[^0-9]/g, '').length >= 10;
    case 'business.legalName': return looksLikeBusinessNameAnswer(value);
    case 'business.ein': return /^\d{2}-?\d{7}$/.test(value) || /sole propriet/i.test(value);
    case 'business.industry': return isKnownIndustry(value);
    case 'business.businessStartDate': return value.length >= 4 && value.length <= 40;
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

function looksLikeBusinessNameAnswer(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  if (normalized.length < 2 || normalized.length > 100) return false;
  if (/[?!]/.test(normalized)) return false;
  if (/^(?:i|i'm|im|we|we're|were|my|our)\b/i.test(normalized)) return false;
  if (/\b(?:have|had|owe|need|want|filed|defaulted|behind|struggling)\b/i.test(lower)) return false;
  if (/\b(?:irs|lien|tax debt|mca|merchant cash advance|cash advance|position|positions|loan|loans|bankruptcy|collections|overdraft|nsf)\b/i.test(lower)) return false;
  return /[a-z0-9]/i.test(normalized);
}

function looksLikeMerchantContextNote(value: string): boolean {
  const lower = value.toLowerCase().replace(/[^a-z0-9%$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const startsLikeStatement = /^(?:i|im|i m|i have|i had|i owe|we|we have|we had|my business|our business)\b/.test(lower);
  const contextKeywords = /\b(?:irs|tax lien|lien|tax debt|mca|merchant cash advance|cash advance|position|positions|bankruptcy|chapter 7|chapter 11|chapter 13|default|defaulted|collections|overdraft|nsf|negative balance|debt|lawsuit|judgment|non citizen|not a citizen|itin only)\b/.test(lower);
  return startsLikeStatement && contextKeywords;
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

function looksLikeHostileOrProfane(value: string): boolean {
  const lower = value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [
    /\bf+u+c+k+\b/i,
    /\bshit+\b/i,
    /\bass+hole\b/i,
    /\bbitch+\b/i,
    /\bcunt+\b/i,
    /\bdick+\b/i,
    /\bmotherf/i,
    /\bshut up\b/i,
    /\bgo away\b/i,
    /\bleave me alone\b/i,
    /\bnot interested\b/i,
  ].some((pattern) => pattern.test(lower));
}

function isKnownIndustry(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return INDUSTRIES.some((industry) => industry.toLowerCase() === lower);
}

function buildSafeClientState(state: FormState, pageContext: Record<string, unknown> | null | undefined, chatSessionId: string, appliedField?: { fieldKey: string; value: string } | null, messages: ChatMessage[] = []) {
  const owner = state.owners[0];
  return {
    applicationId: state.applicationId,
    currentStep: state.currentStep,
    chatSessionId,
    pageContext: pageContext || undefined,
    appliedField: appliedField || undefined,
    recentAssistantMessages: messages.filter((message) => message.role === 'assistant').slice(-8).map((message) => message.content),
    contact: { hasEmail: Boolean(state.contact.email), hasPhone: Boolean(state.contact.phone), tcpaConsent: state.contact.tcpaConsent },
    business: state.business,
    financial: state.financial,
    loanRequest: state.loanRequest,
    owner: owner ? {
      ...owner,
      ssn: owner.ssn ? 'present' : '',
      dateOfBirth: owner.dateOfBirth ? 'present' : '',
    } : null,
    hasAdditionalOwners: state.hasAdditionalOwners,
    homeBasedBusiness: state.homeAddressSameAsBusiness,
    homeAddressSameAsBusiness: state.homeAddressSameAsBusiness,
    ownerHomeSameAsBusiness: state.ownerHomeSameAsBusiness,
  };
}