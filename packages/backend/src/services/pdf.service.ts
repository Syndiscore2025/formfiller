import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface ApplicationData {
  applicationId: string;
  business?: Record<string, unknown>;
  owners?: Record<string, unknown>[];
  financial?: Record<string, unknown>;
  loanRequest?: Record<string, unknown>;
  signature?: {
    signerName: string;
    signerEmail: string;
    signedAt: string;
    ipAddress: string;
  };
}

export function generateApplicationPdf(data: ApplicationData): Readable {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  doc.fontSize(18).font('Helvetica-Bold').text('Business Funding Application', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(`Application ID: ${data.applicationId}`, { align: 'center' });
  doc.moveDown(1);

  if (data.business) {
    section(doc, 'Business Information');
    row(doc, 'Legal Name', data.business.legalName as string);
    row(doc, 'DBA', data.business.dba as string);
    row(doc, 'Entity Type', data.business.entityType as string);
    row(doc, 'Industry', data.business.industry as string);
    row(doc, 'EIN', data.business.ein ? '***-**-' + (data.business.ein as string).slice(-4) : '');
    row(doc, 'Business Start Date', data.business.businessStartDate as string);
    row(doc, 'Phone', data.business.phone as string);
    row(doc, 'Website', data.business.website as string);
    row(doc, 'Address', formatAddress(data.business));
    doc.moveDown(0.5);
  }

  if (data.owners?.length) {
    data.owners.forEach((owner, i) => {
      section(doc, `Owner ${i + 1} Information`);
      row(doc, 'Name', `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim());
      row(doc, 'Email', owner.email as string);
      row(doc, 'Phone', owner.phone as string);
      row(doc, 'Ownership %', owner.ownershipPct ? `${owner.ownershipPct}%` : '');
      row(doc, 'Date of Birth', owner.dateOfBirth as string);
      row(doc, 'Address', formatAddress(owner));
      doc.moveDown(0.5);
    });
  }

  if (data.financial) {
    section(doc, 'Financial Information');
    row(doc, 'Annual Revenue', formatCurrency(data.financial.annualRevenue as number));
    row(doc, 'Monthly Revenue', formatCurrency(data.financial.monthlyRevenue as number));
    row(doc, 'Monthly Expenses', formatCurrency(data.financial.monthlyExpenses as number));
    row(doc, 'Outstanding Debts', formatCurrency(data.financial.outstandingDebts as number));
    row(doc, 'Bankruptcy History', data.financial.bankruptcyHistory ? 'Yes' : 'No');
    doc.moveDown(0.5);
  }

  if (data.loanRequest) {
    section(doc, 'Loan Request');
    row(doc, 'Amount Requested', formatCurrency(data.loanRequest.amountRequested as number));
    row(doc, 'Purpose', data.loanRequest.purpose as string);
    row(doc, 'Term Preference', data.loanRequest.termPreference as string);
    row(doc, 'Urgency', data.loanRequest.urgency as string);
    doc.moveDown(0.5);
  }

  if (data.signature) {
    section(doc, 'Electronic Signature');
    doc.fontSize(9).font('Helvetica').fillColor('#444444')
      .text('By signing below, the applicant acknowledges that this application is submitted electronically pursuant to the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). The applicant certifies all information provided is true and accurate.');
    doc.moveDown(0.5);
    row(doc, 'Signer Name', data.signature.signerName);
    row(doc, 'Signer Email', data.signature.signerEmail);
    row(doc, 'Signed At', data.signature.signedAt);
    row(doc, 'IP Address', data.signature.ipAddress);
    doc.moveDown(1);
    doc.fontSize(10).text('_________________________________');
    doc.text(`${data.signature.signerName}  |  ${data.signature.signedAt}`);
  }

  doc.end();
  return doc as unknown as Readable;
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#3d0066').text(title);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke('#cccccc');
  doc.moveDown(0.3);
  doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

function row(doc: PDFKit.PDFDocument, label: string, value?: string): void {
  if (!value) return;
  doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value);
}

function formatAddress(obj: Record<string, unknown>): string {
  const parts = [obj.streetAddress, obj.streetAddress2, obj.city, obj.state, obj.zipCode].filter(Boolean);
  return parts.join(', ');
}

function formatCurrency(val?: number): string {
  if (val == null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

