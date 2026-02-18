import { config } from '../config';

export interface BusinessLookupResult {
  legalName?: string;
  entityType?: string;
  stateOfFormation?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  registrationDate?: string;
  sicCode?: string;
  naicsCode?: string;
  phone?: string;
  website?: string;
  officers?: Array<{ name: string; role: string }>;
  source: string;
  fieldsPopulated: string[];
  // Track which source provided each field
  fieldSources?: Record<string, 'opencorporates' | 'google_places'>;
}

export async function lookupByOpenCorporates(
  businessName: string,
  state: string
): Promise<BusinessLookupResult | null> {
  if (!config.openCorporatesApiKey) return null;

  const params = new URLSearchParams({
    q: businessName,
    jurisdiction_code: `us_${state.toLowerCase()}`,
    api_token: config.openCorporatesApiKey,
    per_page: '1',
  });

  const url = `https://api.opencorporates.com/v0.4/companies/search?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    results?: { companies?: Array<{ company: Record<string, unknown> }> };
  };

  const companies = json?.results?.companies;
  if (!companies?.length) return null;

  const company = companies[0].company as Record<string, unknown>;
  const populated: string[] = [];

  const result: BusinessLookupResult = { source: 'opencorporates', fieldsPopulated: [] };

  if (company.name) { result.legalName = company.name as string; populated.push('legalName'); }
  if (company.company_type) { result.entityType = company.company_type as string; populated.push('entityType'); }
  if (company.jurisdiction_code) { result.stateOfFormation = (company.jurisdiction_code as string).replace('us_', '').toUpperCase(); populated.push('stateOfFormation'); }
  if (company.incorporation_date) { result.registrationDate = company.incorporation_date as string; populated.push('registrationDate'); }

  const addr = company.registered_address as Record<string, unknown> | null;
  if (addr) {
    if (addr.street_address) { result.streetAddress = addr.street_address as string; populated.push('streetAddress'); }
    if (addr.locality) { result.city = addr.locality as string; populated.push('city'); }
    if (addr.region) { result.state = addr.region as string; populated.push('state'); }
    if (addr.postal_code) { result.zipCode = addr.postal_code as string; populated.push('zipCode'); }
  }

  // Extract SIC code — OpenCorporates may return industry_codes array
  const industryCodes = company.industry_codes as Array<{
    code: string;
    description?: string;
    code_scheme_id?: string;
  }> | null;

  if (Array.isArray(industryCodes)) {
    const sicEntry = industryCodes.find((ic) =>
      ic.code_scheme_id?.toLowerCase().startsWith('sic')
    );
    const naicsEntry = industryCodes.find((ic) =>
      ic.code_scheme_id?.toLowerCase().startsWith('naics')
    );
    if (sicEntry?.code) {
      result.sicCode = sicEntry.code;
      populated.push('sicCode');
    }
    if (naicsEntry?.code) {
      result.naicsCode = naicsEntry.code;
      populated.push('naicsCode');
    }
  }

  result.fieldsPopulated = populated;
  return result;
}

