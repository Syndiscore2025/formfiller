/**
 * Curated directory of US banks, credit unions, and business-banking fintechs.
 *
 * When a merchant searches for one of these on the bank-help step, we skip the
 * DuckDuckGo discovery hop and feed the AI a known canonical URL so the
 * resulting instructions are accurate and consistent.
 */

export interface BankDirectoryEntry {
  /** Canonical display name shown back to the merchant. */
  displayName: string;
  /** Official URL we trust enough to fetch and pass to the AI. */
  url: string;
  /** Alternate names / common misspellings used for matching. */
  aliases?: string[];
}

export const BANK_DIRECTORY: readonly BankDirectoryEntry[] = [
  { displayName: 'Chase Bank', url: 'https://www.chase.com/business/banking', aliases: ['chase', 'jpmorgan chase', 'jp morgan chase', 'jpmc'] },
  { displayName: 'Bank of America', url: 'https://www.bankofamerica.com/smallbusiness/', aliases: ['bofa', 'b of a', 'bank of america business'] },
  { displayName: 'Wells Fargo', url: 'https://www.wellsfargo.com/biz/', aliases: ['wells', 'wellsfargo', 'wells fargo bank'] },
  { displayName: 'Citibank', url: 'https://www.citi.com/smallbusiness/', aliases: ['citi', 'citigroup', 'citi bank'] },
  { displayName: 'U.S. Bank', url: 'https://www.usbank.com/business-banking.html', aliases: ['us bank', 'usbank', 'united states bank'] },
  { displayName: 'PNC Bank', url: 'https://www.pnc.com/en/small-business.html', aliases: ['pnc'] },
  { displayName: 'Truist', url: 'https://www.truist.com/small-business', aliases: ['truist bank', 'bbt', 'suntrust', 'bb&t'] },
  { displayName: 'TD Bank', url: 'https://www.td.com/us/en/small-business', aliases: ['td', 'toronto dominion', 'td america'] },
  { displayName: 'Capital One', url: 'https://www.capitalone.com/small-business-bank/', aliases: ['capital 1', 'cap one', 'capitalone'] },
  { displayName: 'Goldman Sachs (Marcus)', url: 'https://www.marcus.com/us/en', aliases: ['marcus', 'goldman sachs', 'goldman'] },
  { displayName: 'Charles Schwab Bank', url: 'https://www.schwab.com/checking', aliases: ['schwab', 'charles schwab'] },
  { displayName: 'Citizens Bank', url: 'https://www.citizensbank.com/small-business/overview.aspx', aliases: ['citizens', 'citizens financial'] },
  { displayName: 'M&T Bank', url: 'https://www3.mtb.com/business', aliases: ['mt bank', 'm and t', 'manufacturers and traders', 'm&t'] },
  { displayName: 'Fifth Third Bank', url: 'https://www.53.com/content/fifth-third/en/small-business.html', aliases: ['fifth third', '5/3', '53 bank', 'fifththird'] },
  { displayName: 'KeyBank', url: 'https://www.key.com/business/index.jsp', aliases: ['key bank', 'key'] },
  { displayName: 'Huntington Bank', url: 'https://www.huntington.com/Business', aliases: ['huntington', 'huntington national'] },
  { displayName: 'Regions Bank', url: 'https://www.regions.com/small-business', aliases: ['regions', 'regions financial'] },
  { displayName: 'BMO Harris', url: 'https://www.bmo.com/main/business/', aliases: ['bmo', 'bmo bank', 'harris bank', 'bank of montreal'] },
  { displayName: 'HSBC USA', url: 'https://www.us.hsbc.com/business-banking/', aliases: ['hsbc', 'hsbc bank usa'] },
  { displayName: 'Santander Bank', url: 'https://www.santanderbank.com/business', aliases: ['santander'] },
  { displayName: 'First Citizens Bank', url: 'https://www.firstcitizens.com/small-business', aliases: ['first citizens', 'firstcitizens'] },
  { displayName: 'BNY Mellon', url: 'https://www.bnymellon.com/', aliases: ['bny', 'bank of new york mellon', 'bnymellon'] },
  { displayName: 'Comerica Bank', url: 'https://www.comerica.com/business.html', aliases: ['comerica'] },
  { displayName: 'Zions Bank', url: 'https://www.zionsbank.com/business/', aliases: ['zions', 'zions first national', 'zion bank'] },
  { displayName: 'First Horizon Bank', url: 'https://www.firsthorizon.com/Small-Business', aliases: ['first horizon', 'first tennessee', 'firsthorizon'] },
  { displayName: 'Synovus Bank', url: 'https://www.synovus.com/business/', aliases: ['synovus'] },
  { displayName: 'Webster Bank', url: 'https://public.websteronline.com/business', aliases: ['webster'] },
  { displayName: 'Valley National Bank', url: 'https://www.valley.com/business', aliases: ['valley national', 'valley bank', 'valley'] },
  { displayName: 'East West Bank', url: 'https://www.eastwestbank.com/en/business-banking', aliases: ['east west', 'eastwest'] },
  { displayName: 'New York Community Bank (Flagstar)', url: 'https://www.flagstar.com/small-business.html', aliases: ['nycb', 'new york community', 'flagstar'] },
  { displayName: 'Pacific Western Bank (Banc of California)', url: 'https://www.bancofcal.com/business-banking', aliases: ['pacific western', 'pacwest', 'banc of california', 'pacific west bank'] },
  { displayName: 'Western Alliance Bank', url: 'https://www.westernalliancebank.com/business-banking', aliases: ['western alliance'] },
  { displayName: 'First National Bank (FNB)', url: 'https://www.fnb-online.com/business', aliases: ['fnb', 'first national bank', 'first national'] },
  { displayName: 'Old National Bank', url: 'https://www.oldnational.com/small-business/', aliases: ['old national'] },
  { displayName: 'BOK Financial', url: 'https://www.bokfinancial.com/business', aliases: ['bok', 'bank of oklahoma', 'bok financial'] },
  { displayName: 'Cadence Bank', url: 'https://cadencebank.com/business', aliases: ['cadence', 'cadencebank'] },
  { displayName: 'Frost Bank', url: 'https://www.frostbank.com/business', aliases: ['frost', 'cullen frost'] },
  { displayName: 'Texas Capital Bank', url: 'https://www.texascapitalbank.com/business', aliases: ['texas capital', 'tcb'] },
  { displayName: 'Prosperity Bank', url: 'https://www.prosperitybankusa.com/business', aliases: ['prosperity', 'prosperity bancshares'] },
  { displayName: 'First Republic Bank', url: 'https://www.firstrepublic.com/business', aliases: ['first republic'] },
  { displayName: 'Silicon Valley Bank', url: 'https://www.svb.com/private-bank/', aliases: ['svb', 'silicon valley'] },
  { displayName: 'City National Bank', url: 'https://www.cnb.com/business-banking.html', aliases: ['city national', 'cnb'] },
  { displayName: 'Banner Bank', url: 'https://www.bannerbank.com/business', aliases: ['banner'] },
  { displayName: 'Columbia Bank', url: 'https://www.columbiabank.com/business', aliases: ['columbia bank', 'columbia banking'] },
  { displayName: 'Umpqua Bank', url: 'https://www.umpquabank.com/business-banking/', aliases: ['umpqua'] },
  { displayName: 'Glacier Bank', url: 'https://www.glacierbank.com/business', aliases: ['glacier'] },
  { displayName: 'Pinnacle Bank', url: 'https://www.pnfp.com/business-banking', aliases: ['pinnacle', 'pinnacle financial'] },
  { displayName: 'United Bank', url: 'https://www.bankwithunited.com/business', aliases: ['united bank'] },
  { displayName: 'Associated Bank', url: 'https://www.associatedbank.com/business', aliases: ['associated'] },
  { displayName: 'Commerce Bank', url: 'https://www.commercebank.com/business', aliases: ['commerce'] },
  { displayName: 'Arvest Bank', url: 'https://www.arvest.com/business', aliases: ['arvest'] },
  { displayName: 'WesBanco', url: 'https://www.wesbanco.com/business/', aliases: ['wesbanco'] },
  { displayName: 'First Interstate Bank', url: 'https://www.firstinterstate.com/business', aliases: ['first interstate'] },
  { displayName: 'South State Bank', url: 'https://www.southstatebank.com/small-business', aliases: ['south state', 'southstate'] },
  { displayName: 'Renasant Bank', url: 'https://www.renasantbank.com/business', aliases: ['renasant'] },
  { displayName: 'Trustmark National Bank', url: 'https://www.trustmark.com/business', aliases: ['trustmark'] },
  { displayName: 'Hancock Whitney Bank', url: 'https://www.hancockwhitney.com/business', aliases: ['hancock whitney', 'hancock', 'whitney bank'] },
  { displayName: 'Independent Bank', url: 'https://www.ibtx.com/business', aliases: ['independent bank', 'ibtx', 'independent financial'] },
  { displayName: 'Heartland Bank', url: 'https://www.heartland.bank/business', aliases: ['heartland'] },
  { displayName: 'TCF Bank (now Huntington)', url: 'https://www.huntington.com/Business', aliases: ['tcf', 'tcf bank'] },
  { displayName: 'Chemical Bank (now TCF/Huntington)', url: 'https://www.huntington.com/Business', aliases: ['chemical bank'] },
  { displayName: 'BankUnited', url: 'https://www.bankunited.com/small-business', aliases: ['bankunited', 'bank united'] },
  { displayName: 'Investors Bank (now Citizens)', url: 'https://www.citizensbank.com/small-business/overview.aspx', aliases: ['investors bank'] },
  { displayName: 'Sterling National Bank (now Webster)', url: 'https://public.websteronline.com/business', aliases: ['sterling national', 'sterling bank'] },
  { displayName: 'Provident Bank', url: 'https://www.provident.bank/business', aliases: ['provident'] },
  { displayName: 'Eastern Bank', url: 'https://www.easternbank.com/business', aliases: ['eastern bank', 'eastern'] },
  { displayName: 'Berkshire Bank', url: 'https://www.berkshirebank.com/business', aliases: ['berkshire'] },
  { displayName: 'Rockland Trust', url: 'https://www.rocklandtrust.com/business', aliases: ['rockland'] },
  { displayName: 'Dollar Bank', url: 'https://www.dollar.bank/business', aliases: ['dollar bank'] },
  { displayName: 'Northwest Bank', url: 'https://www.northwest.bank/business', aliases: ['northwest', 'northwest savings'] },
  { displayName: 'S&T Bank', url: 'https://www.stbank.com/business', aliases: ['s and t', 's&t', 'st bank'] },
  { displayName: 'First Merchants Bank', url: 'https://www.firstmerchants.com/business', aliases: ['first merchants'] },
  { displayName: 'Lakeland Bank (now Provident)', url: 'https://www.provident.bank/business', aliases: ['lakeland'] },
  { displayName: 'TriState Capital Bank', url: 'https://www.tscbank.com/', aliases: ['tristate', 'tristate capital'] },
  { displayName: 'NBT Bank', url: 'https://www.nbtbank.com/business', aliases: ['nbt'] },
  { displayName: 'Sandy Spring Bank', url: 'https://www.sandyspringbank.com/business', aliases: ['sandy spring'] },
  { displayName: 'Bank of Hawaii', url: 'https://www.boh.com/business', aliases: ['boh', 'bank of hawaii'] },
  { displayName: 'First Hawaiian Bank', url: 'https://www.fhb.com/en/business', aliases: ['first hawaiian', 'fhb'] },
  { displayName: 'Central Pacific Bank', url: 'https://www.cpb.bank/business', aliases: ['central pacific', 'cpb'] },
  { displayName: 'Bank of the West', url: 'https://www.bmo.com/main/business/', aliases: ['bank of the west', 'botw'] },
  { displayName: 'Mechanics Bank', url: 'https://www.mechanicsbank.com/business', aliases: ['mechanics'] },
  { displayName: 'Pacific Premier Bank', url: 'https://www.ppbi.com/business', aliases: ['pacific premier', 'ppbi'] },
  { displayName: 'Heritage Oaks Bank (now Pacific Premier)', url: 'https://www.ppbi.com/business', aliases: ['heritage oaks'] },
  { displayName: 'Opus Bank (now Pacific Premier)', url: 'https://www.ppbi.com/business', aliases: ['opus bank'] },
  { displayName: 'Plumas Bank', url: 'https://www.plumasbank.com/business', aliases: ['plumas'] },
  { displayName: 'Mercantile Bank', url: 'https://www.mercbank.com/business', aliases: ['mercantile'] },
  { displayName: 'United Community Bank', url: 'https://www.ucbi.com/business', aliases: ['united community', 'ucbi'] },
  { displayName: 'Atlantic Capital Bank (now SouthState)', url: 'https://www.southstatebank.com/small-business', aliases: ['atlantic capital'] },
  { displayName: 'Ameris Bank', url: 'https://www.amerisbank.com/business', aliases: ['ameris'] },
  { displayName: 'Seacoast Bank', url: 'https://www.seacoastbank.com/business', aliases: ['seacoast'] },
  { displayName: 'United Texas Bank', url: 'https://utbk.com/', aliases: ['united texas'] },
  { displayName: 'Inwood National Bank', url: 'https://www.inwoodbank.com/business', aliases: ['inwood'] },
  { displayName: 'Allegiance Bank', url: 'https://www.allegiancebank.com/business', aliases: ['allegiance'] },
  { displayName: 'Cullen/Frost Bankers', url: 'https://www.frostbank.com/business', aliases: ['cullen frost', 'cullen/frost'] },
  { displayName: 'International Bank of Commerce (IBC)', url: 'https://www.ibc.com/business', aliases: ['ibc', 'international bank of commerce'] },
  { displayName: 'Origin Bank', url: 'https://www.origin.bank/business', aliases: ['origin'] },
  { displayName: 'Home BancShares (Centennial Bank)', url: 'https://www.my100bank.com/business', aliases: ['centennial', 'home bancshares', 'centennial bank'] },
  { displayName: 'Simmons Bank', url: 'https://www.simmonsbank.com/business-banking', aliases: ['simmons'] },
  { displayName: 'Bank OZK', url: 'https://www.ozk.com/business', aliases: ['ozk', 'bank of the ozarks'] },
  { displayName: 'Cathay Bank', url: 'https://www.cathaybank.com/business-banking', aliases: ['cathay'] },
  { displayName: 'Preferred Bank', url: 'https://www.preferredbank.com/business', aliases: ['preferred bank'] },
  { displayName: 'Hanmi Bank', url: 'https://www.hanmi.com/business', aliases: ['hanmi'] },
  { displayName: 'Bank of Hope', url: 'https://www.bankofhope.com/business', aliases: ['bank of hope'] },
  { displayName: 'Customers Bank', url: 'https://customersbank.com/business-banking/', aliases: ['customers bank'] },
  { displayName: 'Live Oak Bank', url: 'https://www.liveoakbank.com/small-business-banking/', aliases: ['live oak'] },
  { displayName: 'Axos Bank', url: 'https://www.axosbank.com/business', aliases: ['axos', 'bofi'] },
  { displayName: 'EverBank (TIAA Bank)', url: 'https://www.everbank.com/business', aliases: ['everbank', 'tiaa bank'] },
  { displayName: 'Sallie Mae Bank', url: 'https://www.salliemae.com/banking/', aliases: ['sallie mae'] },
  { displayName: 'Synchrony Bank', url: 'https://www.synchronybank.com/', aliases: ['synchrony'] },
  { displayName: 'Discover Bank', url: 'https://www.discover.com/online-banking/', aliases: ['discover'] },
  { displayName: 'Ally Bank', url: 'https://www.ally.com/bank/', aliases: ['ally'] },
  { displayName: 'American Express National Bank', url: 'https://www.americanexpress.com/en-us/banking/online-savings/', aliases: ['amex bank', 'american express bank', 'amex'] },
  { displayName: 'Barclays Bank Delaware', url: 'https://www.banking.barclaysus.com/', aliases: ['barclays'] },
  { displayName: 'Citizens Access', url: 'https://www.citizensbank.com/savings/online-savings.aspx', aliases: ['citizens access'] },
  { displayName: 'CIT Bank (First Citizens)', url: 'https://www.cit.com/cit-bank', aliases: ['cit', 'cit bank'] },
  { displayName: 'Marcus by Goldman Sachs', url: 'https://www.marcus.com/us/en', aliases: ['marcus by goldman sachs'] },
  { displayName: 'Capital One 360', url: 'https://www.capitalone.com/bank/360-checking/', aliases: ['capital one 360', 'cap one 360'] },
  { displayName: 'Chime', url: 'https://www.chime.com/', aliases: ['chime bank'] },
  { displayName: 'SoFi Bank', url: 'https://www.sofi.com/banking/', aliases: ['sofi', 'social finance'] },
  { displayName: 'Varo Bank', url: 'https://www.varomoney.com/', aliases: ['varo'] },
  { displayName: 'Current', url: 'https://current.com/', aliases: ['current bank'] },
  { displayName: 'Dave', url: 'https://dave.com/', aliases: ['dave bank'] },
  { displayName: 'Mercury', url: 'https://mercury.com/', aliases: ['mercury bank'] },
  { displayName: 'Bluevine', url: 'https://www.bluevine.com/business-checking', aliases: ['blue vine', 'bluevine business'] },
  { displayName: 'Novo', url: 'https://www.novo.co/', aliases: ['novo bank'] },
  { displayName: 'Brex', url: 'https://www.brex.com/product/business-account', aliases: ['brex business'] },
  { displayName: 'Ramp', url: 'https://ramp.com/business-account', aliases: ['ramp business'] },
  { displayName: 'Relay', url: 'https://relayfi.com/', aliases: ['relay bank', 'relayfi'] },
  { displayName: 'Lili', url: 'https://lili.co/', aliases: ['lili bank'] },
  { displayName: 'Found', url: 'https://found.com/', aliases: ['found bank'] },
  { displayName: 'NorthOne', url: 'https://www.northone.com/', aliases: ['north one'] },
  { displayName: 'Oxygen', url: 'https://oxygen.us/', aliases: ['oxygen bank'] },
  { displayName: 'Kabbage by American Express', url: 'https://www.kabbage.com/checking/', aliases: ['kabbage'] },
  { displayName: 'OnDeck', url: 'https://www.ondeck.com/', aliases: ['on deck'] },
  { displayName: 'Square Banking', url: 'https://squareup.com/us/en/banking', aliases: ['square bank', 'square banking', 'block banking'] },
  { displayName: 'PayPal', url: 'https://www.paypal.com/us/business/manage-money/business-account', aliases: ['pay pal', 'paypal business'] },
  { displayName: 'Venmo Business', url: 'https://venmo.com/business', aliases: ['venmo'] },
  { displayName: 'Wise (formerly TransferWise)', url: 'https://wise.com/us/business/', aliases: ['wise bank', 'transferwise'] },
  { displayName: 'Revolut', url: 'https://www.revolut.com/business', aliases: ['revolut business'] },
  { displayName: 'Navy Federal Credit Union', url: 'https://www.navyfederal.org/products-services/business.html', aliases: ['navy federal', 'nfcu'] },
  { displayName: 'State Employees Credit Union (SECU)', url: 'https://www.ncsecu.org/', aliases: ['secu', 'state employees credit union', 'state employees'] },
  { displayName: 'PenFed Credit Union', url: 'https://www.penfed.org/business', aliases: ['penfed', 'pentagon federal'] },
  { displayName: 'Boeing Employees Credit Union (BECU)', url: 'https://www.becu.org/business', aliases: ['becu', 'boeing employees'] },
  { displayName: 'SchoolsFirst Federal Credit Union', url: 'https://www.schoolsfirstfcu.org/', aliases: ['schools first', 'schoolsfirst'] },
  { displayName: 'Golden 1 Credit Union', url: 'https://www.golden1.com/business', aliases: ['golden 1', 'golden one'] },
  { displayName: 'Alliant Credit Union', url: 'https://www.alliantcreditunion.com/business', aliases: ['alliant'] },
  { displayName: 'America First Credit Union', url: 'https://www.americafirst.com/business.html', aliases: ['america first'] },
  { displayName: 'Mountain America Credit Union', url: 'https://www.macu.com/business', aliases: ['mountain america', 'macu'] },
  { displayName: 'Suncoast Credit Union', url: 'https://www.suncoastcreditunion.com/business', aliases: ['suncoast'] },
  { displayName: 'VyStar Credit Union', url: 'https://vystarcu.org/Business', aliases: ['vystar'] },
  { displayName: 'Randolph-Brooks Federal Credit Union', url: 'https://www.rbfcu.org/personal/business-services', aliases: ['rbfcu', 'randolph brooks'] },
  { displayName: 'Digital Federal Credit Union (DCU)', url: 'https://www.dcu.org/business-banking.html', aliases: ['dcu', 'digital federal'] },
  { displayName: 'First Tech Federal Credit Union', url: 'https://www.firsttechfed.com/business', aliases: ['first tech'] },
  { displayName: 'Lake Michigan Credit Union', url: 'https://www.lmcu.org/business/', aliases: ['lake michigan', 'lmcu'] },
  { displayName: 'Bethpage Federal Credit Union', url: 'https://www.bethpagefcu.com/business', aliases: ['bethpage'] },
  { displayName: 'GreenState Credit Union', url: 'https://www.greenstate.org/business', aliases: ['greenstate', 'green state'] },
  { displayName: 'Affinity Federal Credit Union', url: 'https://www.affinityfcu.com/business', aliases: ['affinity'] },
  { displayName: 'BCU (Baxter Credit Union)', url: 'https://www.bcu.org/business', aliases: ['bcu', 'baxter credit union'] },
  { displayName: 'ESL Federal Credit Union', url: 'https://www.esl.org/business', aliases: ['esl federal', 'esl credit union'] },
  { displayName: 'Patelco Credit Union', url: 'https://www.patelco.org/business', aliases: ['patelco'] },
  { displayName: 'Logix Federal Credit Union', url: 'https://www.logixbanking.com/business', aliases: ['logix'] },
  { displayName: 'TruStone Financial Credit Union', url: 'https://www.trustonefinancial.org/business', aliases: ['trustone'] },
  { displayName: 'OneAZ Credit Union', url: 'https://www.oneazcu.com/business', aliases: ['oneaz', 'one az'] },
] as const;

/**
 * Build a canonical lookup index once at module load time so per-request
 * matching is O(1) for exact matches and a small linear scan otherwise.
 */
const NORMALIZED_INDEX: Map<string, BankDirectoryEntry> = (() => {
  const index = new Map<string, BankDirectoryEntry>();
  for (const entry of BANK_DIRECTORY) {
    const keys = new Set<string>([entry.displayName, ...(entry.aliases ?? [])]);
    for (const key of keys) {
      const normalized = normalizeForMatch(key);
      if (normalized && !index.has(normalized)) index.set(normalized, entry);
    }
  }
  return index;
})();

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Find a bank in the curated directory. Returns the matched entry if the
 * search query is an exact normalized match for the display name, any alias,
 * or one of the directory's normalized keys; otherwise returns the best
 * partial match (where the query is contained in the key or vice versa).
 */
export function findBankInDirectory(query: string): BankDirectoryEntry | null {
  const normalized = normalizeForMatch(query);
  if (!normalized) return null;

  const exact = NORMALIZED_INDEX.get(normalized);
  if (exact) return exact;

  let best: { entry: BankDirectoryEntry; score: number } | null = null;
  for (const [key, entry] of NORMALIZED_INDEX) {
    if (key.includes(normalized) || normalized.includes(key)) {
      const score = Math.min(key.length, normalized.length) / Math.max(key.length, normalized.length);
      if (!best || score > best.score) best = { entry, score };
    }
  }

  return best && best.score >= 0.6 ? best.entry : null;
}
