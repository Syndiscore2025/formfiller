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
  annualRevenue: string;
  monthlyRevenue: string;
  monthlyExpenses: string;
  outstandingDebts: string;
  bankruptcyHistory: boolean | null;
  bankName: string;
  accountType: string;
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
  owners: OwnerInfo[];
  financial: FinancialInfo;
  loanRequest: LoanRequest;
  isSaving: boolean;
  lastSaved: string | null;
}

export const STEPS = [
  { id: 1, label: 'EIN Lookup' },
  { id: 2, label: 'Business Info' },
  { id: 3, label: 'Owners & Financials' },
  { id: 4, label: 'Loan Request' },
  { id: 5, label: 'Review & Sign' },
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

