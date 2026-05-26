import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireTenant, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { chatLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../middleware/errorHandler';
import { createChatReply, createPreApplicationChatReply } from '../services/chatAgent.service';

const router = Router();
const guestAccess = [optionalAuth, requireTenant];

const messageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(1200, 'Message is too long'),
  clientState: z.unknown().optional(),
});

async function assertApplicationAccess(applicationId: string, tenantId: string): Promise<void> {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, tenantId },
    select: { id: true },
  });
  if (!app) throw createError('Application not found', 404);
}

router.get(
  '/:appId/history',
  ...guestAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const applicationId = String(req.params.appId);
    await assertApplicationAccess(applicationId, req.tenantId!);

    const messages = await prisma.chatMessage.findMany({
      where: { applicationId, tenantId: req.tenantId!, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: messages });
  })
);

router.post(
  '/message',
  ...guestAccess,
  chatLimiter,
  validate(messageSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { message, clientState } = req.body as z.infer<typeof messageSchema>;

    try {
      const reply = await createPreApplicationChatReply({
        tenantId: req.tenantId!,
        userMessage: message,
        clientState,
      });
      res.json({ success: true, data: reply });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to process chat message.';
      if (msg.includes('not enabled')) throw createError('AI chat is not enabled for this tenant.', 403);
      throw createError('Unable to process chat message right now. Please try again.', 502);
    }
  })
);

router.post(
  '/:appId/message',
  ...guestAccess,
  chatLimiter,
  validate(messageSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const applicationId = String(req.params.appId);
    const { message, clientState } = req.body as z.infer<typeof messageSchema>;

    try {
      const reply = await createChatReply({
        tenantId: req.tenantId!,
        applicationId,
        userMessage: message,
        clientState,
      });
      res.json({ success: true, data: reply });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to process chat message.';
      if (msg.includes('not found')) throw createError('Application not found', 404);
      if (msg.includes('not enabled')) throw createError('AI chat is not enabled for this tenant.', 403);
      throw createError('Unable to process chat message right now. Please try again.', 502);
    }
  })
);

export default router;