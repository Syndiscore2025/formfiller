import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { decrypt } from '../utils/encryption';

interface StorageConfig {
  provider: 's3';
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  tenantSlug: string;
}

interface UploadInput {
  tenantId: string;
  applicationId: string;
  documentType: string;
  statementMonth: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface StoredDocumentRef {
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  storageUrl?: string;
  storageEtag?: string;
}

export async function getTenantStorageConfig(tenantId: string): Promise<StorageConfig | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { settings: true },
  });
  const settings = tenant?.settings;
  if (!tenant || settings?.documentStorageProvider !== 's3') return null;
  if (!settings.documentStorageEndpoint || !settings.documentStorageRegion || !settings.documentStorageBucket) return null;
  if (!settings.documentStorageAccessKeyId || !settings.documentStorageSecretAccessKey) return null;

  return {
    provider: 's3',
    endpoint: settings.documentStorageEndpoint,
    region: settings.documentStorageRegion,
    bucket: settings.documentStorageBucket,
    prefix: normalizePrefix(settings.documentStoragePrefix),
    accessKeyId: settings.documentStorageAccessKeyId,
    secretAccessKey: decrypt(settings.documentStorageSecretAccessKey),
    publicBaseUrl: settings.documentStoragePublicBaseUrl ?? undefined,
    tenantSlug: tenant.slug,
  };
}

export async function uploadTenantDocument(input: UploadInput): Promise<StoredDocumentRef | null> {
  const config = await getTenantStorageConfig(input.tenantId);
  if (!config) return null;

  const key = buildObjectKey(config, input);
  const { etag } = await putObject(config, key, input.content, input.mimeType);
  return {
    storageProvider: config.provider,
    storageBucket: config.bucket,
    storageKey: key,
    storageUrl: buildPublicUrl(config, key),
    storageEtag: etag,
  };
}

export async function downloadTenantDocument(tenantId: string, storageKey: string): Promise<Buffer> {
  const config = await getTenantStorageConfig(tenantId);
  if (!config) throw new Error('Document storage is not configured for this tenant.');
  return getObject(config, storageKey);
}

function normalizePrefix(prefix?: string | null): string {
  const clean = (prefix ?? '').trim().replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/` : '';
}

function safeFileName(fileName: string): string {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document.pdf';
}

function buildObjectKey(config: StorageConfig, input: UploadInput): string {
  return `${config.prefix}${config.tenantSlug}/applications/${input.applicationId}/${input.documentType}/${input.statementMonth}-${safeFileName(input.fileName)}`;
}

function buildPublicUrl(config: StorageConfig, key: string): string | undefined {
  if (!config.publicBaseUrl) return undefined;
  return `${config.publicBaseUrl.replace(/\/+$/g, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function objectUrl(config: StorageConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  const host = endpoint.hostname.startsWith(`${config.bucket}.`)
    ? endpoint.hostname
    : `${config.bucket}.${endpoint.hostname}`;
  return new URL(`${endpoint.protocol}//${host}/${key.split('/').map(encodeURIComponent).join('/')}`);
}

async function putObject(config: StorageConfig, key: string, body: Buffer, mimeType: string): Promise<{ etag?: string }> {
  const url = objectUrl(config, key);
  const headers = signRequest(config, 'PUT', url, body, { 'content-type': mimeType });
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Object storage upload failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`);
  }
  return { etag: res.headers.get('etag') ?? undefined };
}

async function getObject(config: StorageConfig, key: string): Promise<Buffer> {
  const url = objectUrl(config, key);
  const headers = signRequest(config, 'GET', url, Buffer.alloc(0), {});
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error(`Object storage download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

function signRequest(config: StorageConfig, method: string, url: URL, body: Buffer, extraHeaders: Record<string, string>): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((key) => `${key}:${headers[key].trim()}\n`).join('');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(config.secretAccessKey, dateStamp, config.region), stringToSign).toString('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function sha256Hex(input: Buffer | string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}