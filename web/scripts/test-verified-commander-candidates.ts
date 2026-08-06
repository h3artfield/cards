/**
 * Invariant tests for getVerifiedCommanderCandidates — every accepted candidate must pass eligibility gates.
 */
import assert from "node:assert/strict";
import {
  getVerifiedCommanderCandidates,
  type VerifiedCommanderCandidate,
} from "../src/lib/store-inventory/clerk-tools/get-verified-commander-candidates";
import { isLegalCommanderForInventoryCard, passesCommanderColor } from "../src/lib/store-inventory/clerk-tools/commander-eligibility";
import type { StoreInventoryCard } from "../src/lib/deck-builder/store-inventory-browse";

function mockCommander(overrides: Partial<StoreInventoryCard>): StoreInventoryCard {
  return {
    inventoryItemId: overrides.inventoryItemId ?? "inv-1",
    name: overrides.name ?? "Test Commander",
    oracleId: overrides.oracleId ?? "oracle-test-1",
    scryfallId: overrides.scryfallId,
    qty: overrides.qty ?? 1,
    colorIdentity: overrides.colorIdentity ?? ["U"],
    isCommander: overrides.isCommander ?? true,
    typeLine: overrides.typeLine ?? "Legendary Creature — Bird Wizard",
    listPrice: overrides.listPrice ?? 5,
    imageUrl: "",
    imageProxyUrl: "",
    category: "magic",
  };
}

async function assertCandidateInvariants(
  candidates: VerifiedCommanderCandidate[],
  colorFilter: "U" | "all",
  maxPrice?: number,
): Promise<void> {
  for (const candidate of candidates) {
    assert.ok(candidate.oracleId?.trim(), "oracleId required");
    assert.equal(candidate.structurallyEligible, true);
    assert.ok(await isLegalCommanderForInventoryCard(candidate.card));
    assert.ok(passesCommanderColor(candidate.colorIdentity, colorFilter));
    assert.ok(candidate.card.qty > 0);
    if (maxPrice != null) {
      const price = candidate.card.listPrice ?? candidate.card.tcgLowPrice;
      if (price != null && price > 0) {
        assert.ok(price <= maxPrice);
      }
    }
  }
}

async function runTests(): Promise<void> {
  const instantLeak = mockCommander({
    inventoryItemId: "inv-instant",
    name: "Aetherspouts",
    oracleId: "oracle-aetherspouts",
    typeLine: "Instant",
    isCommander: false,
    colorIdentity: ["U"],
    listPrice: 0.5,
  });

  const legalBird = mockCommander({
    inventoryItemId: "inv-bird",
    name: "Kangee, Aerie Keeper",
    oracleId: "oracle-kangee",
    typeLine: "Legendary Creature — Bird Wizard",
    listPrice: 3,
  });

  const audit = await getVerifiedCommanderCandidates({
    storeId: "test-store",
    inventory: [instantLeak, legalBird],
    colorFilter: "U",
    inventoryOnly: true,
    sort: "price_asc",
    limit: 5,
    themeQuestion: "Cheapest mono-blue commander in stock?",
  });

  assert.ok(
    !audit.accepted.some((c) => c.card.name.toLowerCase().includes("aetherspouts")),
    "Aetherspouts must never appear as commander candidate",
  );
  assert.ok(
    audit.rejected.some((r) => r.reason === "not_commander_eligible"),
    "Ineligible cards must be rejected with not_commander_eligible",
  );

  await assertCandidateInvariants(audit.accepted, "U");

  const birdAudit = await getVerifiedCommanderCandidates({
    storeId: "test-store",
    inventory: [legalBird, mockCommander({
      inventoryItemId: "inv-animar",
      name: "Animar, Soul of Elements",
      oracleId: "oracle-animar",
      typeLine: "Legendary Creature — Human Wizard",
      colorIdentity: ["U", "R", "G"],
      listPrice: 8,
    })],
    colorFilter: "all",
    inventoryOnly: true,
    sort: "popularity",
    limit: 5,
    themeQuestion: "What are good Bird commanders?",
  });

  assert.ok(
    !birdAudit.accepted.some((c) => /animar/i.test(c.card.name)),
    "Theme-irrelevant Animar must be filtered for Bird request",
  );

  console.log("getVerifiedCommanderCandidates invariant tests passed");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
