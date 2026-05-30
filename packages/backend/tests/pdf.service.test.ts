import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import { generateApplicationPdf } from '../src/services/pdf.service';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function countPdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

test('typical signed one-owner application fits on one PDF page', async () => {
  const pdf = await readAll(generateApplicationPdf({
    business: {
      legalName: 'Syndiscore Funding LLC',
      dba: 'Syndiscore',
      entityType: 'LLC',
      industry: 'Professional services',
      stateOfFormation: 'CT',
      ein: '881610629',
      businessStartDate: '2020-01-15',
      phone: '8609229875',
      website: 'https://example.com',
      streetAddress: '100 Main Street',
      city: 'Hartford',
      state: 'CT',
      zipCode: '06103',
    },
    owner: {
      firstName: 'Michael',
      lastName: 'Horak',
      ssn: '041761371',
      ownershipPct: '100',
      creditScore: '700 - 749',
      dateOfBirth: '1985-05-12',
      streetAddress: '100 Main Street',
      city: 'Hartford',
      state: 'CT',
      zipCode: '06103',
    },
    contact: { email: 'syndiscore@example.com', phone: '8609229875' },
    financial: { annualRevenue: '250k-500k' },
    loanRequest: { amountRequested: '25k-50k' },
    signature: {
      signerName: 'Michael Horak',
      signerEmail: 'syndiscore@example.com',
      signedAt: '2026-05-30T11:05:20.000Z',
    },
  }));

  assert.equal(countPdfPages(pdf), 1);
});
