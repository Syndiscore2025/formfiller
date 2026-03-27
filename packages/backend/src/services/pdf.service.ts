import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

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

/* ── data interface ── */

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

/* ── PDF generation ── */

const CONSENT_TEXT =
  'By signing below, I certify that all information provided is true, accurate, and complete. ' +
  'I authorize the lender to conduct a soft credit inquiry, verify all submitted information, and share data with necessary parties. ' +
  'This electronic signature is legally binding under the ESIGN Act and UETA.';

const LABEL_X = 50;
const VALUE_X = 200;
const RIGHT_MARGIN = 560;

export function generateApplicationPdf(data: ApplicationData): Readable {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  /* ── Header ── */
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111111')
    .text('Review & Sign', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#888888')
    .text('Please review your information before signing.', { align: 'center' });
  doc.moveDown(1);

  /* ── Business ── */
  if (data.business) {
    const b = data.business;
    section(doc, 'Business');
    row(doc, 'Business Name', b.legalName);
    row(doc, 'DBA', b.dba);
    row(doc, 'Entity Type', b.entityType);
    row(doc, 'Industry', b.industry);
    row(doc, 'State of Formation', b.stateOfFormation);
    row(doc, 'EIN', fmtEin(b.ein));
    row(doc, 'SIC', b.sicCode);
    row(doc, 'NAICS', b.naicsCode);
    row(doc, 'Business Start Date', fmtDate(b.businessStartDate));
    row(doc, 'Phone', fmtPhone(b.phone));
    row(doc, 'Website', b.website);
    row(doc, 'Address', b.streetAddress);
    row(doc, 'City', b.city);
    row(doc, 'State', b.state);
    row(doc, 'Zip', b.zipCode);
    doc.moveDown(0.5);
  }

  /* ── Owner ── */
  if (data.owner) {
    const o = data.owner;
    section(doc, 'Owner');
    row(doc, 'Name', `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || undefined);
    row(doc, 'SSN', fmtSsn(o.ssn));
    row(doc, 'Ownership', o.ownershipPct ? `${o.ownershipPct}%` : undefined);
    row(doc, 'DOB', fmtDate(o.dateOfBirth));
    doc.moveDown(0.5);

    /* ── Home Address ── */
    section(doc, 'Home Address');
    row(doc, 'Address', o.streetAddress);
    row(doc, 'City', o.city);
    row(doc, 'State', o.state);
    row(doc, 'Zip', o.zipCode);
    doc.moveDown(0.5);
  }

  /* ── Contact Information ── */
  if (data.contact) {
    section(doc, 'Contact Information');
    row(doc, 'Email', data.contact.email);
    row(doc, 'Phone', fmtPhone(data.contact.phone));
    doc.moveDown(0.5);
  }

  /* ── Electronic Signature Consent ── */
  if (data.signature) {
    section(doc, 'Electronic Signature Consent');
    doc.fontSize(9).font('Helvetica').fillColor('#444444')
      .text(CONSENT_TEXT, LABEL_X, undefined, { width: RIGHT_MARGIN - LABEL_X });
    doc.moveDown(0.8);

    row(doc, 'Full Name (Signer)', data.signature.signerName);
    row(doc, 'Email (Signer)', data.signature.signerEmail);
    doc.moveDown(1);

	    const signedDate = fmtDate(data.signature.signedAt.slice(0, 10));

    /* Signature image */
	    const sigX = LABEL_X;
	    const sigW = 250;
	    const sigH = 80;
	    const sigY = doc.y;
    if (data.signature.signatureData) {
      try {
        const b64 = data.signature.signatureData.replace(/^data:image\/png;base64,/, '');
        const imgBuf = Buffer.from(b64, 'base64');
		        doc.image(imgBuf, sigX, sigY, { width: sigW, height: sigH });
      } catch {
        // fall back to italic name if image decode fails
        doc.fontSize(24).font('Helvetica-Oblique').fillColor('#1a1a2e')
		          .text(data.signature.signerName, sigX, sigY, { width: sigW });
      }
    } else {
      doc.fontSize(24).font('Helvetica-Oblique').fillColor('#1a1a2e')
		        .text(data.signature.signerName, sigX, sigY, { width: sigW });
    }

	    // Date next to signature (lenders typically want the date adjacent to the signature mark)
	    if (signedDate) {
	      const dateX = sigX + sigW + 12;
	      doc.fontSize(9).font('Helvetica').fillColor('#888888')
	        .text('Date', dateX, sigY + 18, { width: RIGHT_MARGIN - dateX });
	      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
	        .text(signedDate, dateX, sigY + 32, { width: RIGHT_MARGIN - dateX });
	    }

	    // Continue layout below the signature image
	    doc.y = sigY + sigH + 6;
	    doc.moveTo(sigX, doc.y).lineTo(sigX + sigW, doc.y).stroke('#cccccc');
    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text(`Electronically signed at ${data.signature.signedAt}`);
  }

  doc.end();
  return doc as unknown as Readable;
}

/* ── helpers ── */

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#5b21b6').text(title, LABEL_X);
  doc.moveTo(LABEL_X, doc.y).lineTo(RIGHT_MARGIN, doc.y).stroke('#ddd6fe');
  doc.moveDown(0.3);
}

function row(doc: PDFKit.PDFDocument, label: string, value?: string): void {
  if (!value) return;
  const y = doc.y;
  doc.fontSize(10).font('Helvetica').fillColor('#888888').text(label, LABEL_X, y, { width: VALUE_X - LABEL_X - 10 });
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text(value, VALUE_X, y, { width: RIGHT_MARGIN - VALUE_X });
  doc.moveDown(0.15);
}

