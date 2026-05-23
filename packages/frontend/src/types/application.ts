export type EntityType =
  | 'LLC'
  | 'C_CORP'
  | 'S_CORP'
  | 'SOLE_PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'NON_PROFIT'
  | 'OTHER';

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'declined';

export type DataSource = 'opencorporates' | 'google_places';

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
  fieldSources?: Record<string, DataSource>;
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
  urgency: string;
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
  hasAdditionalOwners: boolean | null;
  homeAddressSameAsBusiness: boolean | null;
  isSaving: boolean;
  lastSaved: string | null;
}

export const STEPS = [
  { id: 1, label: 'Get Started' },
  { id: 2, label: 'Business Details' },
  { id: 3, label: 'Revenue & Funding' },
  { id: 4, label: 'Owner Details' },
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
  'Agriculture',
  'Arts & Entertainment',
  'Automotive',
  'Beauty & Wellness',
  'Business Services',
  'Construction',
  'Education',
  'eCommerce',
  'Finance & Insurance',
  'Food & Beverage',
  'Healthcare',
  'Home Services',
  'Hospitality',
  'Manufacturing',
  'Non-Profit',
  'Professional Services',
  'Real Estate',
  'Retail',
  'Technology',
  'Transportation',
  'Travel',
  'Wholesale',
  'Other',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export interface IndustryCodes {
  sicCode: string;
  naicsCode: string;
}

export const INDUSTRY_CODE_MAP = {
  Agriculture: { sicCode: '0100', naicsCode: '111000' },
  'Arts & Entertainment': { sicCode: '7900', naicsCode: '711000' },
  Automotive: { sicCode: '7538', naicsCode: '811111' },
  'Beauty & Wellness': { sicCode: '7231', naicsCode: '812112' },
  'Business Services': { sicCode: '7389', naicsCode: '561990' },
  Construction: { sicCode: '1542', naicsCode: '236220' },
  Education: { sicCode: '8200', naicsCode: '611000' },
  eCommerce: { sicCode: '5961', naicsCode: '454110' },
  'Finance & Insurance': { sicCode: '6000', naicsCode: '522000' },
  'Food & Beverage': { sicCode: '5812', naicsCode: '722511' },
  Healthcare: { sicCode: '8099', naicsCode: '621999' },
  'Home Services': { sicCode: '7349', naicsCode: '561790' },
  Hospitality: { sicCode: '7011', naicsCode: '721110' },
  Manufacturing: { sicCode: '3999', naicsCode: '339999' },
  'Non-Profit': { sicCode: '8399', naicsCode: '813000' },
  'Professional Services': { sicCode: '8999', naicsCode: '541990' },
  'Real Estate': { sicCode: '6531', naicsCode: '531210' },
  Retail: { sicCode: '5399', naicsCode: '455219' },
  Technology: { sicCode: '7371', naicsCode: '541511' },
  Transportation: { sicCode: '4213', naicsCode: '484110' },
  Travel: { sicCode: '4724', naicsCode: '561510' },
  Wholesale: { sicCode: '5099', naicsCode: '423990' },
  Other: { sicCode: '9999', naicsCode: '999990' },
} satisfies Record<Industry, IndustryCodes>;

export function getIndustryCodes(industry: string): IndustryCodes | undefined {
  return INDUSTRY_CODE_MAP[industry as Industry];
}



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
  { value: '1m+', label: '$1,000,000+' },
] as const;

export const URGENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediately (within 1 week)' },
  { value: '2-4weeks', label: '2-4 weeks' },
  { value: '1-2months', label: '1-2 months' },
  { value: 'flexible', label: 'Flexible / No rush' },
] as const;



export const CREDIT_SCORE_RANGES = [
  { value: 'excellent', label: 'Excellent (750+)' },
  { value: 'good', label: 'Good (700-749)' },
  { value: 'fair', label: 'Fair (650-699)' },
  { value: 'poor', label: 'Poor (below 650)' },
  { value: 'unknown', label: "I don't know" },
] as const;

