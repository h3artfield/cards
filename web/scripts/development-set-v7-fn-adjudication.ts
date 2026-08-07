/**
 * Manual FN adjudication records for development_set_v7 (all 14 pre-v7 emission false negatives).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { REVIEWER_ID } from "./oracle-action-eval-shared";

export interface FnAdjudicationRecord {
  caseId: string;
  oracleText: string;
  expectedPrimitive: string;
  evidenceSpan: string;
  parserOutput: string[];
  verdict: "parser_defect" | "gold_defect" | "structural_only_text";
  resolution: string;
  reviewer: string;
}

export const V7_FN_ADJUDICATION: FnAdjudicationRecord[] = [
  {
    caseId: "eval-0040",
    oracleText:
      "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Kolaghan's Command deals 2 damage to any target.\n• Destroy target artifact or enchantment.\n• Each player discards their hand, then draws that many cards.",
    expectedPrimitive: "discard",
    evidenceSpan: "discards",
    parserOutput: [],
    verdict: "parser_defect",
    resolution: "Extend discard pattern for 'discards their hand' in modal bullet.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0040",
    oracleText:
      "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Kolaghan's Command deals 2 damage to any target.\n• Destroy target artifact or enchantment.\n• Each player discards their hand, then draws that many cards.",
    expectedPrimitive: "draw",
    evidenceSpan: "draws",
    parserOutput: [],
    verdict: "parser_defect",
    resolution: "Extend draw pattern for 'draws that many cards' after compound-then split.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0049",
    oracleText:
      "(As this Saga enters and after your draw step, add a lore counter.)\nI — Each opponent sacrifices a creature or planeswalker.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control.",
    expectedPrimitive: "sacrifice",
    evidenceSpan: "sacrifices",
    parserOutput: [],
    verdict: "parser_defect",
    resolution: "Add third-person sacrifice pattern (Each opponent sacrifices).",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0054",
    oracleText:
      "+1: Each player discards a card.\n-2: Target player sacrifices a creature.\n-6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.",
    expectedPrimitive: "sacrifice",
    evidenceSpan: "sacrifices",
    parserOutput: [],
    verdict: "parser_defect",
    resolution: "Add third-person sacrifice pattern (Target/That player sacrifices).",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0064",
    oracleText: "",
    expectedPrimitive: "play",
    evidenceSpan: "graveyard",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove play gold — Flashback is structural permission, not standalone play action.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0083",
    oracleText: "",
    expectedPrimitive: "return_to_battlefield",
    evidenceSpan: "from your graveyard to your hand",
    parserOutput: [],
    verdict: "gold_defect",
    resolution: "Remove duplicate return_to_battlefield; destination is hand (return_to_hand only).",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0120",
    oracleText: "",
    expectedPrimitive: "sacrifice",
    evidenceSpan: "sacrifice a Treasure",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove sacrifice gold — appears in Whenever trigger condition, not Layer-2 effect.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0137",
    oracleText: "",
    expectedPrimitive: "return_to_battlefield",
    evidenceSpan: "from your graveyard to your hand",
    parserOutput: [],
    verdict: "gold_defect",
    resolution: "Remove duplicate return_to_battlefield; keep return_to_hand only.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0150",
    oracleText: "",
    expectedPrimitive: "search_library",
    evidenceSpan: "Reveal",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove search_library gold — reveal top card is not search_library.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0196",
    oracleText: "",
    expectedPrimitive: "draw",
    evidenceSpan: "draw a card",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove draw from Whenever condition clause; keep triggered create_token effect only.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0200",
    oracleText: "",
    expectedPrimitive: "draw",
    evidenceSpan: "draw",
    parserOutput: [],
    verdict: "gold_defect",
    resolution: "Remove erroneous draw gold from prototype reminder line.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "eval-0202",
    oracleText: "",
    expectedPrimitive: "draw",
    evidenceSpan: "draw",
    parserOutput: [],
    verdict: "gold_defect",
    resolution: "Remove erroneous draw gold from Mutate keyword line.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "dev-opt-016",
    oracleText: "",
    expectedPrimitive: "return_to_battlefield",
    evidenceSpan: "Choose up to one card of each card type",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove return_to_battlefield gold — choose-from-graveyard without battlefield destination.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "dev-opt-038",
    oracleText: "",
    expectedPrimitive: "copy",
    evidenceSpan: "choose new targets for the copy",
    parserOutput: [],
    verdict: "structural_only_text",
    resolution: "Remove second copy gold for target retargeting; single copy primitive only.",
    reviewer: REVIEWER_ID,
  },
];

function enrichWithParserOutput(
  records: FnAdjudicationRecord[],
  cases: OracleActionEvalCaseV2[],
): FnAdjudicationRecord[] {
  return records.map((record) => {
    const testCase = cases.find((c) => c.id === record.caseId);
    if (!testCase) return record;
    const oracleText = record.oracleText || testCase.oracleText;
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const parserOutput = raw.actions.map(
      (a) => `${normalizeToPrimitive(a.actionType, a.evidenceText)}:${a.evidenceText} (${a.reviewStatus})`,
    );
    return { ...record, oracleText, parserOutput };
  });
}

export function writeFnAdjudicationReport(cases: OracleActionEvalCaseV2[], outPath: string) {
  const enriched = enrichWithParserOutput(V7_FN_ADJUDICATION, cases);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        reviewer: REVIEWER_ID,
        dataset: "development_set_v7",
        recordCount: enriched.length,
        records: enriched,
      },
      null,
      2,
    ),
    "utf8",
  );
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const v6Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");
  const v6 = JSON.parse(readFileSync(v6Path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const outPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v7-fn-adjudication.json");
  writeFnAdjudicationReport(v6.cases, outPath);
  console.log("Wrote", outPath);
}
