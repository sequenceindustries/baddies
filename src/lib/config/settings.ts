import { db } from "@/lib/db/client";
import {
  BUSINESS_CONFIG_KEYS,
  DEFAULT_BUSINESS_CONFIG,
  type BusinessConfigKey,
} from "./business";

/**
 * Reads a single platform setting from the database, falling back to the
 * seed default (and logging a warning) if it hasn't been provisioned yet.
 * This is the ONLY sanctioned way for application code to read a business
 * value like price or revenue share — never import DEFAULT_BUSINESS_CONFIG
 * directly outside of the seed script and this module.
 */
export async function getPlatformSetting(key: BusinessConfigKey): Promise<string> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  if (row) return row.value;

  console.warn(
    `[settings] platform_settings row missing for "${key}"; falling back to seed default. Run prisma/seed.ts.`
  );
  return DEFAULT_BUSINESS_CONFIG[key];
}

export async function setPlatformSetting(
  key: BusinessConfigKey,
  value: string,
  updatedBy?: string
): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}

export interface BusinessConfigSnapshot {
  vvipDefaultPriceUsd: number;
  vipPassPriceUsd: number;
  creatorShare: number;
  platformShare: number;
  unlimitedAllocationModel: string;
}

/** Convenience accessor for pricing/ledger code that needs several values at once. */
export async function getBusinessConfig(): Promise<BusinessConfigSnapshot> {
  const [vvipDefault, vipPass, creatorShare, platformShare, allocationModel] =
    await Promise.all([
      getPlatformSetting(BUSINESS_CONFIG_KEYS.VVIP_DEFAULT_PRICE_USD),
      getPlatformSetting(BUSINESS_CONFIG_KEYS.VIP_PASS_PRICE_USD),
      getPlatformSetting(BUSINESS_CONFIG_KEYS.CREATOR_SHARE),
      getPlatformSetting(BUSINESS_CONFIG_KEYS.PLATFORM_SHARE),
      getPlatformSetting(BUSINESS_CONFIG_KEYS.UNLIMITED_ALLOCATION_MODEL),
    ]);

  const config: BusinessConfigSnapshot = {
    vvipDefaultPriceUsd: Number(vvipDefault),
    vipPassPriceUsd: Number(vipPass),
    creatorShare: Number(creatorShare),
    platformShare: Number(platformShare),
    unlimitedAllocationModel: allocationModel,
  };

  const shareSum = config.creatorShare + config.platformShare;
  if (Math.abs(shareSum - 1) > 0.0001) {
    throw new Error(
      `[settings] creator_share + platform_share must equal 1.0, got ${shareSum}. Refusing to proceed with an inconsistent revenue split.`
    );
  }

  return config;
}
