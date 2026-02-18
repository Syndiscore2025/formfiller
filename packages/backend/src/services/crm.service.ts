import { config } from '../config';
import { prisma } from '../lib/prisma';

// Per-field friction entry
export interface FieldHeatmapEntry {
  fieldName: string;
  focusCount: number;
  totalDurationMs: number;
  pauseCount: number;   // typing pauses > 3s
  revisitCount: number;
}

export type AnalyticsHeatmap = FieldHeatmapEntry[];

export interface CrmPayload {
  applicationId: string;
  tenantId: string;
  status: string;
  business?: Record<string, unknown>;
  owners?: Record<string, unknown>[];
  financial?: Record<string, unknown>;
  loanRequest?: Record<string, unknown>;
  submittedAt: string;
  analyticsHeatmap?: AnalyticsHeatmap;
}

export interface WarmLeadPayload {
  applicationId: string;
  tenantId: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  businessName?: string | null;
  stateOfFormation?: string | null;
  abandonedAtStep: number;
  analyticsHeatmap: AnalyticsHeatmap;
  createdAt: string;
}

/** Build a per-field analytics heatmap from stored events for an application. */
export async function buildHeatmap(applicationId: string): Promise<AnalyticsHeatmap> {
  const events = await prisma.analyticsEvent.findMany({
    where: { applicationId },
    select: { fieldName: true, eventType: true, durationMs: true },
  });

  const map = new Map<string, FieldHeatmapEntry>();

  for (const ev of events) {
    const key = ev.fieldName ?? '__page__';
    if (!map.has(key)) {
      map.set(key, { fieldName: key, focusCount: 0, totalDurationMs: 0, pauseCount: 0, revisitCount: 0 });
    }
    const entry = map.get(key)!;
    if (ev.eventType === 'field_focus') entry.focusCount += 1;
    if (ev.eventType === 'field_blur' && ev.durationMs) entry.totalDurationMs += ev.durationMs;
    if (ev.eventType === 'typing_pause') entry.pauseCount += 1;
    if (ev.eventType === 'field_revisit') entry.revisitCount += 1;
  }

  return Array.from(map.values()).sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

async function pushWebhook(url: string, apiKey: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Switchbox webhook failed: ${res.status} ${res.statusText}`);
  }
}

export async function pushToSwitchboxCrm(payload: CrmPayload): Promise<void> {
  if (!config.crmWebhookUrl || !config.crmApiKey) return;
  await pushWebhook(config.crmWebhookUrl, config.crmApiKey, payload);
}

export async function pushWarmLeadToSwitchbox(payload: WarmLeadPayload): Promise<void> {
  if (!config.crmWebhookUrl || !config.crmApiKey) return;
  // Use the same CRM endpoint with a warm_lead wrapper, or a dedicated warm-lead URL if configured
  const url = (config as Record<string, unknown>).crmWarmLeadUrl as string | undefined ?? config.crmWebhookUrl;
  await pushWebhook(url, config.crmApiKey, { type: 'warm_lead', ...payload });
}

