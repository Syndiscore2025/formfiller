import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from './auth';
import { createError } from './errorHandler';
import { CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN } from '../services/customFrontendSettings.service';
import {
  CUSTOM_FRONTEND_PUBLIC_KEY_HEADER,
  originMatchesAllowedOrigins,
  publicKeyMatchesHash,
  shouldRequireCustomFrontendAuth,
} from '../services/customFrontendAuth.service';

export async function requireCustomFrontendAccess(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const origin = req.header('origin');
    const publicKey = req.header(CUSTOM_FRONTEND_PUBLIC_KEY_HEADER)?.trim() ?? '';

    if (!shouldRequireCustomFrontendAuth({ origin, publicKey, isAuthenticated: Boolean(req.userId) })) {
      next();
      return;
    }

    if (!publicKey || !CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN.test(publicKey)) {
      next(createError('Missing or invalid public frontend key', 401));
      return;
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: req.tenantId! },
      select: {
        customFrontendEnabled: true,
        customFrontendPublicKeyHash: true,
        customFrontendAllowedOrigins: true,
      },
    });

    if (!settings?.customFrontendEnabled || !settings.customFrontendPublicKeyHash) {
      next(createError('Custom frontend access is not enabled for this tenant', 403));
      return;
    }

    if (!publicKeyMatchesHash(publicKey, settings.customFrontendPublicKeyHash)) {
      next(createError('Invalid public frontend key', 401));
      return;
    }

    if (origin && !originMatchesAllowedOrigins(origin, settings.customFrontendAllowedOrigins)) {
      next(createError('Origin is not allowed for this tenant', 403));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
