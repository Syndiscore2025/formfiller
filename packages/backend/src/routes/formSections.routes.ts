import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { encrypt } from '../utils/encryption';
import { writeAuditLog } from '../services/auditLog.service';

const router = Router();
const guestAccess = [optionalAuth, requireTenant];

const businessSchema = z.object({
  legalName: z.string().optional(),
  dba: z.string().optional(),
  entityType: z.string().optional(),
  industry: z.string().optional(),
  stateOfFormation: z.string().optional(),
  ein: z.string().regex(/^\d{9}$/, 'EIN must be 9 digits').optional(),
  businessStartDate: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  streetAddress: z.string().optional(),
  streetAddress2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  sicCode: z.string().optional(),
  naicsCode: z.string().optional(),
  autoPopulated: z.record(z.boolean()).optional(),
});

const ownerSchema = z.object({
  ownerIndex: z.number().int().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
  ssn: z.string().regex(/^\d{9}$/, 'SSN must be 9 digits').optional(),
  dateOfBirth: z.string().optional(),
  creditScore: z.string().optional(),
  streetAddress: z.string().optional(),
  streetAddress2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

const financialSchema = z.object({
  annualRevenue: z.number().nonnegative().optional(),
  monthlyRevenue: z.number().nonnegative().optional(),
  monthlyExpenses: z.number().nonnegative().optional(),
  outstandingDebts: z.number().nonnegative().optional(),
  bankruptcyHistory: z.boolean().optional(),
  bankName: z.string().optional(),
  accountType: z.string().optional(),
});

const loanSchema = z.object({
  amountRequested: z.number().positive().optional(),
  purpose: z.string().optional(),
  urgency: z.string().optional(),
  termPreference: z.string().optional(),
});

async function assertAppOwnership(appId: string, tenantId: string): Promise<void> {
  const app = await prisma.application.findFirst({ where: { id: appId, tenantId } });
  if (!app) throw createError('Application not found', 404);
}

// Business Info
router.put('/:appId/business', ...guestAccess, validate(businessSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const appId = String(req.params.appId);
  await assertAppOwnership(appId, req.tenantId!);
  const { ein, ...rest } = req.body as z.infer<typeof businessSchema>;
  await prisma.businessInfo.upsert({
    where: { applicationId: appId },
    update: { ...rest, ein },
    create: { applicationId: appId, ...rest, ein },
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

