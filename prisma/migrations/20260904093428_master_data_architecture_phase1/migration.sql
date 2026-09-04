-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('ID_DOCUMENT', 'SELFIE', 'ID_HOLDING_PHOTO');

-- CreateEnum
CREATE TYPE "IdentityDocumentStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('PENDING', 'SOUTH_AFRICA', 'REJECTED');

-- CreateEnum
CREATE TYPE "BankingStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'EXTERNALLY_VERIFIED', 'FAILED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('SAVINGS', 'CHEQUE', 'TRANSMISSION', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "FoundingApplicationStatus_new" AS ENUM ('APPLIED', 'CONTACT_CONFIRMED', 'IDENTITY_SUBMITTED', 'VERIFICATION_REVIEW', 'VERIFIED', 'APPROVED', 'ONBOARDING', 'CONTENT_READY', 'LIVE', 'REJECTED');
ALTER TABLE "founding_applications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "founding_applications" ALTER COLUMN "status" TYPE "FoundingApplicationStatus_new" USING ("status"::text::"FoundingApplicationStatus_new");
ALTER TYPE "FoundingApplicationStatus" RENAME TO "FoundingApplicationStatus_old";
ALTER TYPE "FoundingApplicationStatus_new" RENAME TO "FoundingApplicationStatus";
DROP TYPE "FoundingApplicationStatus_old";
ALTER TABLE "founding_applications" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
COMMIT;

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationality" TEXT NOT NULL,
    "idNumberEncrypted" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_documents" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "type" "IdentityDocumentType" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "IdentityDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_contacts" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "whatsappVerifiedAt" TIMESTAMP(3),
    "whatsappVerifiedBy" TEXT,
    "whatsappMethod" TEXT NOT NULL DEFAULT 'click_to_chat_manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "detectedCountry" TEXT,
    "detectionSignal" TEXT NOT NULL,
    "detectionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LocationStatus" NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banking_details" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountType" "BankAccountType" NOT NULL,
    "branchCode" TEXT NOT NULL,
    "status" "BankingStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "externalVerificationRef" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banking_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identities_foundingApplicationId_key" ON "identities"("foundingApplicationId");

-- CreateIndex
CREATE INDEX "identities_status_idx" ON "identities"("status");

-- CreateIndex
CREATE INDEX "identity_documents_foundingApplicationId_idx" ON "identity_documents"("foundingApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "application_contacts_foundingApplicationId_key" ON "application_contacts"("foundingApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_foundingApplicationId_key" ON "locations"("foundingApplicationId");

-- CreateIndex
CREATE INDEX "locations_status_idx" ON "locations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "banking_details_foundingApplicationId_key" ON "banking_details"("foundingApplicationId");

-- CreateIndex
CREATE INDEX "banking_details_status_idx" ON "banking_details"("status");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banking_details" ADD CONSTRAINT "banking_details_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

