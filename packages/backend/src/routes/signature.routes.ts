import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { writeAuditLog } from '../services/auditLog.service';

const router = Router();
const guestAccess = [optionalAuth, requireTenant];

const signatureSchema = z.object({
  signatureData: z.string().min(10, 'Signature data is required'),
  signerName: z.string().min(2),
  signerEmail: z.string().email(),
  consentAcknowledged: z.literal(true, {
    errorMap: () => ({ message: 'You must acknowledge the consent statement' }),
  }),
  marketingConsent: z.literal(true, {
    errorMap: () => ({ message: 'Marketing consent acknowledgment is required' }),
  }),
});

const CONSENT_TEXT =
  'By signing this application, I certify that all information provided is accurate and complete. ' +
  'I authorize the lender to obtain credit reports and verify all information. ' +
  'This electronic signature is legally binding under the Electronic Signatures in Global and National ' +
  'Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).';

router.post(
  '/:appId/sign',
  ...guestAccess,
  validate(signatureSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appId = String(req.params.appId);
    const { signatureData, signerName, signerEmail } = req.body as z.infer<typeof signatureSchema>;
    const marketingConsent = true; // validated as z.literal(true) above

    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId: req.tenantId! },
    });
    if (!app) throw createError('Application not found', 404);

    const existing = await prisma.signature.findUnique({ where: { applicationId: appId } });
    if (existing) throw createError('Application already signed', 409);

    const now = new Date();
    const ipAddress = req.ip ?? '0.0.0.0';
    const userAgent = req.headers['user-agent'] ?? '';

    await prisma.signature.create({
      data: {
        applicationId: appId,
        signatureData,
        signerName,
        signerEmail,
        ipAddress,
        userAgent,
        consentText: CONSENT_TEXT,
        signedAt: now,
        marketingConsent,
        marketingConsentTimestamp: now,
      },
    });

    await writeAuditLog({
      applicationId: appId,
      action: 'APPLICATION_SIGNED',
      actor: signerEmail,
      ipAddress,
      details: {
        signerName,
        signerEmail,
        signedAt: now.toISOString(),
        marketingConsent,
        marketingConsentTimestamp: now.toISOString(),
      },
    });

    res.json({
      success: true,
      signedAt: now.toISOString(),
      consentText: CONSENT_TEXT,
    });
  })
);

router.get(
  '/:appId/signature',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sig = await prisma.signature.findFirst({
      where: { applicationId: String(req.params.appId), application: { tenantId: req.tenantId! } },
      select: { signerName: true, signerEmail: true, signedAt: true, ipAddress: true, consentText: true },
    });
    if (!sig) throw createError('Signature not found', 404);
    res.json({ success: true, data: sig });
  })
);

export default router;

