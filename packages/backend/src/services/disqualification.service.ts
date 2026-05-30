import { prisma } from '../lib/prisma';
import { writeAuditLog } from './auditLog.service';

export type DisqualificationCode =
  | 'no_revenue'
  | 'startup_or_pre_revenue'
  | 'insufficient_time_in_business';

export interface DisqualificationResult {
  code: DisqualificationCode;
  reason: string;
  merchantMessage: string;
}

export const MIN_BUSINESS_AGE_MONTHS = 1;

const MINIMUM_MESSAGE =
  'At this time, this application does not meet the minimum requirements. The business needs active revenue and at least 1 month in business before moving forward. Please come back once those requirements are met.';

export function buildDisqualificationReply(result: DisqualificationResult): string {
  return `${result.merchantMessage}\n\n${MINIMUM_MESSAGE}`;
}

export function evaluateChatDisqualification(message: string): DisqualificationResult | null {
  const lower = message.toLowerCase().replace(/[^a-z0-9$% .-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!lower) return null;

  if (/\b(?:no revenue|zero revenue|0 revenue|not making revenue|no sales|zero sales|0 sales|no deposits|not generating revenue|haven't generated revenue|havent generated revenue)\b/i.test(lower)) {
    return {
      code: 'no_revenue',
      reason: 'Merchant stated the business has no revenue.',
      merchantMessage: 'Thanks for letting me know. Because the business is not generating revenue yet, we cannot continue this funding application right now.',
    };
  }

  if (/\b(?:pre[- ]?revenue|startup|start up|just started|just opened|not open yet|haven't opened|havent opened)\b/i.test(lower)) {
    return {
      code: 'startup_or_pre_revenue',
      reason: 'Merchant stated the business is a startup, not open, or pre-revenue.',
      merchantMessage: 'Thanks for being upfront. Because the business is a startup or pre-revenue, we cannot continue this funding application right now.',
    };
  }

  if (/\b(?:0|zero)\s*(?:months?|mos?)\b/i.test(lower) || /\b(?:less than|under)\s*(?:1|one)\s*month\b/i.test(lower) || /\bnot even\s*(?:1|one|a)\s*month\b/i.test(lower)) {
    return {
      code: 'insufficient_time_in_business',
      reason: 'Merchant stated time in business is under 1 month.',
      merchantMessage: 'Thanks for clarifying. Because the business has been operating for less than 1 month, we cannot continue this funding application right now.',
    };
  }

  return null;
}

export function evaluateBusinessStartDateDisqualification(value: Date | string | null | undefined, now = new Date()): DisqualificationResult | null {
  if (!value) return null;
  const start = value instanceof Date ? value : parseDateOnlyLocal(value);
  if (Number.isNaN(start.getTime())) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneMonthAnniversary = new Date(start.getFullYear(), start.getMonth() + MIN_BUSINESS_AGE_MONTHS, start.getDate());
  if (oneMonthAnniversary <= today) return null;

  return {
    code: 'insufficient_time_in_business',
    reason: 'Business start date indicates less than 1 month in business.',
    merchantMessage: 'Based on the business start date, the business has been operating for less than 1 month.',
  };
}

function parseDateOnlyLocal(value: string): Date {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export async function markApplicationDisqualified(params: {
  applicationId: string;
  tenantId: string;
  result: DisqualificationResult;
  source: string;
}): Promise<void> {
  const now = new Date();
  const updated = await prisma.application.updateMany({
    where: { id: params.applicationId, tenantId: params.tenantId, disqualifiedAt: null },
    data: {
      status: 'disqualified',
      disqualifiedAt: now,
      disqualificationReason: params.result.reason,
      lastActivityAt: now,
    },
  });

  if (updated.count > 0) {
    await writeAuditLog({
      applicationId: params.applicationId,
      action: 'APPLICATION_DISQUALIFIED',
      details: { code: params.result.code, source: params.source },
    });
  }
}