/**
 * Guide-driven MTG detective question planner tests.
 * Run: npx tsx scripts/test-detective-question-planner.ts
 */
import assert from "node:assert/strict";
import type { ImageEvidenceReport } from "../src/lib/card-flow-v2/types";
import { MTG_DETECTIVE_GUIDE } from "../src/lib/card-flow-v2/knowledge/mtg";
import { planMtgDetectiveQuestions } from "../src/lib/card-flow-v2/detective-question-planner";

function slot(
  field: string,
  value: string | null,
  status: "observed" | "inferred" | "unknown" = "observed",
  confidence = 0.95,
  note?: string,
) {
  return {
    field,
    value,
    status,
    confidence,
    source: "front_image" as const,
    note,
  };
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
  };
}

function testHighConfidencePrintingPlansListAndFoil() {
  const questions = planMtgDetectiveQuestions(
    MTG_DETECTIVE_GUIDE,
    evidence([
      slot("card_name", "Yuriko, the Tiger's Shadow"),
      slot("set_code", "C18"),
      slot("collector_number", "052/307"),
      slot("the_list_mark", "no", "inferred", 0.9),
      slot("foil_pattern", "nonfoil", "inferred", 0.9),
    ]),
  );
  assert.ok(questions.some((q) => q.id === "mtg_list_mark"));
  assert.ok(questions.some((q) => q.id === "mtg_foil_finish"));
}

function testMicroVisionResolvedSkipsList() {
  const questions = planMtgDetectiveQuestions(
    MTG_DETECTIVE_GUIDE,
    evidence([
      slot("card_name", "Yuriko, the Tiger's Shadow"),
      slot("set_code", "C18"),
      slot("collector_number", "052/307"),
      slot("the_list_mark", "no", "observed", 0.92, "List mark micro-vision (clear crop): not visible"),
    ]),
  );
  assert.equal(questions.some((q) => q.id === "mtg_list_mark"), false);
}

function testOriginRefForcesListQuestion() {
  const questions = planMtgDetectiveQuestions(
    MTG_DETECTIVE_GUIDE,
    evidence([
      slot("card_name", "Yuriko, the Tiger's Shadow"),
      slot("collector_number", "AFC-198"),
    ]),
  );
  assert.equal(questions[0]?.id, "mtg_list_mark");
}

function main() {
  testHighConfidencePrintingPlansListAndFoil();
  testMicroVisionResolvedSkipsList();
  testOriginRefForcesListQuestion();
  console.log("test-detective-question-planner: all passed");
}

main();
