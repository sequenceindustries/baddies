-- Soft-launch pricing: VIP Pass $5/month, Exclusive a flat $10/month.
-- Data-only. prisma/seed.ts never overwrites existing platform_settings /
-- vip_pass_plans rows, so already-seeded environments need this explicit
-- update.

UPDATE "platform_settings"
SET "value" = '5.00', "updatedAt" = NOW()
WHERE "key" = 'pricing.vip_pass_usd';

UPDATE "platform_settings"
SET "value" = '10.00', "updatedAt" = NOW()
WHERE "key" = 'pricing.vvip_usd';

-- Re-derive each VIP Pass package from the new $5 base and the
-- environment's own bundle-discount curve (same formula as
-- seedVipPassPlans); a duration missing from the curve gets no discount.
UPDATE "vip_pass_plans" p
SET "priceUsd" = ROUND(
      5.00 * p."durationMonths" * (1 - COALESCE(
        (SELECT (s."value"::jsonb ->> p."durationMonths"::text)::numeric
           FROM "platform_settings" s
          WHERE s."key" = 'pricing.bundle_discount_curve'),
        0)),
      2),
    "updatedAt" = NOW();

-- Retired pre-redesign price keys (Entry / old VIP / Unlimited) — read by
-- nothing, and their stale values (2.99 / 9.99 / 19.99) only conflict
-- with the real prices above.
DELETE FROM "platform_settings"
WHERE "key" IN ('pricing.entry_usd', 'pricing.vip_usd', 'pricing.unlimited_usd');
