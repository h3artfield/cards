/**
 * Directive 005B staging validation — Grusha confirm/clear/promotion flow.
 * Run: npx tsx scripts/validate-directive-005b.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import {
  applyStaffSuspectSelection,
  clearStaffSuspectSelection,
  getStaffSelectedSuspect,
} from "../src/lib/card-flow-v2/staff-suspect-selection";
import {
  clearStaffConfirmedMarket,
  evaluateSnapshotReuse,
  findSnapshotForSuspect,
  promoteStaffConfirmedMarket,
} from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import {
  applyStaffCorrection,
  runCardAuditV2,
} from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import type { CardSuspect } from "../src/lib/card-flow-v2/types";

const GRUSHA_ID = "a9913433-d799-4bd8-867d-a7866e080668";
const REVERSE_SUSPECT_ID = "pokemon_tcg:sv2-184:reverse_holo";

function loadEnv() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
  process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED = "true";
}

function summarizeCard(card: Awaited<ReturnType<typeof dataStore.getCard>>) {
  if (!card) return null;
  const market = card.cardFlowV2Market;
  const reverseSnap = market?.snapshots.find((s) => s.suspectId === REVERSE_SUSPECT_ID);
  return {
    name: card.detectedName,
    lockStatus: card.cardFlowV2Identity?.lockedIdentity.lockStatus,
    marketMode: market?.mode,
    selectedSuspectId: market?.selectedSuspectId,
    staffSelection: card.cardFlowV2Identity?.staffSelection?.suspectId,
    promotion: market?.staffConfirmedPromotion,
    reverseHolo: reverseSnap
      ? {
          accepted: reverseSnap.acceptedComps.length,
          median: reverseSnap.valueMedian,
          confidence: reverseSnap.confidence,
        }
      : null,
    audit: card.cardFlowV2Audit
      ? {
          basis: card.cardFlowV2Audit.v2IdentityBasis,
          agreement: card.cardFlowV2Audit.priceComparison.agreement,
          mode: card.cardFlowV2Audit.v2MarketMode,
          promoted: card.cardFlowV2Audit.v2StaffMarketPromotion?.promotedFromSnapshot,
        }
      : null,
    snapshotCount: market?.snapshots.length ?? 0,
  };
}

async function confirmReverseHolo(
  card: NonNullable<Awaited<ReturnType<typeof dataStore.getCard>>>,
) {
  const identity = card.cardFlowV2Identity!;
  const market = card.cardFlowV2Market!;
  const suspect = identity.suspects.find((s) => s.suspectId === REVERSE_SUSPECT_ID);
  if (!suspect) throw new Error("Reverse holo suspect not found");

  const updatedIdentity = applyStaffSuspectSelection(identity, {
    suspectId: REVERSE_SUSPECT_ID,
    confirmedBy: "validate-directive-005b",
  });
  const { market: promotedMarket, promotion } = await promoteStaffConfirmedMarket({
    market,
    suspect,
    confirmedBy: "validate-directive-005b",
  });

  let audit = runCardAuditV2({
    card: { ...card, cardFlowV2Identity: updatedIdentity, cardFlowV2Market: promotedMarket },
  });
  audit = applyStaffCorrection(audit, {
    status: "staff_confirmed_v2",
    correctedName: suspect.canonicalName ?? suspect.label,
    correctedVariant: suspect.finish,
    notes: "Directive 005B validation confirm",
    reviewedBy: "validate-directive-005b",
  });
  audit = { ...audit, v2StaffMarketPromotion: promotion };

  return {
    ...card,
    cardFlowV2Identity: updatedIdentity,
    cardFlowV2Market: promotedMarket,
    cardFlowV2Audit: audit,
    promotion,
  };
}

async function clearConfirmation(
  card: NonNullable<Awaited<ReturnType<typeof dataStore.getCard>>>,
) {
  const identity = clearStaffSuspectSelection(card.cardFlowV2Identity!);
  const market = card.cardFlowV2Market
    ? clearStaffConfirmedMarket(card.cardFlowV2Market)
    : undefined;
  const audit = runCardAuditV2({
    card: { ...card, cardFlowV2Identity: identity, cardFlowV2Market: market },
  });
  return { ...card, cardFlowV2Identity: identity, cardFlowV2Market: market, cardFlowV2Audit: audit };
}

async function main() {
  loadEnv();
  console.log("=== Directive 005B Validation ===\n");

  let card = await dataStore.getCard(GRUSHA_ID);
  if (!card?.cardFlowV2Identity || !card.cardFlowV2Market) {
    throw new Error("Grusha missing V2 bundles — run reprocess-card-v2 first");
  }

  console.log("1. BEFORE confirmation");
  console.log(JSON.stringify(summarizeCard(card), null, 2));

  const beforeMode = card.cardFlowV2Market.mode;
  const beforeSnapshots = card.cardFlowV2Market.snapshots.length;
  const reverseBefore = findSnapshotForSuspect(card.cardFlowV2Market, REVERSE_SUSPECT_ID);

  console.log("\n2. CONFIRM reverse holo (promote prepared snapshot)");
  const t0 = Date.now();
  const confirmed = await confirmReverseHolo(card);
  const confirmMs = Date.now() - t0;
  await dataStore.saveCard(confirmed);
  card = confirmed;

  console.log(`   Confirm completed in ${confirmMs}ms`);
  console.log(JSON.stringify(summarizeCard(card), null, 2));

  const checks = {
    instant: confirmMs < 5000,
    mode: card.cardFlowV2Market?.mode === "staff_confirmed_identity_market",
    selected: card.cardFlowV2Market?.selectedSuspectId === REVERSE_SUSPECT_ID,
    promoted: card.cardFlowV2Market?.staffConfirmedPromotion?.promotedFromSnapshot === true,
    snapshotsKept: (card.cardFlowV2Market?.snapshots.length ?? 0) >= beforeSnapshots,
    auditBasis: card.cardFlowV2Audit?.v2IdentityBasis === "staff_confirmed",
    comparable: card.cardFlowV2Audit?.priceComparison.agreement !== "not_comparable",
  };
  console.log("\n   Checks:", checks);

  console.log("\n3. CLEAR confirmation");
  card = await clearConfirmation(card);
  await dataStore.saveCard(card);
  console.log(JSON.stringify(summarizeCard(card), null, 2));
  const clearChecks = {
    mode: card.cardFlowV2Market?.mode === "candidate_market_comparison",
    noSelection: !card.cardFlowV2Identity?.staffSelection,
    snapshotsPreserved: (card.cardFlowV2Market?.snapshots.length ?? 0) >= beforeSnapshots,
    reverseStillHasComps:
      (findSnapshotForSuspect(card.cardFlowV2Market!, REVERSE_SUSPECT_ID)?.acceptedComps.length ?? 0) > 0,
  };
  console.log("\n   Checks:", clearChecks);

  console.log("\n4. RE-CONFIRM reverse holo");
  card = await confirmReverseHolo(card);
  await dataStore.saveCard(card);
  console.log(JSON.stringify(summarizeCard(card), null, 2));

  console.log("\n5. MISSING SNAPSHOT (unit simulation)");
  const mockSuspect: CardSuspect = {
    suspectId: "test:missing",
    category: "pokemon",
    label: "Missing snapshot test",
    catalogSource: "unknown",
    variantTags: [],
    expectedEvidence: [],
    canonicalName: "Test",
    finish: "normal",
  };
  const missingEval = evaluateSnapshotReuse({
    snapshot: undefined,
    suspect: mockSuspect,
    marketCreatedAt: new Date().toISOString(),
  });
  console.log("   missing snapshot:", missingEval);

  console.log("\n6. LOW CONFIDENCE / NO COMP (unit simulation)");
  const lowSnap = findSnapshotForSuspect(card.cardFlowV2Market!, REVERSE_SUSPECT_ID)!;
  const lowEval = evaluateSnapshotReuse({
    snapshot: {
      ...lowSnap,
      acceptedComps: [],
      confidence: "none",
      pricingMethod: "no_accepted_sold_comps",
    },
    suspect: getStaffSelectedSuspect(card.cardFlowV2Identity!)!,
    marketCreatedAt: new Date().toISOString(),
  });
  console.log("   no comps:", lowEval);

  const allPass =
    Object.values(checks).every(Boolean) &&
    Object.values(clearChecks).every(Boolean) &&
    missingEval.marketRefetchReason === "snapshot_missing" &&
    lowEval.canPromote &&
    lowEval.marketRefetchRequired;

  console.log(`\n=== RESULT: ${allPass ? "PASS" : "FAIL"} ===`);
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
