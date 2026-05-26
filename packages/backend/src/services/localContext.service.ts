export interface ZipLocation {
  zipCode: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  source: 'zippopotam' | 'client_state' | 'prefix_fallback';
}

export interface DateContext {
  isoDate: string;
  weekday: string;
  monthName: string;
  year: number;
  humanDate: string;
}

export interface LocalFact {
  topic: 'weather' | 'local_news' | 'community' | 'business' | 'seasonal' | 'sports';
  summary: string;
  sourceLabel: string;
  sourceUrl?: string;
  fetchedAt: string;
}

export interface LocalContext {
  date: DateContext;
  location: ZipLocation | null;
  approvedFacts: LocalFact[];
  icebreaker: string | null;
  safetyNotes: string[];
}

export interface LocalContextNextField {
  label: string;
  question: string;
}

const PROHIBITED_LOCAL_TOPICS = [
  'politic', 'election', 'campaign', 'religion', 'church', 'mosque', 'temple', 'faith',
  'race', 'racial', 'racism', 'discrimination', 'immigration', 'lgbt', 'transgender',
  'crime', 'murder', 'robbery', 'assault', 'shooting', 'theft', 'fraud', 'arrest',
  'disaster', 'hurricane', 'flood', 'fire', 'earthquake', 'tornado', 'crash', 'accident',
  'death', 'died', 'killed', 'injured', 'tragedy', 'scandal', 'lawsuit', 'bankruptcy',
  'layoff', 'recession', 'unemployment', 'inflation', 'adult', 'sexual', 'porn', 'dating',
];

const POSITIVE_LOCAL_HINTS = [
  'festival', 'parade', 'market', 'farmers market', 'opening', 'grand opening', 'expansion',
  'award', 'wins', 'victory', 'championship', 'community', 'park', 'library', 'downtown',
  'business', 'restaurant', 'shop', 'development', 'improvement', 'grant', 'celebration',
];

const ZIP_PREFIX_FALLBACKS: Record<string, Omit<ZipLocation, 'zipCode' | 'source'>> = {
  '100': { city: 'New York', state: 'NY', latitude: 40.75, longitude: -73.99 },
  '112': { city: 'Brooklyn', state: 'NY', latitude: 40.65, longitude: -73.95 },
  '070': { city: 'Newark', state: 'NJ', latitude: 40.73, longitude: -74.17 },
  '191': { city: 'Philadelphia', state: 'PA', latitude: 39.95, longitude: -75.16 },
  '200': { city: 'Washington', state: 'DC', latitude: 38.9, longitude: -77.04 },
  '303': { city: 'Atlanta', state: 'GA', latitude: 33.75, longitude: -84.39 },
  '331': { city: 'Miami', state: 'FL', latitude: 25.76, longitude: -80.19 },
  '336': { city: 'Tampa', state: 'FL', latitude: 27.95, longitude: -82.46 },
  '606': { city: 'Chicago', state: 'IL', latitude: 41.88, longitude: -87.63 },
  '770': { city: 'Houston', state: 'TX', latitude: 29.76, longitude: -95.37 },
  '752': { city: 'Dallas', state: 'TX', latitude: 32.78, longitude: -96.8 },
  '787': { city: 'Austin', state: 'TX', latitude: 30.27, longitude: -97.74 },
  '850': { city: 'Phoenix', state: 'AZ', latitude: 33.45, longitude: -112.07 },
  '900': { city: 'Los Angeles', state: 'CA', latitude: 34.05, longitude: -118.24 },
  '921': { city: 'San Diego', state: 'CA', latitude: 32.72, longitude: -117.16 },
  '941': { city: 'San Francisco', state: 'CA', latitude: 37.77, longitude: -122.42 },
  '981': { city: 'Seattle', state: 'WA', latitude: 47.61, longitude: -122.33 },
  '802': { city: 'Denver', state: 'CO', latitude: 39.74, longitude: -104.99 },
};

export function getCurrentDateContext(now = new Date()): DateContext {
  return {
    isoDate: now.toISOString(),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(now),
    monthName: new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'America/New_York' }).format(now),
    year: Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/New_York' }).format(now)),
    humanDate: new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'America/New_York' }).format(now),
  };
}

export async function buildFreshLocalContext(input: {
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<LocalContext> {
  const fetcher = input.fetchImpl || fetch;
  const date = getCurrentDateContext(input.now);
  const location = await resolveZipLocation({ ...input, fetchImpl: fetcher });
  const safetyNotes: string[] = [];
  const approvedFacts: LocalFact[] = [];

  if (location) {
    const [weather, localNews] = await Promise.all([
      fetchWeatherFact(location, fetcher),
      fetchLocalNewsFacts(location, fetcher),
    ]);
    for (const fact of [...weather, ...localNews, buildSeasonalFact(location, date, input.industry)]) {
      const validation = validateLocalFact(fact.summary);
      if (validation.safe) approvedFacts.push(fact);
      else safetyNotes.push(`Blocked ${fact.topic}: ${validation.reason}`);
    }
  }

  return {
    date,
    location,
    approvedFacts: approvedFacts.slice(0, 5),
    icebreaker: buildRelatableIcebreaker(location, approvedFacts, date),
    safetyNotes,
  };
}

export async function resolveZipLocation(input: {
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ZipLocation | null> {
  const zipCode = normalizeZip(input.zipCode);
  const city = input.city?.trim();
  const state = input.state?.trim().toUpperCase();
  if (!zipCode && city && state) return { zipCode: '', city, state, source: 'client_state' };
  if (!zipCode) return null;

  const fetcher = input.fetchImpl || fetch;
  try {
    const response = await fetchWithTimeout(`https://api.zippopotam.us/us/${zipCode}`, fetcher, 1800);
    if (response.ok) {
      const payload = await response.json() as { places?: Array<Record<string, string>> };
      const place = payload.places?.[0];
      if (place) {
        return {
          zipCode,
          city: place['place name'] || city || 'Unknown',
          state: place['state abbreviation'] || state || 'Unknown',
          latitude: Number(place.latitude) || undefined,
          longitude: Number(place.longitude) || undefined,
          source: 'zippopotam',
        };
      }
    }
  } catch {
    // No cache by design: fall through to local prefix fallback only for graceful behavior.
  }

  const fallback = ZIP_PREFIX_FALLBACKS[zipCode.slice(0, 3)];
  if (fallback) return { zipCode, ...fallback, source: 'prefix_fallback' };
  if (city && state) return { zipCode, city, state, source: 'client_state' };
  return null;
}

export function validateLocalFact(content: string): { safe: boolean; reason?: string } {
  const lower = content.toLowerCase();
  const prohibited = PROHIBITED_LOCAL_TOPICS.find((topic) => lower.includes(topic));
  if (prohibited) return { safe: false, reason: `prohibited topic: ${prohibited}` };
  if (content.length > 220) return { safe: false, reason: 'too long' };
  return { safe: true };
}

export function buildLocalContextReply(message: string, context: LocalContext, nextField: LocalContextNextField | null): string | null {
  const lower = message.toLowerCase();
  const asksLocalFollowUp = [
    'what happened', 'tell me more', 'what did they say', 'what was that', 'what news',
    'what event', 'local', 'near me', 'my area', 'out here', 'weather', 'sports', 'relative',
  ].some((phrase) => lower.includes(phrase));

  if (!asksLocalFollowUp || context.approvedFacts.length === 0 || !context.location) return null;

  const factLines = context.approvedFacts.slice(0, 2).map((fact) => `- ${fact.summary} (${fact.sourceLabel})`);
  const next = nextField ? `\n\nNext up: ${nextField.question}` : '\n\nIf the application details look accurate, please review and sign so the team can move the file forward.';
  return `I can clarify. For ${context.location.city}, ${context.location.state}, the safe local context I can reference today is:\n${factLines.join('\n')}\n\nI keep local references positive and avoid sensitive topics, so I won't bring up anything political, tragic, or controversial.${next}`;
}

function buildRelatableIcebreaker(location: ZipLocation | null, facts: LocalFact[], date: DateContext): string | null {
  if (!location || facts.length === 0) return null;
  const fact = facts[0];
  return `Hope your ${date.weekday} is going well. I was just talking with a close relative out near ${location.city}, and they mentioned ${fact.summary}. That must be a positive thing for the area.`;
}

function buildSeasonalFact(location: ZipLocation, date: DateContext, industry?: string | null): LocalFact {
  const industryText = industry ? `, especially for local ${industry} businesses` : '';
  return {
    topic: 'seasonal',
    summary: `${date.monthName} tends to be a good time for local businesses in the ${location.city} area to stay visible in the community${industryText}`,
    sourceLabel: 'calendar context',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchWeatherFact(location: ZipLocation, fetcher: typeof fetch): Promise<LocalFact[]> {
  if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') return [];
  try {
    const point = await fetchWithTimeout(`https://api.weather.gov/points/${location.latitude},${location.longitude}`, fetcher, 1800);
    if (!point.ok) return [];
    const pointJson = await point.json() as { properties?: { forecast?: string } };
    if (!pointJson.properties?.forecast) return [];
    const forecast = await fetchWithTimeout(pointJson.properties.forecast, fetcher, 1800);
    if (!forecast.ok) return [];
    const forecastJson = await forecast.json() as { properties?: { periods?: Array<{ name?: string; shortForecast?: string }> } };
    const period = forecastJson.properties?.periods?.[0];
    if (!period?.shortForecast) return [];
    return [{
      topic: 'weather',
      summary: `${location.city} has ${period.shortForecast.toLowerCase()} in the latest local forecast`,
      sourceLabel: 'National Weather Service',
      sourceUrl: pointJson.properties.forecast,
      fetchedAt: new Date().toISOString(),
    }];
  } catch {
    return [];
  }
}

async function fetchLocalNewsFacts(location: ZipLocation, fetcher: typeof fetch): Promise<LocalFact[]> {
  const query = encodeURIComponent(`"${location.city}" ${location.state} (festival OR community OR business OR opening OR downtown OR award OR park OR market OR sports)`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=10&sort=datedesc`;
  try {
    const response = await fetchWithTimeout(url, fetcher, 2200);
    if (!response.ok) return [];
    const payload = await response.json() as { articles?: Array<{ title?: string; url?: string; sourceCountry?: string }> };
    return (payload.articles || [])
      .map((article) => article.title?.trim() ? ({ article, title: article.title.trim() }) : null)
      .filter((item): item is { article: { title?: string; url?: string }; title: string } => Boolean(item))
      .filter(({ title }) => validateLocalFact(title).safe && POSITIVE_LOCAL_HINTS.some((hint) => title.toLowerCase().includes(hint)))
      .slice(0, 3)
      .map(({ article, title }) => ({
        topic: classifyLocalNewsTopic(title),
        summary: `there was a local update about ${title}`,
        sourceLabel: 'recent local news search',
        sourceUrl: article.url,
        fetchedAt: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function classifyLocalNewsTopic(title: string): LocalFact['topic'] {
  const lower = title.toLowerCase();
  if (lower.includes('sport') || lower.includes('wins') || lower.includes('championship')) return 'sports';
  if (lower.includes('business') || lower.includes('opening') || lower.includes('restaurant') || lower.includes('shop')) return 'business';
  if (lower.includes('festival') || lower.includes('market') || lower.includes('park') || lower.includes('community')) return 'community';
  return 'local_news';
}

function normalizeZip(zipCode?: string | null): string {
  const match = zipCode?.match(/\d{5}/);
  return match?.[0] || '';
}

async function fetchWithTimeout(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FormFiller local context assistant; contact=support@formfiller.local' },
    });
  } finally {
    clearTimeout(timer);
  }
}