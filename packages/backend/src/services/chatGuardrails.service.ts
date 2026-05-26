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

export interface GuardrailEvaluation {
  category: GuardrailCategory | null;
  reply: string | null;
  suggestedActions: string[];
  qualificationSignals: QualificationSignal[];
  responseSource: 'response_bank' | 'openai_allowed';
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
      /\bhow much can i get\b/i, /\bwhat can i get\b/i, /\bmonthly\b/i, /\bweekly\b/i, /\bdaily\b/i,
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

const FIELD_HELP: Record<string, { aliases: string[]; answer: string; findIt?: string }> = {
  'business.legalName': {
    aliases: ['legal name', 'business name', 'company name', 'name of business'],
    answer: 'Use the exact legal business name used on tax records, formation documents, bank statements, and business registrations. This helps the review team match the application to the correct business.',
    findIt: 'You can usually find it on IRS documents, your Secretary of State registration, business bank statements, or formation paperwork.',
  },
  'business.stateOfFormation': {
    aliases: ['state of formation', 'state of incorporation', 'incorporated', 'formed', 'registered'],
    answer: 'This is the state where the business entity was legally formed or registered. It helps verify the business record and keeps the application consistent with public filings.',
    findIt: 'Check your articles of organization/incorporation, Secretary of State filing, or business registration record.',
  },
  'contact.email': {
    aliases: ['email', 'email address'],
    answer: 'The email address is used for application communication, status follow-up, document requests, and signature-related messages. Use the best business contact email.',
  },
  'contact.phone': {
    aliases: ['phone', 'phone number', 'telephone'],
    answer: 'The phone number gives the funding team a way to reach you if something on the application needs clarification. Use the best number for the business owner or authorized contact.',
  },
  'business.ein': {
    aliases: ['ein', 'employer identification number', 'tax id', 'tax identification', 'federal tax id'],
    answer: 'An EIN is the 9-digit business tax identification number shown on the SS-4 confirmation letter the IRS sends when the business is first registered. It may also appear on business tax returns, payroll records, business bank paperwork, or IRS notices. If you are a sole proprietor and do not have an EIN, do not wait on the IRS for a new number or replacement letter — select the Sole Proprietorship option in the form instead.',
  },
  tcpaConsent: {
    aliases: ['consent', 'contact consent', 'tcpa', 'authorization to contact'],
    answer: 'Contact consent confirms the team is allowed to communicate with you about this funding request. It is part of keeping outreach permission clear and documented.',
  },
  'business.industry': {
    aliases: ['industry', 'business type', 'type of business', 'naics', 'sic'],
    answer: 'Industry helps the review team understand what the business does and route the file correctly. Choose the closest match to the main way the business earns revenue.',
  },
  'business.streetAddress': {
    aliases: ['business address', 'street address', 'business street', 'office address', 'store address'],
    answer: 'The business address helps verify where the business operates and keeps the application aligned with business records and bank documentation.',
    findIt: 'Use the operating address shown on business bank statements, leases, utility bills, registrations, or other business records.',
  },
  'business.city': {
    aliases: ['business city', 'city'],
    answer: 'The city is part of the business operating address. It helps verify the business location and complete the application record.',
  },
  'business.state': {
    aliases: ['business state', 'state located', 'business location state'],
    answer: 'The business state is part of the operating address and helps the review team understand where the business is located.',
  },
  'business.zipCode': {
    aliases: ['business zip', 'zip code', 'postal code', 'business postal'],
    answer: 'The ZIP code completes the business address and helps verify the business location accurately.',
  },
  'financial.annualRevenue': {
    aliases: ['annual revenue', 'revenue', 'sales', 'gross sales', 'gross revenue'],
    answer: 'Annual revenue gives the review team a high-level view of business activity. Use the closest accurate range from your records rather than guessing from one day or one deposit.',
    findIt: 'You can estimate it from tax returns, profit-and-loss reports, bookkeeping software, bank deposits, or annual sales reports.',
  },
  'loanRequest.amountRequested': {
    aliases: ['funding needed', 'amount requested', 'funding amount', 'how much funding', 'amount looking for'],
    answer: 'The requested amount helps the team understand your funding goal and business need. It is not a quote or approval; it simply tells the team what you are seeking so the file can be reviewed properly.',
  },
  'owner.firstName': {
    aliases: ['owner first name', 'first name', 'primary owner name'],
    answer: 'The primary owner name identifies the person associated with the application and helps match the owner details to the business record.',
  },
  'owner.lastName': {
    aliases: ['owner last name', 'last name', 'surname'],
    answer: 'The owner last name is part of verifying the identity of the primary owner connected to the business application.',
  },
  'owner.ownershipPct': {
    aliases: ['ownership', 'ownership percent', 'ownership percentage', 'percent owned', 'owner percentage'],
    answer: 'Ownership percentage helps determine who needs to be listed on the application and whether additional owners must be included. Enter the primary owner’s actual ownership share.',
    findIt: 'You can usually confirm this from your operating agreement, shareholder records, partnership agreement, or formation documents.',
  },
  'owner.streetAddress': {
    aliases: ['owner address', 'home address', 'personal address', 'owner street'],
    answer: 'The owner home address is used for identity verification and application review. Enter it only in the secure form fields, not in chat.',
  },
  'owner.city': {
    aliases: ['owner city', 'home city'],
    answer: 'The owner city is part of the owner address used for identity verification and application records.',
  },
  'owner.state': {
    aliases: ['owner state', 'home state'],
    answer: 'The owner state is part of the owner address used for identity verification and application records.',
  },
  'owner.zipCode': {
    aliases: ['owner zip', 'home zip', 'owner postal'],
    answer: 'The owner ZIP code completes the owner address for identity verification and application records.',
  },
  'application.hasAdditionalOwners': {
    aliases: ['additional owners', 'other owners', 'partners', 'co owner', 'co-owner'],
    answer: 'This tells the team whether other owners need to be included on the application. If the primary owner owns the required controlling share, the form may not need additional owner details.',
  },
  'owner.ssn': {
    aliases: ['ssn', 'social security', 'social security number'],
    answer: 'SSN is used only for identity verification and must be entered in the secure form field. Do not send it in chat.',
  },
  'owner.dateOfBirth': {
    aliases: ['date of birth', 'dob', 'birthdate', 'birthday'],
    answer: 'Date of birth is used only for identity verification and must be entered in the secure form field. Do not send it in chat.',
  },
  signature: {
    aliases: ['signature', 'sign', 'e-sign', 'esign', 'authorization'],
    answer: 'The signature confirms the application is accurate and ready to be reviewed. Review the information first, then sign through the application when everything looks correct.',
  },
  'documents.bankStatements': {
    aliases: ['bank statements', 'bank statement', 'documents', 'upload', 'pdf', 'plaid'],
    answer: 'Bank statements help verify business activity and cash flow for review. Upload them through the secure application area so the documents stay attached to the file.',
    findIt: 'Most banks let you download monthly statement PDFs from online banking. Official PDFs are better than screenshots when available.',
  },
};

const RESPONSE_BANK: Record<Exclude<GuardrailCategory, 'field_help'>, string[]> = {
  rate_cost: [
    "I wouldn't want to guess at pricing from a chat message. The team needs the full application and supporting documents before discussing options. Let's keep the file moving so it can be reviewed the right way.",
    "Pricing is file-specific, so I don't want to give you anything inaccurate here. Once the application is complete and signed, the funding team can review the full picture and respond appropriately.",
    "I can help with the application, but I should not quote pricing, payment structure, or terms in chat. The fastest path to accurate information is completing and signing the file.",
    "Those details depend on the complete business profile and document review. I don't want to throw out numbers that may not apply. Let's finish the application so the team can review it properly.",
    "That's a fair question, but pricing cannot be responsibly estimated from partial information. The next best move is to complete the remaining fields and sign so the review can begin.",
    "I want to be careful here: chat is not the place to quote costs, terms, or payment details. A complete signed application gives the funding team what they need to evaluate options.",
    "Rather than guessing, let's get the file complete. Once the application and requested documents are in, the team can review the full business profile.",
    "I don't want to mislead you with a rough estimate. Funding details are reviewed after the complete application is submitted and signed.",
    "The responsible answer is that it depends on the full file review. I can help you finish the application so the team has what they need.",
    "I can explain the process, but I won't quote pricing or terms in chat. Completing and signing the application is what lets the team review real options.",
  ],
  approval_qualification: [
    "Qualification depends on the full business profile, not a single answer in chat. The best way to get reviewed is to complete and sign the application.",
    "I don't want to approve or decline anything from chat. The funding team needs the completed file before making any review decision.",
    "A lot goes into review, including the business profile and supporting documents. Let's finish the application so it can be looked at properly.",
    "I can help you move through the application, but I can't make an underwriting call here. Once the file is complete and signed, the team can review it.",
    "That is something the review team determines from the complete file. The fastest way to find out is to finish the remaining steps.",
    "I don't want to guess on eligibility. Complete information gives the team the context they need to review your business fairly.",
    "The review is based on the overall application, so the next step is getting the full file submitted and signed.",
    "I can keep you moving, but I should not make a qualification promise in chat. Let's get the file complete first.",
    "There may be options to review, but the team needs the complete application before saying what fits. Let's keep going.",
    "The safest answer is that it requires review. Finishing and signing the application gives the funding team what they need.",
  ],
  credit: [
    "Credit can be part of the review, but it is not the only thing considered. The full business file gives the team a better view than chat can.",
    "A credit profile alone does not tell the whole story. Business activity, documentation, and the completed application all matter.",
    "I don't want to make a call from one credit detail. The best next step is to finish the application so the team can review the complete profile.",
    "Many files require a broader review than just credit. Let's get the application completed and signed so it can be evaluated correctly.",
    "Credit questions are common, but the answer depends on the full file. I can help you get the application submitted for review.",
    "The team will look at the overall business picture. I should not reduce that to a chat answer or a single credit point.",
    "Your credit profile is only one piece of the review. Completing the application gives the team the context they need.",
    "I can explain the process, but I can't determine eligibility from credit alone in chat. Let's keep the application moving.",
    "The review team needs the completed file before weighing credit with the rest of the business information.",
    "Rather than guessing from credit alone, let's finish and sign the application so the file can be reviewed properly.",
  ],
  documents_bank: [
    "Bank statements help the funding team understand business activity and cash flow. Uploading the requested documents helps the review move much faster.",
    "The documents support the information in the application and help the team review the business accurately. The best move is to upload them through the secure form.",
    "Statements are used to verify business activity for review. Please upload the requested files in the application rather than sending sensitive information in chat.",
    "Those documents help complete the file so the team is not guessing. Uploading them in the secure portal keeps everything organized.",
    "The review team needs documentation to evaluate the business properly. Once the statements are uploaded, the file is much stronger for review.",
    "Please use the secure upload area for bank statements. It keeps the documents tied to your application and avoids sensitive details in chat.",
    "Screenshots are often harder to review than official files. If possible, upload the statement PDFs through the application.",
    "Documents help verify the business profile. The secure upload step is the cleanest way to get the file ready for review.",
    "I can guide you through the upload, but the actual statements should go through the secure application area.",
    "The more complete the document section is, the easier it is for the team to review the file without delays.",
  ],
  process_timeline: [
    "After the application is complete and signed, the file can move into review. The cleaner the file is, the easier it is for the team to work through it.",
    "The process starts with a complete signed application and the requested documents. From there, the funding team reviews the business profile.",
    "Your next step is to finish the missing application item. Once everything is submitted and signed, the team can review the file.",
    "The application is designed to collect what the review team needs upfront. Finishing it helps avoid back-and-forth later.",
    "Once the file is complete, the team can review it and follow up if anything else is needed. Let's focus on getting it complete first.",
    "The fastest path is a complete application, signature, and requested uploads. That gives the team the full context.",
    "The review depends on having the complete file. I can help you get through the next application step now.",
    "The next move is completing the open fields and signing. That is what lets the review process start cleanly.",
    "I can walk you through it step by step. We should get the application completed before discussing review outcomes.",
    "The process is straightforward: complete the form, sign, upload requested documents, and let the team review the full file.",
  ],
  trust_security: [
    "That's a smart question. The application is meant to collect information securely in the form fields, not through chat. I can help guide you without asking for sensitive identity details here.",
    "Your caution makes sense. Sensitive information should only be entered in the secure application fields, and I can help you understand each step before you continue.",
    "I understand wanting to verify things before moving forward. This chat is here to guide the application, and sensitive details should stay inside the secure form.",
    "Good question. I won't ask you to send identity information in chat. Use the secure application fields for anything sensitive.",
    "It's reasonable to be careful with business and owner information. The safest path is to complete the requested fields directly in the application.",
    "I can explain why each item is requested, but sensitive details should never be typed into chat. Keep those inside the secure form fields.",
    "Trust matters. The review team needs complete information, but it should be provided through the application workflow rather than in this chat.",
    "I appreciate you checking. My role is to help you finish the application and answer financing-process questions without collecting sensitive identity data here.",
    "If something feels unclear, ask me before entering it. I can explain the purpose of the field and help you continue safely.",
    "Security is important here. Let's keep sensitive information in the form and use chat only for guidance and general questions.",
  ],
  application_help: [
    "I can help with that. The goal is to complete the application cleanly so the funding team has enough context to review it.",
    "No problem — I'll guide you through the next piece. If a field is unclear, tell me which one and I'll explain it in plain language.",
    "The application is collecting the business profile for review. Let's handle the next missing field and keep the file moving.",
    "I can walk you through it step by step. Complete information helps prevent delays once the file is reviewed.",
    "If you're unsure what to enter, give me the field name and I can explain what it is asking for. You should still confirm the final entry in the form.",
    "You can ask questions as you go. My job is to help you finish the application without guessing or skipping important items.",
    "Let's keep it simple: answer the next required field as accurately as you can, and I can clarify anything that feels confusing.",
    "I can help you understand the form, but I won't fill or change fields for you. You stay in control of what gets submitted.",
    "The best way forward is to finish the required fields, review everything, and sign when it is accurate.",
    "I'm here to keep the process moving. Tell me what part is giving you trouble and we'll work through it.",
  ],
  signing: [
    "The signature confirms the application is ready to be reviewed. Before signing, make sure the information looks accurate.",
    "Signing is what allows the completed file to move forward for review. Please review the application first, then sign when it is correct.",
    "The review team needs a completed and signed file. If everything looks accurate, the signature step is the next move.",
    "E-signature is part of finalizing the application. Review the information, confirm the authorizations, and sign when ready.",
    "If you are comfortable with the information entered, signing helps move the file from draft into review.",
    "The signature step is important because it confirms the application is complete from your side.",
    "Please do not sign until the application details look right. Once they do, signing is the cleanest way to move forward.",
    "The file cannot be fully reviewed as a completed submission until the signature step is handled.",
    "Signing does not mean I can quote an outcome in chat; it means the team can review the completed file properly.",
    "Review first, then sign through the application when the details are accurate.",
  ],
  competitor_comparison: [
    "It makes sense to compare options. I still wouldn't want to discuss pricing or promises in chat. Completing the application gives the team the full file to review properly.",
    "Shopping around is normal. The best way for this team to evaluate your situation is with a completed and signed application.",
    "Another offer may not be directly comparable without reviewing the full details. Let's get your file complete so it can be reviewed on its own merits.",
    "I don't want to negotiate from partial information in chat. The team needs the complete application before discussing what may fit.",
    "Every provider structures things differently, so the cleanest path is to complete this application and let the team review your file.",
    "I understand wanting the strongest option. A complete signed application gives the team the best chance to review the full picture.",
    "Rather than comparing incomplete details, let's get this file submitted properly so the team can evaluate it.",
    "I can help you move through the application, but I should not quote or compare terms in chat.",
    "If you already have another option, accuracy matters even more. Finish the application so the team can review the actual file.",
    "The best comparison starts with a complete file. Let's finish the application and avoid guessing.",
  ],
  frustration: [
    "I understand — applications can feel repetitive. The goal is to collect enough information upfront so the review team does not have to keep coming back for basics.",
    "I hear you. Let's keep this as simple as possible and focus only on the next required item.",
    "Totally fair. The form is asking for what the review team needs, and I'll help you get through it without extra noise.",
    "I get that it can feel like a lot. Completing it now helps avoid delays later in the review.",
    "Let's slow it down and handle one field at a time. We only need to focus on the next missing piece.",
    "I understand the frustration. The fastest way out of the form is to finish the required fields, review, and sign.",
    "You're not alone — business funding forms can be detailed. I can help you move through the remaining steps.",
    "I hear you. I'll keep my answers short and focused so we can get this finished.",
    "The details matter for review, but we can take it one step at a time.",
    "Let's get you through the next required item and keep the process moving.",
  ],
  product_education: [
    "Small-business financing can include different product types, and the right fit depends on the complete file. The application helps the team understand what may be appropriate.",
    "Different funding products review business activity in different ways. I can explain the general process, but the team needs the full application before discussing fit.",
    "The application is designed to give the funding team enough information to review possible options without guessing from chat.",
    "There are multiple ways businesses seek capital, but I should not steer you to a specific structure without a file review.",
    "The best product fit depends on the business profile and documentation. Completing the application is the right first step.",
    "I can answer general financing questions, but specific options require review of the completed application.",
    "Working capital, credit lines, and other products can be reviewed differently. The team needs the full file to evaluate what fits.",
    "Rather than guessing which product applies, let's get your application submitted so the team has the whole picture.",
    "The funding team reviews the application before determining what type of option may make sense.",
    "I can keep this high-level for now: complete the form, sign, upload requested documents, and let the team review the full business profile.",
  ],
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
  const fieldHelpReply = buildFieldHelpReply(input.message, input.nextField);
  if (fieldHelpReply) {
    return {
      category: 'field_help',
      reply: fieldHelpReply,
      suggestedActions: input.nextField ? [input.nextField.label, 'Continue application'] : ['Review next steps'],
      qualificationSignals,
      responseSource: 'response_bank',
    };
  }

  const category = classifyGuardrailCategory(input.message);

  if (!category) {
    return {
      category: null,
      reply: null,
      suggestedActions: input.nextField ? [input.nextField.label] : ['Review next steps'],
      qualificationSignals,
      responseSource: 'openai_allowed',
    };
  }

  const selected = selectResponse(category, input.message, input.usedAssistantMessages || []);
  const reply = appendForwardMotion(selected, input.nextField);
  return {
    category,
    reply,
    suggestedActions: input.nextField ? [input.nextField.label, 'Continue application'] : ['Review next steps'],
    qualificationSignals,
    responseSource: 'response_bank',
  };
}

export function enforceFundingResponseSafety(message: string, nextField: GuardrailNextField | null): FundingSafetyResult {
  const assistantAnswerOnly = message.split(/\n\nNext up:/i)[0] || message;
  const issues = FUNDING_QUOTE_PATTERNS
    .filter(({ pattern }) => pattern.test(assistantAnswerOnly))
    .map(({ issue }) => issue);

  if (issues.length === 0) return { message, replaced: false, issues: [] };
  return {
    message: appendForwardMotion(NO_QUOTE_MESSAGE, nextField),
    replaced: true,
    issues,
  };
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

function selectResponse(category: Exclude<GuardrailCategory, 'field_help'>, message: string, usedAssistantMessages: string[]): string {
  const responses = RESPONSE_BANK[category];
  const used = usedAssistantMessages.map(normalizeForComparison);
  const available = responses.filter((candidate) => !used.some((old) => old.includes(normalizeForComparison(candidate).slice(0, 80))));
  const pool = available.length > 0 ? available : responses;
  return pool[Math.abs(hash(`${category}:${message}`)) % pool.length];
}

function buildFieldHelpReply(message: string, nextField: GuardrailNextField | null): string | null {
  if (!FIELD_HELP_INTENT.some((pattern) => pattern.test(message))) return null;
  const targetKey = findFieldHelpTarget(message, nextField);
  if (!targetKey) return null;
  const help = FIELD_HELP[targetKey];
  if (!help) return null;

  const parts = [help.answer];
  if (help.findIt) parts.push(help.findIt);
  return appendForwardMotion(parts.join(' '), nextField);
}

function findFieldHelpTarget(message: string, nextField: GuardrailNextField | null): string | null {
  const lower = message.toLowerCase();
  for (const [fieldKey, help] of Object.entries(FIELD_HELP)) {
    if (help.aliases.some((alias) => lower.includes(alias))) return fieldKey;
  }
  return nextField?.fieldKey || null;
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

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result) + value.charCodeAt(index);
    result |= 0;
  }
  return result;
}