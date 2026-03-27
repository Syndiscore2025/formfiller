const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'default';

interface ApiOptions extends RequestInit {
  token?: string;
}

function sanitizeApiErrorMessage(message: unknown): string {
  if (typeof message !== 'string') return 'Request failed';

  const trimmed = message.trim();
  if (!trimmed) return 'Request failed';

  const lower = trimmed.toLowerCase();
  const looksSensitive = [
    'prisma',
    'connectorerror',
    'query engine',
    'schema.prisma',
    'invalid `prisma.',
    'c:\\',
    '/src/',
    '.dll',
  ].some((token) => lower.includes(token));

  if (looksSensitive || trimmed.length > 220) {
    return 'We hit a temporary application error. Please try again.';
  }

  return trimmed;
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...rest } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-tenant-slug': TENANT_SLUG,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...rest.headers,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch {
    throw new Error('Unable to reach the application service. Make sure the backend server is running and try again.');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error || data?.errors?.[0]?.message || 'Request failed';
    throw new Error(sanitizeApiErrorMessage(message));
  }
  return data as T;
}

export const api = {
  post: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), token }),

  put: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), token }),

  patch: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), token }),

  get: <T>(path: string, token?: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<T>(`${path}${qs}`, { method: 'GET', token });
  },
};

