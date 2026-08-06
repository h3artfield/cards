import type { StoreInventoryCard } from "../../../deck-builder/store-inventory-browse";
import type { SpecialistResponse } from "../../clerk-types";
import type { VerifiedClaim, VerifierCheckDetail } from "../types";

const PRICE_TOLERANCE = 0.02;

function inventoryPool(
  pool: StoreInventoryCard[],
  matchPool?: StoreInventoryCard[],
): StoreInventoryCard[] {
  return matchPool?.length ? matchPool : pool;
}

export function checkInventoryGrounding(input: {
  specialist: SpecialistResponse | null;
  inventoryByName: StoreInventoryCard[];
  inventoryMatchPool?: StoreInventoryCard[];
  inventoryOnly: boolean;
}): {
  check: VerifierCheckDetail;
  hardFailures: string[];
  claims: VerifiedClaim[];
} {
  const hardFailures: string[] = [];
  const claims: VerifiedClaim[] = [];
  const warnings: string[] = [];

  if (!input.specialist) {
    return {
      check: { score: 100, passed: true },
      hardFailures,
      claims,
    };
  }

  const pool = inventoryPool(
    input.inventoryByName,
    input.inventoryMatchPool,
  );
  const byId = new Map(pool.map((c) => [c.inventoryItemId, c]));

  for (const rec of input.specialist.recommendations) {
    if (!rec.inventoryItemId) {
      if (input.inventoryOnly) {
        hardFailures.push(
          `Recommendation "${rec.card_name}" has no verified inventory record.`,
        );
      }
      claims.push({
        claim: `${rec.card_name} is in stock.`,
        source_type: "inventory",
        source_id: null,
        verified: false,
      });
      continue;
    }

    const record = byId.get(rec.inventoryItemId);
    if (!record) {
      hardFailures.push(
        `Invented inventory: "${rec.card_name}" (${rec.inventoryItemId}) is not in store records.`,
      );
      claims.push({
        claim: `${rec.card_name} is in stock.`,
        source_type: "inventory",
        source_id: rec.inventoryItemId,
        verified: false,
      });
      continue;
    }

    if ((record.qty ?? 0) <= 0) {
      hardFailures.push(
        `"${rec.card_name}" is listed but quantity is zero in inventory.`,
      );
    }

    if (rec.qty != null && rec.qty > (record.qty ?? 0)) {
      hardFailures.push(
        `Quantity claim for "${rec.card_name}" (${rec.qty}) exceeds stock (${record.qty}).`,
      );
    }

    const storePrice = record.listPrice ?? record.tcgLowPrice;
    if (rec.price != null && storePrice != null) {
      if (Math.abs(rec.price - storePrice) > PRICE_TOLERANCE) {
        hardFailures.push(
          `Price mismatch for "${rec.card_name}": claimed $${rec.price.toFixed(2)}, store has $${storePrice.toFixed(2)}.`,
        );
      }
    }

    claims.push({
      claim: `${record.name} is in stock (${record.qty} at $${(storePrice ?? 0).toFixed(2)}).`,
      source_type: "inventory",
      source_id: record.inventoryItemId,
      verified: true,
    });
  }

  const deck = input.specialist.deckList;
  if (deck) {
    for (const line of deck.lines) {
      if (!line.inStock) continue;
      if (!line.inventoryItemId) {
        if (input.inventoryOnly) {
          hardFailures.push(
            `Deck line "${line.name}" marked in-stock without inventory ID.`,
          );
        }
        continue;
      }
      const record = byId.get(line.inventoryItemId);
      if (!record) {
        hardFailures.push(
          `Deck includes "${line.name}" with invalid inventory ID ${line.inventoryItemId}.`,
        );
        continue;
      }
      if (line.listPrice != null) {
        const storePrice = record.listPrice ?? record.tcgLowPrice;
        if (
          storePrice != null &&
          Math.abs(line.listPrice - storePrice) > PRICE_TOLERANCE
        ) {
          warnings.push(
            `Deck price for "${line.name}" may not match current shelf price.`,
          );
        }
      }
    }

    const claimedTotal = deck.deckTotal;
    const computed = deck.lines
      .filter((l) => l.inStock && l.lineTotal != null)
      .reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    if (
      claimedTotal > 0 &&
      computed > 0 &&
      Math.abs(claimedTotal - computed) > 0.05
    ) {
      warnings.push("Deck total price does not match sum of line items.");
    }
  }

  const passed = hardFailures.length === 0;
  return {
    check: {
      score: passed ? 100 : Math.max(0, 100 - hardFailures.length * 25),
      passed,
      warnings: warnings.length ? warnings : undefined,
    },
    hardFailures,
    claims,
  };
}
