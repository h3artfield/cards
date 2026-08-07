/**
 * Tutor/compound-action gold audit — search + put + shuffle mismatches.
 * Run: npx tsx scripts/audit-tutor-compound-gold-v21.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

const TUTOR_PATTERN = /\bsearch (?:your |their )?library for\b/i;

async function main() {
  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v20.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const entries: Array<Record<string, unknown>> = [];

  for (const testCase of dev.cases) {
    if (!TUTOR_PATTERN.test(testCase.oracleText)) continue;
    const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const accepted = raw.actions.filter((a) => a.reviewStatus === "accepted");

    const hasPutOracle = /\bput (?:that |it(?:self)? )(?:card )?onto the battlefield\b/i.test(testCase.oracleText);
    const hasShuffleOracle = /\b(?:then )?shuffle\b/i.test(testCase.oracleText);

    const goldSearch = gold.some((g) => g.actionType === "search_library");
    const goldPut = gold.some((g) => g.actionType === "put_onto_battlefield");
    const goldShuffle = gold.some((g) => g.actionType === "shuffle_into_library");

    const parserPut = accepted.filter((a) => a.actionType === "put_onto_battlefield");
    const parserSearch = accepted.filter((a) => a.actionType === "search_library");
    const parserShuffle = accepted.filter((a) => a.actionType === "shuffle_into_library");

    const missingGoldPut = hasPutOracle && !goldPut && parserPut.length > 0;
    const missingGoldShuffle = hasShuffleOracle && !goldShuffle && parserShuffle.length > 0;
    const parserFpPut =
      parserPut.length > 0 &&
      !goldPut &&
      gold.some((g) => g.actionType === "search_library") &&
      !hasPutOracle;

    if (missingGoldPut || missingGoldShuffle || parserFpPut || (hasPutOracle && goldSearch && !goldPut)) {
      entries.push({
        caseId: testCase.id,
        card: testCase.cardName,
        hasPutOracle,
        hasShuffleOracle,
        gold: { search: goldSearch, put: goldPut, shuffle: goldShuffle },
        parser: {
          search: parserSearch.map((a) => a.evidenceText.slice(0, 50)),
          put: parserPut.map((a) => a.evidenceText.slice(0, 50)),
          shuffle: parserShuffle.map((a) => a.evidenceText.slice(0, 50)),
        },
        verdict: missingGoldPut
          ? "missing_compound_gold_put"
          : missingGoldShuffle
            ? "missing_compound_gold_shuffle"
            : parserFpPut
              ? "parser_false_positive_put"
              : "review_compound_gold",
        goldEntries: gold.map((g) => ({ type: g.actionType, evidence: g.evidenceContains })),
      });
    }
  }

  const byVerdict = entries.reduce(
    (m, e) => {
      const v = e.verdict as string;
      m[v] = (m[v] ?? 0) + 1;
      return m;
    },
    {} as Record<string, number>,
  );

  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const outPath = resolve(process.cwd(), "reports/tutor-compound-gold-audit-v20.json");
  writeFileSync(outPath, JSON.stringify({ byVerdict, entries }, null, 2));
  console.log(JSON.stringify({ outPath, byVerdict, total: entries.length }, null, 2));
}

main();
