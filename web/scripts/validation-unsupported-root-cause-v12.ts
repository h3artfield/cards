/**
 * Document root causes for accepted unsupported extractions — updated after taxonomy v1.2.
 * Run: npx tsx scripts/validation-unsupported-root-cause-v12.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { HELD_OUT_CARD_NAMES } from "./validation-held-out-card-names";

/** Resolved in validation_set_v4 + evaluator v1.2 — no longer genuinely_unsupported. */
export const RESOLVED_V12_AUDIT_CASES = [
  {
    caseId: "held-0025",
    cardName: HELD_OUT_CARD_NAMES["held-0025"],
    priorClassification: "genuinely_unsupported_extraction (search_library mislabel)",
    v12Resolution: "validation_set_v4 gold adds put_onto_battlefield; parser FP reclassified as wrong_primitive_action_type",
    rootCause: "missing_gold_label + parser search_library over-match",
  },
  {
    caseId: "held-0058",
    cardName: HELD_OUT_CARD_NAMES["held-0058"],
    priorClassification: "genuinely_unsupported_extraction (search_library mislabel)",
    v12Resolution: "validation_set_v4 gold adds put_onto_battlefield; parser FP reclassified as wrong_primitive_action_type",
    rootCause: "missing_gold_label + parser search_library over-match",
  },
  {
    caseId: "held-0010",
    cardName: HELD_OUT_CARD_NAMES["held-0010"],
    priorClassification: "genuinely_unsupported_extraction (evaluator draw heuristic)",
    v12Resolution: "Gold unchanged; inferSupportedPrimitiveFromEvidence now matches third-person 'draws cards'. Accepted TP 2/2.",
    rootCause: "evaluator_defect",
  },
];

/** @deprecated Pre-v1.2 records — retained for audit trail only. */
export const UNSUPPORTED_ACCEPTED_ROOT_CAUSES = [
  {
    caseId: "held-0025",
    cardName: HELD_OUT_CARD_NAMES["held-0025"],
    patternFired: "You may put [\\w ]+ onto the battlefield",
    actionTypeAssigned: "search_library",
    evidenceSpan: "You may put a land card from your hand onto the battlefield",
    whyUnsupported:
      "Hand→battlefield put permission is play-land semantics, not library search. inferSupportedPrimitiveFromEvidence returns null.",
    confidence: 0.9,
    whyAccepted:
      "Pattern requiresPermissionVerb false but matches search_library put-onto-battlefield regex; confidence 0.9 exceeds promotion threshold with no structural uncertainty gate for hand-origin puts.",
    safestGeneralCorrection:
      "Restrict search_library pattern to require 'search (your|their) library' OR 'from your library' in evidence; route hand-origin 'put ... onto the battlefield' to put_onto_battlefield primitive.",
    proposedRouting: "wrong_primitive_until_parser_v1.13",
    reviewer: "catalog-audit-agent",
    resolvedIn: "validation_set_v4 + three-layer-v1.2",
  },
  {
    caseId: "held-0058",
    cardName: HELD_OUT_CARD_NAMES["held-0058"],
    patternFired: "You may put [\\w ]+ onto the battlefield",
    actionTypeAssigned: "search_library",
    evidenceSpan:
      "you may put a creature card with mana value equal to the number of charge counters on this artifact from your hand onto the battlefield",
    whyUnsupported:
      "Creature put from hand onto battlefield is not search_library; no library zone in evidence span.",
    confidence: 0.9,
    whyAccepted:
      "Same overly broad put-onto-battlefield pattern as Growth Spiral family; promoted at 0.9 without zone guard.",
    safestGeneralCorrection:
      "Require library zone token in evidence for search_library classification; hand-origin puts use put_onto_battlefield.",
    proposedRouting: "wrong_primitive_until_parser_v1.13",
    reviewer: "catalog-audit-agent",
    resolvedIn: "validation_set_v4 + three-layer-v1.2",
  },
  {
    caseId: "held-0010",
    cardName: HELD_OUT_CARD_NAMES["held-0010"],
    patternFired: "draws? (?:a |one |two |...)?cards?",
    actionTypeAssigned: "draw",
    evidenceSpan: "draws cards",
    whyUnsupported:
      "Third-person 'draws cards equal to' inside compound clause — inferSupported heuristics require 'draw' not 'draws'.",
    confidence: 0.9,
    whyAccepted:
      "Draw pattern matches 'draws cards'; promoted despite evaluator support heuristic gap.",
    safestGeneralCorrection:
      "Extend draw pattern for third-person 'draws N cards' AND ensure compound 'discards... then draws' clause split.",
    proposedRouting: "accepted",
    reviewer: "catalog-audit-agent",
    resolvedIn: "evaluator fix in oracle-action-eval-shared.ts (gold unchanged)",
  },
];

function main() {
  const outPath = resolve(process.cwd(), "reports", "oracle-action-unsupported-root-cause-v12.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        validationSet: "validation_set_v4",
        taxonomyVersion: "three-layer-v1.2",
        recordCount: UNSUPPORTED_ACCEPTED_ROOT_CAUSES.length,
        resolvedV12AuditCases: RESOLVED_V12_AUDIT_CASES,
        records: UNSUPPORTED_ACCEPTED_ROOT_CAUSES,
        note: "Original three v12 audit cases resolved. Parser grammar unchanged — put_onto_battlefield emission deferred to development_set_v8-driven v1.13 work.",
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("Wrote", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("validation-unsupported-root-cause-v12.ts")) {
  main();
}
