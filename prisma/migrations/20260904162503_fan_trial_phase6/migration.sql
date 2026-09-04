-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "fan_trials" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fan_trials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fan_trials_fanId_key" ON "fan_trials"("fanId");

-- CreateIndex
CREATE INDEX "fan_trials_status_idx" ON "fan_trials"("status");

-- AddForeignKey
ALTER TABLE "fan_trials" ADD CONSTRAINT "fan_trials_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

