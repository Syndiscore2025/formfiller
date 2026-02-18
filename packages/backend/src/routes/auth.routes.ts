import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().min(1),
  tenantName: z.string().min(1).optional(),
  adminKey: z.string().optional(),
});

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, tenantSlug } = req.body as z.infer<typeof loginSchema>;

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.isActive) throw createError('Tenant not found', 404);

    const user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user || !user.isActive) throw createError('Invalid credentials', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw createError('Invalid credentials', 401);

    const token = jwt.sign(
      { userId: user.id, tenantId: tenant.id, role: user.role },
      config.jwtSecret,
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, role: user.role, tenantId: tenant.id });
  })
);

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, tenantSlug, tenantName } = req.body as z.infer<typeof registerSchema>;

    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });

    if (!tenant) {
      if (!tenantName) throw createError('tenantName required for new tenant', 400);
      const { v4: uuidv4 } = await import('uuid');
      tenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          apiKey: uuidv4(),
        },
      });
    }

    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (existing) throw createError('User already exists', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email, passwordHash },
    });

    const token = jwt.sign(
      { userId: user.id, tenantId: tenant.id, role: user.role },
      config.jwtSecret,
      { expiresIn: '8h' }
    );

    res.status(201).json({ success: true, token, role: user.role, tenantId: tenant.id });
  })
);

export default router;

