import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

export interface ApplicationValidationIssue {
  field: string;
  message: string;
}

export interface ApplicationValidationState {
  applicationId: string;
  tenantId: string;
  ready: boolean;
  issues: ApplicationValidationIssue[];
  bankStatementCount: number;
}

export interface ApplicationValidationOptions {
  requireSignature?: boolean;
  requireBankStatements?: boolean;
  minBankStatements?: number;
}

export interface ApplicationValidationRecord {
  id: string;
  tenantId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  tcpaConsentStep1: boolean;
  homeBasedBusiness: boolean | null;
  hasAdditionalOwners: boolean | null;
  business: {
    legalName: string | null;
    entityType: string | null;
    industry: string | null;
    stateOfFormation: string | null;
    ein: string | null;
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  } | null;
  owners: Array<{
    ownerIndex: number;
    firstName: string | null;
    lastName: string | null;
    ownershipPct: string | null;
    ssnEncrypted: string | null;
    dateOfBirth: string | null;
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  }>;
  financial: { annualRevenue: string | null } | null;
  loanRequest: { amountRequested: string | null } | null;
  signature: { id: string } | null;
}

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function digits(value: string | null | undefined): string {
  return text(value).replace(/\D/g, '');
}

function addIssue(issues: ApplicationValidationIssue[], field: string, message: string): void {
  issues.push({ field, message });
}

function isValidIsoDateOnly(value: string | null | undefined): boolean {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return parsed.getFullYear() === Number(match[1])
    && parsed.getMonth() === Number(match[2]) - 1
    && parsed.getDate() === Number(match[3]);
}

function isAtLeast18(value: string | null | undefined): boolean {
  if (!isValidIsoDateOnly(value)) return false;
  const [year, month, day] = text(value).split('-').map(Number);
  const eighteenthBirthday = new Date(year + 18, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eighteenthBirthday <= today;
}

function validateRecord(
  app: ApplicationValidationRecord,
  bankStatementCount: number,
  options: ApplicationValidationOptions = {}
): ApplicationValidationState {
  const issues: ApplicationValidationIssue[] = [];
  const minBankStatements = Math.max(1, options.minBankStatements ?? 1);

  if (!text(app.contactEmail)) addIssue(issues, 'contactEmail', 'Contact email is required.');
  if (digits(app.contactPhone).length < 10) addIssue(issues, 'contactPhone', 'Valid contact phone is required.');
  if (!app.tcpaConsentStep1) addIssue(issues, 'tcpaConsentStep1', 'Step 1 TCPA/contact consent is required.');

  const business = app.business;
  if (!business) {
    addIssue(issues, 'business', 'Business information is required.');
  } else {
    if (!text(business.legalName)) addIssue(issues, 'business.legalName', 'Business legal name is required.');
    if (!text(business.industry)) addIssue(issues, 'business.industry', 'Industry is required.');
    if (!text(business.stateOfFormation)) addIssue(issues, 'business.stateOfFormation', 'State of formation is required.');
    if (business.entityType !== 'SOLE_PROPRIETORSHIP' && digits(business.ein).length !== 9) {
      addIssue(issues, 'business.ein', 'A 9-digit EIN is required unless the business is a sole proprietorship.');
    }
    if (!text(business.streetAddress)) addIssue(issues, 'business.streetAddress', 'Business street address is required.');
    if (!text(business.city)) addIssue(issues, 'business.city', 'Business city is required.');
    if (!text(business.state)) addIssue(issues, 'business.state', 'Business state is required.');
    if (!text(business.zipCode)) addIssue(issues, 'business.zipCode', 'Business ZIP code is required.');
  }

  if (app.homeBasedBusiness === null) {
    addIssue(issues, 'homeBasedBusiness', 'Home-based business question must be answered.');
  }

  if (!app.financial || !text(app.financial.annualRevenue)) {
    addIssue(issues, 'financial.annualRevenue', 'Annual revenue is required.');
  }
  if (!app.loanRequest || !text(app.loanRequest.amountRequested)) {
    addIssue(issues, 'loanRequest.amountRequested', 'Amount requested is required.');
  }

  const primaryOwner = app.owners.find((owner) => owner.ownerIndex === 0) ?? app.owners[0];
  if (!primaryOwner) {
    addIssue(issues, 'owners[0]', 'Primary owner information is required.');
  } else {
    if (!text(primaryOwner.firstName)) addIssue(issues, 'owners[0].firstName', 'Primary owner first name is required.');
    if (!text(primaryOwner.lastName)) addIssue(issues, 'owners[0].lastName', 'Primary owner last name is required.');
    if (!text(primaryOwner.ssnEncrypted)) addIssue(issues, 'owners[0].ssn', 'Primary owner SSN/ITIN is required.');
    if (!isValidIsoDateOnly(primaryOwner.dateOfBirth)) {
      addIssue(issues, 'owners[0].dateOfBirth', 'Primary owner valid date of birth is required.');
    } else if (!isAtLeast18(primaryOwner.dateOfBirth)) {
      addIssue(issues, 'owners[0].dateOfBirth', 'Primary owner must be at least 18 years old.');
    }

    const ownershipPct = Number(text(primaryOwner.ownershipPct));
    if (!text(primaryOwner.ownershipPct) || !Number.isFinite(ownershipPct) || ownershipPct < 1 || ownershipPct > 100) {
      addIssue(issues, 'owners[0].ownershipPct', 'Primary owner ownership percentage must be between 1 and 100.');
    } else if (ownershipPct < 81 && app.hasAdditionalOwners === null) {
      addIssue(issues, 'hasAdditionalOwners', 'Additional owner question must be answered for ownership below 81%.');
    }

    if (!text(primaryOwner.streetAddress)) addIssue(issues, 'owners[0].streetAddress', 'Primary owner street address is required.');
    if (!text(primaryOwner.city)) addIssue(issues, 'owners[0].city', 'Primary owner city is required.');
    if (!text(primaryOwner.state)) addIssue(issues, 'owners[0].state', 'Primary owner state is required.');
    if (!text(primaryOwner.zipCode)) addIssue(issues, 'owners[0].zipCode', 'Primary owner ZIP code is required.');
  }

  if (options.requireSignature && !app.signature) {
    addIssue(issues, 'signature', 'Signature required before submission.');
  }
  if (options.requireBankStatements && bankStatementCount < minBankStatements) {
    addIssue(issues, 'documents.bankStatements', `At least ${minBankStatements} bank statement PDF is required before final submission.`);
  }

  return {
    applicationId: app.id,
    tenantId: app.tenantId,
    ready: issues.length === 0,
    issues,
    bankStatementCount,
  };
}

export { validateRecord as validateApplicationRecord };

export function formatApplicationValidationMessage(state: ApplicationValidationState): string {
  if (state.ready) return 'Application is complete.';
  const details = state.issues.map((issue) => issue.message).join(' ');
  return `Application is incomplete. ${details}`;
}

export async function getApplicationValidationState(
  applicationId: string,
  tenantId: string,
  options: ApplicationValidationOptions = {}
): Promise<ApplicationValidationState> {
  const [app, bankStatementCount] = await Promise.all([
    prisma.application.findFirst({
      where: { id: applicationId, tenantId },
      select: {
        id: true,
        tenantId: true,
        contactEmail: true,
        contactPhone: true,
        tcpaConsentStep1: true,
        homeBasedBusiness: true,
        hasAdditionalOwners: true,
        business: {
          select: {
            legalName: true,
            entityType: true,
            industry: true,
            stateOfFormation: true,
            ein: true,
            streetAddress: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
        owners: {
          orderBy: { ownerIndex: 'asc' },
          select: {
            ownerIndex: true,
            firstName: true,
            lastName: true,
            ownershipPct: true,
            ssnEncrypted: true,
            dateOfBirth: true,
            streetAddress: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
        financial: { select: { annualRevenue: true } },
        loanRequest: { select: { amountRequested: true } },
        signature: { select: { id: true } },
      },
    }),
    prisma.applicationDocument.count({
      where: { applicationId, documentType: 'bank_statement' },
    }),
  ]);

  if (!app) throw createError('Application not found', 404);
  return validateRecord(app, bankStatementCount, options);
}

export async function assertReadyForSubmit(applicationId: string, tenantId: string): Promise<ApplicationValidationState> {
  const state = await getApplicationValidationState(applicationId, tenantId, { requireSignature: true });
  if (!state.ready) throw createError(formatApplicationValidationMessage(state), 400);
  return state;
}

export async function assertReadyForSignature(applicationId: string, tenantId: string): Promise<ApplicationValidationState> {
  const state = await getApplicationValidationState(applicationId, tenantId);
  if (!state.ready) throw createError(formatApplicationValidationMessage(state), 400);
  return state;
}

export async function assertReadyForFinalize(applicationId: string, tenantId: string): Promise<ApplicationValidationState> {
  const state = await getApplicationValidationState(applicationId, tenantId, {
    requireSignature: true,
    requireBankStatements: true,
    minBankStatements: 1,
  });
  if (!state.ready) throw createError(formatApplicationValidationMessage(state), 400);
  return state;
}