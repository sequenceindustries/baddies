-- CreateTable
CREATE TABLE "creator_identities" (
    "id" TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationality" TEXT NOT NULL,
    "idNumberEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_identity_documents" (
    "id" TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_identities_creatorProfileId_key" ON "creator_identities"("creatorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "creator_identity_documents_creatorProfileId_key" ON "creator_identity_documents"("creatorProfileId");

-- AddForeignKey
ALTER TABLE "creator_identities" ADD CONSTRAINT "creator_identities_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_identity_documents" ADD CONSTRAINT "creator_identity_documents_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
