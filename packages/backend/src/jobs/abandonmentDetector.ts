import { prisma } from '../lib/prisma';
import { buildHeatmap, pushWarmLeadToSwitchbox } from '../services/crm.service';

const ABANDONMENT_MS = 15 * 60 * 1000; // 15 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

async function detectAndPushAbandonedLeads(): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONMENT_MS);

  let abandoned;
  try {
    abandoned = await prisma.application.findMany({
      where: {
        status: 'draft',
        tcpaConsentStep1: true,
        warmLeadSentAt: null,
        lastActivityAt: { lt: cutoff },
        // Require minimum contact info to be present
        contactEmail: { not: null },
        contactFirstName: { not: null },
        contactLastName: { not: null },
        contactPhone: { not: null },
      },
      include: { business: { select: { legalName: true, stateOfFormation: true } } },
    });
  } catch (err) {
    console.error('[AbandonmentDetector] Query error:', (err as Error).message);
    return;
  }

  if (abandoned.length === 0) return;

  console.log(`[AbandonmentDetector] Found ${abandoned.length} abandoned application(s).`);

  for (const app of abandoned) {
    try {
      const analyticsHeatmap = await buildHeatmap(app.id);

      await pushWarmLeadToSwitchbox({
        applicationId: app.id,
        tenantId: app.tenantId,
        contactFirstName: app.contactFirstName!,
        contactLastName: app.contactLastName!,
        contactEmail: app.contactEmail!,
        contactPhone: app.contactPhone!,
        businessName: app.business?.legalName ?? null,
        stateOfFormation: app.business?.stateOfFormation ?? null,
        abandonedAtStep: app.currentStep,
        analyticsHeatmap,
        createdAt: app.createdAt.toISOString(),
      });

      await prisma.application.update({
        where: { id: app.id },
        data: { warmLeadSentAt: new Date() },
      });

      console.log(`[AbandonmentDetector] Warm lead sent for application ${app.id}`);
    } catch (err) {
      console.error(`[AbandonmentDetector] Error processing ${app.id}:`, (err as Error).message);
    }
  }
}

export function startAbandonmentDetector(): void {
  console.log(`[AbandonmentDetector] Started. Checking every ${CHECK_INTERVAL_MS / 60000} min, timeout ${ABANDONMENT_MS / 60000} min.`);
  // Run once shortly after start, then on interval
  setTimeout(() => { detectAndPushAbandonedLeads().catch(console.error); }, 30_000);
  setInterval(() => { detectAndPushAbandonedLeads().catch(console.error); }, CHECK_INTERVAL_MS);
}

