import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

interface AuditParams {
  applicationId: string;
  action: string;
  actor?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      applicationId: params.applicationId,
      action: params.action,
      actor: params.actor,
      ipAddress: params.ipAddress,
      details: params.details as Prisma.InputJsonValue | undefined,
    },
  });
}

