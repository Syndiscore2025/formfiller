import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Prisma } from '@prisma/client';

type ChatRole = 'user' | 'assistant';

interface ChatMessageInput {
  tenantId: string;
  applicationId: string;
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

const APPROVED_FUNDING_LANGUAGE =
  'Funding options can range broadly from about $2,500 up to $15 million, with terms up to 10 years and daily, weekly, or monthly payment structures depending on the product, lender, and underwriting review. This is not an approval or quote.';

const OFF_TOPIC_MESSAGE =
  "I can help with this small-business funding application, business financing questions, bank statement uploads, and the information needed to submit your file. I can't help with unrelated topics, but I'm happy to keep moving through the application with you.";

const FALLBACK_PERSONA = 'Funding Assistant';
const SENSITIVE_CHAT_NOTICE =
  'For your protection, do not send SSN or date of birth in chat. Identity information must be entered only in the secure form fields, where it is transmitted over HTTPS, stored encrypted where applicable, and limited to authorized application processing and underwriting workflows.';

export async function createChatReply(input: ChatMessageInput): Promise<ChatReply> {
  const cleanMessage = input.userMessage.trim();
  if (!cleanMessage) {
    throw new Error('Message is required.');
  }

  const safeMessage = redactSensitiveChatContent(cleanMessage);
  const redactedSensitiveInput = safeMessage !== cleanMessage;

  const app = await loadApplicationContext(input.applicationId, input.tenantId);
  if (!app) throw new Error('Application not found.');

  const tenantSettings = app.tenant.settings;
  if (tenantSettings && tenantSettings.aiChatEnabled === false) {
    throw new Error('AI chat is not enabled for this tenant.');
  }

  await prisma.chatMessage.create({
    data: {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      role: 'user',
      content: safeMessage,
      metadata: { source: 'merchant_chat', redactedSensitiveInput } as Prisma.InputJsonObject,
    },
  });

  const nextField = determineNextField(app);

  let reply: ChatReply;
  if (redactedSensitiveInput) {
    reply = buildSensitiveInfoReply(nextField);
  } else if (isClearlyOffTopic(safeMessage)) {
    reply = {
      message: nextField ? `${OFF_TOPIC_MESSAGE}\n\nNext up: ${nextField.question}` : OFF_TOPIC_MESSAGE,
      nextField,
      suggestedActions: nextField ? ['Continue application'] : [],
    };
  } else if (!config.anthropicApiKey) {
    reply = buildFallbackReply(safeMessage, nextField);
  } else {
    reply = await requestClaudeReply({
      userMessage: safeMessage,
      nextField,
      appContext: buildSafeApplicationSummary(app, input.clientState),
      history: await loadRecentHistory(input.applicationId, input.tenantId),
      personaName: tenantSettings?.aiPersonaName || FALLBACK_PERSONA,
      systemPromptOverride: tenantSettings?.aiSystemPromptOverride || undefined,
      model: tenantSettings?.aiModel || config.anthropicModel,
    });
  }

  reply = enforceAssistantSafety(reply);

  await prisma.chatMessage.create({
    data: {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      role: 'assistant',
      content: reply.message,
      metadata: {
        nextField: nextField ? { ...nextField } : null,
        suggestedActions: reply.suggestedActions,
      } as Prisma.InputJsonObject,
    },
  });

  return reply;
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

function determineNextField(app: ApplicationContext): NextField | null {
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

  return fields.find((candidate) => isMissing(candidate.fieldKey, app, business, owner)) ?? null;
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

function buildSafeApplicationSummary(app: ApplicationContext, clientState?: unknown) {
  const owner = primaryOwner(app);
  return {
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

function buildFallbackReply(userMessage: string, nextField: NextField | null): ChatReply {
  if (isSecureIdentityField(nextField)) return buildSensitiveInfoReply(nextField);

  const lower = userMessage.toLowerCase();
  const fundingQuestion = ['rate', 'term', 'amount', 'payment', 'fund'].some((token) => lower.includes(token));
  const message = fundingQuestion
    ? `${APPROVED_FUNDING_LANGUAGE}\n\n${nextField ? `To keep your application moving, ${nextField.question}` : 'Your application looks complete from what I can see.'}`
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

async function requestClaudeReply(input: {
  userMessage: string;
  nextField: NextField | null;
  appContext: unknown;
  history: Array<{ role: ChatRole; content: string }>;
  personaName: string;
  systemPromptOverride?: string;
  model: string;
}): Promise<ChatReply> {
  const systemPrompt = [
    `You are ${input.personaName}, a professional small-business funding application assistant embedded in FormFiller.`,
    'Stay strictly limited to small-business financing, this application, document uploads, e-signature, and underwriting-readiness questions.',
    'Be friendly, concise, and professional. Do not discuss unrelated topics.',
    'Never promise approval, exact rates, exact terms, or exact offers. Use broad language only.',
    `Approved funding language: ${APPROVED_FUNDING_LANGUAGE}`,
    'Never silently fill fields or claim you changed an application. You may suggest what the merchant should enter, but the merchant must confirm in the form UI.',
    'Do not ask for full SSN or date of birth in chat. Tell the merchant to enter those only in the secure form field.',
    'If eligibility seems uncertain, say it may require manual review by the funding team. Do not disqualify unless explicit deterministic rules are provided by the application.',
    'Ask for the next missing field in the same order as the form. If the merchant asks a question, answer it and then guide them back to the next missing field.',
    'Do not ask merchants to complete optional fields that they skipped or left blank unless they explicitly ask to revisit them.',
    'Return ONLY valid JSON with keys: message (string), suggestedActions (array of strings).',
    input.systemPromptOverride ? `Tenant-specific instruction: ${input.systemPromptOverride}` : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.25,
      max_tokens: 600,
      system: systemPrompt,
      messages: [
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

  const payload = await res.json() as { content?: Array<{ type?: string; text?: string }> };
  const content = payload.content?.find((part) => part.type === 'text')?.text;
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