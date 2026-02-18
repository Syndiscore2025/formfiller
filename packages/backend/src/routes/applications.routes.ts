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

const router = Router();

// Guest-accessible middleware chain (JWT or x-tenant-slug header)
const guestAccess = [optionalAuth, requireTenant];

const stepSchema = z.object({ currentStep: z.number().int().min(1).max(5) });

const createAppSchema = z.object({
  contactFirstName: z.string().min(1, 'First name is required'),
  contactLastName: z.string().min(1, 'Last name is required'),
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
    const now = new Date();
    const app = await prisma.application.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        contactFirstName,
        contactLastName,
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
      include: { business: true, owners: true, financial: true, loanRequest: true, signature: true },
    });
    if (!app) throw createError('Application not found', 404);
    if (!app.signature) throw createError('Application not yet signed', 400);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="application-${app.id}.pdf"`);

    const sig = app.signature;
    const stream = generateApplicationPdf({
      applicationId: app.id,
      business: app.business as Record<string, unknown> ?? undefined,
      owners: (app.owners as Record<string, unknown>[]) ?? undefined,
      financial: app.financial as Record<string, unknown> ?? undefined,
      loanRequest: app.loanRequest as Record<string, unknown> ?? undefined,
      signature: {
        signerName: sig.signerName,
        signerEmail: sig.signerEmail,
        signedAt: sig.signedAt.toISOString(),
        ipAddress: sig.ipAddress,
        marketingConsent: sig.marketingConsent,
        marketingConsentTimestamp: sig.marketingConsentTimestamp?.toISOString(),
      },
    });
    stream.pipe(res);
  })
);

export default router;

