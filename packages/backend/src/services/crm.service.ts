import { config } from '../config';

export interface CrmPayload {
  applicationId: string;
  tenantId: string;
  status: string;
  business?: Record<string, unknown>;
  owners?: Record<string, unknown>[];
  financial?: Record<string, unknown>;
  loanRequest?: Record<string, unknown>;
  submittedAt: string;
}

export async function pushToSwitchboxCrm(payload: CrmPayload): Promise<void> {
  if (!config.crmWebhookUrl || !config.crmApiKey) return;

  const res = await fetch(config.crmWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.crmApiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Switchbox CRM push failed: ${res.status} ${res.statusText}`);
  }
}

