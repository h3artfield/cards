/**
 * Inventory Category B (gold_incomplete) cases before manual completion.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function load(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function inventory(setName: string, path: string) {
  const env = load(path);
  const cases = env.cases as Array<{
    id: string;
    oracleId: string;
    cardName?: string;
    invalidPriorTextDisposition?: string;
    goldCompletenessStatus?: string;
    expectedPrimitiveActions: unknown[];
    expectedStructure?: unknown;
    forbiddenPrimitiveActions?: unknown[];
  }>;

  const categoryB = cases.filter(
    (c) =>
      c.invalidPriorTextDisposition === "gold_incomplete" ||
      c.goldCompletenessStatus === "incomplete",
  );

  const reviewClassifications =
    env.secondPassGoldReview?.invalidPriorText?.classifications ??
    env.categoryBGoldCompletion?.classifications ??
    [];

  const byReason: Record<string, number> = {};
  const entries = categoryB.map((c) => {
    const cls = reviewClassifications.find((x: { caseId: string }) => x.caseId === c.id);
    const reasons = cls?.reasons ?? ["marked gold_incomplete on case"];
    for (const r of reasons) {
      byReason[r] = (byReason[r] ?? 0) + 1;
    }
    return {
      caseId: c.id,
      oracleId: c.oracleId,
      cardName: c.cardName,
      reasons,
      primitiveCount: c.expectedPrimitiveActions.length,
      hasStructure: !!c.expectedStructure,
      hasForbidden: (c.forbiddenPrimitiveActions?.length ?? 0) > 0,
    };
  });

  return { setName, total: cases.length, categoryBCount: categoryB.length, byReason, entries };
}

const dev = inventory("development_set_v12", "data/oracle-action-eval-development-v12.json");
const val = inventory("validation_set_v7", "data/oracle-action-eval-validation-v7.json");

console.log(JSON.stringify({ development: dev, validation: val }, null, 2));
