/**
 * Face/component segmentation diagnostic for split/MDFC/adventure/room cards.
 * Run: npx tsx scripts/diagnose-face-segmentation.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentCardFaces, segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const MULTIFACE_CATEGORIES = [
  "split/adventure",
  "sagas and rooms",
  "transforming cards",
  "aftermath",
  "modal double-faced",
];

const dev = JSON.parse(
  readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json"), "utf8"),
) as {
  cases: Array<{ id: string; category: string; oracleText: string; oracleId: string; cardFace?: string }>;
};

const cases = dev.cases.filter(
  (c) =>
    MULTIFACE_CATEGORIES.includes(c.category) ||
    c.oracleText.includes("\n//\n") ||
    c.oracleText.includes("Aftermath") ||
    /\bRoom\b/i.test(c.oracleText),
);

const results = cases.map((c) => {
  const faces = segmentCardFaces(c.oracleText);
  const extraction = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
  const spanIssues = extraction.actions.filter((a) => {
    const slice = c.oracleText.slice(a.evidenceStart, a.evidenceEnd);
    return slice !== a.evidenceText;
  });

  return {
    caseId: c.id,
    category: c.category,
    faceCount: faces.length,
    faces: faces.map((f) => ({
      faceId: f.faceId,
      componentType: f.componentType,
      start: f.start,
      end: f.end,
      abilityCount: segmentAbilities(c.oracleId, f.faceId, f.text, f.start).length,
    })),
    actionCount: extraction.actions.length,
    spanValid: spanIssues.length === 0,
    spanIssues: spanIssues.map((a) => a.evidenceText.slice(0, 40)),
  };
});

const outPath = resolve(process.cwd(), "reports", "oracle-action-face-segmentation-dev-v4.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      developmentSet: "development_set_v4",
      caseCount: results.length,
      allSpanValid: results.every((r) => r.spanValid),
      results,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`Face segmentation diagnostic: ${results.length} multifaced cases`);
console.log(`  all evidence spans valid: ${results.every((r) => r.spanValid)}`);
console.log(`  → ${outPath}`);
