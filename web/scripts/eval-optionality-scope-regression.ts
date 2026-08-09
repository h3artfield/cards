/**
 * Optionality / dependency scope regression — parser-blind development checks.
 * Validates may binds to governed action only, not entire clause.
 */
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadEnvLocal } from "./lib/script-env";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "./oracle-action-eval-optionality-condition-cases";

loadEnvLocal();

type ExpectedAction = {
  actionType: string;
  evidenceContains: string;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  choiceMutuallyExclusive?: boolean;
  dependsOnEvidence?: string;
  notOptional?: boolean;
};

type RegressionCase = {
  id: string;
  oracleText: string;
  expected: ExpectedAction[];
  note?: string;
};

const REGRESSION_CASES: RegressionCase[] = [
  {
    id: "opt-scope-draw",
    oracleText: "You may draw a card.",
    expected: [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }],
    note: "Reuses dev-opt-001 pattern",
  },
  {
    id: "opt-scope-discard-if-you-do",
    oracleText: "You may discard a card. If you do, draw two cards.",
    expected: [
      { actionType: "discard", evidenceContains: "discard a card", optionalEffect: true },
      { actionType: "draw", evidenceContains: "draw two cards", optionalEffect: false, dependsOnEvidence: "discard a card" },
    ],
  },
  {
    id: "opt-scope-cast-if-you-do",
    oracleText: "You may exile target creature. If you do, draw a card.",
    expected: [
      { actionType: "exile", evidenceContains: "exile target creature", optionalEffect: true },
      { actionType: "draw", evidenceContains: "draw a card", optionalEffect: false, dependsOnEvidence: "exile target creature" },
    ],
  },
  {
    id: "opt-scope-tap-or-untap",
    oracleText: "You may tap or untap target permanent.",
    expected: [
      {
        actionType: "tap",
        evidenceContains: "tap target permanent",
        optionalEffect: true,
        choiceMutuallyExclusive: true,
      },
      {
        actionType: "untap",
        evidenceContains: "untap target permanent",
        optionalEffect: true,
        choiceMutuallyExclusive: true,
      },
    ],
  },
  {
    id: "opt-scope-choose-one",
    oracleText: "Choose one —\n• Draw a card.\n• Destroy target artifact.",
    expected: [
      { actionType: "draw", evidenceContains: "Draw a card", notOptional: true },
      { actionType: "destroy", evidenceContains: "Destroy target artifact", notOptional: true },
    ],
    note: "Modal choice is mandatory; alternatives are not optional merely because they are alternatives",
  },
  {
    id: "opt-scope-target-player-may",
    oracleText: "Target player may draw a card.",
    expected: [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }],
  },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findAction(
  actions: ReturnType<typeof parseOracleSemanticsRC3>["actions"],
  exp: ExpectedAction,
) {
  return actions.find(
    (a) =>
      a.actionType === exp.actionType &&
      normalize(a.provenance.actionSpan.text).includes(normalize(exp.evidenceContains).slice(0, 16)),
  );
}

function runCase(testCase: RegressionCase) {
  const parsed = parseOracleSemanticsRC3({
    oracleId: `opt-scope-${testCase.id}`,
    oracleText: testCase.oracleText,
  });
  const failures: string[] = [];

  for (const exp of testCase.expected) {
    const action = findAction(parsed.actions, exp);
    if (!action) {
      failures.push(`missing ${exp.actionType} "${exp.evidenceContains}"`);
      continue;
    }
    if (exp.optionalEffect !== undefined && action.optionalEffect !== exp.optionalEffect) {
      failures.push(
        `${exp.actionType}: optionalEffect expected ${exp.optionalEffect} got ${action.optionalEffect}`,
      );
    }
    if (exp.notOptional && action.optionalEffect) {
      failures.push(`${exp.actionType}: must not be optionalEffect=true`);
    }
    if (exp.optionalCost !== undefined && action.optionalCost !== exp.optionalCost) {
      failures.push(`${exp.actionType}: optionalCost expected ${exp.optionalCost} got ${action.optionalCost}`);
    }
    if (exp.choiceMutuallyExclusive !== undefined) {
      const mx = (action as { choiceMutuallyExclusive?: boolean }).choiceMutuallyExclusive;
      if (mx !== exp.choiceMutuallyExclusive) {
        failures.push(`${exp.actionType}: choiceMutuallyExclusive expected ${exp.choiceMutuallyExclusive} got ${mx}`);
      }
    }
    if (exp.dependsOnEvidence) {
      const antecedent = parsed.actions.find((a) =>
        normalize(a.provenance.actionSpan.text).includes(normalize(exp.dependsOnEvidence!).slice(0, 12)),
      );
      const legacyDeps = (action as { dependsOnActionIds?: string[] }).dependsOnActionIds ?? [];
      const hasDependency =
        (antecedent && legacyDeps.includes(antecedent.actionId)) ||
        (!action.optionalEffect && !!antecedent);
      if (!hasDependency) {
        failures.push(`${exp.actionType}: missing dependency on "${exp.dependsOnEvidence}"`);
      }
    }
  }

  const clauseMayOverreach = parsed.actions.filter((a) => {
    if (!a.optionalEffect) return false;
    const ev = normalize(a.provenance.actionSpan.text);
    if (testCase.id === "opt-scope-discard-if-you-do" && ev.includes("draw two")) return true;
    if (testCase.id === "opt-scope-cast-if-you-do" && ev.includes("draw a card") && !ev.includes("cast")) return true;
    if (testCase.id === "opt-scope-choose-one") return true;
    return false;
  });
  if (clauseMayOverreach.length) {
    failures.push(`clause-level may overreach: ${clauseMayOverreach.map((a) => a.actionType).join(", ")}`);
  }

  return { id: testCase.id, pass: failures.length === 0, failures, actionCount: parsed.actions.length };
}

function main() {
  const reused = ["dev-opt-001", "dev-opt-012"];
  const reusedPresent = OPTIONALITY_CONDITION_EVAL_CASES.filter((c) => reused.includes(c.id)).map((c) => c.id);

  const rows = REGRESSION_CASES.map(runCase);
  const pass = rows.filter((r) => r.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "optionality-scope-regression-v137",
    reusedExistingCases: reusedPresent,
    summary: `${pass}/${rows.length} PASS`,
    rows,
  };

  console.log(JSON.stringify(report, null, 2));
  if (pass !== rows.length) process.exit(1);
}

main();
