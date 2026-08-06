/**
 * Unit checks for evidence-driven MTG List investigation (no network).
 * Run: npx tsx scripts/test-mtg-list-evidence.ts
 */
import assert from "node:assert/strict";
import type { CardSuspect, ImageEvidenceReport } from "../src/lib/card-flow-v2/types";
import {
  assessMtgListInvestigation,
  listInvestigationBlocksSetNumberNarrowing,
  shouldRunMtgListMarkInspection,
} from "../src/lib/card-flow-v2/mtg-list-evidence";
import { narrowSuspectsByObservedSetAndNumber } from "../src/lib/card-flow-v2/suspect-matcher";

function slot(
  field: string,
  value: string | null,
  status: "observed" | "unknown" = "observed",
  confidence = 0.9,
) {
  return { field, value, status, confidence, source: "front_image" as const, note: undefined };
}

function evidence(slots: ReturnType<typeof slot>[]): ImageEvidenceReport {
  return {
    imageUsability: "good",
    canAttemptIdentification: true,
    canAutoLockIdentity: false,
    detectedCardCount: 1,
    detectedSides: ["front"],
    visualProblems: [],
    extractedText: [],
    evidenceSlots: slots,
    missingCriticalEvidence: [],
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage: "",
    customerMessage: undefined,
  };
}

const eoeSuspect: CardSuspect = {
  suspectId: "scryfall:eoe:357:nonfoil",
  category: "mtg",
  label: "Anticausal Vestige · eoe #357",
  canonicalName: "Anticausal Vestige",
  catalogSource: "scryfall",
  catalogId: "x",
  setCode: "eoe",
  setName: "Edge of Eternities",
  collectorNumber: "357",
  finish: "nonfoil",
  variantTags: [],
  expectedEvidence: [],
  referenceImageUrls: [],
};

const wrongSuspect: CardSuspect = {
  ...eoeSuspect,
  suspectId: "scryfall:cmm:357",
  setCode: "cmm",
  setName: "Commander Masters",
  label: "Anticausal Vestige · cmm #357",
};

function testListMarkYesTriggersInvestigation() {
  const inv = assessMtgListInvestigation(
    evidence([slot("the_list_mark", "yes"), slot("card_name", "Yuriko")]),
    [],
  );
  assert.equal(inv.investigate, true);
  assert.ok(inv.reasons.includes("list_mark_yes"));
  assert.equal(
    shouldRunMtgListMarkInspection(
      evidence([slot("the_list_mark", "yes")]),
      inv,
    ),
    true,
  );
}

function testOriginRefCollectorLineTriggers() {
  const inv = assessMtgListInvestigation(
    evidence([
      slot("collector_number", "AFC-198"),
      slot("card_name", "Yuriko, the Tiger's Shadow"),
    ]),
    [],
  );
  assert.equal(inv.investigate, true);
  assert.ok(inv.reasons.includes("origin_ref_collector_line"));
}

function testExplicitNoSkipsMicroVisionUnlessOriginRef() {
  const ev = evidence([slot("the_list_mark", "no"), slot("set_code", "eoe")]);
  const inv = assessMtgListInvestigation(ev, []);
  assert.equal(inv.investigate, false);
  assert.equal(shouldRunMtgListMarkInspection(ev, inv), false);
}

function testNarrowBySetAndNumber() {
  const narrowed = narrowSuspectsByObservedSetAndNumber(
    [eoeSuspect, wrongSuspect],
    evidence([
      slot("set_code", "eoe"),
      slot("collector_number", "357"),
    ]),
  );
  assert.equal(narrowed.suspects.length, 1);
  assert.equal(narrowed.suspects[0]!.setCode, "eoe");
}

function testNarrowingSkippedDuringListInvestigation() {
  const inv = assessMtgListInvestigation(
    evidence([
      slot("the_list_mark", "yes"),
      slot("set_code", "AFC"),
      slot("collector_number", "198"),
    ]),
    [],
  );
  assert.equal(listInvestigationBlocksSetNumberNarrowing(inv), true);
  const narrowed = narrowSuspectsByObservedSetAndNumber(
    [eoeSuspect, wrongSuspect],
    evidence([
      slot("set_code", "eoe"),
      slot("collector_number", "357"),
    ]),
    { skipWhenListInvestigation: true },
  );
  assert.equal(narrowed.suspects.length, 2);
}

function main() {
  testListMarkYesTriggersInvestigation();
  testOriginRefCollectorLineTriggers();
  testExplicitNoSkipsMicroVisionUnlessOriginRef();
  testNarrowBySetAndNumber();
  testNarrowingSkippedDuringListInvestigation();
  console.log("test-mtg-list-evidence: all passed");
}

main();
