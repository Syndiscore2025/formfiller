import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { createError } from './errorHandler';

export interface AuthRequest extends Request {
  tenantId?: string;
  userId?: string;
  role?: string;
}

interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export async function requireAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(createError('Missing or invalid authorization header', 401));
    }
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.userId = payload.userId;
    req.tenantId = payload.tenantId;
    req.role = payload.role;
    next();
  } catch {
    next(createError('Invalid or expired token', 401));
  }
}

export async function requireTenantApiKey(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return next(createError('Missing API key', 401));

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant || !tenant.isActive) return next(createError('Invalid or inactive API key', 401));

    req.tenantId = tenant.id;
    next();
  } catch (err) {
    next(err);
  }
}

