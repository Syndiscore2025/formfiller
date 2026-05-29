import { createHash } from 'crypto';

export const CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9._-]+$/u;

export function normalizeStringList(value: unknown): string[] | null {
  const raw = typeof value === 'string'
    ? value.split(/[\n,]/u)
    : Array.isArray(value)
      ? value
      : null;

  if (!raw) return null;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export function hashCustomFrontendPublicKey(publicKey: string): string {
  return createHash('sha256').update(publicKey.trim()).digest('hex');
}

export function previewCustomFrontendPublicKey(publicKey: string): string {
  const trimmed = publicKey.trim();
  if (trimmed.length <= 16) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 12)}…${trimmed.slice(-4)}`;
}

export function deriveCustomFrontendPublicKeyConfig(publicKey: string): {
  hash: string;
  preview: string;
} {
  const trimmed = publicKey.trim();
  return {
    hash: hashCustomFrontendPublicKey(trimmed),
    preview: previewCustomFrontendPublicKey(trimmed),
  };
}