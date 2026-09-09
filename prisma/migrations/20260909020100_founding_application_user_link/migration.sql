-- Links a FoundingApplication to a real User account — see
-- FoundingApplication's own schema comment for why (the initial
-- application form now collects a password and creates a real,
-- immediately-usable account). Nullable: existing applications
-- predate this and have none.
ALTER TABLE "founding_applications" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "founding_applications_userId_key" ON "founding_applications"("userId");

-- ON DELETE SET NULL, not CASCADE: removing an application (e.g. the
-- admin "reset founding roster" tool) must never take the real,
-- login-capable account down with it.
ALTER TABLE "founding_applications" ADD CONSTRAINT "founding_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
