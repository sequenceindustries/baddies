-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('CREATOR_TERMS', 'CONTENT_POLICY', 'PRIVACY_POLICY', 'PAYOUT_AGREEMENT');

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_acceptances" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "foundingApplicationId" TEXT,
    "userId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "agreement_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agreements_type_version_key" ON "agreements"("type", "version");

-- CreateIndex
CREATE INDEX "agreement_acceptances_agreementId_idx" ON "agreement_acceptances"("agreementId");

-- CreateIndex
CREATE INDEX "agreement_acceptances_foundingApplicationId_idx" ON "agreement_acceptances"("foundingApplicationId");

-- CreateIndex
CREATE INDEX "agreement_acceptances_userId_idx" ON "agreement_acceptances"("userId");

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

