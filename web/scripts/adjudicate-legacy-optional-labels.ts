/**
 * Formal adjudication of legacy optional:true labels conflated with up-to,
 * modal, or incorrect scope attachment.
 * Run: npx tsx scripts/adjudicate-legacy-optional-labels.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

export type LegacyOptionalRelabelDecision =
  | "target_or_quantity_may_be_zero"
  | "up_to_constraint"
  | "modal_choice"
  | "optional_cost"
  | "optional_effect"
  | "incorrect_gold_label";

export interface LegacyOptionalAdjudicationRow {
  caseId: string;
  oracleId: string;
  actionType: string;
  evidenceContains: string;
  originalLabel: { optional?: boolean; optionalEffect?: boolean; optionalCost?: boolean };
  decision: LegacyOptionalRelabelDecision;
  correctedLabel: Partial<ExpectedPrimitiveAction>;
  reason: string;
  reviewer: string;
}

const REVIEWER = "legacy-optional-label-adjudicator";

function parseUpToMaximum(oracle: string): number | "X" | undefined {
  const m = oracle.match(/\bup to (one|two|three|four|five|\d+|X)\b/i);
  if (!m) return undefined;
  const word = m[1].toLowerCase();
  const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  if (word === "x") return "X";
  return map[word] ?? Number.parseInt(word, 10);
}

function findParagraphContaining(oracle: string, evidence: string): string {
  const parts = oracle.split(/\n|(?=[+\−-]\d+:)/);
  for (const part of parts) {
    if (part.toLowerCase().includes(evidence.toLowerCase().slice(0, Math.min(24, evidence.length)))) {
      return part.trim();
    }
  }
  return oracle;
}

export function adjudicateLegacyOptionalLabel(
  testCase: OracleActionEvalCaseV2,
  label: ExpectedPrimitiveAction,
): LegacyOptionalAdjudicationRow | null {
  const hadLegacyOptional = label.optional === true || label.optionalEffect === true || label.optionalCost === true;
  if (!hadLegacyOptional) return null;

  const oracle = testCase.oracleText;
  const evidence = label.evidenceContains;
  const paragraph = findParagraphContaining(oracle, evidence);
  const hasMayInOracle = /\bmay\b/i.test(paragraph);
  const hasMayInEvidence = /\bmay\b/i.test(evidence);

  const base = {
    caseId: testCase.id,
    oracleId: testCase.oracleId,
    actionType: label.actionType,
    evidenceContains: evidence,
    originalLabel: {
      optional: label.optional,
      optionalEffect: label.optionalEffect,
      optionalCost: label.optionalCost,
    },
    reviewer: REVIEWER,
  };

  if (/\bAs an additional cost[^.]+\byou may\b/i.test(oracle)) {
    return {
      ...base,
      decision: "optional_cost",
      correctedLabel: {
        optionalCost: true,
        optionalEffect: false,
        optional: undefined,
      },
      reason: "May appears in an additional-cost clause — optional cost, not optional effect.",
    };
  }

  if (!hasMayInOracle && !hasMayInEvidence) {
    if (/\bup to\b/i.test(paragraph)) {
      const max = parseUpToMaximum(oracle);
      return {
        ...base,
        decision: "up_to_constraint",
        correctedLabel: {
          optional: undefined,
          optionalEffect: false,
          targetMaximum: max,
          quantityMayBeZero: true,
        },
        reason: "Legacy optional:true conflated up-to quantity constraint with may optionality.",
      };
    }
    if (/\bAny number of target/i.test(paragraph)) {
      return {
        ...base,
        decision: "target_or_quantity_may_be_zero",
        correctedLabel: {
          optional: undefined,
          optionalEffect: false,
          targetMinimum: 0,
          quantityMayBeZero: true,
        },
        reason: "Any-number targeting permits zero — not may optionality.",
      };
    }
    if (/\bChoose one\b|\bChoose two\b|\bChoose three\b/i.test(paragraph)) {
      return {
        ...base,
        decision: "modal_choice",
        correctedLabel: {
          optional: undefined,
          optionalEffect: false,
        },
        reason: "Modal choice is separate from may optionality.",
      };
    }
    return {
      ...base,
      decision: "incorrect_gold_label",
      correctedLabel: { optional: undefined, optionalEffect: false },
      reason: "Oracle text contains no may — optional flag was incorrect.",
    };
  }

  const evidenceIdx = paragraph.toLowerCase().indexOf(evidence.toLowerCase().slice(0, Math.min(20, evidence.length)));
  const mayMatches = [...paragraph.matchAll(/\bmay\b/gi)];
  const governingMay = mayMatches.find(
    (m) => evidenceIdx >= 0 && m.index !== undefined && m.index < evidenceIdx + evidence.length,
  );

  if (hasMayInOracle && !governingMay && !hasMayInEvidence) {
    if (/\bup to\b/i.test(evidence)) {
      const max = parseUpToMaximum(evidence);
      return {
        ...base,
        decision: "up_to_constraint",
        correctedLabel: {
          optional: undefined,
          optionalEffect: false,
          targetMaximum: max,
          quantityMayBeZero: true,
        },
        reason: "Evidence uses up-to constraint; may elsewhere in paragraph does not govern this action.",
      };
    }
    return {
      ...base,
      decision: "incorrect_gold_label",
      correctedLabel: { optional: undefined, optionalEffect: false },
      reason: "May in oracle does not govern this evidence span — separate non-optional action.",
    };
  }

  if (/\bchoose new targets\b/i.test(paragraph) && label.actionType === "copy" && !hasMayInEvidence) {
    return {
      ...base,
      decision: "incorrect_gold_label",
      correctedLabel: { optional: undefined, optionalEffect: false },
      reason: "Copy is mandatory; optional choose-new-targets is a separate scope.",
    };
  }

  return {
    ...base,
    decision: "optional_effect",
    correctedLabel: {
      optionalEffect: true,
      optional: undefined,
    },
    reason: "May governs this action — normalize to optionalEffect.",
  };
}

export function applyLegacyOptionalAdjudications(cases: OracleActionEvalCaseV2[]): {
  cases: OracleActionEvalCaseV2[];
  adjudications: LegacyOptionalAdjudicationRow[];
} {
  const cloned = structuredClone(cases);
  const adjudications: LegacyOptionalAdjudicationRow[] = [];

  for (const testCase of cloned) {
    for (const label of testCase.expectedPrimitiveActions) {
      const row = adjudicateLegacyOptionalLabel(testCase, label);
      if (!row) continue;
      adjudications.push(row);
      delete label.optional;
      delete label.optionalEffect;
      delete label.optionalCost;
      Object.assign(label, row.correctedLabel);
    }
    if (testCase.expectedStructure?.optional && !/\bmay\b/i.test(testCase.oracleText)) {
      delete testCase.expectedStructure.optional;
    }
  }

  return { cases: cloned, adjudications };
}

function main() {
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v2.json");
  const outPath = resolve(process.cwd(), "reports", "oracle-action-legacy-optional-label-adjudication.json");

  const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const { adjudications } = applyLegacyOptionalAdjudications(v2.cases);

  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        reviewer: REVIEWER,
        totalAdjudications: adjudications.length,
        byDecision: Object.fromEntries(
          [...new Set(adjudications.map((a) => a.decision))].map((d) => [
            d,
            adjudications.filter((a) => a.decision === d).length,
          ]),
        ),
        adjudications,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Legacy optional adjudications: ${adjudications.length}`);
  for (const [d, c] of Object.entries(
    Object.fromEntries(
      [...new Set(adjudications.map((a) => a.decision))].map((d) => [
        d,
        adjudications.filter((a) => a.decision === d).length,
      ]),
    ),
  )) {
    console.log(`  ${d}: ${c}`);
  }
  console.log(`→ ${outPath}`);
}

if (process.argv[1]?.includes("adjudicate-legacy-optional-labels")) {
  main();
}
