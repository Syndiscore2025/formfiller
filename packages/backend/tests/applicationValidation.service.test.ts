import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type ApplicationValidationRecord,
  validateApplicationRecord,
} from '../src/services/applicationValidation.service';

function completeRecord(): ApplicationValidationRecord {
  return {
    id: 'app-validation-test',
    tenantId: 'tenant-validation-test',
    contactEmail: 'applicant@example.test',
    contactPhone: '8602026706',
    tcpaConsentStep1: true,
    homeBasedBusiness: false,
    hasAdditionalOwners: false,
    business: {
      legalName: 'Application Validation Business',
      entityType: 'LLC',
      industry: 'Professional Services',
      stateOfFormation: 'CT',
      ein: '123456789',
      streetAddress: '100 Validation Way',
      city: 'Hartford',
      state: 'CT',
      zipCode: '06103',
    },
    owners: [{
      ownerIndex: 0,
      firstName: 'Primary',
      lastName: 'Owner',
      ownershipPct: '100',
      ssnEncrypted: 'encrypted-value-present',
      dateOfBirth: '1985-01-01',
      streetAddress: '100 Validation Way',
      city: 'Hartford',
      state: 'CT',
      zipCode: '06103',
    }],
    financial: { annualRevenue: '500k-1m' },
    loanRequest: { amountRequested: '100k-250k' },
    signature: { id: 'signature-validation-test' },
  };
}

test('submit validation accepts a complete signed application before bank statements', () => {
  const state = validateApplicationRecord(completeRecord(), 0, { requireSignature: true });
  assert.equal(state.ready, true);
  assert.deepEqual(state.issues, []);
});

test('signature readiness accepts complete application data without existing signature or bank statements', () => {
  const record = completeRecord();
  record.signature = null;

  const state = validateApplicationRecord(record, 0);
  assert.equal(state.ready, true);
  assert.deepEqual(state.issues, []);
});

test('submit validation rejects unsigned or incomplete application data', () => {
  const record = completeRecord();
  record.signature = null;
  record.business!.ein = '';
  record.homeBasedBusiness = null;

  const state = validateApplicationRecord(record, 0, { requireSignature: true });
  assert.equal(state.ready, false);
  assert.deepEqual(state.issues.map((issue) => issue.field), [
    'business.ein',
    'homeBasedBusiness',
    'signature',
  ]);
});

test('finalize validation requires at least one bank statement PDF', () => {
  const state = validateApplicationRecord(completeRecord(), 0, {
    requireSignature: true,
    requireBankStatements: true,
  });

  assert.equal(state.ready, false);
  assert.equal(state.issues[0]?.field, 'documents.bankStatements');
});

test('sole proprietorship can complete without EIN', () => {
  const record = completeRecord();
  record.business!.entityType = 'SOLE_PROPRIETORSHIP';
  record.business!.ein = '';

  const state = validateApplicationRecord(record, 1, {
    requireSignature: true,
    requireBankStatements: true,
  });

  assert.equal(state.ready, true);
});

test('additional owner answer is required when primary ownership is below 81 percent', () => {
  const record = completeRecord();
  record.owners[0].ownershipPct = '80';
  record.hasAdditionalOwners = null;

  const state = validateApplicationRecord(record, 1, { requireSignature: true });
  assert.equal(state.ready, false);
  assert.equal(state.issues[0]?.field, 'hasAdditionalOwners');
});