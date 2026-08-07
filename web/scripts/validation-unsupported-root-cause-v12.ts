/**
 * Document root causes for accepted unsupported extractions on validation_set_v2.
 * Run: npx tsx scripts/validation-unsupported-root-cause-v12.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { HELD_OUT_CARD_NAMES } from "./validation-held-out-card-names";

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
      "Restrict search_library pattern to require 'search (your|their) library' OR 'from your library' in evidence; route hand-origin 'put ... onto the battlefield' to play primitive or needs_review.",
    proposedRouting: "needs_review",
    reviewer: "catalog-audit-agent",
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
      "Require library zone token in evidence for search_library classification; hand/graveyard/exile source puts use return_to_battlefield or play/cast permission rules.",
    proposedRouting: "needs_review",
    reviewer: "catalog-audit-agent",
  },
  {
    caseId: "held-0010",
    cardName: HELD_OUT_CARD_NAMES["held-0010"],
    patternFired: "draws? (?:a |one |two |...)?cards?",
    actionTypeAssigned: "draw",
    evidenceSpan: "draws cards",
    whyUnsupported:
      "Third-person 'draws cards equal to' inside compound clause — inferSupported heuristics require 'draw' capitalized or 'draw a/one/two cards' form.",
    confidence: 0.9,
    whyAccepted:
      "Draw pattern matches 'draws cards'; promoted despite evaluator support heuristic gap (counts as genuinely_unsupported in authoritative tally when unmatched).",
    safestGeneralCorrection:
      "Extend draw pattern for third-person 'draws N cards' AND ensure compound 'discards... then draws' clause split; do not card-specifically gate Windfall.",
    proposedRouting: "accepted",
    reviewer: "catalog-audit-agent",
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
        commitSha: "39a1e6108b97f084565e9151f5f3eef953762885",
        validationSet: "validation_set_v2",
        recordCount: UNSUPPORTED_ACCEPTED_ROOT_CAUSES.length,
        records: UNSUPPORTED_ACCEPTED_ROOT_CAUSES,
        note: "Parser not modified in this milestone — corrections apply to next development-driven iteration only.",
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
