import assert from "node:assert/strict";
import {
  cardNameFromInventoryItem,
  dualFaceScryfallName,
  priceChartingNameMatches,
  scryfallLookupNames,
} from "../src/lib/inventory/image-fallback";
import type { InventoryItem } from "../src/lib/types";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "test-item",
    storeId: "test-store",
    displayName: "Test Card",
    status: "on_hand",
    quantity: 1,
    ...overrides,
  } as InventoryItem;
}

/**
 * A spinning loop pins the Node event loop, which takes the whole server down
 * rather than failing one request, so terminating is the assertion that matters.
 */
function withinBudget<T>(label: string, budgetMs: number, work: () => T): T {
  const startedAt = process.hrtime.bigint();
  const result = work();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  assert.ok(
    elapsedMs < budgetMs,
    `${label} took ${elapsedMs.toFixed(1)}ms, expected under ${budgetMs}ms`,
  );
  return result;
}

// A parenthetical tag that is not at the end of the name used to spin forever:
// the loop condition matched parentheses anywhere, the replace only stripped a
// trailing group, so the string never changed and the condition never cleared.
{
  const sealed = item({
    displayName:
      "Secret Lair Drop: Secret Lair x Marvel's Spider-Man: Venom Unleashed (Inks) - Rainbow Foil Edition - Unopened",
    setName: "Secret Lair Drop Series",
  });

  const names = withinBudget("mid-string parenthetical", 250, () =>
    scryfallLookupNames(sealed),
  );

  assert.ok(names.length > 0, "expected at least one lookup name");
  assert.ok(
    names.some((name) => !name.includes("(")),
    "expected a variant with the parenthetical tag removed",
  );
  assert.ok(
    names.every((name) => name.trim() === name && name.length > 0),
    "expected trimmed, non-empty names",
  );
}

// Trailing tags should still strip progressively, innermost last.
{
  const showcase = item({
    displayName: "Katara, the Fearless (Showcase) — Avatar: The Last Airbender #350 — Near Mint",
    cardNumber: "350",
  });

  const names = withinBudget("trailing parenthetical", 250, () =>
    scryfallLookupNames(showcase),
  );

  assert.equal(cardNameFromInventoryItem(showcase), "Katara, the Fearless (Showcase)");
  assert.ok(
    names.includes("Katara, the Fearless"),
    `expected bare card name, got ${JSON.stringify(names)}`,
  );
}

// Several tags in one title must still terminate.
{
  const messy = item({
    displayName: "Some Card (Borderless) (Foil) - Special Edition - Near Mint",
  });

  const names = withinBudget("multiple parentheticals", 250, () =>
    scryfallLookupNames(messy),
  );

  assert.ok(
    names.some((name) => !name.includes("(")),
    "expected a fully stripped variant",
  );
}

// PriceCharting answers any query with something, so weak matches are rejected.
{
  assert.equal(
    priceChartingNameMatches(
      "Secret Lair x Marvel's Spider-Man: Venom Unleashed",
      "Secret Lair Marvel Spider-Man Venom Unleashed",
    ),
    true,
    "expected overlapping names to match",
  );

  assert.equal(
    priceChartingNameMatches("Vow of Malice", "Charizard VMAX"),
    false,
    "expected an unrelated product to be rejected",
  );

  assert.equal(
    priceChartingNameMatches("Sol Ring", undefined),
    false,
    "expected a missing product name to be rejected",
  );

  assert.equal(
    priceChartingNameMatches("Bag End", "Adventure Bag"),
    false,
    "Magic Bag End must not match Pokémon Adventure Bag",
  );

  assert.equal(
    dualFaceScryfallName("Bag End - Horizon Canopy"),
    "Bag End // Horizon Canopy",
  );
  assert.equal(dualFaceScryfallName("Venom Unleashed - Rainbow Foil Edition"), null);

  const bagEnd = item({
    displayName: "Bag End - Horizon Canopy (Borderless) (Surge Foil) — Near Mint",
    productName: "Bag End - Horizon Canopy (Borderless) (Surge Foil)",
    productLine: "Magic: The Gathering",
  });
  const bagNames = scryfallLookupNames(bagEnd);
  assert.ok(
    bagNames.includes("Bag End // Horizon Canopy"),
    `expected dual-face Scryfall name, got ${JSON.stringify(bagNames)}`,
  );
  assert.ok(
    !bagNames.includes("Bag End"),
    "short front face must not be a search query",
  );
}

console.log("inventory image names: all assertions passed");
