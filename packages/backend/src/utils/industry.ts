function digitsOnly(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

export function deriveIndustryFromCodes(sicCode?: string | null, naicsCode?: string | null): string | undefined {
  const sic = digitsOnly(sicCode);
  const naics = digitsOnly(naicsCode);

  const hasNaics = (prefixes: string[]) => prefixes.some((prefix) => naics.startsWith(prefix));
  const hasSic = (prefixes: string[]) => prefixes.some((prefix) => sic.startsWith(prefix));
  const sicSector = sic.length >= 2 ? Number.parseInt(sic.slice(0, 2), 10) : Number.NaN;
  const naicsSector = naics.length >= 2 ? Number.parseInt(naics.slice(0, 2), 10) : Number.NaN;

  if (hasNaics(['441']) || hasSic(['5511', '5521', '5531', '5532', '5533', '5541', '753', '754'])) return 'Automotive';
  if (hasNaics(['445', '722']) || hasSic(['5812', '5813', '5814', '514', '5411', '542'])) return 'Food & Beverage';
  if (hasNaics(['621', '622', '623']) || hasSic(['80'])) return 'Healthcare';
  if (hasNaics(['721']) || hasSic(['70'])) return 'Hospitality & Lodging';
  if (hasNaics(['8121']) || hasSic(['723', '724', '725', '726', '729'])) return 'Beauty & Personal Care';
  if (hasNaics(['6244']) || hasSic(['8351'])) return 'Childcare';
  if (hasNaics(['5411']) || hasSic(['81'])) return 'Legal Services';
  if (hasNaics(['5415', '5112', '518']) || hasSic(['737'])) return 'Technology';
  if (hasNaics(['517']) || hasSic(['48'])) return 'Telecommunications';
  if (hasNaics(['5418']) || hasSic(['731', '781', '782', '783'])) return 'Marketing & Media';
  if (hasNaics(['71394']) || hasSic(['7991'])) return 'Fitness & Wellness';
  if (hasNaics(['811']) || hasSic(['75', '76', '769'])) return 'Repair & Maintenance';
  if (hasNaics(['8131']) || hasSic(['8661'])) return 'Religious Organization';
  if (hasNaics(['8132', '8133', '8134', '8139']) || hasSic(['83', '86'])) return 'Nonprofit';

  if (naicsSector === 11 || (sicSector >= 1 && sicSector <= 9)) return 'Agriculture';
  if ([21, 22].includes(naicsSector) || (sicSector >= 10 && sicSector <= 14) || sicSector === 49) return 'Energy & Utilities';
  if (naicsSector === 23 || (sicSector >= 15 && sicSector <= 17)) return 'Construction';
  if ([31, 32, 33].includes(naicsSector) || (sicSector >= 20 && sicSector <= 39)) return 'Manufacturing';
  if (naicsSector === 42 || sicSector === 50 || sicSector === 51) return 'Wholesale & Distribution';
  if ([44, 45].includes(naicsSector) || (sicSector >= 52 && sicSector <= 59)) return 'Retail';
  if ([48, 49].includes(naicsSector) || (sicSector >= 40 && sicSector <= 47)) return 'Transportation & Logistics';
  if (naicsSector === 52 || (sicSector >= 60 && sicSector <= 64) || sicSector === 67) return 'Finance & Insurance';
  if (naicsSector === 53 || sicSector === 65) return 'Real Estate';
  if (naicsSector === 54 || sicSector === 87) return 'Professional Services';
  if ([55, 56].includes(naicsSector) || sicSector === 73) return 'Business Services';
  if (naicsSector === 61 || sicSector === 82) return 'Education';
  if (naicsSector === 71 || sicSector === 78 || sicSector === 79) return 'Entertainment & Recreation';
  if (naicsSector === 72) return 'Hospitality & Lodging';
  if (naicsSector === 92 || (sicSector >= 91 && sicSector <= 97)) return 'Government & Public Services';

  return undefined;
}