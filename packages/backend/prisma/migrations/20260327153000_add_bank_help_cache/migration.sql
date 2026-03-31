-- CreateTable
CREATE TABLE "BankHelpCache" (
    "id" TEXT NOT NULL,
    "normalizedBankName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankUrl" TEXT,
    "instructions" TEXT NOT NULL,
    "sourcePages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankHelpCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankHelpCache_normalizedBankName_key" ON "BankHelpCache"("normalizedBankName");

-- CreateIndex
CREATE INDEX "BankHelpCache_bankName_idx" ON "BankHelpCache"("bankName");