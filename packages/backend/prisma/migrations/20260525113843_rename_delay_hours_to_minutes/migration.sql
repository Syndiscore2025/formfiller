/*
  Warnings:

  - You are about to drop the column `emailAbandonedDelayHours` on the `TenantSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TenantSettings" DROP COLUMN "emailAbandonedDelayHours",
ADD COLUMN     "emailAbandonedDelayMinutes" INTEGER NOT NULL DEFAULT 1440;
