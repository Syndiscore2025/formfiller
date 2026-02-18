-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "hasAdditionalOwners" BOOLEAN;

-- AlterTable
ALTER TABLE "FinancialInfo" ALTER COLUMN "annualRevenue" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "LoanRequest" ALTER COLUMN "amountRequested" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "OwnerInfo" ALTER COLUMN "ownerIndex" SET DEFAULT 0,
ALTER COLUMN "ownershipPct" SET DATA TYPE TEXT,
ALTER COLUMN "dateOfBirth" SET DATA TYPE TEXT;
