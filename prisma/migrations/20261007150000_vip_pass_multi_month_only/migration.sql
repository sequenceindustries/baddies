-- VIP Pass is sold only as 3/6/12-month packages (no 1-month option),
-- discounted off the $5/month base: 3mo $13.50 (10%), 6mo $24 (20%),
-- 12mo $42 (30%). Data-only. prisma/seed.ts never overwrites existing
-- rows, so already-seeded environments need this explicit update.

INSERT INTO "platform_settings" ("key", "value", "updatedAt")
VALUES ('pricing.vip_pass_discount_curve', '{"3":0.1,"6":0.2,"12":0.3}', NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();

INSERT INTO "vip_pass_plans" ("id", "durationMonths", "priceUsd", "isActive", "updatedAt")
VALUES
  ('vip_pass_plan_3', 3, 13.50, true, NOW()),
  ('vip_pass_plan_6', 6, 24.00, true, NOW()),
  ('vip_pass_plan_12', 12, 42.00, true, NOW())
ON CONFLICT ("durationMonths") DO UPDATE
SET "priceUsd" = EXCLUDED."priceUsd", "isActive" = true, "updatedAt" = NOW();

-- Kept (not deleted) so existing 1-month passes still reference a real
-- price history; no longer sold.
UPDATE "vip_pass_plans"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "durationMonths" NOT IN (3, 6, 12);
