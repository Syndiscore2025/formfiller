/**
 * Local-only lead export tool.
 *
 * This is NOT an HTTP route and is NOT mounted in the deployed app. It runs on
 * your own machine against the database (use a read-only DATABASE_URL) and writes
 * a CSV to disk. Nothing about this capability ships to the tenant/Switchbox-facing
 * deployment.
 *
 * Usage:
 *   npm run report:export -- [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--sensitive] [--out=path.csv]
 *
 * Requires local env: DATABASE_URL (read-only role) and ENCRYPTION_KEY.
 */
import 'dotenv/config';
import fs from 'fs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { decrypt } from '../utils/encryption';

const CSV_HEADERS = [
  'createdDate', 'updatedDate', 'tenantSlug', 'tenantName', 'applicationId', 'status',
  'finalizedAt', 'contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone',
  'businessLegalName', 'businessDba', 'entityType', 'industry', 'stateOfFormation', 'ein',
  'businessStartDate', 'businessPhone', 'website', 'businessStreet', 'businessStreet2',
  'businessCity', 'businessState', 'businessZip', 'annualRevenue', 'amountRequested',
  'ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerPhone', 'ownershipPct', 'ssn',
  'dateOfBirth', 'ownerStreet', 'ownerStreet2', 'ownerCity', 'ownerState', 'ownerZip',
  'hasAdditionalOwners', 'homeBasedBusiness', 'ownerHomeSameAsBusiness', 'bankStatementCount',
];

type ExportApplication = Prisma.ApplicationGetPayload<{
  include: {
    tenant: { select: { slug: true; name: true } };
    business: true;
    owners: true;
    financial: true;
    loanRequest: true;
    documents: { select: { id: true } };
  };
}>;

interface CliArgs {
  start?: string;
  end?: string;
  includeSensitive: boolean;
  out: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : undefined;
  };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const start = get('start');
  const end = get('end');
  if (start && !dateRe.test(start)) throw new Error('--start must be YYYY-MM-DD');
  if (end && !dateRe.test(end)) throw new Error('--end must be YYYY-MM-DD');
  const fileDate = new Date().toISOString().slice(0, 10);
  return {
    start,
    end,
    includeSensitive: args.includes('--sensitive'),
    out: get('out') || `merchant-report-${fileDate}.csv`,
  };
}

async function main(): Promise<void> {
  const { start: startStr, end: endStr, includeSensitive, out } = parseArgs();
  const { start, endExclusive } = parseDateRange(startStr, endStr);

  const where: Prisma.ApplicationWhereInput = {};
  if (start || endExclusive) {
    where.createdAt = { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) };
  }

  const apps = await prisma.application.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
    take: 25000,
    include: {
      tenant: { select: { slug: true, name: true } },
      business: true,
      owners: { orderBy: { ownerIndex: 'asc' } },
      financial: true,
      loanRequest: true,
      documents: { where: { documentType: 'bank_statement' }, select: { id: true } },
    },
  });

  const rows = dedupeApplications(apps).map((app) => toCsvRow(app, includeSensitive));

  const lines = [CSV_HEADERS.map(csvEscape).join(',')];
  for (const row of rows) lines.push(CSV_HEADERS.map((h) => csvEscape(row[h] ?? '')).join(','));
  fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');

  process.stdout.write(
    `Wrote ${rows.length} merchant row(s) to ${out} (sensitive=${includeSensitive}).\n`
  );
}

function parseDateRange(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined;
  const endExclusive = endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined;
  if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

function dedupeApplications(apps: ExportApplication[]): ExportApplication[] {
  const seen = new Set<string>();
  const rows: ExportApplication[] = [];
  for (const app of apps) {
    const key = merchantKey(app);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(app);
  }
  return rows;
}

function merchantKey(app: ExportApplication): string {
  const owner = app.owners[0];
  const email = normalize(app.contactEmail || owner?.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(app.contactPhone || owner?.phone || app.business?.phone);
  if (phone) return `phone:${phone}`;
  return `business:${normalize(app.business?.legalName)}:${normalize(app.business?.zipCode)}`;
}

function toCsvRow(app: ExportApplication, includeSensitive: boolean): Record<string, string> {
  const owner = app.owners[0];
  return {
    createdDate: iso(app.createdAt), updatedDate: iso(app.updatedAt), tenantSlug: app.tenant.slug,
    tenantName: app.tenant.name, applicationId: app.id, status: app.status, finalizedAt: iso(app.finalizedAt),
    contactFirstName: app.contactFirstName || '', contactLastName: app.contactLastName || '',
    contactEmail: app.contactEmail || '', contactPhone: app.contactPhone || '',
    businessLegalName: app.business?.legalName || '', businessDba: app.business?.dba || '',
    entityType: app.business?.entityType || '', industry: app.business?.industry || '',
    stateOfFormation: app.business?.stateOfFormation || '', ein: app.business?.ein || '',
    businessStartDate: iso(app.business?.businessStartDate), businessPhone: app.business?.phone || '',
    website: app.business?.website || '', businessStreet: app.business?.streetAddress || '',
    businessStreet2: app.business?.streetAddress2 || '', businessCity: app.business?.city || '',
    businessState: app.business?.state || '', businessZip: app.business?.zipCode || '',
    annualRevenue: app.financial?.annualRevenue || '', amountRequested: app.loanRequest?.amountRequested || '',
    ownerFirstName: owner?.firstName || '', ownerLastName: owner?.lastName || '', ownerEmail: owner?.email || '',
    ownerPhone: owner?.phone || '', ownershipPct: owner?.ownershipPct || '',
    ssn: includeSensitive ? decryptSsn(owner?.ssnEncrypted) : lastFourSsn(owner?.ssnEncrypted),
    dateOfBirth: includeSensitive ? owner?.dateOfBirth || '' : '',
    ownerStreet: owner?.streetAddress || '', ownerStreet2: owner?.streetAddress2 || '',
    ownerCity: owner?.city || '', ownerState: owner?.state || '', ownerZip: owner?.zipCode || '',
    hasAdditionalOwners: bool(app.hasAdditionalOwners), homeBasedBusiness: bool(app.homeBasedBusiness),
    ownerHomeSameAsBusiness: bool(app.ownerHomeSameAsBusiness), bankStatementCount: String(app.documents.length),
  };
}

function decryptSsn(value?: string | null): string {
  if (!value) return '';
  try { return decrypt(value); } catch { return ''; }
}

function lastFourSsn(value?: string | null): string {
  const ssn = decryptSsn(value);
  return ssn ? `***-**-${ssn.slice(-4)}` : '';
}

function iso(value?: Date | string | null): string {
  if (!value) return '';
  return new Date(value).toISOString();
}

function bool(value: boolean | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalize(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function normalizePhone(value?: string | null): string {
  return (value || '').replace(/[^0-9]/g, '');
}

function csvEscape(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

main()
  .catch((err) => {
    process.stderr.write(`Export failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
