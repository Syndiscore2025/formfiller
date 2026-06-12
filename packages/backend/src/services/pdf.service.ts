import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { getIndustryCodes } from '../utils/industryCodes';

/* ── formatting helpers (mirrors frontend Step8ReviewSign) ── */

/** EIN: 88-1610629 */
function fmtEin(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : v;
}

/** SSN: 041-76-1371 */
function fmtSsn(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v;
}

/** Phone: (860) 202-6706 */
function fmtPhone(v?: string): string | undefined {
  if (!v) return undefined;
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
}

/** Date: YYYY-MM-DD → MM-DD-YYYY */
function fmtDate(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : v;
}

function fmtEasternTimestamp(v?: string): string | undefined {
  if (!v) return undefined;
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function fmtEasternDate(v?: string): string | undefined {
  if (!v) return undefined;
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date).replace(/\//g, '-');
}

function calculateTimeInBusiness(v?: string): string | undefined {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(start.getTime())) return undefined;
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (start > current) return '0 months';
  let totalMonths = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
  if (current.getDate() < start.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (!years) return `${months} ${months === 1 ? 'month' : 'months'}`;
  if (!months) return `${years} ${years === 1 ? 'year' : 'years'}`;
  return `${years} ${years === 1 ? 'year' : 'years'}, ${months} ${months === 1 ? 'month' : 'months'}`;
}

/* ── data interfaces ── */

interface ApplicationData {
  business?: {
    legalName?: string; dba?: string; entityType?: string;
    industry?: string; sicCode?: string; naicsCode?: string;
    stateOfFormation?: string; ein?: string; businessStartDate?: string;
    phone?: string; website?: string;
    streetAddress?: string; city?: string; state?: string; zipCode?: string;
  };
  owner?: {
    firstName?: string; lastName?: string; ssn?: string;
    ownershipPct?: string; creditScore?: string; dateOfBirth?: string;
    streetAddress?: string; city?: string; state?: string; zipCode?: string;
  };
  contact?: { email?: string; phone?: string };
  financial?: { annualRevenue?: string };
  loanRequest?: { amountRequested?: string; urgency?: string };
  signature?: {
    signerName: string; signerEmail: string; signedAt: string; signatureData?: string;
  };
}

/* ── Human-readable labels for stored range / option codes (mirror frontend) ── */

const ANNUAL_REVENUE_LABELS: Record<string, string> = {
  '0-100k':    '$0 - $100,000',
  '100k-250k': '$100,000 - $250,000',
  '250k-500k': '$250,000 - $500,000',
  '500k-1m':   '$500,000 - $1,000,000',
  '1m-2m':     '$1,000,000 - $2,000,000',
  '2m-5m':     '$2,000,000 - $5,000,000',
  '5m+':       '$5,000,000+',
};

const FUNDING_AMOUNT_LABELS: Record<string, string> = {
  '5k-25k':    '$5,000 - $25,000',
  '25k-50k':   '$25,000 - $50,000',
  '50k-100k':  '$50,000 - $100,000',
  '100k-250k': '$100,000 - $250,000',
  '250k-500k': '$250,000 - $500,000',
  '500k+':     '$500,000+',
  '1m+':       '$1,000,000+',
};

const URGENCY_LABELS: Record<string, string> = {
  'immediate':  'Immediately (within 1 week)',
  '2-4weeks':   '2-4 weeks',
  '1-2months':  '1-2 months',
  'flexible':   'Flexible / No rush',
};

function fmtRange(value: string | undefined, map: Record<string, string>): string | undefined {
  if (!value) return undefined;
  return map[value] ?? value;
}

export interface TenantBranding {
  companyName?: string;
  legalBusinessName?: string;
  logoUrl?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
}

/** Per-tenant PDF privacy toggles. All default true when omitted. */
export interface PdfVisibility {
  showContactEmail?: boolean;
  showContactPhone?: boolean;
  showAnnualRevenue?: boolean;
  showAmountRequested?: boolean;
  showEstimatedCreditScore?: boolean;
}

/* ── PDF generation ── */

export const PDF_CONSENT_TEXT =
  'By signing below, I certify that all pre-filled and manually entered information has been reviewed and is true, accurate, and complete. ' +
  'I authorize verification of business, identity, ownership, bank, revenue, and application information, including soft credit and business credit checks where permitted. ' +
  'This electronic signature is legally binding under the ESIGN Act and UETA.';

export const PDF_ACKNOWLEDGEMENT_LABEL =
  'I reviewed the application, certify the information is true, accurate, and complete, authorize the listed verifications where permitted, and agree this electronic signature is legally binding.';

const PAGE_MARGIN = 30;
const RIGHT_MARGIN = 582;
const FIELD_GAP = 5;
const SECTION_COLOR = '#4f46e5';
const FIELD_BORDER = '#d7dce8';
const FIELD_BG = '#f8fafc';
const SIGNATURE_KEEP_TOGETHER_HEIGHT = 170;

export function generateApplicationPdf(
  data: ApplicationData,
  tenant?: TenantBranding,
  visibility?: PdfVisibility,
): Readable {
  // Privacy toggles default to true (show) when not provided.
  const showContactEmail = visibility?.showContactEmail ?? true;
  const showContactPhone = visibility?.showContactPhone ?? true;
  const showAnnualRevenue = visibility?.showAnnualRevenue ?? true;
  const showAmountRequested = visibility?.showAmountRequested ?? true;
  const showEstimatedCreditScore = visibility?.showEstimatedCreditScore ?? true;

  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'LETTER', bufferPages: true });

  const headerTitle = tenant?.companyName ? `${tenant.companyName} Business Funding Application` : 'Business Funding Application';
  const headerSub = tenant?.legalBusinessName ?? 'Signed merchant application packet';

  /* ── Header ── */
  doc.save().rect(0, 0, doc.page.width, 64).fill('#111827').restore();

  // Try to embed the tenant logo (URL → fetch is async, so we embed synchronously only if pre-fetched)
  // Logo pre-fetching is handled by the caller when available; here we just reserve the text layout.
  const textStartX = PAGE_MARGIN;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
    .text(headerTitle, textStartX, 18, { width: RIGHT_MARGIN - textStartX, lineBreak: false, ellipsis: true });
  doc.fontSize(8).font('Helvetica').fillColor('#cbd5e1')
    .text(headerSub, textStartX, 42, { width: RIGHT_MARGIN - textStartX, lineBreak: false, ellipsis: true });
  doc.y = 78;

  /* ── Tenant footer info on every page ── */
  const footerLines: string[] = [];
  if (tenant?.companyName) footerLines.push(tenant.companyName);
  if (tenant?.companyAddress) footerLines.push(tenant.companyAddress);
  const contactParts: string[] = [];
  if (tenant?.companyPhone) contactParts.push(fmtPhone(tenant.companyPhone) ?? tenant.companyPhone);
  if (tenant?.companyEmail) contactParts.push(tenant.companyEmail);
  if (contactParts.length) footerLines.push(contactParts.join(' · '));

  /* ── Business ── */
  if (data.business) {
    const b = data.business;
    const mappedCodes: { sicCode?: string; naicsCode?: string } = getIndustryCodes(b.industry) || {};
    section(doc, 'Business Information');
    fieldGrid(doc, [
      { label: 'Business Name', value: b.legalName, span: 3 },
      { label: 'DBA / Trade Name', value: b.dba },
      { label: 'Entity Type', value: b.entityType },
      { label: 'State of Formation', value: b.stateOfFormation },
      { label: 'Industry', value: b.industry, span: 3 },
      { label: 'SIC', value: b.sicCode || mappedCodes.sicCode },
      { label: 'NAICS', value: b.naicsCode || mappedCodes.naicsCode },
      { label: 'EIN', value: fmtEin(b.ein) },
      { label: 'Business Start Date', value: fmtDate(b.businessStartDate) },
      { label: 'Time in Business', value: calculateTimeInBusiness(b.businessStartDate) },
      { label: 'Phone', value: showContactPhone ? fmtPhone(b.phone) : undefined },
      { label: 'Website', value: b.website },
      { label: 'Street Address', value: b.streetAddress, span: 2 },
      { label: 'City', value: b.city },
      { label: 'State', value: b.state },
      { label: 'Zip', value: b.zipCode },
    ]);
  }

  /* ── Owner ── */
  if (data.owner) {
    const o = data.owner;
    section(doc, 'Owner / Guarantor Information');
    const ownerFields: FieldDefinition[] = [
      { label: 'Owner Name', value: `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || undefined, span: 2 },
      { label: 'Ownership', value: o.ownershipPct ? `${o.ownershipPct}%` : undefined },
      ...(showEstimatedCreditScore ? [{ label: 'Credit Score', value: o.creditScore }] : []),
      { label: 'SSN', value: fmtSsn(o.ssn) },
      { label: 'Date of Birth', value: fmtDate(o.dateOfBirth) },
      { label: 'Home Street Address', value: o.streetAddress, span: 2 },
      { label: 'City', value: o.city },
      { label: 'State', value: o.state },
      { label: 'Zip', value: o.zipCode },
    ];
    fieldGrid(doc, ownerFields);
  }

  /* ── Contact & Funding ── */
  if (data.contact || data.financial || data.loanRequest) {
    const contactFundingFields: FieldDefinition[] = [];
    if (showContactEmail) contactFundingFields.push({ label: 'Contact Email', value: data.contact?.email });
    if (showContactPhone) contactFundingFields.push({ label: 'Contact Phone', value: fmtPhone(data.contact?.phone) });
    if (showAnnualRevenue) {
      contactFundingFields.push({ label: 'Annual Revenue', value: fmtRange(data.financial?.annualRevenue, ANNUAL_REVENUE_LABELS) });
    }
    if (showAmountRequested) {
      contactFundingFields.push({ label: 'Amount Requested', value: fmtRange(data.loanRequest?.amountRequested, FUNDING_AMOUNT_LABELS) });
    }
    if (data.loanRequest?.urgency) contactFundingFields.push({ label: 'Funding Urgency', value: fmtRange(data.loanRequest.urgency, URGENCY_LABELS) });
    if (contactFundingFields.length) {
      section(doc, 'Contact & Funding');
      fieldGrid(doc, contactFundingFields);
    }
  }

  /* ── Electronic Signature Consent ── */
  if (data.signature) {
    // Try to keep the signature section together, but do not waste a mostly
    // empty first page. The previous 260pt threshold was too conservative and
    // pushed signatures to page 2 even when the compact block could fit below
    // Contact & Funding.
    ensureSpace(doc, SIGNATURE_KEEP_TOGETHER_HEIGHT);

    section(doc, 'Authorizations & Electronic Signature Consent');
    textBox(doc, PDF_CONSENT_TEXT);
    ensureSpace(doc, 24);
    doc.fontSize(6.2).font('Helvetica').fillColor('#334155');
    doc.text(`[x] ${PDF_ACKNOWLEDGEMENT_LABEL}`, PAGE_MARGIN + 8, doc.y, { width: RIGHT_MARGIN - PAGE_MARGIN - 16 });
    doc.moveDown(0.2);

    fieldGrid(doc, [
      { label: 'Full Name (Signer)', value: data.signature.signerName },
      { label: 'Email (Signer)', value: showContactEmail ? data.signature.signerEmail : undefined },
    ]);

    const signedDate = fmtEasternDate(data.signature.signedAt);

    /* Signature image — capture sigY AFTER ensureSpace so it always reflects
       the correct Y on whichever page we land on. */
    const sigX = PAGE_MARGIN;
    const sigW = 270;
    const sigH = 64;
    ensureSpace(doc, sigH + 20);
    const sigY = doc.y;
    doc.save().roundedRect(sigX, sigY, sigW, sigH, 8).fillAndStroke('#ffffff', FIELD_BORDER).restore();
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#64748b')
      .text('SIGNATURE', sigX + 10, sigY + 8, { width: sigW - 20 });
    if (data.signature.signatureData) {
      try {
        const b64 = data.signature.signatureData.replace(/^data:image\/png;base64,/, '');
        const imgBuf = Buffer.from(b64, 'base64');
        doc.image(imgBuf, sigX + 10, sigY + 14, { fit: [sigW - 20, sigH - 18], align: 'center', valign: 'center' });
      } catch {
        // fall back to italic name if image decode fails
        doc.fontSize(20).font('Helvetica-Oblique').fillColor('#1a1a2e')
          .text(data.signature.signerName, sigX + 12, sigY + 26, { width: sigW - 24 });
      }
    } else {
      doc.fontSize(20).font('Helvetica-Oblique').fillColor('#1a1a2e')
        .text(data.signature.signerName, sigX + 12, sigY + 26, { width: sigW - 24 });
    }

    fieldBox(doc, sigX + sigW + FIELD_GAP, sigY, RIGHT_MARGIN - sigX - sigW - FIELD_GAP, 22, 'Date Signed', signedDate);
    fieldBox(
      doc,
      sigX + sigW + FIELD_GAP,
      sigY + 26,
      RIGHT_MARGIN - sigX - sigW - FIELD_GAP,
      22,
      'Timestamp',
      fmtEasternTimestamp(data.signature.signedAt) ?? data.signature.signedAt,
    );

    doc.y = sigY + sigH + 4;
  }

  addFooterToBufferedPages(doc, footerLines);
  doc.end();
  return doc as unknown as Readable;
}

/* ── helpers ── */

type FieldDefinition = { label: string; value?: string; span?: number; height?: number };

function section(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 18);
  doc.moveDown(0.18);
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(SECTION_COLOR).text(title, PAGE_MARGIN);
  doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(RIGHT_MARGIN, doc.y + 2).stroke('#c7d2fe');
  doc.moveDown(0.28);
}

function fieldGrid(doc: PDFKit.PDFDocument, rawFields: FieldDefinition[], columns = 3): void {
  const fields = rawFields.filter((field) => field.value);
  const contentWidth = RIGHT_MARGIN - PAGE_MARGIN;
  const columnWidth = (contentWidth - FIELD_GAP * (columns - 1)) / columns;
  let row: Array<FieldDefinition & { x: number; width: number }> = [];
  let usedColumns = 0;
  let cursorX = PAGE_MARGIN;

  const flush = () => {
    if (!row.length) return;
    const rowHeight = Math.max(...row.map((field) => field.height ?? (field.span && field.span > 1 ? 28 : 24)));
    ensureSpace(doc, rowHeight + FIELD_GAP);
    const y = doc.y;
    row.forEach((field) => fieldBox(doc, field.x, y, field.width, rowHeight, field.label, field.value));
    doc.y = y + rowHeight + FIELD_GAP;
    row = [];
    usedColumns = 0;
    cursorX = PAGE_MARGIN;
  };

  fields.forEach((field) => {
    const span = Math.min(field.span ?? 1, columns);
    if (usedColumns + span > columns) flush();
    const width = columnWidth * span + FIELD_GAP * (span - 1);
    row.push({ ...field, span, x: cursorX, width });
    cursorX += width + FIELD_GAP;
    usedColumns += span;
    if (usedColumns >= columns) flush();
  });

  flush();
}

function fieldBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, label: string, value?: string): void {
  doc.save().roundedRect(x, y, width, height, 5).fillAndStroke(FIELD_BG, FIELD_BORDER).restore();
  doc.fontSize(5.4).font('Helvetica-Bold').fillColor('#64748b')
    .text(label.toUpperCase(), x + 6, y + 4, { width: width - 12, lineBreak: false });
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a')
    .text(value || '-', x + 6, y + 13, { width: width - 12, height: height - 15, ellipsis: true });
}

function textBox(doc: PDFKit.PDFDocument, text: string): void {
  const width = RIGHT_MARGIN - PAGE_MARGIN;
  const height = Math.max(30, doc.fontSize(6.3).heightOfString(text, { width: width - 14 }) + 10);
  ensureSpace(doc, height + 5);
  const y = doc.y;
  doc.save().roundedRect(PAGE_MARGIN, y, width, height, 6).fillAndStroke('#eef2ff', '#c7d2fe').restore();
  doc.fontSize(6.3).font('Helvetica').fillColor('#334155')
    .text(text, PAGE_MARGIN + 7, y + 5, { width: width - 14 });
  doc.y = y + height + 5;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height <= doc.page.height - PAGE_MARGIN) return;
  doc.addPage();
  doc.y = PAGE_MARGIN;
}

function addFooterToBufferedPages(doc: PDFKit.PDFDocument, footerLines: string[]): void {
  if (!footerLines.length) return;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const footerY = doc.page.height - PAGE_MARGIN - 20;
    doc.save()
      .fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(footerLines.join('  |  '), PAGE_MARGIN, footerY, {
        width: RIGHT_MARGIN - PAGE_MARGIN,
        height: 10,
        align: 'center',
        lineBreak: false,
      })
      .restore();
  }
}

