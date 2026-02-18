export type EntityType =
  | 'LLC'
  | 'C_CORP'
  | 'S_CORP'
  | 'SOLE_PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'NON_PROFIT'
  | 'OTHER';

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'declined';

export interface BusinessInfo {
  legalName: string;
  dba: string;
  entityType: EntityType | '';
  industry: string;
  stateOfFormation: string;
  ein: string;
  businessStartDate: string;
  phone: string;
  website: string;
  streetAddress: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
  sicCode: string;
  naicsCode: string;
  autoPopulated?: Record<string, boolean>;
}

export interface OwnerInfo {
  ownerIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ownershipPct: string;
  ssn: string;
  dateOfBirth: string;
  creditScore: string;
  streetAddress: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface FinancialInfo {
  annualRevenue: string; // dropdown value
}

export interface LoanRequest {
  amountRequested: string;
  purpose: string;
  urgency: string;
  termPreference: string;
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tcpaConsent: boolean;
}

export interface FormState {
  applicationId: string | null;
  currentStep: number;
  contact: ContactInfo;
  business: BusinessInfo;
  businessConfirmed: boolean | null; // true = confirmed, false = needs edit, null = not yet answered
  owners: OwnerInfo[];
  financial: FinancialInfo;
  loanRequest: LoanRequest;
  hasAdditionalOwners: boolean | null;
  isSaving: boolean;
  lastSaved: string | null;
}

// Micro-step flow (Step 3 is conditional - only if business not confirmed)
export const STEPS = [
  { id: 1, label: 'About You' },
  { id: 2, label: 'Confirm Business' },
  { id: 3, label: 'Business Details' },  // conditional
  { id: 4, label: 'Revenue' },
  { id: 5, label: 'Funding Request' },
  { id: 6, label: 'Owner Details' },
  { id: 7, label: 'Additional Owners' },
  { id: 8, label: 'Review & Sign' },
] as const;

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
] as const;

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'LLC', label: 'LLC' },
  { value: 'C_CORP', label: 'C Corporation' },
  { value: 'S_CORP', label: 'S Corporation' },
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
  { value: 'OTHER', label: 'Other' },
];

export const INDUSTRIES = [
  'Automotive','Construction','Education','Food & Beverage','Healthcare',
  'Hospitality','Manufacturing','Professional Services','Retail','Technology',
  'Transportation','Wholesale','Other',
] as const;

export const LOAN_PURPOSES = [
  'Working Capital','Equipment Purchase','Inventory','Expansion','Payroll',
  'Debt Consolidation','Marketing','Real Estate','Other',
] as const;

export const ANNUAL_REVENUE_RANGES = [
  { value: '0-100k', label: '$0 - $100,000' },
  { value: '100k-250k', label: '$100,000 - $250,000' },
  { value: '250k-500k', label: '$250,000 - $500,000' },
  { value: '500k-1m', label: '$500,000 - $1,000,000' },
  { value: '1m-2m', label: '$1,000,000 - $2,000,000' },
  { value: '2m-5m', label: '$2,000,000 - $5,000,000' },
  { value: '5m+', label: '$5,000,000+' },
] as const;

export const FUNDING_AMOUNT_RANGES = [
  { value: '5k-25k', label: '$5,000 - $25,000' },
  { value: '25k-50k', label: '$25,000 - $50,000' },
  { value: '50k-100k', label: '$50,000 - $100,000' },
  { value: '100k-250k', label: '$100,000 - $250,000' },
  { value: '250k-500k', label: '$250,000 - $500,000' },
  { value: '500k+', label: '$500,000+' },
] as const;

export const URGENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediately (within 1 week)' },
  { value: '2-4weeks', label: '2-4 weeks' },
  { value: '1-2months', label: '1-2 months' },
  { value: 'flexible', label: 'Flexible / No rush' },
] as const;

export const TERM_PREFERENCES = [
  { value: 'short', label: 'Short-term (3-12 months)' },
  { value: 'medium', label: 'Medium-term (1-3 years)' },
  { value: 'long', label: 'Long-term (3+ years)' },
  { value: 'flexible', label: 'Flexible' },
] as const;

export const CREDIT_SCORE_RANGES = [
  { value: 'excellent', label: 'Excellent (750+)' },
  { value: 'good', label: 'Good (700-749)' },
  { value: 'fair', label: 'Fair (650-699)' },
  { value: 'poor', label: 'Poor (below 650)' },
  { value: 'unknown', label: "I don't know" },
] as const;

