import { prisma } from '../lib/prisma';
import { config } from '../config';
import { buildHeatmap, pushWarmLeadToSwitchbox } from '../services/crm.service';
import { sendAbandonedEmail } from '../services/email.service';

const WARM_LEAD_MS = 15 * 60 * 1000;    // 15 minutes — push to Switchbox CRM
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // run both checks every 5 minutes

// ─── 1. Warm-lead push (unchanged behaviour) ──────────────────────────────────

async function detectAndPushAbandonedLeads(): Promise<void> {
  const cutoff = new Date(Date.now() - WARM_LEAD_MS);

  let abandoned;
  try {
    abandoned = await prisma.application.findMany({
      where: {
        status: 'draft',
        tcpaConsentStep1: true,
        warmLeadSentAt: null,
        lastActivityAt: { lt: cutoff },
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
  console.log(`[AbandonmentDetector] Found ${abandoned.length} warm lead(s).`);

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

// ─── 2. Abandonment email (per-tenant delay + SMTP settings) ─────────────────

async function detectAndSendAbandonmentEmails(): Promise<void> {
  // Only query tenants that have the feature enabled and SMTP host configured
  let tenantSettingsList;
  try {
    tenantSettingsList = await prisma.tenantSettings.findMany({
      where: {
        emailAbandonedEnabled: true,
        smtpHost: { not: null },
        smtpFrom: { not: null },
      },
    });
  } catch (err) {
    console.error('[AbandonmentDetector] Settings query error:', (err as Error).message);
    return;
  }

  if (tenantSettingsList.length === 0) return;

  for (const settings of tenantSettingsList) {
    const delayMs = (settings.emailAbandonedDelayMinutes ?? 1440) * 60 * 1000;
    const cutoff = new Date(Date.now() - delayMs);

    let apps;
    try {
      apps = await prisma.application.findMany({
        where: {
          tenantId: settings.tenantId,
          status: 'draft',
          tcpaConsentStep1: true,
          abandonedEmailSentAt: null,
          lastActivityAt: { lt: cutoff },
          contactEmail: { not: null },
          contactFirstName: { not: null },
        },
        include: { business: { select: { legalName: true } } },
      });
    } catch (err) {
      console.error(`[AbandonmentDetector] App query error for tenant ${settings.tenantId}:`, (err as Error).message);
      continue;
    }

    for (const app of apps) {
      try {
        await sendAbandonedEmail(settings, app.contactEmail!, {
          firstName: app.contactFirstName,
          companyName: app.business?.legalName ?? app.contactFirstName,
          applicationUrl: `${config.frontendUrl}/apply`,
        });
        await prisma.application.update({
          where: { id: app.id },
          data: { abandonedEmailSentAt: new Date() },
        });
        console.log(`[AbandonmentDetector] Abandonment email sent for application ${app.id}`);
      } catch (err) {
        console.error(`[AbandonmentDetector] Email error for ${app.id}:`, (err as Error).message);
      }
    }
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

export function startAbandonmentDetector(): void {
  console.log(`[AbandonmentDetector] Started. Warm-lead check every ${CHECK_INTERVAL_MS / 60000} min (cutoff ${WARM_LEAD_MS / 60000} min). Email check every ${CHECK_INTERVAL_MS / 60000} min (delay per tenant settings).`);

  // Warm-lead push: first run 30 s after boot, then every 5 min
  setTimeout(() => { detectAndPushAbandonedLeads().catch(console.error); }, 30_000);
  setInterval(() => { detectAndPushAbandonedLeads().catch(console.error); }, CHECK_INTERVAL_MS);

  // Abandonment email: first run 60 s after boot, then every 5 min
  setTimeout(() => { detectAndSendAbandonmentEmails().catch(console.error); }, 60_000);
  setInterval(() => { detectAndSendAbandonmentEmails().catch(console.error); }, CHECK_INTERVAL_MS);
}

