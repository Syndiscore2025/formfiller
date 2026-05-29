import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { requireCustomFrontendAccess } from '../middleware/customFrontendAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { bankHelpLimiter } from '../middleware/rateLimiter';
import { writeAuditLog } from '../services/auditLog.service';
import { enqueueCrmDelivery } from '../services/crm.service';
import { generateApplicationPdf, TenantBranding, PdfVisibility } from '../services/pdf.service';
import { generateBankStatementHelp } from '../services/bankHelp.service';
import { downloadTenantDocument, uploadTenantDocument } from '../services/documentStorage.service';
import { decrypt } from '../utils/encryption';
import { assertReadyForFinalize, assertReadyForSubmit } from '../services/applicationValidation.service';

const router = Router();

function isApplicationDocumentTableMissing(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  return code === 'P2021'
    || (message.includes('applicationdocument') && message.includes('does not exist'));
}

// Guest-accessible middleware chain (JWT, hosted app origin, or tenant-approved custom frontend key+origin)
const guestAccess = [optionalAuth, requireTenant, requireCustomFrontendAccess];

const stepSchema = z.object({ currentStep: z.number().int().min(1).max(8) });
const updateAppSchema = z.object({
  hasAdditionalOwners: z.boolean().nullable().optional(),
  homeBasedBusiness: z.boolean().nullable().optional(),
  ownerHomeSameAsBusiness: z.boolean().nullable().optional(),
});
const documentUploadSchema = z.object({
  statementMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Statement month must be YYYY-MM'),
  fileName: z.string().trim().min(1, 'File name is required'),
  mimeType: z.string().trim().min(1, 'MIME type is required'),
  fileData: z.string().min(20, 'PDF content is required'),
});
const bankHelpSchema = z.object({
  bankName: z.string().trim().min(2, 'Bank name is required').max(120, 'Bank name is too long'),
  bankUrl: z.string().trim().url('Bank website must be a valid URL').optional().or(z.literal('')),
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
    const { hasAdditionalOwners, homeBasedBusiness, ownerHomeSameAsBusiness } = req.body as z.infer<typeof updateAppSchema>;
    const data: Record<string, unknown> = { lastActivityAt: new Date() };
    if (hasAdditionalOwners !== undefined) data.hasAdditionalOwners = hasAdditionalOwners;
    if (homeBasedBusiness !== undefined) data.homeBasedBusiness = homeBasedBusiness;
    if (ownerHomeSameAsBusiness !== undefined) data.ownerHomeSameAsBusiness = ownerHomeSameAsBusiness;
    await prisma.application.updateMany({
      where: { id: appId, tenantId: req.tenantId! },
      data,
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
    const app = await prisma.application.findFirst({ where: { id: appId, tenantId: req.tenantId! }, select: { id: true, tenantId: true } });
    if (!app) throw createError('Application not found', 404);

    let documents;
    try {
      documents = await prisma.applicationDocument.findMany({
        where: { applicationId: appId, documentType: 'bank_statement' },
        orderBy: [{ statementMonth: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, statementMonth: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true },
      });
    } catch (error) {
      if (isApplicationDocumentTableMissing(error)) {
        res.json({ success: true, data: [] });
        return;
      }
      throw error;
    }

    res.json({ success: true, data: documents });
  })
);

router.post(
  '/:id/documents',
  ...guestAccess,
  validate(documentUploadSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({ where: { id: appId, tenantId: req.tenantId! }, select: { id: true, tenantId: true } });
    if (!app) throw createError('Application not found', 404);

    const { statementMonth, fileName, mimeType, fileData } = req.body as z.infer<typeof documentUploadSchema>;
    const normalizedFileName = fileName.trim();
    const looksLikePdf = mimeType.toLowerCase() === 'application/pdf' || normalizedFileName.toLowerCase().endsWith('.pdf') || fileData.startsWith('data:application/pdf;base64,');
    if (!looksLikePdf) throw createError('Only PDF bank statements are accepted', 400);

    const base64 = fileData.replace(/^data:application\/pdf;base64,/, '');
    const content = Buffer.from(base64, 'base64');
    if (!content.length) throw createError('The uploaded PDF was empty', 400);
    if (content.length > 10 * 1024 * 1024) throw createError('Each PDF must be 10MB or smaller', 400);

    const storageRef = await uploadTenantDocument({
      tenantId: app.tenantId,
      applicationId: appId,
      documentType: 'bank_statement',
      statementMonth,
      fileName: normalizedFileName,
      mimeType: 'application/pdf',
      content,
    });

    let saved;
    try {
      saved = await prisma.applicationDocument.upsert({
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
          content: storageRef ? null : content,
          storageProvider: storageRef?.storageProvider ?? null,
          storageBucket: storageRef?.storageBucket ?? null,
          storageKey: storageRef?.storageKey ?? null,
          storageUrl: storageRef?.storageUrl ?? null,
          storageEtag: storageRef?.storageEtag ?? null,
        },
        create: {
          applicationId: appId,
          documentType: 'bank_statement',
          statementMonth,
          fileName: normalizedFileName,
          mimeType: 'application/pdf',
          sizeBytes: content.length,
          content: storageRef ? null : content,
          storageProvider: storageRef?.storageProvider ?? null,
          storageBucket: storageRef?.storageBucket ?? null,
          storageKey: storageRef?.storageKey ?? null,
          storageUrl: storageRef?.storageUrl ?? null,
          storageEtag: storageRef?.storageEtag ?? null,
        },
        select: { id: true, statementMonth: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true },
      });
    } catch (error) {
      if (isApplicationDocumentTableMissing(error)) {
        throw createError('Document uploads are not available yet in this environment. Please try again shortly.', 503);
      }
      throw error;
    }

    await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
    await writeAuditLog({ applicationId: appId, action: 'BANK_STATEMENT_UPLOADED', actor: req.userId, ipAddress: req.ip, details: { statementMonth, fileName: normalizedFileName, sizeBytes: content.length } });

    // Note: CRM delivery is intentionally NOT auto-triggered here. The merchant
    // explicitly clicks "Submit Application" on the bank-statements screen,
    // which calls POST /:id/finalize below to enqueue delivery.

    res.status(201).json({ success: true, data: saved });
  })
);

async function readDocumentContent(tenantId: string, document: { content: Uint8Array | null; storageKey: string | null }): Promise<Buffer> {
  if (document.storageKey) return downloadTenantDocument(tenantId, document.storageKey);
  if (document.content) return Buffer.from(document.content);
  throw createError('Document content is unavailable.', 404);
}

// POST /applications/:id/finalize — merchant clicks the final "Submit Application"
// button on the bank-statements screen to officially hand off the package.
// Guests (the merchant) are allowed because they hold the application token.
router.post(
  '/:id/finalize',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId: req.tenantId! },
      select: { id: true, status: true, tenantId: true, finalizedAt: true },
    });
    if (!app) throw createError('Application not found', 404);
    if (app.status !== 'submitted') {
      throw createError('Application must be signed before it can be finalized.', 400);
    }

    const validation = await assertReadyForFinalize(appId, req.tenantId!);
    const docCount = validation.bankStatementCount;

    const now = new Date();
    if (!app.finalizedAt) {
      await prisma.application.update({
        where: { id: appId },
        data: { finalizedAt: now, lastActivityAt: now },
      });
      await writeAuditLog({
        applicationId: appId,
        action: 'APPLICATION_FINALIZED',
        actor: req.userId,
        ipAddress: req.ip,
        details: { bankStatementCount: docCount },
      });
    }

    enqueueCrmDelivery(appId, app.tenantId).catch((err: Error) =>
      console.error('[CRM] Enqueue error after finalize:', err.message)
    );

    res.json({ success: true, data: { finalizedAt: (app.finalizedAt ?? now).toISOString(), bankStatementCount: docCount } });
  })
);

router.post(
  '/:id/bank-help',
  ...guestAccess,
  bankHelpLimiter,
  validate(bankHelpSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.id);
    const app = await prisma.application.findFirst({ where: { id: appId, tenantId: req.tenantId! }, select: { id: true } });
    if (!app) throw createError('Application not found', 404);

    const { bankName, bankUrl } = req.body as z.infer<typeof bankHelpSchema>;

    try {
      const help = await generateBankStatementHelp({
        bankName,
        bankUrl: bankUrl || undefined,
      });

      await prisma.application.updateMany({ where: { id: appId, tenantId: req.tenantId! }, data: { lastActivityAt: new Date() } });
      await writeAuditLog({
        applicationId: appId,
        action: 'BANK_HELP_LOOKUP',
        actor: req.userId,
        ipAddress: req.ip,
        details: {
          bankName,
          bankUrl: help.bankUrl,
          cached: help.cached,
          sourcePages: help.sourcePages,
        },
      });

      res.json({ success: true, data: help });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to retrieve bank download instructions right now.';

      if (
        message.includes('Bank name is required')
        || message.includes('invalid')
        || message.includes('supported')
        || message.includes('safely')
      ) {
        throw createError(message, 400);
      }

      if (message.includes('not configured')) {
        throw createError(message, 503);
      }

      throw createError('Unable to retrieve bank download instructions right now.', 502);
    }
  })
);

// POST /applications/:id/submit — mark the signed application submitted.
// Lender/API handoff is intentionally deferred to POST /:id/finalize.
router.post(
  '/:id/submit',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const submitAppId = String(req.params.id);
    const app = await assertReadyForSubmit(submitAppId, req.tenantId!);

    await prisma.application.update({ where: { id: app.applicationId }, data: { status: 'submitted', completionPct: 100 } });
    await writeAuditLog({ applicationId: app.applicationId, action: 'APPLICATION_SUBMITTED', actor: req.userId, ipAddress: req.ip });

    // Do not push raw signed application data from this legacy submit step.
    // Lender/API delivery happens only after the merchant clicks the final
    // Submit Application button, via POST /:id/finalize -> enqueueCrmDelivery.
    // That path builds a privacy-aware package and redacts fields based on the
    // tenant PDF Privacy toggles before sending anything to the lender API.

    res.json({ success: true });
  })
);

// GET /applications/:id/pdf — download signed PDF (guests allowed)
router.get(
  '/:id/pdf',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const pdfAppId = String(req.params.id);
    const [app, tenantSettings] = await Promise.all([
      prisma.application.findFirst({
        where: { id: pdfAppId, tenantId: req.tenantId! },
        include: { business: true, owners: { orderBy: { ownerIndex: 'asc' } }, signature: true, financial: true, loanRequest: true },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId: req.tenantId! },
        select: {
          companyName: true, legalBusinessName: true, logoUrl: true,
          companyEmail: true, companyPhone: true, companyAddress: true,
          pdfShowContactEmail: true, pdfShowContactPhone: true,
          pdfShowAnnualRevenue: true, pdfShowAmountRequested: true,
        },
      }),
    ]);
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

    const branding: TenantBranding | undefined = tenantSettings ? {
      companyName: tenantSettings.companyName ?? undefined,
      legalBusinessName: tenantSettings.legalBusinessName ?? undefined,
      logoUrl: tenantSettings.logoUrl ?? undefined,
      companyEmail: tenantSettings.companyEmail ?? undefined,
      companyPhone: tenantSettings.companyPhone ?? undefined,
      companyAddress: tenantSettings.companyAddress ?? undefined,
    } : undefined;

    const visibility: PdfVisibility | undefined = tenantSettings ? {
      showContactEmail: tenantSettings.pdfShowContactEmail,
      showContactPhone: tenantSettings.pdfShowContactPhone,
      showAnnualRevenue: tenantSettings.pdfShowAnnualRevenue,
      showAmountRequested: tenantSettings.pdfShowAmountRequested,
    } : undefined;

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
      financial: app.financial ? {
        annualRevenue: app.financial.annualRevenue ?? undefined,
      } : undefined,
      loanRequest: app.loanRequest ? {
        amountRequested: app.loanRequest.amountRequested ?? undefined,
        urgency: app.loanRequest.urgency ?? undefined,
      } : undefined,
      signature: {
        signerName: sig.signerName,
        signerEmail: sig.signerEmail,
        signedAt: sig.signedAt.toISOString(),
        signatureData: sig.signatureData,
      },
    }, branding, visibility);
    stream.pipe(res);
  })
);

export default router;

