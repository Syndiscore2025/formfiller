/**
 * Email service — sends follow-up emails to merchants via the tenant's
 * configured SMTP server. All three scenarios are handled here:
 *   1. Abandoned application (merchant started but never finished)
 *   2. Submitted with zero bank statements
 *   3. Submitted with fewer than the required number of bank statements
 */
import nodemailer, { Transporter } from 'nodemailer';
import type { TenantSettings } from '@prisma/client';
import { decrypt } from '../utils/encryption';

// ─── types ────────────────────────────────────────────────────────────────────

export interface EmailContext {
  firstName?: string | null;
  companyName?: string | null;
  uploadedCount?: number;
  requiredCount?: number;
  applicationUrl?: string;
}

// ─── template rendering ───────────────────────────────────────────────────────

function renderTemplate(template: string, ctx: EmailContext): string {
  return template
    .replace(/\{firstName\}/g, ctx.firstName ?? 'there')
    .replace(/\{companyName\}/g, ctx.companyName ?? 'your company')
    .replace(/\{uploadedCount\}/g, String(ctx.uploadedCount ?? 0))
    .replace(/\{requiredCount\}/g, String(ctx.requiredCount ?? 3))
    .replace(/\{applicationUrl\}/g, ctx.applicationUrl ?? '');
}

function buildHtml(opts: {
  body: string;
  settings: TenantSettings;
  includeLogo: boolean;
  includeSig: boolean;
}): string {
  const { body, settings, includeLogo, includeSig } = opts;
  const logo =
    includeLogo && settings.logoUrl
      ? `<div style="margin-bottom:24px;"><img src="${settings.logoUrl}" alt="${settings.companyName ?? ''}" style="max-height:60px;max-width:200px;"/></div>`
      : '';
  const sig =
    includeSig
      ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;"/>
         <p style="font-size:13px;color:#64748b;margin:0;">${settings.companyName ?? ''}</p>
         ${settings.companyEmail ? `<p style="font-size:13px;color:#64748b;margin:0;">${settings.companyEmail}</p>` : ''}
         ${settings.companyPhone ? `<p style="font-size:13px;color:#64748b;margin:0;">${settings.companyPhone}</p>` : ''}`
      : '';

  // Convert plain-text newlines to <br> for the HTML body
  const htmlBody = body.replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;padding:0;margin:0;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;padding:40px;color:#1e293b;">
    ${logo}
    <div style="font-size:15px;line-height:1.7;">${htmlBody}</div>
    ${sig}
  </div>
</body></html>`;
}

// ─── transporter factory ──────────────────────────────────────────────────────

function createTransporter(settings: TenantSettings): Transporter {
  const pass = settings.smtpPass ? decrypt(settings.smtpPass) : undefined;
  return nodemailer.createTransport({
    host: settings.smtpHost ?? undefined,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure,
    auth:
      settings.smtpUser
        ? { user: settings.smtpUser, pass }
        : undefined,
  });
}

function fromAddress(settings: TenantSettings): string {
  const name = settings.smtpFromName ?? settings.companyName ?? '';
  const addr = settings.smtpFrom ?? settings.companyEmail ?? '';
  return name ? `"${name}" <${addr}>` : addr;
}

// ─── public send helpers ──────────────────────────────────────────────────────

async function sendMail(
  settings: TenantSettings,
  to: string,
  subject: string,
  body: string,
  includeLogo: boolean,
  includeSig: boolean,
): Promise<void> {
  if (!settings.smtpHost || !settings.smtpFrom) {
    throw new Error('SMTP not configured. Set smtpHost and smtpFrom in tenant settings.');
  }
  const transporter = createTransporter(settings);
  const html = buildHtml({ body, settings, includeLogo, includeSig });
  await transporter.sendMail({
    from: fromAddress(settings),
    to,
    subject,
    text: body,
    html,
  });
}

export async function sendAbandonedEmail(
  settings: TenantSettings,
  to: string,
  ctx: EmailContext,
): Promise<void> {
  if (!settings.emailAbandonedEnabled) return;
  const subject = renderTemplate(settings.emailAbandonedSubject ?? 'Complete your funding application', ctx);
  const body = renderTemplate(settings.emailAbandonedBody ?? 'Hi {firstName},\n\nYou started a funding application but haven\'t finished it yet. Click the link below to complete it.\n\n{applicationUrl}', ctx);
  await sendMail(settings, to, subject, body, settings.emailAbandonedIncludeLogo, settings.emailAbandonedIncludeSig);
}

export async function sendNoBanksEmail(
  settings: TenantSettings,
  to: string,
  ctx: EmailContext,
): Promise<void> {
  if (!settings.emailNoBanksEnabled) return;
  const subject = renderTemplate(settings.emailNoBanksSubject ?? "Don't forget to upload your bank statements", ctx);
  const body = renderTemplate(settings.emailNoBanksBody ?? 'Hi {firstName},\n\nYour application has been received but we still need your bank statements to proceed.\n\n{applicationUrl}', ctx);
  await sendMail(settings, to, subject, body, settings.emailNoBanksIncludeLogo, settings.emailNoBanksIncludeSig);
}

export async function sendInsufficientBanksEmail(
  settings: TenantSettings,
  to: string,
  ctx: EmailContext,
): Promise<void> {
  if (!settings.emailInsufficientBanksEnabled) return;
  const subject = renderTemplate(settings.emailInsufficientBanksSubject ?? 'We need more bank statements to process your application', ctx);
  const body = renderTemplate(settings.emailInsufficientBanksBody ?? 'Hi {firstName},\n\nWe received your application but only have {uploadedCount} of the {requiredCount} required bank statements. Please upload the remaining statements.\n\n{applicationUrl}', ctx);
  await sendMail(settings, to, subject, body, settings.emailInsufficientBanksIncludeLogo, settings.emailInsufficientBanksIncludeSig);
}
