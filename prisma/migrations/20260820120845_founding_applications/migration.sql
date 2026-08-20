-- CreateEnum
CREATE TYPE "FoundingApplicationStatus" AS ENUM ('APPLIED', 'REVIEWED', 'APPROVED', 'VERIFICATION_PENDING', 'VERIFIED', 'ONBOARDING', 'LIVE', 'REJECTED');

-- CreateTable
CREATE TABLE "founding_applications" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "platforms" JSONB NOT NULL,
    "audienceSize" TEXT,
    "monetisationExperience" TEXT,
    "creatingSince" TEXT,
    "currentlyMonetising" BOOLEAN,
    "whyJoinBaddies" TEXT NOT NULL,
    "confirmsAdult" BOOLEAN NOT NULL,
    "agreesToVerification" BOOLEAN NOT NULL,
    "status" "FoundingApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "founding_applications_status_idx" ON "founding_applications"("status");

-- CreateIndex
CREATE INDEX "founding_applications_email_idx" ON "founding_applications"("email");
