import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Prisma } from '@prisma/client';
import {
  enforceFundingResponseSafety,
  evaluateChatGuardrails,
  extractQualificationSignals,
  type FundingSafetyResult,
  type GuardrailEvaluation,
} from './chatGuardrails.service';
import {
  buildFreshLocalContext,
  buildLocalContextReply,
  getCurrentDateContext,
  type LocalContext,
} from './localContext.service';

type ChatRole = 'user' | 'assistant';

interface ChatMessageInput {
  tenantId: string;
  applicationId: string;
  userMessage: string;
  clientState?: unknown;
}

interface PreApplicationChatInput {
  tenantId: string;
  userMessage: string;
  clientState?: unknown;
}

export interface ChatReply {
  message: string;
  nextField: NextField | null;
  suggestedActions: string[];
}

interface NextField {
  step: number;
  stepName: string;
  fieldKey: string;
  label: string;
  question: string;
}

const SAFE_FUNDING_LANGUAGE =
  "I don't want to guess at pricing, terms, payment structure, approval status, or funding amounts in chat. The funding team needs a complete signed application and supporting documents before reviewing options.";

const OFF_TOPIC_MESSAGE =
  "I can help with this small-business funding application, business financing questions, bank statement uploads, and the information needed to submit your file. I can't help with unrelated topics, but I'm happy to keep moving through the application with you.";

const FALLBACK_PERSONA = 'Funding Assistant';
const DEFAULT_CHAT_MODEL = 'gpt-4o';
const SENSITIVE_CHAT_NOTICE =
  'For your protection, do not send SSN or date of birth in chat. Identity information must be entered only in the secure form fields, where it is transmitted over HTTPS, stored encrypted where applicable, and limited to authorized application processing and underwriting workflows.';
const OPT_OUT_MESSAGE =
  'Understood — I will stop this chat interaction. If you decide you want help with the funding application later, you can reopen the assistant or continue directly in the form.';

export async function createChatReply(input: ChatMessageInput): Promise<ChatReply> {
  const cleanMessage = input.userMessage.trim();
  if (!cleanMessage) {
    throw new Error('Message is required.');
  }

  const safeMessage = redactSensitiveChatContent(cleanMessage);
  const redactedSensitiveInput = safeMessage !== cleanMessage;
  const qualificationSignals = extractQualificationSignals(safeMessage);

  const app = await loadApplicationContext(input.applicationId, input.tenantId);
  if (!app) throw new Error('Application not found.');

  const tenantSettings = app.tenant.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) {
    throw new Error('AI chat is not enabled for this tenant.');
  }

  const userMetadata = {
    source: 'merchant_chat',
    redactedSensitiveInput,
    ...(qualificationSignals.length > 0 ? { qualificationSignals } : {}),
  } as unknown as Prisma.InputJsonObject;

  await prisma.chatMessage.create({
    data: {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      role: 'user',
      content: safeMessage,
      metadata: userMetadata,
    },
  });

  const nextField = determineNextField(app, input.clientState);
  const history = await loadRecentHistory(input.applicationId, input.tenantId);
  const localContext = await buildApplicationLocalContext(app, input.clientState);
  const guardrailEvaluation = evaluateChatGuardrails({
    message: safeMessage,
    nextField,
    usedAssistantMessages: history.filter((item) => item.role === 'assistant').map((item) => item.content),
  });
  const localContextReply = buildLocalContextReply(safeMessage, localContext, nextField);

  let reply: ChatReply;
  if (isOptOutRequest(safeMessage)) {
    reply = buildOptOutReply();
  } else if (redactedSensitiveInput) {
    reply = buildSensitiveInfoReply(nextField);
  } else if (localContextReply) {
    reply = {
      message: localContextReply,
      nextField,
      suggestedActions: nextField ? [nextField.label, 'Continue application'] : ['Review and sign'],
    };
  } else if (guardrailEvaluation.reply) {
    reply = {
      message: guardrailEvaluation.reply,
      nextField,
      suggestedActions: guardrailEvaluation.suggestedActions,
    };
  } else if (isClearlyOffTopic(safeMessage)) {
    reply = {
      message: nextField ? `${OFF_TOPIC_MESSAGE}\n\nNext up: ${nextField.question}` : OFF_TOPIC_MESSAGE,
      nextField,
      suggestedActions: nextField ? ['Continue application'] : [],
    };
  } else if (!config.openAiApiKey) {
    reply = buildFallbackReply(safeMessage, nextField);
  } else {
    reply = await requestOpenAiReply({
      userMessage: safeMessage,
      nextField,
      appContext: buildSafeApplicationSummary(app, input.clientState, localContext),
      history,
      personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
      systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
      model: resolveOpenAiChatModel(tenantSettings?.aiModel),
    });
  }

  const finalSafety = enforceFinalChatSafety(reply);
  reply = finalSafety.reply;

  await prisma.chatMessage.create({
    data: {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      role: 'assistant',
      content: reply.message,
      metadata: buildAssistantChatMetadata(nextField, reply.suggestedActions, guardrailEvaluation, qualificationSignals, finalSafety.fundingSafety),
    },
  });

  return reply;
}

export async function createPreApplicationChatReply(input: PreApplicationChatInput): Promise<ChatReply> {
  const cleanMessage = input.userMessage.trim();
  if (!cleanMessage) throw new Error('Message is required.');

  const safeMessage = redactSensitiveChatContent(cleanMessage);
  const redactedSensitiveInput = safeMessage !== cleanMessage;
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      settings: {
        select: {
          aiChatEnabled: true,
          aiPersonaName: true,
          aiSystemPromptOverride: true,
          aiModel: true,
        },
      },
    },
  });

  const tenantSettings = tenant?.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) throw new Error('AI chat is not enabled for this tenant.');

  const safeClientState = sanitizeClientState(input.clientState);
  const nextField = determinePreApplicationNextField(safeClientState);
  const localContext = await buildClientStateLocalContext(safeClientState);
  const guardrailEvaluation = evaluateChatGuardrails({
    message: safeMessage,
    nextField,
    usedAssistantMessages: [],
  });
  const localContextReply = buildLocalContextReply(safeMessage, localContext, nextField);

  let reply: ChatReply;
  if (isOptOutRequest(safeMessage)) {
    reply = buildOptOutReply();
  } else if (redactedSensitiveInput) {
    reply = buildSensitiveInfoReply(nextField);
  } else if (localContextReply) {
    reply = {
      message: localContextReply,
      nextField,
      suggestedActions: nextField ? [nextField.label, 'Continue application'] : ['Review next steps'],
    };
  } else if (guardrailEvaluation.reply) {
    reply = {
      message: guardrailEvaluation.reply,
      nextField,
      suggestedActions: guardrailEvaluation.suggestedActions,
    };
  } else if (!config.openAiApiKey) {
    reply = buildFallbackReply(safeMessage, nextField);
  } else {
    reply = await requestOpenAiReply({
      userMessage: safeMessage,
      nextField,
      appContext: {
        stage: 'pre_application',
        currentDate: localContext.date,
        localContext: summarizeLocalContext(localContext),
        instruction: 'The merchant has not saved the first form card yet. Be conversational and helpful. Do not repeat the same generic menu. If they provide a name or business name, acknowledge it naturally and ask what they need help with or guide them to the first required field.',
        clientState: safeClientState,
      },
      history: [],
      personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
      systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
      model: resolveOpenAiChatModel(tenantSettings?.aiModel),
    });
  }

  return enforceFinalChatSafety(reply).reply;
}

const PRE_APPLICATION_FIELDS: NextField[] = [
  field(1, 'Get Started', 'business.legalName', 'Name of Business', 'What is the exact legal name of your business?'),
  field(1, 'Get Started', 'business.stateOfFormation', 'State of Incorporation', 'What state is the business incorporated or registered in?'),
  field(1, 'Get Started', 'contact.email', 'Email Address', 'What email address should we use for the application?'),
  field(1, 'Get Started', 'contact.phone', 'Phone Number', 'What phone number should we use for the application?'),
  field(1, 'Get Started', 'business.ein', 'EIN', 'What is the business EIN? If you are a sole proprietor, select Sole Proprietorship in the form instead.'),
];

function determinePreApplicationNextField(clientState: unknown): NextField | null {
  const state = clientState && typeof clientState === 'object' ? clientState as Record<string, unknown> : {};
  const applied = state.appliedField && typeof state.appliedField === 'object'
    ? state.appliedField as { fieldKey?: string }
    : null;

  if (applied?.fieldKey) {
    const index = PRE_APPLICATION_FIELDS.findIndex((item) => item.fieldKey === applied.fieldKey);
    if (index >= 0) return PRE_APPLICATION_FIELDS[index + 1] ?? null;
  }

  const business = state.business && typeof state.business === 'object' ? state.business as Record<string, unknown> : {};
  const contact = state.contact && typeof state.contact === 'object' ? state.contact as Record<string, unknown> : {};

  if (!hasText(business.legalName)) return PRE_APPLICATION_FIELDS[0];
  if (!hasText(business.stateOfFormation)) return PRE_APPLICATION_FIELDS[1];
  if (contact.hasEmail !== true) return PRE_APPLICATION_FIELDS[2];
  if (contact.hasPhone !== true) return PRE_APPLICATION_FIELDS[3];
  if (!hasText(business.ein) && business.entityType !== 'SOLE_PROPRIETORSHIP') return PRE_APPLICATION_FIELDS[4];
  return null;
}

async function loadApplicationContext(applicationId: string, tenantId: string) {
  return prisma.application.findFirst({
    where: { id: applicationId, tenantId },
    include: {
      tenant: {
        select: {
          settings: {
            select: {
              aiChatEnabled: true,
              aiPersonaName: true,
              aiSystemPromptOverride: true,
              aiEligibilityRules: true,
              aiModel: true,
              companyName: true,
            },
          },
        },
      },
      business: true,
      owners: { orderBy: { ownerIndex: 'asc' } },
      financial: true,
      loanRequest: true,
      signature: { select: { id: true, signedAt: true } },
      documents: { where: { documentType: 'bank_statement' }, select: { id: true } },
      analyticsEvents: {
        where: { eventType: { in: ['field_autofill', 'field_autofill_edited', 'field_skipped', 'toggle_selected'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { fieldName: true, eventType: true, metadata: true, createdAt: true },
      },
    },
  });
}

type ApplicationContext = NonNullable<Awaited<ReturnType<typeof loadApplicationContext>>>;

async function loadRecentHistory(applicationId: string, tenantId: string): Promise<Array<{ role: ChatRole; content: string }>> {
  const messages = await prisma.chatMessage.findMany({
    where: { applicationId, tenantId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { role: true, content: true },
  });

  return messages.reverse().map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: redactSensitiveChatContent(msg.content),
  }));
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSoleProprietor(app: ApplicationContext): boolean {
  return app.business?.entityType === 'SOLE_PROPRIETORSHIP';
}

function primaryOwner(app: ApplicationContext) {
  return app.owners[0];
}

function shouldAskAdditionalOwners(app: ApplicationContext): boolean {
  const pct = Number(primaryOwner(app)?.ownershipPct || '');
  return !(pct >= 81 && pct <= 100);
}

function determineNextField(app: ApplicationContext, clientState?: unknown): NextField | null {
  const business = app.business;
  const owner = primaryOwner(app);

  const fields: NextField[] = [
    field(1, 'Get Started', 'business.legalName', 'Name of Business', "What is the exact legal name of your business?"),
    field(1, 'Get Started', 'business.stateOfFormation', 'State of Incorporation', 'What state was the business formed or incorporated in?'),
    field(1, 'Get Started', 'contact.email', 'Email Address', 'What email should we use for this funding request?'),
    field(1, 'Get Started', 'contact.phone', 'Phone Number', 'What is the best phone number for this funding request?'),
    field(1, 'Get Started', 'business.ein', 'EIN', 'What is the business EIN? If this is a sole proprietorship without an EIN, say that.'),
    field(1, 'Get Started', 'tcpaConsent', 'Contact Consent', 'Please confirm the contact consent so we can continue the application.'),

    field(2, 'Business Details', 'business.industry', 'Industry', 'What industry best describes your business?'),
    field(2, 'Business Details', 'business.streetAddress', 'Business Street Address', 'What is the street address for the business?'),
    field(2, 'Business Details', 'business.city', 'Business City', 'What city is the business located in?'),
    field(2, 'Business Details', 'business.state', 'Business State', 'What state is the business located in?'),
    field(2, 'Business Details', 'business.zipCode', 'Business ZIP Code', 'What is the business ZIP code?'),
    field(3, 'Revenue & Funding', 'financial.annualRevenue', 'Estimated Annual Revenue', 'Which annual revenue range best matches the business?'),
    field(3, 'Revenue & Funding', 'loanRequest.amountRequested', 'Funding Needed', 'How much funding are you looking for?'),

    field(4, 'Owner Details', 'owner.firstName', 'Owner First Name', 'What is the primary owner’s first name?'),
    field(4, 'Owner Details', 'owner.lastName', 'Owner Last Name', 'What is the primary owner’s last name?'),
    field(4, 'Owner Details', 'owner.ownershipPct', 'Ownership %', 'What percentage of the business does the primary owner own?'),
    field(4, 'Owner Details', 'owner.streetAddress', 'Owner Home Address', 'What is the primary owner’s home street address?'),
    field(4, 'Owner Details', 'owner.city', 'Owner City', 'What city does the primary owner live in?'),
    field(4, 'Owner Details', 'owner.state', 'Owner State', 'What state does the primary owner live in?'),
    field(4, 'Owner Details', 'owner.zipCode', 'Owner ZIP Code', 'What is the primary owner’s ZIP code?'),
    field(4, 'Owner Details', 'application.hasAdditionalOwners', 'Additional Owners', 'Are there any other owners with 20% or more ownership?'),
    field(4, 'Owner Details', 'owner.ssn', 'Owner SSN', 'For identity verification, please enter the primary owner’s SSN in the secure form field.'),
    field(4, 'Owner Details', 'owner.dateOfBirth', 'Owner Date of Birth', 'For identity verification, please enter the primary owner’s date of birth in the secure form field.'),

    field(5, 'Review & Sign', 'signature', 'Electronic Signature', 'Please review the application, check the authorizations, and electronically sign.'),
    field(6, 'Bank Statements', 'documents.bankStatements', 'Bank Statements', 'Please upload the most recent business bank statement PDFs.'),
  ];

  return fields.find((candidate) => isMissing(candidate.fieldKey, app, business, owner) && !hasClientFieldValue(clientState, candidate.fieldKey)) ?? null;
}

function field(step: number, stepName: string, fieldKey: string, label: string, question: string): NextField {
  return { step, stepName, fieldKey, label, question };
}

function isMissing(fieldKey: string, app: ApplicationContext, business = app.business, owner = primaryOwner(app)): boolean {
  switch (fieldKey) {
    case 'business.legalName': return !hasText(business?.legalName);
    case 'business.stateOfFormation': return !hasText(business?.stateOfFormation);
    case 'contact.email': return !hasText(app.contactEmail);
    case 'contact.phone': return !hasText(app.contactPhone);
    case 'business.ein': return !isSoleProprietor(app) && !hasText(business?.ein);
    case 'tcpaConsent': return !app.tcpaConsentStep1;
    case 'business.industry': return !hasText(business?.industry);
    case 'business.streetAddress': return !hasText(business?.streetAddress);
    case 'business.city': return !hasText(business?.city);
    case 'business.state': return !hasText(business?.state);
    case 'business.zipCode': return !hasText(business?.zipCode);
    case 'business.businessStartDate': return !business?.businessStartDate;
    case 'financial.annualRevenue': return !hasText(app.financial?.annualRevenue);
    case 'loanRequest.amountRequested': return !hasText(app.loanRequest?.amountRequested);
    case 'owner.firstName': return !hasText(owner?.firstName);
    case 'owner.lastName': return !hasText(owner?.lastName);
    case 'owner.ownershipPct': return !hasText(owner?.ownershipPct);
    case 'owner.streetAddress': return !hasText(owner?.streetAddress);
    case 'owner.city': return !hasText(owner?.city);
    case 'owner.state': return !hasText(owner?.state);
    case 'owner.zipCode': return !hasText(owner?.zipCode);
    case 'application.hasAdditionalOwners': return shouldAskAdditionalOwners(app) && app.hasAdditionalOwners === null;
    case 'owner.ssn': return !hasText(owner?.ssnEncrypted);
    case 'owner.dateOfBirth': return !hasText(owner?.dateOfBirth);
    case 'signature': return !app.signature;
    case 'documents.bankStatements': return app.documents.length === 0 || !app.finalizedAt;
    default: return false;
  }
}

function hasClientFieldValue(clientState: unknown, fieldKey: string): boolean {
  const state = clientState && typeof clientState === 'object' ? clientState as Record<string, unknown> : {};
  const applied = state.appliedField && typeof state.appliedField === 'object'
    ? state.appliedField as { fieldKey?: string; value?: unknown }
    : null;
  if (applied?.fieldKey === fieldKey && hasMeaningfulFieldValue(fieldKey, applied.value, state)) return true;

  const [section, key] = fieldKey.split('.');
  if (fieldKey === 'tcpaConsent') {
    const contact = state.contact && typeof state.contact === 'object' ? state.contact as Record<string, unknown> : {};
    return contact.tcpaConsent === true;
  }
  if (section === 'contact') {
    const contact = state.contact && typeof state.contact === 'object' ? state.contact as Record<string, unknown> : {};
    if (key === 'email') return contact.hasEmail === true;
    if (key === 'phone') return contact.hasPhone === true;
  }
  if (section === 'application') {
    if (fieldKey === 'application.hasAdditionalOwners') {
      const owner = state.owner && typeof state.owner === 'object' ? state.owner as Record<string, unknown> : {};
      const pct = Number(owner.ownershipPct || '');
      if (pct >= 81 && pct <= 100) return true;
      if (typeof state.hasAdditionalOwners === 'boolean') return true;
    }
    return hasMeaningfulFieldValue(fieldKey, state[key], state);
  }

  const source = state[section];
  const record = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  return hasMeaningfulFieldValue(fieldKey, record[key], state);
}

function hasMeaningfulFieldValue(fieldKey: string, value: unknown, state?: Record<string, unknown>): boolean {
  if (fieldKey === 'business.ein') {
    const business = state?.business && typeof state.business === 'object' ? state.business as Record<string, unknown> : {};
    if (business.entityType === 'SOLE_PROPRIETORSHIP') return true;
  }
  if (fieldKey === 'application.hasAdditionalOwners') return typeof value === 'boolean';
  if (fieldKey === 'owner.ssn' || fieldKey === 'owner.dateOfBirth') return value === 'present' || hasText(value);
  return hasText(value);
}

async function buildApplicationLocalContext(app: ApplicationContext, clientState?: unknown): Promise<LocalContext> {
  const clientBusiness = extractClientBusiness(clientState);
  return buildFreshLocalContext({
    zipCode: app.business?.zipCode || clientBusiness.zipCode,
    city: app.business?.city || clientBusiness.city,
    state: app.business?.state || clientBusiness.state,
    industry: app.business?.industry || clientBusiness.industry,
  });
}

async function buildClientStateLocalContext(clientState?: unknown): Promise<LocalContext> {
  const clientBusiness = extractClientBusiness(clientState);
  return buildFreshLocalContext({
    zipCode: clientBusiness.zipCode,
    city: clientBusiness.city,
    state: clientBusiness.state,
    industry: clientBusiness.industry,
  });
}

function extractClientBusiness(clientState?: unknown): { zipCode?: string; city?: string; state?: string; industry?: string } {
  const state = clientState && typeof clientState === 'object' ? clientState as Record<string, unknown> : {};
  const business = state.business && typeof state.business === 'object' ? state.business as Record<string, unknown> : {};
  return {
    zipCode: typeof business.zipCode === 'string' ? business.zipCode : undefined,
    city: typeof business.city === 'string' ? business.city : undefined,
    state: typeof business.state === 'string' ? business.state : undefined,
    industry: typeof business.industry === 'string' ? business.industry : undefined,
  };
}

function summarizeLocalContext(localContext: LocalContext) {
  return {
    location: localContext.location,
    approvedFacts: localContext.approvedFacts.map((fact) => ({
      topic: fact.topic,
      summary: fact.summary,
      sourceLabel: fact.sourceLabel,
      fetchedAt: fact.fetchedAt,
    })),
    suggestedIcebreaker: localContext.icebreaker,
    safetyNotes: localContext.safetyNotes,
  };
}

function buildSafeApplicationSummary(app: ApplicationContext, clientState?: unknown, localContext?: LocalContext) {
  const owner = primaryOwner(app);
  return {
    currentDate: localContext?.date || getCurrentDateContext(),
    currentStep: app.currentStep,
    status: app.status,
    finalized: Boolean(app.finalizedAt),
    disqualified: Boolean(app.disqualifiedAt),
    disqualificationReason: app.disqualificationReason ? 'configured_reason_present' : null,
    contact: {
      hasEmail: hasText(app.contactEmail),
      hasPhone: hasText(app.contactPhone),
    },
    business: {
      legalName: app.business?.legalName || null,
      entityType: app.business?.entityType || null,
      industry: app.business?.industry || null,
      stateOfFormation: app.business?.stateOfFormation || null,
      hasEin: hasText(app.business?.ein),
      hasBusinessStartDate: Boolean(app.business?.businessStartDate),
      hasAddress: Boolean(app.business?.streetAddress && app.business?.city && app.business?.state && app.business?.zipCode),
      fieldMemory: app.business?.autoPopulated || null,
    },
    financial: {
      annualRevenue: app.financial?.annualRevenue || null,
      amountRequested: app.loanRequest?.amountRequested || null,
    },
    owner: {
      hasName: Boolean(owner?.firstName && owner?.lastName),
      ownershipPct: owner?.ownershipPct || null,
      hasHomeAddress: Boolean(owner?.streetAddress && owner?.city && owner?.state && owner?.zipCode),
      hasSsn: hasText(owner?.ssnEncrypted),
      hasDateOfBirth: hasText(owner?.dateOfBirth),
      hasAdditionalOwners: app.hasAdditionalOwners,
    },
    signature: Boolean(app.signature),
    bankStatementCount: app.documents.length,
    homeBasedBusiness: app.homeBasedBusiness,
    ownerHomeSameAsBusiness: app.ownerHomeSameAsBusiness,
    localContext: localContext ? summarizeLocalContext(localContext) : undefined,
    recentFieldMemoryEvents: app.analyticsEvents.map((event) => ({
      fieldName: event.fieldName,
      eventType: event.eventType,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })).reverse(),
    clientState: sanitizeClientState(clientState),
  };
}

function sanitizeClientState(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return redactSensitiveValues(value);
}

function isClearlyOffTopic(message: string): boolean {
  const lower = message.toLowerCase();
  const greetings = ['hi', 'hello', 'hey', 'thanks', 'thank you'];
  if (greetings.some((greeting) => lower.trim().startsWith(greeting))) return false;

  const allowed = [
    'business', 'fund', 'funding', 'finance', 'financing', 'loan', 'merchant', 'advance', 'rate', 'term', 'payment',
    'application', 'apply', 'form', 'ein', 'owner', 'revenue', 'bank', 'statement', 'upload', 'signature', 'sign',
    'credit', 'approval', 'qualify', 'amount', 'address', 'industry', 'tax', 'document', 'underwriting', 'lender',
  ];
  if (allowed.some((token) => lower.includes(token))) return false;

  const blocked = ['weather', 'recipe', 'sports', 'politics', 'dating', 'homework', 'song', 'movie', 'medical diagnosis'];
  return blocked.some((token) => lower.includes(token)) || lower.split(/\s+/).length > 4;
}

function isOptOutRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[.!?,]/g, '');
  const directOptOut = [
    'stop',
    'unsubscribe',
    'cancel',
    'do not contact me',
    "don't contact me",
    'dont contact me',
    'leave me alone',
    'remove me',
    'remove my information',
    'no more messages',
  ];

  return directOptOut.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function buildOptOutReply(): ChatReply {
  return { message: OPT_OUT_MESSAGE, nextField: null, suggestedActions: [] };
}

function buildFallbackReply(userMessage: string, nextField: NextField | null): ChatReply {
  if (isSecureIdentityField(nextField)) return buildSensitiveInfoReply(nextField);

  const lower = userMessage.toLowerCase();
  const fundingQuestion = ['rate', 'term', 'amount', 'payment', 'fund'].some((token) => lower.includes(token));
  const message = fundingQuestion
    ? `${SAFE_FUNDING_LANGUAGE}\n\n${nextField ? `Next up: ${nextField.question}` : 'Please review and sign so the team can move the file forward.'}`
    : nextField
      ? `I can help you through the application one step at a time. Next up: ${nextField.question}`
      : 'Your application looks complete from what I can see. If you have questions about bank statements, signing, or next steps, I can help.';

  return { message, nextField, suggestedActions: nextField ? [nextField.label] : ['Review next steps'] };
}

function buildSensitiveInfoReply(nextField: NextField | null): ChatReply {
  const message = nextField
    ? `${SENSITIVE_CHAT_NOTICE}\n\nNext up: ${nextField.question}`
    : SENSITIVE_CHAT_NOTICE;

  return {
    message,
    nextField,
    suggestedActions: nextField ? [nextField.label] : ['Continue in secure form'],
  };
}

function enforceFinalChatSafety(reply: ChatReply): { reply: ChatReply; fundingSafety: FundingSafetyResult } {
  const fundingSafety = enforceFundingResponseSafety(reply.message, reply.nextField);
  const safeFundingReply: ChatReply = fundingSafety.replaced
    ? {
        ...reply,
        message: fundingSafety.message,
        suggestedActions: reply.nextField ? [reply.nextField.label, 'Continue application'] : ['Review and sign'],
      }
    : reply;

  return { reply: enforceAssistantSafety(safeFundingReply), fundingSafety };
}

function buildGuardrailMetadata(guardrail: GuardrailEvaluation): Prisma.InputJsonObject {
  return {
    category: guardrail.category,
    responseSource: guardrail.responseSource,
    deterministicReply: Boolean(guardrail.reply),
  };
}

function buildAssistantChatMetadata(
  nextField: NextField | null,
  suggestedActions: string[],
  guardrail: GuardrailEvaluation,
  qualificationSignals: ReturnType<typeof extractQualificationSignals>,
  fundingSafety: FundingSafetyResult,
): Prisma.InputJsonObject {
  return {
    nextField: nextField ? { ...nextField } : null,
    suggestedActions,
    guardrail: buildGuardrailMetadata(guardrail),
    fundingSafety: fundingSafety.replaced
      ? { replaced: true, issues: fundingSafety.issues }
      : { replaced: false },
    ...(qualificationSignals.length > 0 ? { qualificationSignals } : {}),
  } as unknown as Prisma.InputJsonObject;
}

function enforceAssistantSafety(reply: ChatReply): ChatReply {
  if (isSecureIdentityField(reply.nextField)) {
    return buildSensitiveInfoReply(reply.nextField);
  }

  const lower = reply.message.toLowerCase();
  const mentionsSensitiveIdentity = lower.includes('ssn') || lower.includes('social security') || lower.includes('date of birth') || lower.includes('dob');
  const mentionsSecureForm = lower.includes('secure form') || lower.includes('form field');
  if (mentionsSensitiveIdentity && !mentionsSecureForm) {
    return {
      ...reply,
      message: `${reply.message}\n\n${SENSITIVE_CHAT_NOTICE}`,
    };
  }

  return reply;
}

function isSecureIdentityField(nextField: NextField | null): boolean {
  return nextField?.fieldKey === 'owner.ssn' || nextField?.fieldKey === 'owner.dateOfBirth';
}

function resolveOpenAiChatModel(configuredModel?: string | null): string {
  const model = configuredModel?.trim();
  if (!model) return DEFAULT_CHAT_MODEL;
  const lower = model.toLowerCase();
  if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return model;
  return DEFAULT_CHAT_MODEL;
}

async function requestOpenAiReply(input: {
  userMessage: string;
  nextField: NextField | null;
  appContext: unknown;
  history: Array<{ role: ChatRole; content: string }>;
  personaName: string;
  systemPromptOverride?: string;
  model: string;
}): Promise<ChatReply> {
  const dateContext = getCurrentDateContext();
  const systemPrompt = [
    `You are ${input.personaName}, a professional small-business funding application assistant embedded in FormFiller.`,
    `Current date context: Today is ${dateContext.humanDate}. Use this as the current day/date. Never imply a different current day.`,
    'Stay strictly limited to small-business financing, this application, document uploads, e-signature, and underwriting-readiness questions.',
    'Be friendly, concise, professional, and interactive like a live chat agent. Respond directly to what the merchant typed before guiding them forward.',
    'If localContext.approvedFacts are provided, you may use them for a brief relatable opening or follow-up only. Do not invent local facts. Do not reference local politics, tragedy, crime, religion, protected classes, scandals, disasters, adult topics, or negative economic news.',
    'If using a relatable local opening, keep it professional and phrase it as a light human connection, then immediately steer back to completing or signing the application.',
    'Do not repeat the same generic greeting/menu. Vary your wording naturally and ask one useful follow-up question at a time.',
    'Unless the merchant clearly opts out or says stop, always helpfully steer the conversation back toward completing the application and the next missing field.',
    'If the merchant opts out, stop encouraging the application and acknowledge the opt-out respectfully.',
    'Never promise approval, quote rates, quote terms, estimate payment structures, estimate funding amounts, give example pricing, or provide approval odds. Do not use broad numeric ranges either.',
    `Safe funding language when asked about pricing, terms, approval, or funding amount: ${SAFE_FUNDING_LANGUAGE}`,
    'Never silently fill fields or claim you changed an application. You may suggest what the merchant should enter, but the merchant must confirm in the form UI.',
    'Do not ask for full SSN or date of birth in chat. Tell the merchant to enter those only in the secure form field.',
    'If eligibility seems uncertain, say it may require manual review by the funding team. Do not disqualify unless explicit deterministic rules are provided by the application.',
    'If the merchant asks why a form field is needed, what a field means, or where to find information, answer the field-specific question first in plain language, then redirect to the next missing required field.',
    'Ask for the next missing field in the same order as the form. If the merchant asks a question, answer it and then guide them back to the next missing field.',
    'Do not ask merchants to complete optional fields that they skipped or left blank unless they explicitly ask to revisit them.',
    'Return ONLY valid JSON with keys: message (string), suggestedActions (array of strings).',
    input.systemPromptOverride ? `Tenant-specific instruction: ${input.systemPromptOverride}` : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.25,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...input.history,
        {
          role: 'user',
          content: JSON.stringify({
            merchantMessage: input.userMessage,
            nextMissingField: input.nextField,
            applicationContext: input.appContext,
          }),
        },
      ],
    }),
  });

  if (!res.ok) return buildFallbackReply(input.userMessage, input.nextField);

  const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return buildFallbackReply(input.userMessage, input.nextField);

  try {
    const parsed = parseJsonObject(content) as { message?: string; suggestedActions?: string[] };
    const message = parsed.message?.trim() || buildFallbackReply(input.userMessage, input.nextField).message;
    const suggestedActions = Array.isArray(parsed.suggestedActions)
      ? parsed.suggestedActions.filter((action) => typeof action === 'string').slice(0, 3)
      : [];
    return { message, nextField: input.nextField, suggestedActions };
  } catch {
    return buildFallbackReply(input.userMessage, input.nextField);
  }
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error('Invalid model JSON response');
  }
}

export function redactSensitiveChatContent(content: string): string {
  return content
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted SSN]')
    .replace(/\b\d{9}\b/g, '[redacted sensitive number]')
    .replace(/\b(?:\d{1,2}[/-]){2}\d{2,4}\b/g, '[redacted date]')
    .replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, '[redacted date]');
}

function redactSensitiveValues(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveChatContent(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValues(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('ssn') || lowerKey.includes('dateofbirth') || lowerKey === 'dob') {
        return [key, item ? 'present' : ''];
      }
      return [key, redactSensitiveValues(item)];
    }),
  );
}