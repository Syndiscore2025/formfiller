import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { encrypt } from '../utils/encryption';

const router = Router();

const PUBLIC_SETTINGS_SELECT = {
  companyName: true,
  legalBusinessName: true,
  logoUrl: true,
  companyEmail: true,
  companyPhone: true,
  companyAddress: true,
  websiteUrl: true,
  supportEmail: true,
  theme: true,
  accentColor: true,
  surfaceColor: true,
  pdfShowContactEmail: true,
  pdfShowContactPhone: true,
  pdfShowAnnualRevenue: true,
  pdfShowAmountRequested: true,
} as const;

const PUBLIC_SETTINGS_DEFAULTS = {
  companyName: null,
  legalBusinessName: null,
  logoUrl: null,
  companyEmail: null,
  companyPhone: null,
  companyAddress: null,
  websiteUrl: null,
  supportEmail: null,
  theme: 'dark',
  accentColor: null,
  surfaceColor: null,
  pdfShowContactEmail: true,
  pdfShowContactPhone: true,
  pdfShowAnnualRevenue: true,
  pdfShowAmountRequested: true,
};

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
      select: PUBLIC_SETTINGS_SELECT,
    });
    res.json({ success: true, data: settings ?? PUBLIC_SETTINGS_DEFAULTS });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin/settings endpoints. Login required. Manage branding, theme, PDF privacy,
// outbound integration credentials, and document storage. Secrets are write-only:
// responses only include booleans indicating whether keys are configured.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_SELECT = {
  ...PUBLIC_SETTINGS_SELECT,
  switchboxApiUrl: true,
  documentStorageProvider: true,
  documentStorageEndpoint: true,
  documentStorageRegion: true,
  documentStorageBucket: true,
  documentStoragePrefix: true,
  documentStorageAccessKeyId: true,
  documentStoragePublicBaseUrl: true,
  // SMTP
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUser: true,
  smtpFrom: true,
  smtpFromName: true,
  // Email templates
  emailAbandonedEnabled: true,
  emailAbandonedDelayMinutes: true,
  emailAbandonedSubject: true,
  emailAbandonedBody: true,
  emailAbandonedIncludeLogo: true,
  emailAbandonedIncludeSig: true,
  emailNoBanksEnabled: true,
  emailNoBanksSubject: true,
  emailNoBanksBody: true,
  emailNoBanksIncludeLogo: true,
  emailNoBanksIncludeSig: true,
  emailInsufficientBanksEnabled: true,
  emailMinBankStatements: true,
  emailInsufficientBanksSubject: true,
  emailInsufficientBanksBody: true,
  emailInsufficientBanksIncludeLogo: true,
  emailInsufficientBanksIncludeSig: true,
  aiChatEnabled: true,
  aiPersonaName: true,
  aiSystemPromptOverride: true,
  aiEligibilityRules: true,
  aiModel: true,
} as const;

const ADMIN_DEFAULTS = {
  ...PUBLIC_SETTINGS_DEFAULTS,
  pdfShowContactEmail: true,
  pdfShowContactPhone: true,
  pdfShowAnnualRevenue: true,
  pdfShowAmountRequested: true,
  switchboxApiUrl: null,
  documentStorageProvider: 'database',
  documentStorageEndpoint: null,
  documentStorageRegion: null,
  documentStorageBucket: null,
  documentStoragePrefix: null,
  documentStorageAccessKeyId: null,
  documentStoragePublicBaseUrl: null,
  smtpHost: null,
  smtpPort: null,
  smtpSecure: false,
  smtpUser: null,
  smtpFrom: null,
  smtpFromName: null,
  emailAbandonedEnabled: false,
  emailAbandonedDelayMinutes: 1440,
  emailAbandonedSubject: 'Complete your funding application',
  emailAbandonedBody: null,
  emailAbandonedIncludeLogo: true,
  emailAbandonedIncludeSig: true,
  emailNoBanksEnabled: false,
  emailNoBanksSubject: "Don't forget to upload your bank statements",
  emailNoBanksBody: null,
  emailNoBanksIncludeLogo: true,
  emailNoBanksIncludeSig: true,
  emailInsufficientBanksEnabled: false,
  emailMinBankStatements: 3,
  emailInsufficientBanksSubject: 'We need more bank statements to process your application',
  emailInsufficientBanksBody: null,
  emailInsufficientBanksIncludeLogo: true,
  emailInsufficientBanksIncludeSig: true,
  aiChatEnabled: true,
  aiPersonaName: 'Funding Assistant',
  aiSystemPromptOverride: null,
  aiEligibilityRules: null,
  aiModel: 'claude-3-5-sonnet-latest',
};

router.get(
  '/settings/admin',
  optionalAuth,
  requireTenant,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: req.tenantId! },
      select: { ...ADMIN_SELECT, switchboxApiKey: true, documentStorageSecretAccessKey: true, smtpPass: true },
    });
    const base = settings ?? { ...ADMIN_DEFAULTS, switchboxApiKey: null, documentStorageSecretAccessKey: null, smtpPass: null };
    const { switchboxApiKey, documentStorageSecretAccessKey, smtpPass, ...rest } = base;
    res.json({
      success: true,
      data: {
        ...rest,
        switchboxApiKeyConfigured: Boolean(switchboxApiKey),
        documentStorageSecretConfigured: Boolean(documentStorageSecretAccessKey),
        smtpPassConfigured: Boolean(smtpPass),
      },
    });
  })
);

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Color must be a 6-digit hex code (e.g. #22d3ee)');

const optionalNullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

const urlOrBlank = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === 'https://' || trimmed === 'http://' ? '' : trimmed;
  },
  z.string().url().or(z.literal('')),
);

// Logo can be either an http(s) URL or an inline data: URI for direct upload.
// Cap data URIs at ~512KB encoded (≈ 380KB raw) to keep DB rows reasonable.
const logoUrl = z
  .string()
  .trim()
  .max(700_000)
  .refine(
    (v) => v === '' || /^https?:\/\//u.test(v) || /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/u.test(v),
    'Logo must be an http(s) URL or a PNG/JPEG/WebP/SVG data URI',
  );

const updateSchema = z.object({
  companyName: optionalNullable(z.string().trim().max(120)),
  legalBusinessName: optionalNullable(z.string().trim().max(200)),
  logoUrl: optionalNullable(logoUrl),
  companyEmail: optionalNullable(z.string().trim().email().or(z.literal(''))),
  companyPhone: optionalNullable(z.string().trim().max(40)),
  companyAddress: optionalNullable(z.string().trim().max(300)),
  websiteUrl: optionalNullable(urlOrBlank),
  supportEmail: optionalNullable(z.string().trim().email().or(z.literal(''))),
  theme: optionalNullable(z.enum(['dark', 'light'])),
  accentColor: optionalNullable(hexColor.or(z.literal(''))),
  surfaceColor: optionalNullable(hexColor.or(z.literal(''))),
  pdfShowContactEmail: z.boolean().optional(),
  pdfShowContactPhone: z.boolean().optional(),
  pdfShowAnnualRevenue: z.boolean().optional(),
  pdfShowAmountRequested: z.boolean().optional(),
  switchboxApiUrl: optionalNullable(urlOrBlank),
  switchboxApiKey: optionalNullable(z.string().trim().max(500)),
  documentStorageProvider: optionalNullable(z.enum(['database', 's3'])),
  documentStorageEndpoint: optionalNullable(urlOrBlank),
  documentStorageRegion: optionalNullable(z.string().trim().max(80)),
  documentStorageBucket: optionalNullable(z.string().trim().max(120)),
  documentStoragePrefix: optionalNullable(z.string().trim().max(240)),
  documentStorageAccessKeyId: optionalNullable(z.string().trim().max(240)),
  documentStorageSecretAccessKey: optionalNullable(z.string().trim().max(500)),
  documentStoragePublicBaseUrl: optionalNullable(urlOrBlank),
  // SMTP
  smtpHost: optionalNullable(z.string().trim().max(253)),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUser: optionalNullable(z.string().trim().max(320)),
  smtpPass: optionalNullable(z.string().trim().max(500)),
  smtpFrom: optionalNullable(z.string().trim().email().or(z.literal(''))),
  smtpFromName: optionalNullable(z.string().trim().max(120)),
  // Email: Abandoned application
  emailAbandonedEnabled: z.boolean().optional(),
  emailAbandonedDelayMinutes: z.number().int().min(1).max(525600).optional(),
  emailAbandonedSubject: optionalNullable(z.string().trim().max(300)),
  emailAbandonedBody: optionalNullable(z.string().trim().max(5000)),
  emailAbandonedIncludeLogo: z.boolean().optional(),
  emailAbandonedIncludeSig: z.boolean().optional(),
  // Email: No bank statements
  emailNoBanksEnabled: z.boolean().optional(),
  emailNoBanksSubject: optionalNullable(z.string().trim().max(300)),
  emailNoBanksBody: optionalNullable(z.string().trim().max(5000)),
  emailNoBanksIncludeLogo: z.boolean().optional(),
  emailNoBanksIncludeSig: z.boolean().optional(),
  // Email: Insufficient bank statements
  emailInsufficientBanksEnabled: z.boolean().optional(),
  emailMinBankStatements: z.number().int().min(1).max(24).optional(),
  emailInsufficientBanksSubject: optionalNullable(z.string().trim().max(300)),
  emailInsufficientBanksBody: optionalNullable(z.string().trim().max(5000)),
  emailInsufficientBanksIncludeLogo: z.boolean().optional(),
  emailInsufficientBanksIncludeSig: z.boolean().optional(),
  // AI chat agent
  aiChatEnabled: z.boolean().optional(),
  aiPersonaName: optionalNullable(z.string().trim().max(80)),
  aiSystemPromptOverride: optionalNullable(z.string().trim().max(5000)),
  aiModel: optionalNullable(z.string().trim().max(120)),
});

// Normalize empty strings to null so the DB stores a real absence of value.
function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  }
  return out as T;
}

router.patch(
  '/settings/admin',
  optionalAuth,
  requireTenant,
  validate(updateSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const data = emptyToNull(body);
    if (typeof data.documentStorageSecretAccessKey === 'string' && data.documentStorageSecretAccessKey.trim()) {
      data.documentStorageSecretAccessKey = encrypt(data.documentStorageSecretAccessKey.trim());
    } else {
      delete data.documentStorageSecretAccessKey;
    }
    // Encrypt SMTP password if provided; omit from update if blank (preserves existing)
    if (typeof data.smtpPass === 'string' && data.smtpPass.trim()) {
      data.smtpPass = encrypt(data.smtpPass.trim());
    } else {
      delete data.smtpPass;
    }

    const updated = await prisma.tenantSettings.upsert({
      where: { tenantId: req.tenantId! },
      create: { tenantId: req.tenantId!, ...data },
      update: data,
      select: { ...ADMIN_SELECT, switchboxApiKey: true, documentStorageSecretAccessKey: true, smtpPass: true },
    });

    const { switchboxApiKey, documentStorageSecretAccessKey, smtpPass, ...rest } = updated;
    res.json({
      success: true,
      data: {
        ...rest,
        switchboxApiKeyConfigured: Boolean(switchboxApiKey),
        documentStorageSecretConfigured: Boolean(documentStorageSecretAccessKey),
        smtpPassConfigured: Boolean(smtpPass),
      },
    });
  })
);

export default router;
