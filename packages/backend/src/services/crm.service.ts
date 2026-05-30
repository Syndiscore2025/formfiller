import { config } from '../config';
import { prisma } from '../lib/prisma';
import { decrypt } from '../utils/encryption';
import { generateApplicationPdf } from './pdf.service';
import { downloadTenantDocument, uploadTenantDocument } from './documentStorage.service';

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [0, 60_000, 300_000, 900_000]; // 0s, 1m, 5m, 15m

// Per-field friction entry
export interface FieldHeatmapEntry {
  fieldName: string;
  focusCount: number;
  totalDurationMs: number;
  pauseCount: number;   // typing pauses > 3s
  revisitCount: number;
}

export type AnalyticsHeatmap = FieldHeatmapEntry[];

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

async function pushWebhook(url: string, apiKey: string, payload: unknown): Promise<{ accountId?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Switchbox webhook failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  try {
    const json = await res.json() as Record<string, unknown>;
    return { accountId: json.accountId as string | undefined };
  } catch {
    return {};
  }
}

/** Build the complete payload Switchbox (or any CRM) needs to create an account and attach documents. */
async function buildSwitchboxPayload(applicationId: string): Promise<Record<string, unknown>> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      business: true,
      owners: { orderBy: { ownerIndex: 'asc' } },
      financial: true,
      loanRequest: true,
      signature: true,
      documents: { where: { documentType: 'bank_statement' }, orderBy: { statementMonth: 'asc' } },
      tenant: { include: { settings: true } },
    },
  });

  const tenantSettings = app.tenant.settings;
  const showEstimatedCreditScore = tenantSettings?.showEstimatedCreditScore ?? true;

  // Generate signed PDF as base64
  let signedApplicationBase64: string | undefined;
  let signedApplicationStorage: {
    storageProvider: string;
    storageBucket: string;
    storageKey: string;
    storageUrl?: string;
    storageEtag?: string;
  } | undefined;
  if (app.signature) {
    const owner = app.owners[0] ?? null;
    let ownerSsn: string | undefined;
    if (owner?.ssnEncrypted) {
      try { ownerSsn = decrypt(owner.ssnEncrypted); } catch { /* leave undefined */ }
    }
    try {
      const pdfStream = generateApplicationPdf(
        {
          business: app.business ? {
            legalName: app.business.legalName ?? undefined,
            dba: app.business.dba ?? undefined,
            entityType: app.business.entityType ?? undefined,
            industry: app.business.industry ?? undefined,
            stateOfFormation: app.business.stateOfFormation ?? undefined,
            ein: app.business.ein ?? undefined,
            businessStartDate: app.business.businessStartDate?.toISOString().slice(0, 10) ?? undefined,
            phone: app.business.phone ?? undefined,
            website: app.business.website ?? undefined,
            streetAddress: app.business.streetAddress ?? undefined,
            city: app.business.city ?? undefined,
            state: app.business.state ?? undefined,
            zipCode: app.business.zipCode ?? undefined,
            sicCode: app.business.sicCode ?? undefined,
            naicsCode: app.business.naicsCode ?? undefined,
          } : undefined,
          owner: owner ? {
            firstName: owner.firstName ?? undefined,
            lastName: owner.lastName ?? undefined,
            ssn: ownerSsn,
            ownershipPct: owner.ownershipPct ?? undefined,
            creditScore: showEstimatedCreditScore ? owner.creditScore ?? undefined : undefined,
            dateOfBirth: owner.dateOfBirth ?? undefined,
            streetAddress: owner.streetAddress ?? undefined,
            city: owner.city ?? undefined,
            state: owner.state ?? undefined,
            zipCode: owner.zipCode ?? undefined,
          } : undefined,
          contact: { email: app.contactEmail ?? undefined, phone: app.contactPhone ?? undefined },
          financial: app.financial ? { annualRevenue: app.financial.annualRevenue ?? undefined } : undefined,
          loanRequest: app.loanRequest ? {
            amountRequested: app.loanRequest.amountRequested ?? undefined,
            urgency: app.loanRequest.urgency ?? undefined,
          } : undefined,
          signature: {
            signerName: app.signature.signerName,
            signerEmail: app.signature.signerEmail,
            signedAt: app.signature.signedAt.toISOString(),
            signatureData: app.signature.signatureData,
          },
        },
        tenantSettings ? {
          companyName: tenantSettings.companyName ?? undefined,
          legalBusinessName: tenantSettings.legalBusinessName ?? undefined,
          logoUrl: tenantSettings.logoUrl ?? undefined,
          companyEmail: tenantSettings.companyEmail ?? undefined,
          companyPhone: tenantSettings.companyPhone ?? undefined,
          companyAddress: tenantSettings.companyAddress ?? undefined,
        } : undefined,
        tenantSettings ? {
          showContactEmail: tenantSettings.pdfShowContactEmail,
          showContactPhone: tenantSettings.pdfShowContactPhone,
          showAnnualRevenue: tenantSettings.pdfShowAnnualRevenue,
          showAmountRequested: tenantSettings.pdfShowAmountRequested,
          showEstimatedCreditScore,
        } : undefined,
      );
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        pdfStream.on('data', (c: Buffer) => chunks.push(c));
        pdfStream.on('end', resolve);
        pdfStream.on('error', reject);
      });
      const signedPdfBuffer = Buffer.concat(chunks);
      signedApplicationBase64 = signedPdfBuffer.toString('base64');

      const signedRef = await uploadTenantDocument({
        tenantId: app.tenantId,
        applicationId: app.id,
        documentType: 'signed_application',
        statementMonth: 'final',
        fileName: `application-${app.id}.pdf`,
        mimeType: 'application/pdf',
        content: signedPdfBuffer,
      });

      if (signedRef) {
        await prisma.applicationDocument.upsert({
          where: {
            applicationId_documentType_statementMonth: {
              applicationId: app.id,
              documentType: 'signed_application',
              statementMonth: 'final',
            },
          },
          update: {
            fileName: `application-${app.id}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: signedPdfBuffer.length,
            content: null,
            storageProvider: signedRef.storageProvider,
            storageBucket: signedRef.storageBucket,
            storageKey: signedRef.storageKey,
            storageUrl: signedRef.storageUrl ?? null,
            storageEtag: signedRef.storageEtag ?? null,
          },
          create: {
            applicationId: app.id,
            documentType: 'signed_application',
            statementMonth: 'final',
            fileName: `application-${app.id}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: signedPdfBuffer.length,
            content: null,
            storageProvider: signedRef.storageProvider,
            storageBucket: signedRef.storageBucket,
            storageKey: signedRef.storageKey,
            storageUrl: signedRef.storageUrl ?? null,
            storageEtag: signedRef.storageEtag ?? null,
          },
        });
        signedApplicationStorage = signedRef;
      }
    } catch (err) {
      console.error('[CRM] PDF generation failed, continuing without PDF:', err);
    }
  }

  const bankStatements = await Promise.all(app.documents.map(async (doc) => {
    const content = doc.storageKey
      ? await downloadTenantDocument(app.tenantId, doc.storageKey)
      : doc.content
        ? Buffer.from(doc.content)
        : null;

    return {
      statementMonth: doc.statementMonth,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      storageProvider: doc.storageProvider,
      storageBucket: doc.storageBucket,
      storageKey: doc.storageKey,
      storageUrl: doc.storageUrl,
      content: content ? content.toString('base64') : null,
    };
  }));

  // Apply tenant privacy toggles to the JSON payload as well as the PDF, so
  // brokers can redact fields end-to-end before forwarding to lenders.
  const showContactEmail = tenantSettings?.pdfShowContactEmail ?? true;
  const showContactPhone = tenantSettings?.pdfShowContactPhone ?? true;
  const showAnnualRevenue = tenantSettings?.pdfShowAnnualRevenue ?? true;
  const showAmountRequested = tenantSettings?.pdfShowAmountRequested ?? true;

  return {
    event: 'application.complete',
    schemaVersion: '1.0',
    applicationId: app.id,
    tenantSlug: app.tenant.slug,
    submittedAt: app.signature?.signedAt.toISOString() ?? new Date().toISOString(),
    contact: {
      firstName: app.contactFirstName,
      lastName: app.contactLastName,
      email: showContactEmail ? app.contactEmail : null,
      phone: showContactPhone ? app.contactPhone : null,
    },
    business: app.business ? {
      legalName: app.business.legalName,
      dba: app.business.dba,
      entityType: app.business.entityType,
      industry: app.business.industry,
      sicCode: app.business.sicCode,
      naicsCode: app.business.naicsCode,
      stateOfFormation: app.business.stateOfFormation,
      ein: app.business.ein,
      businessStartDate: app.business.businessStartDate?.toISOString().slice(0, 10),
      phone: showContactPhone ? app.business.phone : null,
      website: app.business.website,
      address: {
        street: app.business.streetAddress,
        city: app.business.city,
        state: app.business.state,
        zip: app.business.zipCode,
      },
    } : null,
    owners: app.owners.map((o) => ({
      ownerIndex: o.ownerIndex,
      firstName: o.firstName,
      lastName: o.lastName,
      ownershipPct: o.ownershipPct,
      creditScore: showEstimatedCreditScore ? o.creditScore : null,
      dateOfBirth: o.dateOfBirth,
      address: { street: o.streetAddress, city: o.city, state: o.state, zip: o.zipCode },
    })),
    financial: app.financial
      ? { annualRevenue: showAnnualRevenue ? app.financial.annualRevenue : null }
      : null,
    loanRequest: app.loanRequest ? {
      amountRequested: showAmountRequested ? app.loanRequest.amountRequested : null,
      urgency: app.loanRequest.urgency,
    } : null,
    signature: app.signature ? {
      signerName: app.signature.signerName,
      signerEmail: showContactEmail ? app.signature.signerEmail : null,
      signedAt: app.signature.signedAt.toISOString(),
      consentText: app.signature.consentText,
    } : null,
    signedApplication: signedApplicationBase64 ? {
      mimeType: 'application/pdf',
      fileName: `application-${app.id}.pdf`,
      content: signedApplicationBase64,
      storage: signedApplicationStorage ?? null,
    } : null,
    bankStatements,
  };
}

/** Attempt one CRM delivery. Returns the external account ID on success. */
async function attemptDelivery(applicationId: string, tenantId: string): Promise<string | undefined> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { settings: true },
  });

  const apiUrl = tenant.settings?.switchboxApiUrl ?? config.crmWebhookUrl;
  const apiKey = tenant.settings?.switchboxApiKey ?? config.crmApiKey;

  if (!apiUrl || !apiKey) {
    throw new Error('CRM not configured for this tenant (no API URL or key).');
  }

  const payload = await buildSwitchboxPayload(applicationId);
  const result = await pushWebhook(apiUrl, apiKey, payload);
  return result.accountId;
}

/** Execute the delivery with retry logic. Must be called from a detached async context. */
async function runDeliveryWithRetry(applicationId: string, tenantId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    await prisma.crmDelivery.update({
      where: { applicationId },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        status: 'pending',
        lastError: null,
      },
    });

    try {
      const externalAccountId = await attemptDelivery(applicationId, tenantId);
      await prisma.crmDelivery.update({
        where: { applicationId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          externalAccountId: externalAccountId ?? null,
          lastError: null,
          nextRetryAt: null,
        },
      });
      console.log(`[CRM] Delivery success for application ${applicationId}${externalAccountId ? ` → account ${externalAccountId}` : ''}`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      const nextRetry = isLastAttempt ? null : new Date(Date.now() + (RETRY_DELAYS_MS[attempt + 1] ?? 0));
      await prisma.crmDelivery.update({
        where: { applicationId },
        data: {
          status: isLastAttempt ? 'failed' : 'pending',
          lastError: message,
          nextRetryAt: nextRetry,
        },
      });
      console.error(`[CRM] Delivery attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for ${applicationId}: ${message}`);
      if (isLastAttempt) return;
    }
  }
}

/**
 * Create a pending CrmDelivery record and fire the delivery asynchronously.
 * Safe to call multiple times — skips if already sent.
 */
export async function enqueueCrmDelivery(applicationId: string, tenantId: string): Promise<void> {
  // Check if CRM is configured at all
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  const hasConfig = Boolean(
    (settings?.switchboxApiUrl && settings.switchboxApiKey) ||
    (config.crmWebhookUrl && config.crmApiKey)
  );

  // Even if CRM delivery is not configured yet, build the package once so a
  // tenant with document storage enabled still gets a signed PDF copy written
  // to their bucket on final submission.
  if (!hasConfig) {
    buildSwitchboxPayload(applicationId).catch((err: Error) =>
      console.error(`[CRM] Unable to prepare signed document package for ${applicationId}:`, err.message)
    );
  }

  // Atomic upsert: creates the delivery record if it doesn't exist, no-ops if
  // it does. Prevents a duplicate-create race when two requests arrive at the
  // same time (e.g. double-tap of the Finalize button).
  const record = await prisma.crmDelivery.upsert({
    where: { applicationId },
    create: {
      applicationId,
      status: hasConfig ? 'pending' : 'skipped',
      lastError: hasConfig ? null : 'CRM not configured for this tenant',
    },
    update: {}, // no-op — preserve existing record
    select: { status: true },
  });

  if (record.status === 'sent') {
    console.log(`[CRM] Already delivered for application ${applicationId} — skipping.`);
    return;
  }

  if (!hasConfig) {
    console.log(`[CRM] Skipping delivery for ${applicationId} — CRM not configured for tenant ${tenantId}`);
    return;
  }

  // Fire async — do NOT await so it doesn't block the HTTP response
  runDeliveryWithRetry(applicationId, tenantId).catch((err: Error) =>
    console.error('[CRM] Unexpected delivery error:', err.message)
  );
}

export async function pushWarmLeadToSwitchbox(payload: WarmLeadPayload): Promise<void> {
  if (!config.crmWebhookUrl || !config.crmApiKey) return;
  const url = (config as Record<string, unknown>).crmWarmLeadUrl as string | undefined ?? config.crmWebhookUrl;
  await pushWebhook(url, config.crmApiKey, { type: 'warm_lead', ...payload });
}

