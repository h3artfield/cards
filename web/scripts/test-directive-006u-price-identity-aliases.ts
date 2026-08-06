/**
 * Directive 006U — Price identity alias resolution + graph lookup.
 * Run: npm run test:directive-006u-price-identity-aliases
 */
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";
import {
  describePriceHistoryEmptyReason,
  expandIdentityKeyAliases,
  resolvePriceHistoryLookupKeys,
} from "../src/lib/prices/price-identity-aliases";
import {
  importPriceChartingCsv,
  sampleMar93CsvRow,
} from "../src/lib/prices/pricecharting-csv-import";
import { resolveCardPriceHistoryLookup } from "../src/lib/prices/resolve-price-history-lookup";
import type { CardCandidateBundle } from "../src/lib/card-flow-v2/types";
import type { ScannedCard } from "../src/lib/types";
import type { CardPriceSnapshot } from "../src/lib/prices/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function snap(
  id: string,
  identityKey: string,
  rawUngraded: number,
  capturedDate = "2026-07-05",
): CardPriceSnapshot {
  const category = identityKey.split("|")[0] as CardPriceSnapshot["category"];
  return {
    id,
    source: "pricecharting",
    category,
    identityKey,
    sourceIdentityKey: identityKey,
    exactIdentityMatch: true,
    capturedDate,
    capturedAt: `${capturedDate}T12:00:00.000Z`,
    importRunId: "test-run",
    priceChartingProductId: id,
    productName: "Test Card",
    currency: "USD",
    rawUngraded,
    rawSourceRow: {},
  };
}

function runPokemonAliasExpansion() {
  console.log("\n1. Pokémon set alias expansion (sv2 ↔ paldea-evolved)");
  const sv2 = "pokemon|sv2|184|reverse_holo|en";
  const paldea = "pokemon|paldea-evolved|184|reverse_holo|en";
  const expanded = expandIdentityKeyAliases(sv2);
  assert(expanded.includes(sv2), "includes requested sv2 key");
  assert(expanded.includes(paldea), "includes paldea-evolved alias");
  assert(
    expandIdentityKeyAliases(paldea).includes(sv2),
    "paldea-evolved expands back to sv2",
  );
}

function runLookupKeysFromCardFields() {
  console.log("\n2. resolvePriceHistoryLookupKeys from card identity fields");
  const keys = resolvePriceHistoryLookupKeys({
    identityKey: "pokemon|sv2|184|reverse_holo|en",
    category: "pokemon",
    setCode: "sv2",
    setName: "Paldea Evolved",
    collectorNumber: "184",
    finish: "reverse_holo",
    language: "en",
  });
  assert(keys.includes("pokemon|sv2|184|reverse_holo|en"), "includes sv2");
  assert(keys.includes("pokemon|paldea-evolved|184|reverse_holo|en"), "includes paldea-evolved");
  assert(keys.length >= 2, "multiple lookup keys");
}

function runGrushaAliasHistory() {
  console.log("\n3. Grusha sv2 lookup resolves paldea-evolved snapshot in graph response");
  const lookupKeys = resolvePriceHistoryLookupKeys({
    identityKey: "pokemon|sv2|184|reverse_holo|en",
  });
  const snapshots: CardPriceSnapshot[] = [
    snap("pc-grusha", "pokemon|paldea-evolved|184|reverse_holo|en", 0.12),
  ];
  const matchedKeys = snapshots.map((s) => s.identityKey);
  const history = buildCardPriceHistoryResponse({
    identityKey: "pokemon|sv2|184|reverse_holo|en",
    requestedIdentityKey: "pokemon|sv2|184|reverse_holo|en",
    lookupKeys,
    matchedKeys,
    snapshots,
  });
  assert(lookupKeys.includes("pokemon|paldea-evolved|184|reverse_holo|en"), "lookup includes paldea-evolved");
  assert(history.currentEstimate === 0.12, "Grusha $0.12 via alias match");
}

function runGraphResponseShape() {
  console.log("\n4. Graph API response includes alias metadata");
  const history = buildCardPriceHistoryResponse({
    identityKey: "pokemon|sv2|184|reverse_holo|en",
    requestedIdentityKey: "pokemon|sv2|184|reverse_holo|en",
    lookupKeys: [
      "pokemon|sv2|184|reverse_holo|en",
      "pokemon|paldea-evolved|184|reverse_holo|en",
    ],
    matchedKeys: ["pokemon|paldea-evolved|184|reverse_holo|en"],
    snapshots: [snap("pc-grusha", "pokemon|paldea-evolved|184|reverse_holo|en", 0.12)],
  });
  assert(history.requestedIdentityKey === "pokemon|sv2|184|reverse_holo|en", "requestedIdentityKey");
  assert((history.lookupKeys?.length ?? 0) >= 2, "lookupKeys present");
  assert(
    (history.matchedKeys?.includes("pokemon|paldea-evolved|184|reverse_holo|en") ?? false),
    "matchedKeys reports warehouse key",
  );
  assert(history.currentEstimate === 0.12, "currentEstimate $0.12");
}

function runEmptyReasons() {
  console.log("\n5. Empty reason codes");
  assert(
    describePriceHistoryEmptyReason({
      requestedIdentityKey: null,
      lookupKeys: [],
      matchedKeys: [],
    }) === "no_identity",
    "no_identity",
  );
  assert(
    describePriceHistoryEmptyReason({
      requestedIdentityKey: "pokemon|sv2|999|normal|en",
      lookupKeys: ["pokemon|sv2|999|normal|en", "pokemon|paldea-evolved|999|normal|en"],
      matchedKeys: [],
    }) === "no_alias_matched",
    "no_alias_matched when aliases tried",
  );
  assert(
    describePriceHistoryEmptyReason({
      requestedIdentityKey: "mtg|PLST|198|nonfoil|normal|en",
      lookupKeys: ["mtg|PLST|198|nonfoil|normal|en"],
      matchedKeys: [],
    }) === "no_snapshots_for_exact_identity",
    "no_snapshots_for_exact_identity for single key",
  );
  assert(
    describePriceHistoryEmptyReason({
      requestedIdentityKey: "mtg|MAR|93|nonfoil|normal|en",
      lookupKeys: ["mtg|MAR|93|nonfoil|normal|en"],
      matchedKeys: [],
    }) === "source_absent_from_feed",
    "MAR #93 source_absent_from_feed",
  );
}

function runNoCrossContamination() {
  console.log("\n6. Alias layer does not cross-contaminate unrelated cards");
  const marImport = importPriceChartingCsv({
    fileText: sampleMar93CsvRow(),
    capturedDate: "2026-07-05",
    category: "mtg",
    useLegacyMtgInference: true,
  });
  const mar = marImport.snapshots.find((s) => s.setCode === "MAR");
  const rex = marImport.snapshots.find((s) => s.setCode === "REX");
  assert(mar?.identityKey === "mtg|MAR|93|nonfoil|normal|en", "MAR #93 identity");
  assert(rex?.identityKey === "mtg|REX|18|nonfoil|normal|en", "REX #18 identity");
  assert(mar?.identityKey !== rex?.identityKey, "MAR and REX stay separate");

  const plstCsv = [
    "id,product-name,console-name,genre,loose-price",
    '9,"Argentum Armor [The List] #198","Magic The List",Magic Card,25',
  ].join("\n");
  const plstImport = importPriceChartingCsv({
    fileText: plstCsv,
    capturedDate: "2026-07-05",
    category: "mtg",
    useLegacyMtgInference: true,
  });
  const plst = plstImport.snapshots[0];
  assert(plst?.identityKey === "mtg|PLST|198|nonfoil|normal|en", "PLST identity separate from AFC");
  assert(
    expandIdentityKeyAliases("mtg|PLST|198|nonfoil|normal|en").length === 1,
    "MTG keys do not expand Pokémon-style aliases",
  );
  assert(
    !expandIdentityKeyAliases("mtg|MAR|93|nonfoil|normal|en").some((k) => k.includes("REX")),
    "MAR aliases do not include REX",
  );
}

function runLockedCardLookup() {
  console.log("\n7. resolveCardPriceHistoryLookup for locked Grusha-style identity");
  const lookup = resolveCardPriceHistoryLookup({
    card: {
      id: "test-grusha",
      orderId: "o1",
      category: "pokemon",
      detectedName: "Grusha",
      cardNumber: "184",
      setName: "Paldea Evolved",
      frontImageUrl: "",
      backImageUrl: "",
      itemType: "raw",
      status: "processed",
      createdAt: "2026-07-05T00:00:00.000Z",
    } satisfies ScannedCard,
    identity: {
      lockedIdentity: {
        locked: true,
        category: "pokemon",
        setCode: "sv2",
        setName: "Paldea Evolved",
        collectorNumber: "184",
        finish: "reverse_holo",
        language: "en",
      },
    } as CardCandidateBundle,
  });
  assert(lookup.requestedIdentityKey === "pokemon|sv2|184|reverse_holo|en", "locked sv2 key");
  assert(
    lookup.lookupKeys.includes("pokemon|paldea-evolved|184|reverse_holo|en"),
    "lookup expands to paldea-evolved",
  );
}

async function main() {
  console.log("=== Directive 006U — Price Identity Aliases ===");
  runPokemonAliasExpansion();
  runLookupKeysFromCardFields();
  runGrushaAliasHistory();
  runGraphResponseShape();
  runEmptyReasons();
  runNoCrossContamination();
  runLockedCardLookup();

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILED"} (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
