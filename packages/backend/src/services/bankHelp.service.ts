import { config } from '../config';

interface SourcePage {
  url: string;
  excerpt: string;
  links: string[];
}

interface CachedBankHelpResult {
  bankName: string;
  bankUrl?: string;
  instructions: string;
  sourcePages: string[];
}

interface CacheEntry {
  expiresAt: number;
  result: CachedBankHelpResult;
}

export interface BankHelpResult extends CachedBankHelpResult {
  cached: boolean;
}

const HELP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_PAGES = 3;
const MAX_PAGE_CHARS = 5000;
const bankHelpCache = new Map<string, CacheEntry>();

export async function generateBankStatementHelp(input: { bankName: string; bankUrl?: string }): Promise<BankHelpResult> {
  const bankName = input.bankName.trim();
  if (!bankName) throw new Error('Bank name is required.');

  const bankUrl = normalizePublicUrl(input.bankUrl);
  const cacheKey = `${bankName.toLowerCase()}::${bankUrl ?? ''}`;
  const cached = bankHelpCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  if (!config.openAiApiKey) {
    throw new Error('Bank help is not configured yet. Please try again later.');
  }

  const sourcePages = await collectSourcePages(bankUrl);
  const aiResult = await requestOpenAiInstructions(bankName, bankUrl, sourcePages);

  const result: CachedBankHelpResult = {
    bankName,
    bankUrl: aiResult.bankUrl ?? bankUrl,
    instructions: aiResult.instructions,
    sourcePages: sourcePages.map((page) => page.url),
  };

  bankHelpCache.set(cacheKey, {
    expiresAt: Date.now() + HELP_CACHE_TTL_MS,
    result,
  });

  return { ...result, cached: false };
}

function normalizePublicUrl(rawUrl?: string): string | undefined {
  if (!rawUrl?.trim()) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('The selected bank website URL is invalid.');
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Only http and https bank websites are supported.');
  }

  if (parsed.username || parsed.password || isPrivateHost(parsed.hostname)) {
    throw new Error('That bank website cannot be checked safely.');
  }

  parsed.hash = '';
  parsed.search = '';
  return parsed.toString();
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost'
    || lower.endsWith('.local')
    || lower === '::1'
    || lower === '[::1]'
  ) {
    return true;
  }

  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }

  const match = lower.match(/^172\.(\d{1,3})\./);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

async function collectSourcePages(bankUrl?: string): Promise<SourcePage[]> {
  if (!bankUrl) return [];

  const visited = new Set<string>();
  const queue = [bankUrl];
  const pages: SourcePage[] = [];

  while (queue.length > 0 && pages.length < MAX_SOURCE_PAGES) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    const page = await fetchPage(nextUrl);
    if (!page) continue;
    pages.push(page);

    if (pages.length === 1) {
      const followUps = selectFollowUpUrls(nextUrl, page.links).filter((url) => !visited.has(url));
      queue.push(...followUps.slice(0, MAX_SOURCE_PAGES - 1));
    }
  }

  return pages;
}

async function fetchPage(url: string): Promise<SourcePage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'FormFillerBankHelpBot/1.0',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    const html = await res.text();
    const excerpt = stripHtml(html).slice(0, MAX_PAGE_CHARS);
    if (!excerpt) return null;

    return {
      url,
      excerpt,
      links: extractLinks(html, url),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function selectFollowUpUrls(baseUrl: string, links: string[]): string[] {
  const base = new URL(baseUrl);
  const keywords = ['statement', 'document', 'download', 'online-banking', 'banking', 'login', 'help', 'support', 'faq'];
  const ranked = links
    .filter((link) => {
      try {
        const candidate = new URL(link);
        return candidate.origin === base.origin;
      } catch {
        return false;
      }
    })
    .filter((link) => keywords.some((keyword) => link.toLowerCase().includes(keyword)));

  return Array.from(new Set(ranked));
}

function extractLinks(html: string, baseUrl: string): string[] {
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!isPrivateHost(new URL(absolute).hostname)) {
        links.push(absolute);
      }
    } catch {
      continue;
    }
  }

  return links;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function requestOpenAiInstructions(bankName: string, bankUrl: string | undefined, pages: SourcePage[]): Promise<{ instructions: string; bankUrl?: string }> {
  const sources = pages.length > 0
    ? pages.map((page, index) => `Source ${index + 1}: ${page.url}\n${page.excerpt}`).join('\n\n')
    : 'No public website content could be fetched. Use general business-banking knowledge only and keep the guidance cautious.';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openAiModel,
      temperature: 0.2,
      max_tokens: 350,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You help business loan applicants find how to download bank statements. Return only JSON with keys "instructions" and optional "bankUrl". Keep instructions concise: 1 short paragraph plus up to 4 bullet-style steps in plain text. Never mention crawling, AI, or internal errors. If the source text is weak, say likely navigation labels such as Statements, Documents, eStatements, or Online Banking in a cautious way.',
        },
        {
          role: 'user',
          content: `Bank name: ${bankName}\nOfficial site provided: ${bankUrl ?? 'unknown'}\n\nPublic source material:\n${sources}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error('Unable to retrieve bank download instructions right now.');
  }

  const payload = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Unable to retrieve bank download instructions right now.');
  }

  let parsed: { instructions?: string; bankUrl?: string };
  try {
    parsed = JSON.parse(content) as { instructions?: string; bankUrl?: string };
  } catch {
    throw new Error('Unable to retrieve bank download instructions right now.');
  }
  const instructions = parsed.instructions?.trim();
  if (!instructions) {
    throw new Error('Unable to retrieve bank download instructions right now.');
  }

  const normalizedBankUrl = parsed.bankUrl ? normalizePublicUrl(parsed.bankUrl) : undefined;
  return {
    instructions,
    bankUrl: normalizedBankUrl,
  };
}