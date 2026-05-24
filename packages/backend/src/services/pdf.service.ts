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
    ownershipPct?: string; dateOfBirth?: string;
    streetAddress?: string; city?: string; state?: string; zipCode?: string;
  };
  contact?: { email?: string; phone?: string };
  signature?: {
    signerName: string; signerEmail: string; signedAt: string; signatureData?: string;
  };
}

export interface TenantBranding {
  companyName?: string;
  legalBusinessName?: string;
  logoUrl?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
}

/* ── PDF generation ── */

const CONSENT_TEXT =
  'By signing below, I certify that all pre-filled and manually entered information has been reviewed and is true, accurate, and complete. ' +
  'I authorize verification of business, identity, ownership, bank, revenue, and application information, including soft credit and business credit checks where permitted. ' +
  'I consent to be contacted about this funding request by phone, text, and email. Message and data rates may apply. Reply STOP to opt out of text messages or HELP for help. ' +
  'This electronic signature is legally binding under the ESIGN Act and UETA.';

const ACKNOWLEDGEMENTS = [
  'I reviewed the pre-filled and manually entered application information, certify it is true, accurate, and complete, and authorize verification of my business, ownership, identity, bank, revenue, credit, and submitted application information where permitted by law.',
  'I consent to use electronic records and signatures, agree my electronic signature is legally binding, and consent to be contacted by phone, text, and email about this request. Reply STOP to opt out of text messages or HELP for help.',
];

const PAGE_MARGIN = 42;
const RIGHT_MARGIN = 570;
const FIELD_GAP = 8;
const SECTION_COLOR = '#4f46e5';
const FIELD_BORDER = '#d7dce8';
const FIELD_BG = '#f8fafc';

export function generateApplicationPdf(data: ApplicationData, tenant?: TenantBranding): Readable {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'LETTER' });

  const headerTitle = tenant?.companyName ? `${tenant.companyName} — Business Funding Application` : 'Business Funding Application';
  const headerSub = tenant?.legalBusinessName ?? 'Signed merchant application packet';

  /* ── Header ── */
  doc.save().rect(0, 0, doc.page.width, 82).fill('#111827').restore();

  // Try to embed the tenant logo (URL → fetch is async, so we embed synchronously only if pre-fetched)
  // Logo pre-fetching is handled by the caller when available; here we just reserve the text layout.
  const textStartX = PAGE_MARGIN;
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff')
    .text(headerTitle, textStartX, 24, { width: RIGHT_MARGIN - textStartX });
  doc.fontSize(9).font('Helvetica').fillColor('#cbd5e1')
    .text(headerSub, textStartX, 51, { width: RIGHT_MARGIN - textStartX });
  doc.y = 104;

  /* ── Tenant footer info on every page ── */
  const footerLines: string[] = [];
  if (tenant?.companyName) footerLines.push(tenant.companyName);
  if (tenant?.companyAddress) footerLines.push(tenant.companyAddress);
  const contactParts: string[] = [];
  if (tenant?.companyPhone) contactParts.push(fmtPhone(tenant.companyPhone) ?? tenant.companyPhone);
  if (tenant?.companyEmail) contactParts.push(tenant.companyEmail);
  if (contactParts.length) footerLines.push(contactParts.join(' · '));

  doc.on('pageAdded', () => {
    if (!footerLines.length) return;
    const footerY = doc.page.height - 28;
    doc.save()
      .fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(footerLines.join('  |  '), PAGE_MARGIN, footerY, { width: RIGHT_MARGIN - PAGE_MARGIN, align: 'center' })
      .restore();
  });

  /* ── Business ── */
  if (data.business) {
    const b = data.business;
    const mappedCodes: { sicCode?: string; naicsCode?: string } = getIndustryCodes(b.industry) || {};
    section(doc, 'Business Information');
    fieldGrid(doc, [
      { label: 'Business Name', value: b.legalName, span: 2 },
      { label: 'DBA / Trade Name', value: b.dba },
      { label: 'Entity Type', value: b.entityType },
      { label: 'Industry', value: b.industry, span: 2 },
      { label: 'SIC', value: b.sicCode || mappedCodes.sicCode },
      { label: 'NAICS', value: b.naicsCode || mappedCodes.naicsCode },
      { label: 'State of Formation', value: b.stateOfFormation },
      { label: 'EIN', value: fmtEin(b.ein) },
      { label: 'Business Start Date', value: fmtDate(b.businessStartDate) },
      { label: 'Time in Business', value: calculateTimeInBusiness(b.businessStartDate) },
      { label: 'Phone', value: fmtPhone(b.phone) },
      { label: 'Website', value: b.website },
      { label: 'Street Address', value: b.streetAddress, span: 2 },
    ]);
    fieldGrid(doc, [
      { label: 'City', value: b.city },
      { label: 'State', value: b.state },
      { label: 'Zip', value: b.zipCode },
    ], 3);
  }

  /* ── Owner ── */
  if (data.owner) {
    const o = data.owner;
    section(doc, 'Owner / Guarantor Information');
    fieldGrid(doc, [
      { label: 'Owner Name', value: `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || undefined },
      { label: 'Ownership', value: o.ownershipPct ? `${o.ownershipPct}%` : undefined },
      { label: 'SSN', value: fmtSsn(o.ssn) },
      { label: 'Date of Birth', value: fmtDate(o.dateOfBirth) },
    ]);

    /* ── Home Address ── */
    section(doc, 'Home Address');
    fieldGrid(doc, [{ label: 'Street Address', value: o.streetAddress, span: 2 }]);
    fieldGrid(doc, [
      { label: 'City', value: o.city },
      { label: 'State', value: o.state },
      { label: 'Zip', value: o.zipCode },
    ], 3);
  }

  /* ── Contact Information ── */
  if (data.contact) {
    section(doc, 'Contact Information');
    fieldGrid(doc, [
      { label: 'Email', value: data.contact.email },
      { label: 'Phone', value: fmtPhone(data.contact.phone) },
    ]);
  }

  /* ── Electronic Signature Consent ── */
  if (data.signature) {
    section(doc, 'Authorizations & Electronic Signature Consent');
    textBox(doc, CONSENT_TEXT);
    ensureSpace(doc, 86);
    doc.fontSize(8).font('Helvetica').fillColor('#334155');
    ACKNOWLEDGEMENTS.forEach((text) => {
      doc.text(`[x] ${text}`, PAGE_MARGIN + 8, doc.y, { width: RIGHT_MARGIN - PAGE_MARGIN - 16 });
      doc.moveDown(0.18);
    });
    doc.moveDown(0.45);

    fieldGrid(doc, [
      { label: 'Full Name (Signer)', value: data.signature.signerName },
      { label: 'Email (Signer)', value: data.signature.signerEmail },
    ]);

	    const signedDate = fmtEasternDate(data.signature.signedAt);

    /* Signature image */
	    const sigX = PAGE_MARGIN;
    const sigW = 286;
    const sigH = 86;
	    const sigY = doc.y;
    ensureSpace(doc, sigH + 28);
    doc.save().roundedRect(sigX, sigY, sigW, sigH, 8).fillAndStroke('#ffffff', FIELD_BORDER).restore();
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#64748b')
      .text('SIGNATURE', sigX + 10, sigY + 8, { width: sigW - 20 });
    if (data.signature.signatureData) {
      try {
        const b64 = data.signature.signatureData.replace(/^data:image\/png;base64,/, '');
        const imgBuf = Buffer.from(b64, 'base64');
	        doc.image(imgBuf, sigX + 10, sigY + 16, { width: sigW - 20, height: sigH - 26 });
      } catch {
        // fall back to italic name if image decode fails
        doc.fontSize(24).font('Helvetica-Oblique').fillColor('#1a1a2e')
	          .text(data.signature.signerName, sigX + 12, sigY + 32, { width: sigW - 24 });
      }
    } else {
      doc.fontSize(24).font('Helvetica-Oblique').fillColor('#1a1a2e')
	        .text(data.signature.signerName, sigX + 12, sigY + 32, { width: sigW - 24 });
    }

    fieldBox(doc, sigX + sigW + FIELD_GAP, sigY, RIGHT_MARGIN - sigX - sigW - FIELD_GAP, 40, 'Date Signed', signedDate);
    fieldBox(
      doc,
      sigX + sigW + FIELD_GAP,
      sigY + 46,
      RIGHT_MARGIN - sigX - sigW - FIELD_GAP,
      40,
      'Timestamp',
      fmtEasternTimestamp(data.signature.signedAt) ?? data.signature.signedAt,
    );

    doc.y = sigY + sigH + 8;
    doc.fontSize(7).font('Helvetica').fillColor('#64748b')
	      .text(`Electronically signed at ${fmtEasternTimestamp(data.signature.signedAt) ?? data.signature.signedAt}`);
  }

  doc.end();
  return doc as unknown as Readable;
}

/* ── helpers ── */

type FieldDefinition = { label: string; value?: string; span?: number; height?: number };

function section(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 26);
  doc.moveDown(0.45);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(SECTION_COLOR).text(title, PAGE_MARGIN);
  doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(RIGHT_MARGIN, doc.y + 2).stroke('#c7d2fe');
  doc.moveDown(0.55);
}

function fieldGrid(doc: PDFKit.PDFDocument, rawFields: FieldDefinition[], columns = 2): void {
  const fields = rawFields.filter((field) => field.value);
  const contentWidth = RIGHT_MARGIN - PAGE_MARGIN;
  const columnWidth = (contentWidth - FIELD_GAP * (columns - 1)) / columns;
  let row: Array<FieldDefinition & { x: number; width: number }> = [];
  let usedColumns = 0;
  let cursorX = PAGE_MARGIN;

  const flush = () => {
    if (!row.length) return;
    const rowHeight = Math.max(...row.map((field) => field.height ?? (field.span && field.span > 1 ? 48 : 42)));
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
  doc.save().roundedRect(x, y, width, height, 7).fillAndStroke(FIELD_BG, FIELD_BORDER).restore();
  doc.fontSize(6.7).font('Helvetica-Bold').fillColor('#64748b')
    .text(label.toUpperCase(), x + 8, y + 7, { width: width - 16, lineBreak: false });
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f172a')
    .text(value || '—', x + 8, y + 20, { width: width - 16, height: height - 23, ellipsis: true });
}

function textBox(doc: PDFKit.PDFDocument, text: string): void {
  const width = RIGHT_MARGIN - PAGE_MARGIN;
  const height = Math.max(52, doc.fontSize(8.5).heightOfString(text, { width: width - 18 }) + 18);
  ensureSpace(doc, height + 8);
  const y = doc.y;
  doc.save().roundedRect(PAGE_MARGIN, y, width, height, 8).fillAndStroke('#eef2ff', '#c7d2fe').restore();
  doc.fontSize(8.5).font('Helvetica').fillColor('#334155')
    .text(text, PAGE_MARGIN + 9, y + 9, { width: width - 18 });
  doc.y = y + height + 8;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height <= doc.page.height - PAGE_MARGIN) return;
  doc.addPage();
  doc.y = PAGE_MARGIN;
}

