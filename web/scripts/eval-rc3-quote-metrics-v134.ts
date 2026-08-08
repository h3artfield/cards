/**
 * QuoteSpanDetector + GrantedRulesClassifier metrics on granted development set.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectQuoteSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { classifyAllQuotedSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function loadGrantedCases(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote");
}

function main() {
  const cases = loadGrantedCases();

  let quoteGoldSpans = 0;
  let quoteDetected = 0;
  let quoteFalsePositive = 0;
  let grantedGold = 0;
  let grantedClassified = 0;
  let grantedFalsePositive = 0;

  for (const testCase of cases) {
    const goldQuotes = testCase.expectedPrimitiveActions.filter(
      (g) =>
        !g.negative &&
        !/cast from exile|you may cast .*remains exiled|whenever you discard/i.test(g.evidenceContains ?? ""),
    );

    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const spans = detectQuoteSpans(ability.paragraphText);
        const classified = classifyAllQuotedSpans(ability.paragraphText, spans);

        for (const gold of goldQuotes) {
          const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase().slice(0, 12);
          const shouldQuote = ability.paragraphText.toLowerCase().includes(needle);
          if (!shouldQuote) continue;
          quoteGoldSpans++;
          grantedGold++;
          const hit = spans.some((s) => s.innerText.toLowerCase().includes(needle));
          if (hit) quoteDetected++;
          const grantedHit = classified.some(
            (c) => c.classification === "granted_rules_ability" && c.span.innerText.toLowerCase().includes(needle),
          );
          if (grantedHit) grantedClassified++;
        }

        for (const span of spans) {
          const isGold = goldQuotes.some((g) =>
            span.innerText.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
          );
          if (!isGold) quoteFalsePositive++;
        }
        for (const entry of classified) {
          if (entry.classification !== "granted_rules_ability") continue;
          const isGold = goldQuotes.some((g) =>
            entry.span.innerText.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
          );
          if (!isGold) grantedFalsePositive++;
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: "granted_ability_quote_catalog_v133",
    caseCount: cases.length,
    quoteSpanDetector: {
      goldQuoteTargets: quoteGoldSpans,
      detected: quoteDetected,
      falsePositives: quoteFalsePositive,
      recall: quoteGoldSpans > 0 ? quoteDetected / quoteGoldSpans : 1,
      precision: quoteDetected + quoteFalsePositive > 0 ? quoteDetected / (quoteDetected + quoteFalsePositive) : 1,
    },
    grantedRulesClassifier: {
      goldGrantedTargets: grantedGold,
      classifiedGrantedRules: grantedClassified,
      falsePositives: grantedFalsePositive,
      recall: grantedGold > 0 ? grantedClassified / grantedGold : 1,
      precision:
        grantedClassified + grantedFalsePositive > 0
          ? grantedClassified / (grantedClassified + grantedFalsePositive)
          : 1,
    },
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "quote-detector-metrics-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
