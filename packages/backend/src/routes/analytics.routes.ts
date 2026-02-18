import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

const eventSchema = z.object({
  events: z.array(
    z.object({
      fieldName: z.string().optional(),
      eventType: z.enum([
        'field_focus',
        'field_blur',
        'field_change',
        'typing_pause',
        'field_revisit',
        'step_view',
        'step_complete',
        'step_abandon',
        'form_submit',
      ]),
      durationMs: z.number().int().nonnegative().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1).max(100),
});

// POST /analytics/:appId/events — batch event ingestion
router.post(
  '/:appId/events',
  validate(eventSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { appId } = req.params;

    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!app) throw createError('Application not found', 404);

    const { events } = req.body as z.infer<typeof eventSchema>;

    await prisma.analyticsEvent.createMany({
      data: events.map((e) => ({
        applicationId: appId,
        fieldName: e.fieldName,
        eventType: e.eventType,
        durationMs: e.durationMs,
        metadata: e.metadata,
      })),
    });

    res.json({ success: true, count: events.length });
  })
);

// GET /analytics/:appId/summary — friction summary per field/step
router.get(
  '/:appId/summary',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const app = await prisma.application.findFirst({
      where: { id: req.params.appId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!app) throw createError('Application not found', 404);

    const events = await prisma.analyticsEvent.groupBy({
      by: ['fieldName', 'eventType'],
      where: { applicationId: req.params.appId },
      _count: { id: true },
      _avg: { durationMs: true },
      _sum: { durationMs: true },
    });

    res.json({ success: true, data: events });
  })
);

// GET /analytics/tenant/friction — aggregate friction across all apps in tenant
router.get(
  '/tenant/friction',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const events = await prisma.analyticsEvent.groupBy({
      by: ['fieldName', 'eventType'],
      where: {
        application: { tenantId: req.tenantId! },
        eventType: { in: ['typing_pause', 'field_revisit', 'step_abandon'] },
      },
      _count: { id: true },
      _avg: { durationMs: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    });

    res.json({ success: true, data: events });
  })
);

export default router;

