import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/tenant/settings
 *
 * Returns the public-safe subset of TenantSettings for the resolved tenant.
 * Used by the frontend to get branding, redirect URL, and theme values.
 * Never returns API keys or other sensitive integration credentials.
 */
router.get(
  '/settings',
  optionalAuth,
  requireTenant,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: req.tenantId! },
      select: {
        companyName: true,
        legalBusinessName: true,
        logoUrl: true,
        companyEmail: true,
        companyPhone: true,
        companyAddress: true,
        websiteUrl: true,
        supportEmail: true,
        accentColor: true,
        surfaceColor: true,
      },
    });

    // Return defaults if no settings row exists yet
    res.json({
      success: true,
      data: settings ?? {
        companyName: null,
        legalBusinessName: null,
        logoUrl: null,
        companyEmail: null,
        companyPhone: null,
        companyAddress: null,
        websiteUrl: null,
        supportEmail: null,
        accentColor: null,
        surfaceColor: null,
      },
    });
  })
);

export default router;
