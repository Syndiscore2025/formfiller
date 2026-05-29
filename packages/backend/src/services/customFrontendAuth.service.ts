import { config } from '../config';
import { prisma } from '../lib/prisma';
import { hashCustomFrontendPublicKey, normalizeStringList } from './customFrontendSettings.service';

export const CUSTOM_FRONTEND_PUBLIC_KEY_HEADER = 'x-formfiller-public-key';

export function normalizeOrigin(origin: string | null | undefined): string | null {
  const trimmed = origin?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function isConfiguredAppOrigin(origin: string | null | undefined): boolean {
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && config.allowedOrigins.includes(normalized));
}

export function originMatchesAllowedOrigins(origin: string | null | undefined, allowedOrigins: unknown): boolean {
  const raw = origin?.trim();
  if (!raw) return true;
  const normalized = normalizeOrigin(raw);
  if (!normalized) return false;

  const list = normalizeStringList(allowedOrigins) ?? [];
  return list.some((allowed) => normalizeOrigin(allowed) === normalized);
}

export function shouldRequireCustomFrontendAuth(input: {
  origin?: string | null;
  publicKey?: string | null;
  isAuthenticated?: boolean;
}): boolean {
  if (input.isAuthenticated) return false;
  if (input.publicKey?.trim()) return true;

  const rawOrigin = input.origin?.trim();
  if (!rawOrigin) return false;
  const origin = normalizeOrigin(rawOrigin);
  return !origin || !isConfiguredAppOrigin(origin);
}

export function publicKeyMatchesHash(publicKey: string, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return false;
  return hashCustomFrontendPublicKey(publicKey) === expectedHash;
}

export async function isCorsOriginAllowed(origin: string | null | undefined): Promise<boolean> {
  const raw = origin?.trim();
  if (!raw) return true;
  const normalized = normalizeOrigin(raw);
  if (!normalized) return false;
  if (isConfiguredAppOrigin(normalized)) return true;

  const settings = await prisma.tenantSettings.findMany({
    where: { customFrontendEnabled: true },
    select: { customFrontendAllowedOrigins: true },
    take: 1000,
  });

  return settings.some((row) => originMatchesAllowedOrigins(normalized, row.customFrontendAllowedOrigins));
}
