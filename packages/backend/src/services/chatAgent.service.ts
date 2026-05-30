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
  buildDisqualificationReply,
  evaluateChatDisqualification,
  markApplicationDisqualified,
  type DisqualificationResult,
} from './disqualification.service';
import { getCurrentDateContext } from './localContext.service';

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

interface TransitionChatInput {
  tenantId: string;
  applicationId: string;
  clientState?: unknown;
}

export interface ChatReply {
  message: string;
  nextField: NextField | null;
  suggestedActions: string[];
  disqualified?: boolean;
  disqualificationCode?: string;
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

  const app = await loadApplicationContext(input.applicationId, input.tenantId);
  if (!app) throw new Error('Application not found.');

  const tenantSettings = app.tenant.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) {
    throw new Error('AI chat is not enabled for this tenant.');
  }

  const nextField = determineNextField(app, input.clientState);
  const safeMessage = redactSensitiveChatContent(cleanMessage, {
    allowEin: isExpectedEinAnswer(input.clientState, nextField),
  });
  const redactedSensitiveInput = safeMessage !== cleanMessage;
  const qualificationSignals = extractQualificationSignals(safeMessage);
  const chatSessionId = extractChatSessionId(input.clientState);

  const userMetadata = {
    source: 'merchant_chat',
    ...(chatSessionId ? { chatSessionId } : {}),
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

  const history = await loadRecentHistory(input.applicationId, input.tenantId, chatSessionId);
  const guardrailEvaluation = evaluateChatGuardrails({
    message: safeMessage,
    nextField,
  });
  const eligibilityDisqualificationEnabled = tenantSettings?.eligibilityDisqualificationEnabled ?? true;
  const disqualification = eligibilityDisqualificationEnabled ? evaluateChatDisqualification(safeMessage) : null;

  let reply: ChatReply;
  if (isOptOutRequest(safeMessage)) {
    reply = buildOptOutReply();
  } else if (disqualification) {
    await markApplicationDisqualified({
      applicationId: input.applicationId,
      tenantId: input.tenantId,
      result: disqualification,
      source: 'ai_chat',
    });
    reply = buildDisqualificationChatReply(disqualification);
  } else if (redactedSensitiveInput) {
    reply = buildSensitiveInfoReply(nextField);
  } else if (!config.openAiApiKey) {
    reply = buildFallbackReply(safeMessage, nextField);
  } else {
    reply = await requestOpenAiReply({
      userMessage: safeMessage,
      nextField,
      guardrail: guardrailEvaluation,
      appContext: buildSafeApplicationSummary(app, input.clientState),
      history,
      personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
      systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
      eligibilityDisqualificationEnabled,
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
      metadata: buildAssistantChatMetadata(nextField, reply.suggestedActions, guardrailEvaluation, qualificationSignals, finalSafety.fundingSafety, chatSessionId),
    },
  });

  return reply;
}

export async function createPreApplicationChatReply(input: PreApplicationChatInput): Promise<ChatReply> {
  const cleanMessage = input.userMessage.trim();
  if (!cleanMessage) throw new Error('Message is required.');
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      settings: {
        select: {
          aiChatEnabled: true,
          aiPersonaName: true,
          aiSystemPromptOverride: true,
          aiModel: true,
          eligibilityDisqualificationEnabled: true,
        },
      },
    },
  });

  const tenantSettings = tenant?.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) throw new Error('AI chat is not enabled for this tenant.');

  const safeClientState = sanitizeClientState(input.clientState);
  const nextField = determinePreApplicationNextField(safeClientState);
  const safeMessage = redactSensitiveChatContent(cleanMessage, {
    allowEin: isExpectedEinAnswer(safeClientState, nextField),
  });
  const redactedSensitiveInput = safeMessage !== cleanMessage;
  const guardrailEvaluation = evaluateChatGuardrails({
    message: safeMessage,
    nextField,
  });
  const eligibilityDisqualificationEnabled = tenantSettings?.eligibilityDisqualificationEnabled ?? true;
  const disqualification = eligibilityDisqualificationEnabled ? evaluateChatDisqualification(safeMessage) : null;

  let reply: ChatReply;
  if (isOptOutRequest(safeMessage)) {
    reply = buildOptOutReply();
  } else if (disqualification) {
    reply = buildDisqualificationChatReply(disqualification);
  } else if (redactedSensitiveInput) {
    reply = buildSensitiveInfoReply(nextField);
  } else if (!config.openAiApiKey) {
    reply = buildFallbackReply(safeMessage, nextField);
  } else {
    reply = await requestOpenAiReply({
      userMessage: safeMessage,
      nextField,
      guardrail: guardrailEvaluation,
      appContext: {
        stage: 'pre_application',
        currentDate: getCurrentDateContext(),
        eligibilityDisqualificationEnabled,
        instruction: 'The merchant has not saved the first form card yet. Be conversational and helpful. Do not repeat the same generic menu. If they provide a name or business name, acknowledge it naturally and guide them to the next required Step 1 field. After TCPA/contact consent is captured, do not ask for Business Start Date; the next instruction is to review/confirm the Business Details page if lookup found data, or fill the visible business fields if lookup did not.',
        clientState: safeClientState,
      },
      history: [],
      personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
      systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
      eligibilityDisqualificationEnabled,
      model: resolveOpenAiChatModel(tenantSettings?.aiModel),
    });
  }

  return enforceFinalChatSafety(reply).reply;
}

export async function createPostConsentTransitionReply(input: TransitionChatInput): Promise<ChatReply> {
  const app = await loadApplicationContext(input.applicationId, input.tenantId);
  if (!app) throw new Error('Application not found.');

  const tenantSettings = app.tenant.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) throw new Error('AI chat is not enabled for this tenant.');

  const chatSessionId = extractChatSessionId(input.clientState);
  const nextField = determineNextField(app, input.clientState);
  const guardrailEvaluation = evaluateChatGuardrails({
    message: 'post_tcpa_step2_transition',
    nextField,
  });

  const appContext = {
    ...buildSafeApplicationSummary(app, input.clientState),
    transition: {
      type: 'post_tcpa_to_business_details',
      instruction: 'Write ONE concise assistant message. Thank the merchant for consenting. Then tell them the next step is Business Details: confirm the business information on screen if lookup populated it; otherwise fill in the visible business details. If Business Start Date is visible/missing, mention it as part of Step 2, not Revenue & Funding. Do not include an icebreaker, weather, local news, sports, or other local-context opener.',
    },
  };

  const reply = config.openAiApiKey
    ? await requestOpenAiReply({
        userMessage: 'The merchant gave TCPA/contact consent and is arriving at Step 2 Business Details. Give the post-consent transition message now.',
        nextField,
        guardrail: guardrailEvaluation,
        appContext,
        history: [],
        personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
        systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
        eligibilityDisqualificationEnabled: tenantSettings?.eligibilityDisqualificationEnabled ?? true,
        model: resolveOpenAiChatModel(tenantSettings?.aiModel),
      })
    : buildPostConsentFallbackReply(nextField);

  const finalSafety = enforceFinalChatSafety(reply);
  const safeReply = finalSafety.reply;

  await prisma.chatMessage.create({
    data: {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      role: 'assistant',
      content: safeReply.message,
      metadata: buildAssistantChatMetadata(nextField, safeReply.suggestedActions, guardrailEvaluation, [], finalSafety.fundingSafety, chatSessionId),
    },
  });

  return safeReply;
}

const PRE_APPLICATION_FIELDS: NextField[] = [
  field(1, 'Get Started', 'business.legalName', 'Name of Business', 'What is the exact legal name of your business?'),
  field(1, 'Get Started', 'business.stateOfFormation', 'State of Incorporation', 'What state is the business incorporated or registered in?'),
  field(1, 'Get Started', 'contact.email', 'Email Address', 'What email address should we use for the application?'),
  field(1, 'Get Started', 'contact.phone', 'Phone Number', 'What phone number should we use for the application?'),
  field(1, 'Get Started', 'business.ein', 'EIN', 'What is the business EIN? If you are a sole proprietor, select Sole Proprietorship in the form instead.'),
  field(1, 'Get Started', 'tcpaConsent', 'Contact Consent', 'Do I have your permission to check the contact-consent box for you and continue to the next page?'),
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
  if (contact.tcpaConsent !== true) return PRE_APPLICATION_FIELDS[5];
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
              eligibilityDisqualificationEnabled: true,
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

async function loadRecentHistory(applicationId: string, tenantId: string, chatSessionId: string | null): Promise<Array<{ role: ChatRole; content: string }>> {
  if (!chatSessionId) return [];

  const messages = await prisma.chatMessage.findMany({
    where: { applicationId, tenantId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { role: true, content: true, metadata: true },
  });

  return messages
    .filter((msg) => asRecord(msg.metadata).chatSessionId === chatSessionId)
    .slice(0, 10)
    .reverse()
    .map((msg) => ({
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

const APPLICATION_FLOW_FIELDS: NextField[] = [
  field(1, 'Get Started', 'business.legalName', 'Name of Business', "What is the exact legal name of your business?"),
  field(1, 'Get Started', 'business.stateOfFormation', 'State of Incorporation', 'What state was the business formed or incorporated in?'),
  field(1, 'Get Started', 'contact.email', 'Email Address', 'What email should we use for this funding request?'),
  field(1, 'Get Started', 'contact.phone', 'Phone Number', 'What is the best phone number for this funding request?'),
  field(1, 'Get Started', 'business.ein', 'EIN', 'What is the business EIN? If this is a sole proprietorship without an EIN, say that.'),
  field(1, 'Get Started', 'tcpaConsent', 'Contact Consent', 'Do I have your permission to check the contact-consent box for you and continue to the next page?'),

  field(2, 'Business Details', 'business.industry', 'Industry', 'What industry best describes your business?'),
  field(2, 'Business Details', 'business.businessStartDate', 'Business Start Date', 'What date did the business start? Use the Business Start Date field on this page.'),
  field(2, 'Business Details', 'business.streetAddress', 'Business Street Address', 'What is the street address for the business?'),
  field(2, 'Business Details', 'business.city', 'Business City', 'What city is the business located in?'),
  field(2, 'Business Details', 'business.state', 'Business State', 'What state is the business located in?'),
  field(2, 'Business Details', 'business.zipCode', 'Business ZIP Code', 'What is the business ZIP code?'),
  field(2, 'Business Details', 'application.homeBasedBusiness', 'Home Based Business', 'Is this a home-based business? Please choose Yes or No on the Business Details page.'),
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

const STEP2_CONFIRM_CONTINUE_FIELD = field(
  2,
  'Business Details',
  'step2.confirmContinue',
  'Confirm & Continue',
  'Review the business details shown on this page, answer Home Based Business if it is still unanswered, then click Confirm & Continue. If the page opens missing fields after that, complete only those visible fields.'
);

function determineNextField(app: ApplicationContext, clientState?: unknown): NextField | null {
  const business = app.business;
  const owner = primaryOwner(app);
  const currentStep = extractClientCurrentStep(clientState) ?? app.currentStep;

  if (isStep2ReviewContext(clientState)) {
    const homeBased = APPLICATION_FLOW_FIELDS.find((candidate) => candidate.fieldKey === 'application.homeBasedBusiness')!;
    if (isMissing(homeBased.fieldKey, app, business, owner) && !hasClientFieldValue(clientState, homeBased.fieldKey)) return homeBased;
    return STEP2_CONFIRM_CONTINUE_FIELD;
  }

  const currentOrEarlier = APPLICATION_FLOW_FIELDS.find((candidate) => (
    candidate.step <= currentStep
    && isMissing(candidate.fieldKey, app, business, owner)
    && !hasClientFieldValue(clientState, candidate.fieldKey)
  ));
  if (currentOrEarlier) return currentOrEarlier;

  if (currentStep === 2) return STEP2_CONFIRM_CONTINUE_FIELD;

  return APPLICATION_FLOW_FIELDS.find((candidate) => (
    candidate.step === currentStep + 1
    && isMissing(candidate.fieldKey, app, business, owner)
    && !hasClientFieldValue(clientState, candidate.fieldKey)
  )) ?? null;
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
    case 'application.homeBasedBusiness': return app.homeBasedBusiness === null;
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
    if (fieldKey === 'application.homeBasedBusiness') {
      return typeof state.homeAddressSameAsBusiness === 'boolean' || typeof state.homeBasedBusiness === 'boolean';
    }
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
  if (fieldKey === 'application.homeBasedBusiness') return typeof value === 'boolean';
  if (fieldKey === 'application.hasAdditionalOwners') return typeof value === 'boolean';
  if (fieldKey === 'owner.ssn' || fieldKey === 'owner.dateOfBirth') return value === 'present' || hasText(value);
  return hasText(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isStep2ReviewContext(clientState?: unknown): boolean {
  const state = asRecord(clientState);
  const currentStep = extractClientCurrentStep(clientState);
  const pageContext = asRecord(state.pageContext);
  if (pageContext.page === 'step2_business_details') return pageContext.mode === 'review';

  const business = asRecord(state.business);
  const fieldSources = asRecord(business.fieldSources);
  const hasLookupData = Object.keys(fieldSources).some((key) => !['legalName', 'stateOfFormation', 'ein'].includes(key));
  return currentStep === 2 && hasLookupData;
}

function extractChatSessionId(clientState?: unknown): string | null {
  const state = asRecord(clientState);
  return typeof state.chatSessionId === 'string' && state.chatSessionId.trim()
    ? state.chatSessionId.trim().slice(0, 100)
    : null;
}

function extractClientCurrentStep(clientState?: unknown): number | null {
  const state = asRecord(clientState);
  return typeof state.currentStep === 'number' ? state.currentStep : null;
}

function buildApplicationProgress(app: ApplicationContext, clientState?: unknown) {
  const business = app.business;
  const owner = primaryOwner(app);
  const currentStep = extractClientCurrentStep(clientState) ?? app.currentStep;
  const nextMissingField = determineNextField(app, clientState);
  const fields = APPLICATION_FLOW_FIELDS.map((item) => {
    const completed = !isMissing(item.fieldKey, app, business, owner) || hasClientFieldValue(clientState, item.fieldKey);
    return {
      step: item.step,
      stepName: item.stepName,
      fieldKey: item.fieldKey,
      label: item.label,
      completed,
      isNext: nextMissingField?.fieldKey === item.fieldKey,
    };
  });

  const steps = Array.from(new Set(APPLICATION_FLOW_FIELDS.map((item) => item.step))).map((step) => {
    const stepFields = fields.filter((item) => item.step === step);
    const stepName = APPLICATION_FLOW_FIELDS.find((item) => item.step === step)?.stepName || `Step ${step}`;
    return {
      step,
      stepName,
      isCurrentStep: step === currentStep,
      completedFields: stepFields.filter((item) => item.completed).map((item) => item.label),
      missingFields: stepFields.filter((item) => !item.completed).map((item) => item.label),
    };
  });

  return {
    currentStep,
    currentStepName: APPLICATION_FLOW_FIELDS.find((item) => item.step === currentStep)?.stepName || null,
    nextMissingField,
    completedCount: fields.filter((item) => item.completed).length,
    missingCount: fields.filter((item) => !item.completed).length,
    steps,
  };
}

function buildSafeApplicationSummary(app: ApplicationContext, clientState?: unknown) {
  const owner = primaryOwner(app);
  const progress = buildApplicationProgress(app, clientState);
  return {
    currentDate: getCurrentDateContext(),
    currentStep: progress.currentStep,
    databaseCurrentStep: app.currentStep,
    status: app.status,
    finalized: Boolean(app.finalizedAt),
    disqualified: Boolean(app.disqualifiedAt),
    disqualificationReason: app.disqualificationReason ? 'configured_reason_present' : null,
    eligibilityDisqualificationEnabled: app.tenant.settings?.eligibilityDisqualificationEnabled ?? true,
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
    progress,
    conversationInstruction: 'Trust applicationContext.progress as the live source of truth for where the merchant is. If databaseCurrentStep differs from currentStep, the merchant is actively moving through the form and currentStep is more current.',
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
    'go away',
    'shut up',
    'fuck off',
    'f off',
    'remove me',
    'remove my information',
    'no more messages',
  ];

  return directOptOut.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function buildOptOutReply(): ChatReply {
  return { message: OPT_OUT_MESSAGE, nextField: null, suggestedActions: [] };
}

function buildDisqualificationChatReply(result: DisqualificationResult): ChatReply {
  return {
    message: buildDisqualificationReply(result),
    nextField: null,
    suggestedActions: [],
    disqualified: true,
    disqualificationCode: result.code,
  };
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

function buildPostConsentFallbackReply(nextField: NextField | null): ChatReply {
  const next = nextField?.fieldKey === 'business.businessStartDate'
    ? 'I checked the consent box and moved you forward. Please review the business details on screen, then enter the Business Start Date before continuing.'
    : 'I checked the consent box and moved you forward. Please review the business details on screen and confirm anything Google found. If something is missing, fill in the visible business fields before continuing.';

  return {
    message: next,
    nextField,
    suggestedActions: [],
  };
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
    fieldHelpKey: guardrail.fieldHelpKey,
    responseSource: 'openai_guided',
  };
}

function buildAssistantChatMetadata(
  nextField: NextField | null,
  suggestedActions: string[],
  guardrail: GuardrailEvaluation,
  qualificationSignals: ReturnType<typeof extractQualificationSignals>,
  fundingSafety: FundingSafetyResult,
  chatSessionId?: string | null,
): Prisma.InputJsonObject {
  return {
    ...(chatSessionId ? { chatSessionId } : {}),
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
  guardrail: GuardrailEvaluation;
  appContext: unknown;
  history: Array<{ role: ChatRole; content: string }>;
  personaName: string;
  systemPromptOverride?: string;
  eligibilityDisqualificationEnabled: boolean;
  model: string;
}): Promise<ChatReply> {
  const dateContext = getCurrentDateContext();
  const systemPrompt = [
    `You are ${input.personaName}, a professional small-business funding application assistant embedded in FormFiller.`,
    `Current date context: Today is ${dateContext.humanDate}. Use this as the current day/date. Never imply a different current day.`,
    'Your only job is to have a real, natural, helpful conversation with the merchant that always moves them closer to finishing and signing this small-business funding application. You write every reply yourself in your own words — never use a templated or canned answer, never reuse the same phrasing twice in a row, and never sound like a script.',
    'Stay strictly limited to small-business financing, this application, document uploads, e-signature, identity verification, and underwriting-readiness. If the merchant goes off-topic, briefly and warmly bring it back to the application without sounding robotic.',
    'Tone: friendly, professional, concise (typically 1–3 short paragraphs), conversational, like a knowledgeable human funding specialist. Acknowledge what the merchant said before guiding them forward. Ask one useful follow-up question at a time. Vary your wording so consecutive replies do not look alike.',
    'Live progress awareness: before answering, inspect applicationContext.progress and applicationContext.clientState.pageContext. Treat them as the live source of truth, especially when the merchant is filling fields without AI help. Use progress.currentStepName, progress.nextMissingField, and each step’s missingFields/completedFields to know exactly what comes next. Do not ask for a field that progress marks completed.',
    'Conversation flow: respond like a human following along with the form. First briefly acknowledge what just happened or where they are; then give one clear next move. If they ask “what next?”, answer from progress.nextMissingField. If pageContext says Step 2 is in review mode, do not ask for hidden fields such as Industry yet; guide them to the visible Home Based Business Yes/No question or the Confirm & Continue button. If a step is complete, recognize that and move them to the next visible action. Immediately after contact consent/TCPA on Step 1, the next move is ALWAYS Step 2 Business Details review — ask the merchant to confirm the business information if lookup populated it, or fill the visible business fields if lookup did not. Do NOT jump to Business Start Date after consent.',
    'Post-consent transition: if applicationContext.transition.type is post_tcpa_to_business_details, write exactly one concise transition message. Thank the merchant for consenting, then guide them to Step 2 Business Details. Do not include an icebreaker, weather, local news, sports, or other local-context opener. Do not ask a separate question before the Step 2 instruction.',
    'Field capture flow: if applicationContext.clientState.appliedField is present, you may naturally acknowledge that the answer was captured from chat, then immediately move to the next missing field. If no appliedField is present, do not claim you changed the form — guide them to enter or confirm it in the visible UI.',
    'Field-answer discernment: merchants may mention context such as IRS liens, tax issues, existing MCA positions, debts, non-citizenship, or other underwriting notes while you are asking for a form field. Acknowledge those briefly, but do NOT treat those statements as the requested field answer unless clientState.appliedField confirms the UI captured it. Continue asking for the exact next missing field.',
    'Hard funding guardrails — ALWAYS:',
    '- NEVER quote, estimate, hint at, or give ranges for: interest rate, APR, factor rate, fees, payment amount, payback amount, term length, daily/weekly/monthly payments, funding amount, or approval odds.',
    '- NEVER promise approval, prequalification, or eligibility. Do not declare a merchant declined either — that is the funding team\'s call after they review the complete signed file.',
    '- NEVER silently change or claim you filled a field unless applicationContext.clientState.appliedField shows the merchant just provided that answer through chat. Otherwise, you can suggest what they should enter, but they confirm everything in the form UI.',
    '- NEVER ask the merchant to type SSN or DOB in chat. Always tell them to enter those only in the secure form field.',
    `Safe funding language when asked about pricing, terms, approval, or funding amount: ${SAFE_FUNDING_LANGUAGE}`,
    'Annual revenue math is allowed: if the merchant asks how to annualize monthly revenue/sales for the Estimated Annual Revenue field, you may multiply monthly revenue by 12, state the annualized revenue, and tell them which visible annual revenue range to select. This is field help, not a funding quote. Do not discuss approval, rates, terms, payments, or funding offers in that answer.',
    'EIN rule: EIN is the 9-digit business tax ID on the SS-4 confirmation letter the IRS sent when the business was first registered. It may also appear on business tax returns, payroll records, business bank paperwork, or IRS notices. If the merchant is a sole proprietor without an EIN, do NOT send them to the IRS for a new number or replacement letter (that takes weeks) — tell them to select the Sole Proprietorship option in the form and continue.',
    'Field-help rule: if the merchant asks what a field means, why it is needed, or where to find the info, answer that question first in plain language using the fieldHelpGuidance hint when provided, then guide them to the next missing required field (do NOT push them to optional fields they skipped unless they ask to revisit).',
    input.eligibilityDisqualificationEnabled
      ? 'Hard disqualification rule: if the merchant states no/zero revenue, pre-revenue, startup/not open, 0 months in business, or less than 1 month in business, the backend will disqualify the lead. If you see disqualified=true or no next field, do not keep pushing the form.'
      : 'Eligibility disqualification is disabled for this tenant. If the merchant states no/zero revenue, pre-revenue, startup/not open, 0 months in business, or less than 1 month in business, acknowledge briefly and keep them moving through the application for alternate products. Do not tell them they are disqualified.',
    'Silent qualification rule: if the merchant says something that may matter for underwriting but is NOT a hard disqualifier (bankruptcy, restricted industry, non-citizen, NSF, etc.) DO NOT alert them, DO NOT disqualify, DO NOT say "this may be an issue." Just keep them moving through the form normally — those signals are flagged internally for the funding team.',
    'Forward motion: every reply (unless the merchant explicitly opts out) ends with either a clear next step toward the next missing field, an invitation to review and sign, or a short follow-up question that moves the file forward.',
    'Opt-out: if the merchant opts out or says stop, acknowledge respectfully and stop pushing the application.',
    'Output format: return ONLY valid JSON with keys: message (string), suggestedActions (array of up to 3 short button labels).',
    input.guardrail.categoryGuidance ? `Detected merchant intent: ${input.guardrail.category}. Apply these rules in your reply: ${input.guardrail.categoryGuidance}` : '',
    input.guardrail.fieldHelpGuidance
      ? `Detected field-help intent for "${input.guardrail.fieldHelpGuidance.topic}". Use this to answer in your own words: ${input.guardrail.fieldHelpGuidance.guidance}${input.guardrail.fieldHelpGuidance.findIt ? ` Where to find it: ${input.guardrail.fieldHelpGuidance.findIt}` : ''}`
      : '',
    input.guardrail.qualificationSignals.length > 0
      ? `Silent qualification flags detected (${input.guardrail.qualificationSignals.map((s) => s.code).join(', ')}). Do NOT mention these to the merchant. Keep them moving through the application normally.`
      : '',
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
      temperature: 0.55,
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

type RedactionOptions = { allowEin?: boolean };

function isExpectedEinAnswer(clientState: unknown, nextField: NextField | null): boolean {
  if (nextField?.fieldKey === 'business.ein') return true;
  const state = clientState && typeof clientState === 'object' ? clientState as Record<string, unknown> : {};
  const applied = state.appliedField && typeof state.appliedField === 'object'
    ? state.appliedField as { fieldKey?: string }
    : null;
  return applied?.fieldKey === 'business.ein';
}

export function redactSensitiveChatContent(content: string, options: RedactionOptions = {}): string {
  let redacted = content
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted SSN]')
    .replace(/\b(?:\d{1,2}[/-]){2}\d{2,4}\b/g, '[redacted date]')
    .replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, '[redacted date]');
  if (!options.allowEin) {
    redacted = redacted.replace(/\b\d{9}\b/g, '[redacted sensitive number]');
  }
  return redacted;
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