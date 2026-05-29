import { Router, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { requireCustomFrontendAccess } from '../middleware/customFrontendAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { encrypt } from '../utils/encryption';
import { writeAuditLog } from '../services/auditLog.service';

const router = Router();
const guestAccess = [optionalAuth, requireTenant, requireCustomFrontendAccess];

const businessSchema = z.object({
  legalName: z.string().optional(),
  dba: z.string().optional(),
  entityType: z.string().optional(),
  industry: z.string().optional(),
  stateOfFormation: z.string().optional(),
  ein: z.string().refine((val) => val === '' || /^\d{9}$/.test(val), 'EIN must be 9 digits').optional(),
  businessStartDate: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  streetAddress: z.string().optional(),
  streetAddress2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  sicCode: z.string().optional(),
  naicsCode: z.string().optional(),
  autoPopulated: z.record(z.unknown()).optional(),
});

function parseIsoDateOnly(value?: string): Date | null {
  const match = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return parsed.getFullYear() === Number(match[1]) && parsed.getMonth() === Number(match[2]) - 1 && parsed.getDate() === Number(match[3])
    ? parsed
    : null;
}

function isAtLeast18(value?: string): boolean {
  const dob = parseIsoDateOnly(value);
  if (!dob) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eighteenthBirthday = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
  return eighteenthBirthday <= today;
}

const ownerSchema = z.object({
  ownerIndex: z.number().int().min(0),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  ownershipPct: z.string().optional(), // now stored as string
  ssn: z.string().regex(/^\d{9}$/, 'SSN must be 9 digits').optional(),
  dateOfBirth: z.string().optional()
    .refine((value) => !value || Boolean(parseIsoDateOnly(value)), 'Enter a valid date of birth')
    .refine((value) => !value || isAtLeast18(value), 'Applicant must be at least 18 years old to apply.'),
  creditScore: z.string().optional(),
  streetAddress: z.string().optional(),
  streetAddress2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

const financialSchema = z.object({
  annualRevenue: z.string().optional(), // dropdown range value
});

const loanSchema = z.object({
  amountRequested: z.string().optional(), // dropdown range value
  urgency: z.string().optional(),
});

async function assertAppOwnership(appId: string, tenantId: string): Promise<void> {
  const app = await prisma.application.findFirst({ where: { id: appId, tenantId } });
  if (!app) throw createError('Application not found', 404);
}

// Business Info
router.put('/:appId/business', ...guestAccess, validate(businessSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const appId = String(req.params.appId);
  await assertAppOwnership(appId, req.tenantId!);
  const { ein, website, businessStartDate, autoPopulated, ...rest } = req.body as z.infer<typeof businessSchema>;

  // Normalize website: prepend https:// if a value was given but has no protocol
  const normalizedWebsite =
    website && !/^https?:\/\//i.test(website) ? `https://${website}` : website || undefined;

  // Guard against empty string reaching a DateTime column
	const normalizedDate = (() => {
		const v = (businessStartDate ?? '').trim();
		if (!v) return undefined;
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? undefined : d;
	})();

  const data = {
    ...rest,
    ein,
    website: normalizedWebsite,
    businessStartDate: normalizedDate,
    ...(autoPopulated !== undefined ? { autoPopulated: autoPopulated as Prisma.InputJsonValue } : {}),
  };

  await prisma.businessInfo.upsert({
    where: { applicationId: appId },
    update: data,
    create: { applicationId: appId, ...data },
  });
  await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
  await writeAuditLog({ applicationId: appId, action: 'BUSINESS_INFO_SAVED', actor: req.userId, ipAddress: req.ip });
  res.json({ success: true });
}));

// Owner Info — upsert by ownerIndex
router.put('/:appId/owners', ...guestAccess, validate(ownerSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const appId = String(req.params.appId);
  await assertAppOwnership(appId, req.tenantId!);
  const { ssn, ownerIndex, ...rest } = req.body as z.infer<typeof ownerSchema>;
  const ssnEncrypted = ssn ? encrypt(ssn) : undefined;
  await prisma.ownerInfo.upsert({
    where: { applicationId_ownerIndex: { applicationId: appId, ownerIndex } },
    update: { ...rest, ...(ssnEncrypted !== undefined && { ssnEncrypted }) },
    create: { applicationId: appId, ownerIndex, ...rest, ...(ssnEncrypted !== undefined && { ssnEncrypted }) },
  });
  await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
  await writeAuditLog({ applicationId: appId, action: `OWNER_${ownerIndex}_SAVED`, actor: req.userId, ipAddress: req.ip });
  res.json({ success: true });
}));

// Financial Info
router.put('/:appId/financial', ...guestAccess, validate(financialSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const appId = String(req.params.appId);
  await assertAppOwnership(appId, req.tenantId!);
  const data = req.body as z.infer<typeof financialSchema>;
  await prisma.financialInfo.upsert({
    where: { applicationId: appId },
    update: data,
    create: { applicationId: appId, ...data },
  });
  await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
  await writeAuditLog({ applicationId: appId, action: 'FINANCIAL_INFO_SAVED', actor: req.userId, ipAddress: req.ip });
  res.json({ success: true });
}));

// Loan Request
router.put('/:appId/loan', ...guestAccess, validate(loanSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const appId = String(req.params.appId);
  await assertAppOwnership(appId, req.tenantId!);
  const data = req.body as z.infer<typeof loanSchema>;
  await prisma.loanRequest.upsert({
    where: { applicationId: appId },
    update: data,
    create: { applicationId: appId, ...data },
  });
  await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
  await writeAuditLog({ applicationId: appId, action: 'LOAN_REQUEST_SAVED', actor: req.userId, ipAddress: req.ip });
  res.json({ success: true });
}));

export default router;

