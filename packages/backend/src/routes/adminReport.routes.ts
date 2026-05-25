import { Router, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { decrypt } from '../utils/encryption';

const router = Router();

const reportSchema = z.object({
  report: z.literal('lead_export'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  includeSensitive: z.boolean().optional(),
  confirmSensitive: z.string().optional(),
});

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

router.post(
  '/sync',
  requireAuth,
  requireSuperAdmin,
  validate(reportSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = req.body as z.infer<typeof reportSchema>;
    const includeSensitive = body.includeSensitive === true;
    if (includeSensitive && body.confirmSensitive !== 'EXPORT_FULL_SSN_DOB') {
      throw createError('Sensitive export confirmation is required.', 400);
    }

    const { start, endExclusive } = parseDateRange(body.startDate || undefined, body.endDate || undefined);
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

    await prisma.reportExportAudit.create({
      data: {
        userId: req.userId,
        reportType: body.report,
        includeSensitive,
        startDate: start,
        endDate: endExclusive,
        rowCount: rows.length,
      },
    });

    const fileDate = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="merchant-report-${fileDate}.csv"`);
    res.write(`${CSV_HEADERS.map(csvEscape).join(',')}\n`);
    for (const row of rows) res.write(`${CSV_HEADERS.map((header) => csvEscape(row[header] ?? '')).join(',')}\n`);
    res.end();
  })
);

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

export default router;