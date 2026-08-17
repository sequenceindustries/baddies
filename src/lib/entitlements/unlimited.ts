import { db } from "@/lib/db/client";
import { getBusinessConfig } from "@/lib/config/settings";
import type { UnlimitedAllocationModel } from "@/lib/config/business";

/**
 * Unlimited pool allocation engine. Per build brief §2:
 * "Do not hard-code the allocation formula. Create a configurable
 * allocation engine so Baddies can later test: consumption-based,
 * engagement-based, hybrid, minimum creator guarantees, other models."
 *
 * This module computes, for a given monthly pool and period, how much each
 * participating creator is owed — but does NOT write ledger entries
 * itself. Callers take the result and post UNLIMITED_ALLOCATION ledger
 * entries (see src/lib/ledger/service.ts) so the calculation stays
 * auditable and replayable independent of the write path.
 */

export interface CreatorAllocation {
  creatorProfileId: string;
  qualifiedWeight: number;
  allocatedAmountUsd: number;
}

export interface AllocationInput {
  periodStart: Date;
  periodEnd: Date;
  poolAmountUsd: number;
}

interface AllocationModel {
  allocate(input: AllocationInput): Promise<CreatorAllocation[]>;
}

/**
 * Consumption-based model: each creator's share of the pool is proportional
 * to the sum of QualifiedConsumptionEvent.weight attributed to their
 * content within the period. This is the initial MVP model per §2.
 */
class ConsumptionAllocationModel implements AllocationModel {
  async allocate({ periodStart, periodEnd, poolAmountUsd }: AllocationInput): Promise<CreatorAllocation[]> {
    const events = await db.qualifiedConsumptionEvent.findMany({
      where: { qualifiesAt: { gte: periodStart, lt: periodEnd } },
      select: { weight: true, content: { select: { creatorProfileId: true } } },
    });

    const weightByCreator = new Map<string, number>();
    let totalWeight = 0;

    for (const event of events) {
      const creatorProfileId = event.content.creatorProfileId;
      const weight = Number(event.weight);
      weightByCreator.set(creatorProfileId, (weightByCreator.get(creatorProfileId) ?? 0) + weight);
      totalWeight += weight;
    }

    if (totalWeight === 0) return [];

    return Array.from(weightByCreator.entries()).map(([creatorProfileId, qualifiedWeight]) => ({
      creatorProfileId,
      qualifiedWeight,
      allocatedAmountUsd: roundCents((qualifiedWeight / totalWeight) * poolAmountUsd),
    }));
  }
}

/**
 * Placeholder for a future engagement-weighted model (e.g. incorporating
 * follows, tips, or repeat visits alongside raw consumption). Not
 * implemented in Sprint 0 — stubbed so the interface and factory shape are
 * proven out before Sprint 5 (Unlimited).
 */
class EngagementAllocationModel implements AllocationModel {
  async allocate(_input: AllocationInput): Promise<CreatorAllocation[]> {
    throw new Error(
      "EngagementAllocationModel is not yet implemented — planned for Sprint 5 experimentation, see build brief §2."
    );
  }
}

class HybridAllocationModel implements AllocationModel {
  async allocate(_input: AllocationInput): Promise<CreatorAllocation[]> {
    throw new Error("HybridAllocationModel is not yet implemented — planned for Sprint 5 experimentation.");
  }
}

class MinimumGuaranteeAllocationModel implements AllocationModel {
  async allocate(_input: AllocationInput): Promise<CreatorAllocation[]> {
    throw new Error(
      "MinimumGuaranteeAllocationModel is not yet implemented — planned for Sprint 5 experimentation."
    );
  }
}

function getModel(model: UnlimitedAllocationModel | string): AllocationModel {
  switch (model) {
    case "consumption":
      return new ConsumptionAllocationModel();
    case "engagement":
      return new EngagementAllocationModel();
    case "hybrid":
      return new HybridAllocationModel();
    case "minimum_guarantee":
      return new MinimumGuaranteeAllocationModel();
    default:
      throw new Error(`Unknown unlimited allocation model "${model}".`);
  }
}

export async function computeUnlimitedAllocations(
  input: AllocationInput
): Promise<CreatorAllocation[]> {
  const config = await getBusinessConfig();
  const model = getModel(config.unlimitedAllocationModel);
  return model.allocate(input);
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
