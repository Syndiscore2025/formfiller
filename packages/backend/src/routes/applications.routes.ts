import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { writeAuditLog } from '../services/auditLog.service';
import { pushToSwitchboxCrm, buildHeatmap } from '../services/crm.service';
import { generateApplicationPdf } from '../services/pdf.service';
import { decrypt } from '../utils/encryption';

const router = Router();

// Guest-accessible middleware chain (JWT or x-tenant-slug header)
const guestAccess = [optionalAuth, requireTenant];

const stepSchema = z.object({ currentStep: z.number().int().min(1).max(8) });
const updateAppSchema = z.object({ hasAdditionalOwners: z.boolean().optional() });
const documentUploadSchema = z.object({
  statementMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Statement month must be YYYY-MM'),
  fileName: z.string().trim().min(1, 'File name is required'),
  mimeType: z.string().trim().min(1, 'MIME type is required'),
  fileData: z.string().min(20, 'PDF content is required'),
});

const createAppSchema = z.object({
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactEmail: z.string().email('Valid email is required'),
  contactPhone: z.string().min(10, 'Valid phone number is required'),
  tcpaConsent: z.boolean().refine((v) => v === true, 'TCPA consent is required'),
});

// GET /applications — list for tenant (agents only)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const apps = await prisma.application.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, status: true, currentStep: true, completionPct: true,
        createdAt: true, updatedAt: true,
        business: { select: { legalName: true, ein: true } },
      },
    });
    res.json({ success: true, data: apps });
  })
);

// POST /applications — create new draft (guests allowed)
router.post(
  '/',
  ...guestAccess,
  validate(createAppSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { contactFirstName, contactLastName, contactEmail, contactPhone } =
      req.body as z.infer<typeof createAppSchema>;
    const trimmedFirstName = contactFirstName?.trim();
    const trimmedLastName = contactLastName?.trim();
    const now = new Date();
    const app = await prisma.application.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        ...(trimmedFirstName ? { contactFirstName: trimmedFirstName } : {}),
        ...(trimmedLastName ? { contactLastName: trimmedLastName } : {}),
        contactEmail,
        contactPhone,
        tcpaConsentStep1: true,
        tcpaConsentStep1At: now,
        lastActivityAt: now,
      },
    });
    await writeAuditLog({ applicationId: app.id, action: 'APPLICATION_CREATED', actor: req.userId, ipAddress: req.ip });
    res.status(201).json({ success: true, data: { id: app.id } });
  })
);

// GET /applications/:id — full application (guests allowed)
router.get(
  '/:id',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId: req.tenantId! },
      include: { business: true, owners: { orderBy: { ownerIndex: 'asc' } }, financial: true, loanRequest: true, signature: true },
    });
    if (!app) throw createError('Application not found', 404);
    res.json({ success: true, data: app });
  })
);

// PATCH /applications/:id/step — update current step (guests allowed)
router.patch(
  '/:id/step',
  ...guestAccess,
  validate(stepSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentStep } = req.body as z.infer<typeof stepSchema>;
    const appId = String(req.params.id);
    await prisma.application.updateMany({
      where: { id: appId, tenantId: req.tenantId! },
      data: { currentStep, completionPct: Math.round((currentStep - 1) * 20), lastActivityAt: new Date() },
    });
    await writeAuditLog({ applicationId: appId, action: `STEP_${currentStep}_REACHED`, actor: req.userId, ipAddress: req.ip });
    res.json({ success: true });
  })
);

// PATCH /applications/:id — update application fields (guests allowed)
router.patch(
  '/:id',
  ...guestAccess,
  validate(updateAppSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const { hasAdditionalOwners } = req.body as z.infer<typeof updateAppSchema>;
    await prisma.application.updateMany({
      where: { id: appId, tenantId: req.tenantId! },
      data: { hasAdditionalOwners, lastActivityAt: new Date() },
    });
    await writeAuditLog({ applicationId: appId, action: 'APPLICATION_UPDATED', actor: req.userId, ipAddress: req.ip });
    res.json({ success: true });
  })
);

router.get(
  '/:id/documents',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({ where: { id: appId, tenantId: req.tenantId! }, select: { id: true } });
    if (!app) throw createError('Application not found', 404);

    const documents = await prisma.applicationDocument.findMany({
      where: { applicationId: appId, documentType: 'bank_statement' },
      orderBy: [{ statementMonth: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, statementMonth: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true },
    });

    res.json({ success: true, data: documents });
  })
);

router.post(
  '/:id/documents',
  ...guestAccess,
  validate(documentUploadSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({ where: { id: appId, tenantId: req.tenantId! }, select: { id: true } });
    if (!app) throw createError('Application not found', 404);

    const { statementMonth, fileName, mimeType, fileData } = req.body as z.infer<typeof documentUploadSchema>;
    const normalizedFileName = fileName.trim();
    const looksLikePdf = mimeType.toLowerCase() === 'application/pdf' || normalizedFileName.toLowerCase().endsWith('.pdf') || fileData.startsWith('data:application/pdf;base64,');
    if (!looksLikePdf) throw createError('Only PDF bank statements are accepted', 400);

    const base64 = fileData.replace(/^data:application\/pdf;base64,/, '');
    const content = Buffer.from(base64, 'base64');
    if (!content.length) throw createError('The uploaded PDF was empty', 400);
    if (content.length > 10 * 1024 * 1024) throw createError('Each PDF must be 10MB or smaller', 400);

    const saved = await prisma.applicationDocument.upsert({
      where: {
        applicationId_documentType_statementMonth: {
          applicationId: appId,
          documentType: 'bank_statement',
          statementMonth,
        },
      },
      update: {
        fileName: normalizedFileName,
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        content,
      },
      create: {
        applicationId: appId,
        documentType: 'bank_statement',
        statementMonth,
        fileName: normalizedFileName,
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        content,
      },
      select: { id: true, statementMonth: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true },
    });

    await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
    await writeAuditLog({ applicationId: appId, action: 'BANK_STATEMENT_UPLOADED', actor: req.userId, ipAddress: req.ip, details: { statementMonth, fileName: normalizedFileName, sizeBytes: content.length } });

    res.status(201).json({ success: true, data: saved });
  })
);

// POST /applications/:id/submit — finalize and push to CRM (guests allowed)
router.post(
  '/:id/submit',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const submitAppId = String(req.params.id);
    const app = await prisma.application.findFirst({
      where: { id: submitAppId, tenantId: req.tenantId! },
      include: { business: true, owners: true, financial: true, loanRequest: true, signature: true },
    });
    if (!app) throw createError('Application not found', 404);
    if (!app.signature) throw createError('Signature required before submission', 400);

    await prisma.application.update({ where: { id: app.id }, data: { status: 'submitted', completionPct: 100 } });
    await writeAuditLog({ applicationId: app.id, action: 'APPLICATION_SUBMITTED', actor: req.userId, ipAddress: req.ip });

    // Build analytics heatmap and push to CRM asynchronously
    buildHeatmap(app.id).then((analyticsHeatmap) => {
      return pushToSwitchboxCrm({
        applicationId: app.id,
        tenantId: app.tenantId,
        status: 'submitted',
        business: app.business as Record<string, unknown> ?? undefined,
        owners: (app.owners as Record<string, unknown>[]) ?? undefined,
        financial: app.financial as Record<string, unknown> ?? undefined,
        loanRequest: app.loanRequest as Record<string, unknown> ?? undefined,
        submittedAt: new Date().toISOString(),
        analyticsHeatmap,
      });
    }).catch((err: Error) => console.error('CRM push error:', err.message));

    res.json({ success: true });
  })
);

// GET /applications/:id/pdf — download signed PDF (guests allowed)
router.get(
  '/:id/pdf',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const pdfAppId = String(req.params.id);
    const app = await prisma.application.findFirst({
      where: { id: pdfAppId, tenantId: req.tenantId! },
      include: { business: true, owners: { orderBy: { ownerIndex: 'asc' } }, signature: true },
    });
    if (!app) throw createError('Application not found', 404);
    if (!app.signature) throw createError('Application not yet signed', 400);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="application-${app.id}.pdf"`);

    const sig = app.signature;
    const owner = app.owners[0] ?? null;

    // Decrypt SSN for PDF display
    let ownerSsn: string | undefined;
    if (owner?.ssnEncrypted) {
      try { ownerSsn = decrypt(owner.ssnEncrypted); } catch { /* leave undefined */ }
    }

    const stream = generateApplicationPdf({
      business: app.business ? {
        legalName: app.business.legalName ?? undefined,
        dba: app.business.dba ?? undefined,
        entityType: app.business.entityType ?? undefined,
        industry: app.business.industry ?? undefined,
        stateOfFormation: app.business.stateOfFormation ?? undefined,
        ein: app.business.ein ?? undefined,
        businessStartDate: app.business.businessStartDate?.toISOString().slice(0, 10) ?? undefined,
        phone: app.business.phone ?? undefined,
        website: app.business.website ?? undefined,
        streetAddress: app.business.streetAddress ?? undefined,
        city: app.business.city ?? undefined,
        state: app.business.state ?? undefined,
        zipCode: app.business.zipCode ?? undefined,
        sicCode: app.business.sicCode ?? undefined,
        naicsCode: app.business.naicsCode ?? undefined,
      } : undefined,
      owner: owner ? {
        firstName: owner.firstName ?? undefined,
        lastName: owner.lastName ?? undefined,
        ssn: ownerSsn,
        ownershipPct: owner.ownershipPct ?? undefined,
        dateOfBirth: owner.dateOfBirth ?? undefined,
        streetAddress: owner.streetAddress ?? undefined,
        city: owner.city ?? undefined,
        state: owner.state ?? undefined,
        zipCode: owner.zipCode ?? undefined,
      } : undefined,
      contact: {
        email: app.contactEmail ?? undefined,
        phone: app.contactPhone ?? undefined,
      },
      signature: {
        signerName: sig.signerName,
        signerEmail: sig.signerEmail,
        signedAt: sig.signedAt.toISOString(),
        signatureData: sig.signatureData,
      },
    });
    stream.pipe(res);
  })
);

export default router;

