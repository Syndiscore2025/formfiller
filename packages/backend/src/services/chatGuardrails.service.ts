export interface GuardrailNextField {
  label: string;
  question: string;
  fieldKey?: string;
}

export type GuardrailCategory =
  | 'field_help'
  | 'rate_cost'
  | 'approval_qualification'
  | 'credit'
  | 'documents_bank'
  | 'process_timeline'
  | 'trust_security'
  | 'application_help'
  | 'signing'
  | 'competitor_comparison'
  | 'frustration'
  | 'product_education';

export interface QualificationSignal {
  code: string;
  severity: 'info' | 'review' | 'high_review';
  evidence: string;
}

export interface FieldHelpGuidance {
  fieldKey: string;
  topic: string;
  guidance: string;
  findIt?: string;
}

export interface GuardrailEvaluation {
  category: GuardrailCategory | null;
  fieldHelpKey: string | null;
  fieldHelpGuidance: FieldHelpGuidance | null;
  categoryGuidance: string | null;
  qualificationSignals: QualificationSignal[];
}

export interface FundingSafetyResult {
  message: string;
  replaced: boolean;
  issues: string[];
}

const NO_QUOTE_MESSAGE =
  "I don't want to guess at pricing, terms, payment structure, approval status, or funding amounts in chat. Those details need a complete file review. The best move is to finish the application and sign so the funding team can review the full picture.";

const CATEGORY_PATTERNS: Array<{ category: Exclude<GuardrailCategory, 'field_help'>; patterns: RegExp[] }> = [
  {
    category: 'rate_cost',
    patterns: [
      /\brate\b/i, /\brates\b/i, /\bapr\b/i, /\binterest\b/i, /\bfactor\b/i, /\bfee\b/i,
      /\bcost\b/i, /\bpayment\b/i, /\bpayments\b/i, /\bpayback\b/i, /\bterm\b/i, /\bterms\b/i,
      /\bhow much can i get\b/i, /\bwhat can i get\b/i, /\bmonthly\s+payments?\b/i,
      /\bweekly\s+payments?\b/i, /\bdaily\s+payments?\b/i,
    ],
  },
  {
    category: 'approval_qualification',
    patterns: [
      /\bqualif/i, /\bapproved\b/i, /\bapproval\b/i, /\beligible\b/i, /\bdeclined\b/i,
      /\brejected\b/i, /\bpre[- ]?approve/i, /\bcan i get approved\b/i, /\bwill i get approved\b/i,
    ],
  },
  {
    category: 'credit',
    patterns: [/\bcredit\b/i, /\bfico\b/i, /\bscore\b/i, /\bhard pull\b/i, /\bsoft pull\b/i, /\bbad credit\b/i],
  },
  {
    category: 'documents_bank',
    patterns: [/\bbank statement/i, /\bbank statements/i, /\bupload\b/i, /\bdocument/i, /\bpdf\b/i, /\bscreenshot/i, /\bplaid\b/i],
  },
  {
    category: 'process_timeline',
    patterns: [/\bhow long\b/i, /\bwhen\b/i, /\btimeline\b/i, /\bnext step/i, /\bwhat happens next/i, /\bprocess\b/i, /\bunderwriting\b/i, /\breview\b/i],
  },
  {
    category: 'trust_security',
    patterns: [/\blegit\b/i, /\bscam\b/i, /\btrust\b/i, /\bsecure\b/i, /\bsafe\b/i, /\bprivacy\b/i, /\bdata\b/i, /\bwho are you\b/i],
  },
  {
    category: 'signing',
    patterns: [/\bsign\b/i, /\bsignature\b/i, /\be[- ]?sign/i, /\bauthorization\b/i, /\bconsent\b/i],
  },
  {
    category: 'competitor_comparison',
    patterns: [/\bother offer\b/i, /\banother company\b/i, /\bcompetitor\b/i, /\bbeat\b/i, /\bmatch\b/i, /\bshop\b/i, /\bshopping\b/i, /\bcompare\b/i],
  },
  {
    category: 'frustration',
    patterns: [/\bannoy/i, /\bfrustrat/i, /\bwaste of time\b/i, /\btoo much\b/i, /\bwhy so many\b/i, /\bdon't want to fill/i, /\bdont want to fill/i],
  },
  {
    category: 'product_education',
    patterns: [/\bmca\b/i, /\bmerchant cash advance\b/i, /\bline of credit\b/i, /\bsba\b/i, /\bequipment financing\b/i, /\bworking capital\b/i, /\bloan\b/i, /\bfinancing\b/i],
  },
  {
    category: 'application_help',
    patterns: [/\bhelp\b/i, /\bapplication\b/i, /\bform\b/i, /\bfield\b/i, /\bquestion\b/i, /\bwhy do you need\b/i, /\bfinish later\b/i],
  },
];

const FIELD_HELP_INTENT = [
  /\bwhy\s+(?:do|does|is|are)\b/i,
  /\bwhat\s+(?:is|are|does|do|should)\b/i,
  /\bwhere\s+(?:do|can|should)\b/i,
  /\bhow\s+(?:do|can|should)\b/i,
  /\bfind\b/i,
  /\blocate\b/i,
  /\bwhat\s+do\s+i\s+put\b/i,
  /\bwhat\s+goes\s+here\b/i,
  /\bi\s+(?:do not|don't|dont)\s+know\b/i,
  /\bnot\s+sure\b/i,
  /\bexplain\b/i,
];

interface FieldHelpEntry {
  aliases: string[];
  topic: string;
  guidance: string;
  findIt?: string;
}

const FIELD_HELP: Record<string, FieldHelpEntry> = {
  'business.legalName': {
    aliases: ['legal name', 'business name', 'company name', 'name of business'],
    topic: 'Legal business name',
    guidance: 'Use the exact legal business name on tax records, formation docs, bank statements, and registrations. This is so the review team can match the application to the right business.',
    findIt: 'Found on IRS docs, Secretary of State registration, business bank statements, or formation paperwork.',
  },
  'business.stateOfFormation': {
    aliases: ['state of formation', 'state of incorporation', 'incorporated', 'formed', 'registered'],
    topic: 'State of formation',
    guidance: 'The state where the business entity was legally formed or registered. Keeps the application consistent with public filings.',
    findIt: 'Check articles of organization/incorporation, Secretary of State filing, or business registration record.',
  },
  'contact.email': {
    aliases: ['email', 'email address'],
    topic: 'Contact email',
    guidance: 'Best business contact email. Used for application communication, status follow-up, document requests, and signature-related messages.',
  },
  'contact.phone': {
    aliases: ['phone', 'phone number', 'telephone'],
    topic: 'Contact phone',
    guidance: 'Best business phone for the owner or authorized contact. Lets the funding team reach the merchant if something needs clarification.',
  },
  'business.ein': {
    aliases: ['ein', 'employer identification number', 'tax id', 'tax identification', 'federal tax id'],
    topic: 'EIN (Employer Identification Number)',
    guidance: 'The EIN is the 9-digit business tax ID printed on the SS-4 confirmation letter the IRS sent when the business was first registered. It may also appear on business tax returns, payroll records, business bank paperwork, or IRS notices. If the merchant is a sole proprietor and does not have an EIN, do NOT send them to the IRS to request one or wait on a replacement letter (it can take weeks). Instead tell them to select the Sole Proprietorship option in the form and continue.',
  },
  tcpaConsent: {
    aliases: ['consent', 'contact consent', 'tcpa', 'authorization to contact'],
    topic: 'Contact consent',
    guidance: 'Confirms the team is allowed to contact the merchant about this funding request. Standard authorization step.',
  },
  'business.industry': {
    aliases: ['industry', 'business type', 'type of business', 'naics', 'sic'],
    topic: 'Industry',
    guidance: 'Choose the closest match to how the business mainly earns revenue. Helps the review team understand the business and route the file correctly.',
  },
  'business.streetAddress': {
    aliases: ['business address', 'street address', 'business street', 'office address', 'store address'],
    topic: 'Business street address',
    guidance: 'The operating business street address. Verifies where the business operates and matches business records and bank documentation.',
    findIt: 'Use the operating address shown on business bank statements, leases, utility bills, or registrations.',
  },
  'business.city': {
    aliases: ['business city', 'city'],
    topic: 'Business city',
    guidance: 'City portion of the operating business address.',
  },
  'business.state': {
    aliases: ['business state', 'state located', 'business location state'],
    topic: 'Business state',
    guidance: 'State portion of the operating business address.',
  },
  'business.zipCode': {
    aliases: ['business zip', 'zip code', 'postal code', 'business postal'],
    topic: 'Business ZIP code',
    guidance: 'ZIP code portion of the operating business address. Used to verify location.',
  },
  'financial.annualRevenue': {
    aliases: ['annual revenue', 'revenue', 'sales', 'gross sales', 'gross revenue'],
    topic: 'Annual revenue',
    guidance: 'Closest accurate annual revenue range based on records. Do not guess from a single day or deposit.',
    findIt: 'Estimate from tax returns, P&L reports, bookkeeping software, bank deposits, or annual sales reports.',
  },
  'loanRequest.amountRequested': {
    aliases: ['funding needed', 'amount requested', 'funding amount', 'how much funding', 'amount looking for'],
    topic: 'Funding amount requested',
    guidance: 'Whatever amount the merchant is seeking. This is not a quote or approval; it just tells the team what the merchant is asking for.',
  },
  'owner.firstName': {
    aliases: ['owner first name', 'first name', 'primary owner name'],
    topic: 'Primary owner first name',
    guidance: 'First name of the primary owner of the business.',
  },
  'owner.lastName': {
    aliases: ['owner last name', 'last name', 'surname'],
    topic: 'Primary owner last name',
    guidance: 'Last name of the primary owner of the business.',
  },
  'owner.ownershipPct': {
    aliases: ['ownership', 'ownership percent', 'ownership percentage', 'percent owned', 'owner percentage'],
    topic: 'Ownership percentage',
    guidance: 'Actual ownership share of the primary owner. Determines whether additional owners need to be listed.',
    findIt: 'Confirm from operating agreement, shareholder records, partnership agreement, or formation documents.',
  },
  'owner.streetAddress': {
    aliases: ['owner address', 'home address', 'personal address', 'owner street'],
    topic: 'Owner home address',
    guidance: 'Primary owner home street address. Used for identity verification. Must be entered in the secure form fields, not in chat.',
  },
  'owner.city': {
    aliases: ['owner city', 'home city'],
    topic: 'Owner home city',
    guidance: 'City portion of the primary owner home address.',
  },
  'owner.state': {
    aliases: ['owner state', 'home state'],
    topic: 'Owner home state',
    guidance: 'State portion of the primary owner home address.',
  },
  'owner.zipCode': {
    aliases: ['owner zip', 'home zip', 'owner postal'],
    topic: 'Owner home ZIP code',
    guidance: 'ZIP code portion of the primary owner home address.',
  },
  'application.hasAdditionalOwners': {
    aliases: ['additional owners', 'other owners', 'partners', 'co owner', 'co-owner'],
    topic: 'Additional owners',
    guidance: 'Tells the team whether other owners need to be listed. If the primary owner owns the required controlling share, additional owner details may not be needed.',
  },
  'owner.ssn': {
    aliases: ['ssn', 'social security', 'social security number'],
    topic: 'Owner SSN',
    guidance: 'SSN is used only for identity verification. NEVER ask the merchant to type SSN in chat. Tell them to enter it only in the secure form field for that step.',
  },
  'owner.dateOfBirth': {
    aliases: ['date of birth', 'dob', 'birthdate', 'birthday'],
    topic: 'Owner date of birth',
    guidance: 'DOB is used only for identity verification. NEVER ask the merchant to type DOB in chat. Tell them to enter it only in the secure form field for that step.',
  },
  signature: {
    aliases: ['signature', 'sign', 'e-sign', 'esign', 'authorization'],
    topic: 'Electronic signature',
    guidance: 'Signature confirms the application is accurate and ready for review. Tell the merchant to review the entries first, then sign through the application when everything looks right.',
  },
  'documents.bankStatements': {
    aliases: ['bank statements', 'bank statement', 'documents', 'upload', 'pdf', 'plaid'],
    topic: 'Bank statements',
    guidance: 'Bank statements verify business activity and cash flow for review. Have the merchant upload them through the secure application area, not in chat.',
    findIt: 'Most banks let merchants download monthly statement PDFs from online banking. Official PDFs are better than screenshots.',
  },
};

const CATEGORY_GUIDANCE: Record<Exclude<GuardrailCategory, 'field_help'>, string> = {
  rate_cost:
    'Merchant is asking about pricing/rates/terms/payments/cost/factor/APR/fees. Do NOT quote any number, percent, term length, dollar amount, payment cadence, or example. Explain politely that pricing is file-specific and only made after the funding team reviews the complete signed application + documents. Push them to finish and sign so the file can be reviewed.',
  approval_qualification:
    'Merchant is asking about approval, qualifying, being declined/rejected, or pre-approval. Do NOT promise, predict, or estimate approval. Do NOT disqualify. Explain that the funding team determines this from the complete signed file. Steer them to finish the next missing field and sign.',
  credit:
    'Merchant is asking about credit / FICO / score / hard or soft pull. Do NOT quote a minimum score or rule them in or out. Explain credit is one of several factors and that the team needs the complete file to evaluate fairly. Then ask the next missing field.',
  documents_bank:
    'Merchant is asking about bank statements, uploads, PDFs, Plaid, or documents. Explain that bank statements verify business activity for review, that PDFs from online banking are preferred over screenshots, and that uploads happen in the secure documents area inside the application, not in chat. Then push toward finishing or signing.',
  process_timeline:
    'Merchant is asking how long, when, or what happens next. Explain that after a complete signed application + requested documents are in, the funding team reviews the file. Do NOT promise specific timelines, days, or amounts. Then ask the next missing field.',
  trust_security:
    'Merchant is asking if this is legit / safe / private / secure / who you are. Reassure briefly and professionally: data goes only into the secure form fields (not chat), sensitive identity info should never be typed in chat, and you are here to guide them through the application. Then steer them back to the next missing field.',
  application_help:
    'Merchant wants general help with the application or a field. Offer to walk them through the next missing item one step at a time, in plain language. Never claim you filled or changed fields; they confirm entries in the form UI.',
  signing:
    'Merchant is asking about signing / e-signature / authorization. Tell them to review the application first, then e-sign when everything looks accurate. Signing is what moves the completed file into review.',
  competitor_comparison:
    'Merchant mentions another offer / competitor / shopping around / matching or beating an offer. Do NOT quote terms, do NOT negotiate, do NOT compare numbers. Explain that a complete signed application is what lets this team evaluate their file on its own merits. Push them to finish and sign.',
  frustration:
    'Merchant sounds frustrated or annoyed by the form. Acknowledge it briefly and warmly, keep your reply short, and offer to handle just the next one field at a time so they can get out of the form faster. Do NOT lecture.',
  product_education:
    'Merchant is asking about MCA / line of credit / SBA / equipment financing / working capital / loan / financing in general. Keep it high-level and educational only. Do NOT recommend a specific product or quote terms. Explain that the right fit depends on the completed file and the funding team picks it after review. Then steer back to the next missing field.',
};

const FUNDING_QUOTE_PATTERNS: Array<{ issue: string; pattern: RegExp }> = [
  { issue: 'dollar_amount', pattern: /\$\s?\d|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars?|k|m|million|thousand)\b/i },
  { issue: 'rate_or_percent', pattern: /\b\d+(?:\.\d+)?\s?%|\bapr\b|\bfactor rate\b|\bbuy rate\b/i },
  { issue: 'term_length', pattern: /\b\d+(?:\.\d+)?\s?(?:days?|weeks?|months?|years?)\b/i },
  { issue: 'payment_structure', pattern: /\b(?:daily|weekly|biweekly|bi-weekly|monthly)\s+payments?\b/i },
  { issue: 'approval_promise', pattern: /\b(?:you are|you're|youre|we got you|you have been)\s+(?:approved|qualified|prequalified)\b/i },
  { issue: 'specific_offer', pattern: /\b(?:approved for|qualify for|offer is|payment is|payback is|term is|rate is)\b/i },
];

export function evaluateChatGuardrails(input: {
  message: string;
  nextField: GuardrailNextField | null;
  usedAssistantMessages?: string[];
}): GuardrailEvaluation {
  const qualificationSignals = extractQualificationSignals(input.message);
  const fieldHelpKey = detectFieldHelpKey(input.message, input.nextField);
  const fieldHelpGuidance = fieldHelpKey ? buildFieldHelpGuidance(fieldHelpKey) : null;
  const category = classifyGuardrailCategory(input.message);
  const categoryGuidance = category ? CATEGORY_GUIDANCE[category] : null;

  return {
    category: fieldHelpKey ? 'field_help' : category,
    fieldHelpKey,
    fieldHelpGuidance,
    categoryGuidance,
    qualificationSignals,
  };
}

export function enforceFundingResponseSafety(message: string, nextField: GuardrailNextField | null): FundingSafetyResult {
  const assistantAnswerOnly = message.split(/\n\nNext up:/i)[0] || message;
  const issues = FUNDING_QUOTE_PATTERNS
    .filter(({ pattern }) => pattern.test(assistantAnswerOnly))
    .map(({ issue }) => issue);

  if (issues.length === 0) return { message, replaced: false, issues: [] };
  if (isAnnualRevenueMathGuidance(assistantAnswerOnly, nextField, issues)) return { message, replaced: false, issues: [] };
  if (isOwnershipPctAcknowledgement(assistantAnswerOnly, nextField, issues)) return { message, replaced: false, issues: [] };
  return {
    message: appendForwardMotion(NO_QUOTE_MESSAGE, nextField),
    replaced: true,
    issues,
  };
}

function isAnnualRevenueMathGuidance(message: string, nextField: GuardrailNextField | null, issues: string[]): boolean {
  if (nextField?.fieldKey !== 'financial.annualRevenue') return false;
  const lower = message.toLowerCase();
  const talksAboutRevenue = /\b(?:annual|yearly|per year|revenue|gross sales|sales)\b/i.test(lower);
  const talksAboutFundingOffer = /\b(?:rate|apr|factor|fee|payback|approval|approved|qualify|funding amount|amount requested|offer|term|payment)\b/i.test(lower);
  const onlyMathIssues = issues.every((issue) => issue === 'dollar_amount' || issue === 'term_length');
  return talksAboutRevenue && !talksAboutFundingOffer && onlyMathIssues;
}

function isOwnershipPctAcknowledgement(message: string, nextField: GuardrailNextField | null, issues: string[]): boolean {
  if (nextField?.fieldKey !== 'owner.ownershipPct') return false;
  const talksAboutFundingOffer = /\b(?:rate|apr|factor|fee|payback|approval|approved|qualify|funding amount|amount requested|offer|term|payment)\b/i.test(message);
  const onlyPercentIssue = issues.every((issue) => issue === 'rate_or_percent');
  return onlyPercentIssue && !talksAboutFundingOffer;
}

export function extractQualificationSignals(message: string): QualificationSignal[] {
  const signals: QualificationSignal[] = [];
  const lower = message.toLowerCase();

  addSignalIf(signals, lower, /\b(?:just started|just opened|new business|startup|start up|pre[- ]?revenue|not open yet|haven't opened|havent opened)\b/i,
    'startup_or_pre_revenue', 'high_review');
  addSignalIf(signals, lower, /\b(?:no revenue|not making revenue|barely any revenue|low revenue|no deposits|no sales)\b/i,
    'low_or_no_revenue', 'high_review');
  addSignalIf(signals, lower, /\b(?:not a citizen|non citizen|non-citizen|undocumented|visa only|work permit|itin only)\b/i,
    'citizenship_or_residency_review', 'high_review');
  addSignalIf(signals, lower, /\b(?:bankruptcy|bankrupt|chapter 7|chapter 11|chapter 13|defaulted|collections|tax lien)\b/i,
    'credit_or_legal_review', 'review');
  addSignalIf(signals, lower, /\b(?:irs lien|lien with the irs|lien from the irs|tax debt|owe the irs|irs debt|tax levy|judgment)\b/i,
    'tax_or_legal_review', 'review');
  addSignalIf(signals, lower, /\b(?:multiple mca|mca positions?|merchant cash advance positions?|cash advance positions?|stacked advances?|stacking)\b/i,
    'existing_mca_positions_review', 'review');
  addSignalIf(signals, lower, /\b(?:negative balance|overdraft|nsf|bounced payment|returned payment)\b/i,
    'bank_activity_review', 'review');
  addSignalIf(signals, lower, /\b(?:cannabis|marijuana|dispensary|gambling|casino|adult entertainment|strip club|firearms|crypto|cryptocurrency)\b/i,
    'restricted_or_sensitive_industry_review', 'high_review');

  return signals;
}

export function classifyGuardrailCategory(message: string): Exclude<GuardrailCategory, 'field_help'> | null {
  const normalized = message.trim();
  if (!normalized) return null;

  const rateCategory = CATEGORY_PATTERNS.find((item) => item.category === 'rate_cost');
  if (rateCategory?.patterns.some((pattern) => pattern.test(normalized))) return 'rate_cost';

  const creditCategory = CATEGORY_PATTERNS.find((item) => item.category === 'credit');
  if (creditCategory?.patterns.some((pattern) => pattern.test(normalized))) return 'credit';

  for (const item of CATEGORY_PATTERNS) {
    if (item.category === 'rate_cost' || item.category === 'credit') continue;
    if (item.patterns.some((pattern) => pattern.test(normalized))) return item.category;
  }
  return null;
}

export function getCategoryGuidanceForAi(category: GuardrailCategory | null): string | null {
  if (!category || category === 'field_help') return null;
  return CATEGORY_GUIDANCE[category] ?? null;
}

export function getFieldHelpGuidanceForAi(fieldKey: string): FieldHelpGuidance | null {
  return buildFieldHelpGuidance(fieldKey);
}

function buildFieldHelpGuidance(fieldKey: string): FieldHelpGuidance | null {
  const entry = FIELD_HELP[fieldKey];
  if (!entry) return null;
  return {
    fieldKey,
    topic: entry.topic,
    guidance: entry.guidance,
    findIt: entry.findIt,
  };
}

function detectFieldHelpKey(message: string, nextField: GuardrailNextField | null): string | null {
  if (!FIELD_HELP_INTENT.some((pattern) => pattern.test(message))) return null;
  const lower = message.toLowerCase();
  for (const [fieldKey, entry] of Object.entries(FIELD_HELP)) {
    if (entry.aliases.some((alias) => lower.includes(alias))) return fieldKey;
  }
  return nextField?.fieldKey && FIELD_HELP[nextField.fieldKey] ? nextField.fieldKey : null;
}

function appendForwardMotion(message: string, nextField: GuardrailNextField | null): string {
  if (!nextField) return `${message}\n\nIf your application is complete, please review and sign so the team can move the file forward.`;
  if (message.toLowerCase().includes(nextField.question.toLowerCase())) return message;
  return `${message}\n\nNext up: ${nextField.question}`;
}

function addSignalIf(
  signals: QualificationSignal[],
  lowerMessage: string,
  pattern: RegExp,
  code: string,
  severity: QualificationSignal['severity'],
): void {
  if (!pattern.test(lowerMessage)) return;
  signals.push({ code, severity, evidence: 'merchant_chat_keyword_match' });
}
