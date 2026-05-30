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

export interface FieldMemory {
  autoFilled?: boolean;
  source?: DataSource | 'form' | 'merchant';
  editedByMerchant?: boolean;
  skipped?: boolean;
  updatedAt?: string;
}

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
  autoPopulated?: Record<string, boolean | FieldMemory>;
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

export const ESTIMATED_CREDIT_SCORE_OPTIONS = [
  'Below 550',
  '550 - 599',
  '600 - 649',
  '650 - 699',
  '700 - 749',
  '750+',
] as const;

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
  ownerHomeSameAsBusiness: boolean | null;
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

export interface IndustryCodes {
  sicCode: string;
  naicsCode: string;
}

export const INDUSTRY_CODE_MAP = {
  'Accounting & Bookkeeping': { sicCode: '8721', naicsCode: '541219' },
  'Administrative Services': { sicCode: '8741', naicsCode: '561110' },
  'Advertising & Marketing': { sicCode: '7311', naicsCode: '541810' },
  'Aerospace & Defense Manufacturing': { sicCode: '3721', naicsCode: '336411' },
  Agriculture: { sicCode: '0100', naicsCode: '111000' },
  'Amusement & Attractions': { sicCode: '7996', naicsCode: '713110' },
  'Animal Services': { sicCode: '0752', naicsCode: '812910' },
  'Apparel & Fashion Retail': { sicCode: '5651', naicsCode: '458110' },
  'Apparel Manufacturing': { sicCode: '2339', naicsCode: '315990' },
  'Appliance Sales & Repair': { sicCode: '5722', naicsCode: '449210' },
  'Architecture & Design': { sicCode: '8712', naicsCode: '541310' },
  'Architecture & Engineering': { sicCode: '8711', naicsCode: '541330' },
  'Arts & Entertainment': { sicCode: '7900', naicsCode: '711000' },
  'Assisted Living & Senior Care': { sicCode: '8059', naicsCode: '623312' },
  'Auto Body & Collision Repair': { sicCode: '7532', naicsCode: '811121' },
  'Auto Parts & Accessories': { sicCode: '5531', naicsCode: '441330' },
  'Auto Rental & Leasing': { sicCode: '7514', naicsCode: '532111' },
  'Auto Repair': { sicCode: '7538', naicsCode: '811111' },
  'Auto Sales': { sicCode: '5511', naicsCode: '441110' },
  Automotive: { sicCode: '7538', naicsCode: '811111' },
  Bakery: { sicCode: '5461', naicsCode: '311811' },
  'Bar & Nightclub': { sicCode: '5813', naicsCode: '722410' },
  'Beauty & Personal Care': { sicCode: '7231', naicsCode: '812112' },
  'Beauty & Wellness': { sicCode: '7231', naicsCode: '812112' },
  'Boat & Marine Services': { sicCode: '4493', naicsCode: '713930' },
  Bookstore: { sicCode: '5942', naicsCode: '459210' },
  'Brewery, Winery & Distillery': { sicCode: '2082', naicsCode: '312120' },
  'Building Materials': { sicCode: '5211', naicsCode: '444180' },
  'Business Consulting': { sicCode: '8742', naicsCode: '541611' },
  'Business Services': { sicCode: '7389', naicsCode: '561990' },
  'Call Center': { sicCode: '7389', naicsCode: '561422' },
  'Cannabis & CBD': { sicCode: '5999', naicsCode: '459999' },
  'Car Wash': { sicCode: '7542', naicsCode: '811192' },
  Carpentry: { sicCode: '1751', naicsCode: '238350' },
  Catering: { sicCode: '5812', naicsCode: '722320' },
  Childcare: { sicCode: '8351', naicsCode: '624410' },
  'Cleaning & Janitorial': { sicCode: '7349', naicsCode: '561720' },
  'Commercial Real Estate': { sicCode: '6531', naicsCode: '531120' },
  'Computer Repair': { sicCode: '7378', naicsCode: '811212' },
  Construction: { sicCode: '1542', naicsCode: '236220' },
  'Consumer Electronics Retail': { sicCode: '5731', naicsCode: '449210' },
  'Convenience Store': { sicCode: '5411', naicsCode: '445131' },
  'Credit & Financial Services': { sicCode: '6099', naicsCode: '522390' },
  'Dental Practice': { sicCode: '8021', naicsCode: '621210' },
  'Dry Cleaning & Laundry': { sicCode: '7216', naicsCode: '812320' },
  Education: { sicCode: '8200', naicsCode: '611000' },
  'Electrical Contractor': { sicCode: '1731', naicsCode: '238210' },
  eCommerce: { sicCode: '5961', naicsCode: '454110' },
  'Energy & Utilities': { sicCode: '4911', naicsCode: '221000' },
  'Engineering Services': { sicCode: '8711', naicsCode: '541330' },
  'Entertainment & Recreation': { sicCode: '7999', naicsCode: '713990' },
  'Equipment Rental': { sicCode: '7359', naicsCode: '532490' },
  'Event Planning': { sicCode: '7389', naicsCode: '561920' },
  'Farming & Crop Production': { sicCode: '0119', naicsCode: '111998' },
  'Finance & Insurance': { sicCode: '6000', naicsCode: '522000' },
  'Fitness & Wellness': { sicCode: '7991', naicsCode: '713940' },
  'Flooring Contractor': { sicCode: '1752', naicsCode: '238330' },
  Florist: { sicCode: '5992', naicsCode: '459310' },
  'Food & Beverage': { sicCode: '5812', naicsCode: '722511' },
  'Food Truck': { sicCode: '5812', naicsCode: '722330' },
  'Freight Brokerage': { sicCode: '4731', naicsCode: '488510' },
  'Furniture Store': { sicCode: '5712', naicsCode: '449110' },
  'Gas Station': { sicCode: '5541', naicsCode: '457120' },
  'General Contractor': { sicCode: '1521', naicsCode: '236118' },
  'Government & Public Services': { sicCode: '9199', naicsCode: '921190' },
  'Grocery Store': { sicCode: '5411', naicsCode: '445110' },
  'Gym & Fitness Center': { sicCode: '7991', naicsCode: '713940' },
  Healthcare: { sicCode: '8099', naicsCode: '621999' },
  'Home Healthcare': { sicCode: '8082', naicsCode: '621610' },
  'Home Services': { sicCode: '7349', naicsCode: '561790' },
  Hospitality: { sicCode: '7011', naicsCode: '721110' },
  'Hospitality & Lodging': { sicCode: '7011', naicsCode: '721110' },
  'Hotel & Motel': { sicCode: '7011', naicsCode: '721110' },
  'HVAC Contractor': { sicCode: '1711', naicsCode: '238220' },
  'Import/Export': { sicCode: '5099', naicsCode: '425120' },
  'Insurance Agency': { sicCode: '6411', naicsCode: '524210' },
  'Interior Design': { sicCode: '7389', naicsCode: '541410' },
  'IT Services': { sicCode: '7379', naicsCode: '541519' },
  Landscaping: { sicCode: '0782', naicsCode: '561730' },
  'Legal Services': { sicCode: '8111', naicsCode: '541110' },
  'Logistics & Freight': { sicCode: '4731', naicsCode: '488510' },
  Manufacturing: { sicCode: '3999', naicsCode: '339999' },
  'Marketing & Media': { sicCode: '7311', naicsCode: '541810' },
  'Medical Practice': { sicCode: '8011', naicsCode: '621111' },
  'Medical Spa': { sicCode: '8099', naicsCode: '621399' },
  'Mobile Food Services': { sicCode: '5812', naicsCode: '722330' },
  'Mortgage & Lending': { sicCode: '6162', naicsCode: '522310' },
  'Moving Company': { sicCode: '4214', naicsCode: '484210' },
  'Non-Profit': { sicCode: '8399', naicsCode: '813000' },
  Nonprofit: { sicCode: '8399', naicsCode: '813000' },
  'Office Administration': { sicCode: '8741', naicsCode: '561110' },
  'Oil, Gas & Mining': { sicCode: '1311', naicsCode: '211120' },
  'Online Marketplace': { sicCode: '5961', naicsCode: '454110' },
  'Professional Services': { sicCode: '8999', naicsCode: '541990' },
  'Painting Contractor': { sicCode: '1721', naicsCode: '238320' },
  'Personal Services': { sicCode: '7299', naicsCode: '812990' },
  'Pest Control': { sicCode: '7342', naicsCode: '561710' },
  'Pet Care & Grooming': { sicCode: '0752', naicsCode: '812910' },
  Pharmacy: { sicCode: '5912', naicsCode: '456110' },
  Photography: { sicCode: '7221', naicsCode: '541921' },
  'Plumbing Contractor': { sicCode: '1711', naicsCode: '238220' },
  'Printing & Signage': { sicCode: '2752', naicsCode: '323111' },
  'Property Management': { sicCode: '6531', naicsCode: '531311' },
  'Real Estate': { sicCode: '6531', naicsCode: '531210' },
  'Real Estate Brokerage': { sicCode: '6531', naicsCode: '531210' },
  'Religious Organization': { sicCode: '8661', naicsCode: '813110' },
  'Repair & Maintenance': { sicCode: '7699', naicsCode: '811490' },
  Restaurant: { sicCode: '5812', naicsCode: '722511' },
  Retail: { sicCode: '5399', naicsCode: '455219' },
  'Roofing Contractor': { sicCode: '1761', naicsCode: '238160' },
  'Salon & Spa': { sicCode: '7231', naicsCode: '812112' },
  'Security Services': { sicCode: '7381', naicsCode: '561612' },
  'Software & SaaS': { sicCode: '7372', naicsCode: '513210' },
  'Specialty Contractor': { sicCode: '1799', naicsCode: '238990' },
  'Staffing & Recruiting': { sicCode: '7361', naicsCode: '561311' },
  'Storage Facility': { sicCode: '4225', naicsCode: '531130' },
  Technology: { sicCode: '7371', naicsCode: '541511' },
  Telecommunications: { sicCode: '4813', naicsCode: '517810' },
  Transportation: { sicCode: '4213', naicsCode: '484110' },
  'Transportation & Logistics': { sicCode: '4213', naicsCode: '484110' },
  Travel: { sicCode: '4724', naicsCode: '561510' },
  Trucking: { sicCode: '4213', naicsCode: '484121' },
  'Veterinary Clinic': { sicCode: '0742', naicsCode: '541940' },
  'Warehouse & Storage': { sicCode: '4225', naicsCode: '493110' },
  Wholesale: { sicCode: '5099', naicsCode: '423990' },
  'Wholesale & Distribution': { sicCode: '5099', naicsCode: '423990' },
  Other: { sicCode: '9999', naicsCode: '999990' },
} as const satisfies Record<string, IndustryCodes>;

export const INDUSTRIES = Object.keys(INDUSTRY_CODE_MAP).sort() as Array<keyof typeof INDUSTRY_CODE_MAP>;

export type Industry = keyof typeof INDUSTRY_CODE_MAP;

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

