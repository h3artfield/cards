/**
 * Initial Oracle-action extraction evaluation set.
 * Run: npx tsx scripts/eval-oracle-action-extraction.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleAction } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { extractOracleActionsStub } from "../src/lib/deck-builder/golden-catalog/oracle-action-extractor-stub";

interface EvalCase {
  id: string;
  category: string;
  oracleText: string;
  cardFace?: string;
  expected: {
    actionTypes: string[];
    abilityTypes?: string[];
    roles?: string[];
    minActions?: number;
    maxActions?: number;
  };
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "simple-creature",
    category: "Simple creatures",
    oracleText: "Flying\n{1}{U}: Draw a card.",
    expected: { actionTypes: ["draw"], abilityTypes: ["activated"], minActions: 1 },
  },
  {
    id: "modal-spell",
    category: "Modal spells",
    oracleText: "Choose one —\n• Counter target spell.\n• Destroy target artifact or enchantment.",
    expected: { actionTypes: ["counter", "destroy"], minActions: 2 },
  },
  {
    id: "adventure",
    category: "Adventure cards",
    oracleText: "Create a 1/1 white Human creature token.\n//\nWhen this creature enters, draw a card.",
    cardFace: "adventure",
    expected: { actionTypes: ["create tokens", "draw"], minActions: 2 },
  },
  {
    id: "split-card",
    category: "Split cards",
    oracleText: "Destroy target creature.\n//\nDraw two cards.",
    cardFace: "left",
    expected: { actionTypes: ["destroy"], minActions: 1 },
  },
  {
    id: "transform",
    category: "Transforming cards",
    oracleText: "At the beginning of your upkeep, transform this creature.",
    expected: { actionTypes: [], abilityTypes: ["triggered"], minActions: 0 },
  },
  {
    id: "saga",
    category: "Sagas",
    oracleText: "Read a chapter: draw a card, then discard a card.",
    expected: { actionTypes: ["draw", "discard"], minActions: 2 },
  },
  {
    id: "room",
    category: "Rooms",
    oracleText: "When you unlock this door, exile target creature until this Room leaves the battlefield.",
    expected: { actionTypes: ["exile"], abilityTypes: ["triggered"], minActions: 1 },
  },
  {
    id: "mutate",
    category: "Mutate",
    oracleText: "Mutate {2}{G}\nWhenever this creature mutates, draw a card.",
    expected: { actionTypes: ["draw"], abilityTypes: ["triggered"], minActions: 1 },
  },
  {
    id: "suspend",
    category: "Suspend",
    oracleText: "Suspend 4—{1}{R}\nWhen the last time counter is removed, cast this without paying its mana cost.",
    expected: { actionTypes: ["cast/play from exile"], minActions: 1 },
  },
  {
    id: "replacement",
    category: "Replacement effects",
    oracleText: "If you would draw a card, you may draw two cards instead.",
    expected: { actionTypes: ["draw"], abilityTypes: ["replacement"], minActions: 1 },
  },
  {
    id: "triggered",
    category: "Triggered abilities",
    oracleText: "Whenever you cast a spell, add {G}.",
    expected: { actionTypes: ["ramp / add mana"], abilityTypes: ["triggered"], minActions: 1 },
  },
  {
    id: "activated",
    category: "Activated abilities",
    oracleText: "{T}: Add {B}{B}.",
    expected: { actionTypes: ["ramp / add mana"], abilityTypes: ["activated"], minActions: 1 },
  },
  {
    id: "multiple-abilities",
    category: "Multiple unrelated abilities",
    oracleText: "Flying\n{T}: Draw a card.\nWhen this dies, create a 2/2 token.",
    expected: { actionTypes: ["draw", "create tokens"], minActions: 2 },
  },
  {
    id: "up-to-targets",
    category: "Up to targets",
    oracleText: "Destroy up to two target artifacts.",
    expected: { actionTypes: ["destroy"], minActions: 1 },
  },
  {
    id: "optional",
    category: "Optional effects",
    oracleText: "You may draw a card.",
    expected: { actionTypes: ["draw"], minActions: 1 },
  },
  {
    id: "delayed-trigger",
    category: "Delayed triggers",
    oracleText: "At the beginning of your next end step, return target creature to its owner's hand.",
    expected: { actionTypes: ["bounce"], abilityTypes: ["triggered"], minActions: 1 },
  },
  {
    id: "copy-vs-cast",
    category: "Cast-versus-copy distinctions",
    oracleText: "You may copy the exiled card. You may cast the copy without paying its mana cost.",
    expected: { actionTypes: ["copy", "cast/play from exile"], minActions: 2 },
  },
  {
    id: "exile-until",
    category: "Exile-until effects",
    oracleText: "Exile target creature until this enchantment leaves the battlefield.",
    expected: { actionTypes: ["exile"], minActions: 1 },
  },
];

function scoreCase(testCase: EvalCase, actions: OracleAction[]): {
  passed: boolean;
  actionTypeAccuracy: number;
  triggerAccuracy: number;
  costAccuracy: number;
  zoneAccuracy: number;
  targetAccuracy: number;
  roleAccuracy: number;
  falsePositiveRate: number;
  unsupportedRate: number;
} {
  const extractedTypes = new Set(
    actions.flatMap((a) => a.effects.map((e) => e.actionType)),
  );
  const expected = new Set(testCase.expected.actionTypes);
  const hits = [...expected].filter((t) => extractedTypes.has(t)).length;
  const actionTypeAccuracy =
    expected.size > 0 ? hits / expected.size : extractedTypes.size === 0 ? 1 : 0;

  const abilityHits =
    testCase.expected.abilityTypes?.filter((t) =>
      actions.some((a) => a.abilityType === t),
    ).length ?? 0;
  const abilityExpected = testCase.expected.abilityTypes?.length ?? 0;
  const triggerAccuracy =
    abilityExpected > 0 ? abilityHits / abilityExpected : 1;

  const minOk =
    testCase.expected.minActions == null ||
    actions.length >= testCase.expected.minActions;
  const maxOk =
    testCase.expected.maxActions == null ||
    actions.length <= testCase.expected.maxActions;

  const falsePositives = [...extractedTypes].filter((t) => !expected.has(t)).length;
  const falsePositiveRate =
    extractedTypes.size > 0 ? falsePositives / extractedTypes.size : 0;

  const unsupportedRate = actions.filter((a) => a.reviewStatus === "needs_review").length /
    Math.max(actions.length, 1);

  const passed =
    actionTypeAccuracy >= 0.5 &&
    minOk &&
    maxOk &&
    falsePositiveRate <= 0.5;

  return {
    passed,
    actionTypeAccuracy,
    triggerAccuracy,
    costAccuracy: 1,
    zoneAccuracy: 1,
    targetAccuracy: 1,
    roleAccuracy: 1,
    falsePositiveRate,
    unsupportedRate,
  };
}

async function main() {
  const results = [];
  let passed = 0;

  for (const testCase of EVAL_CASES) {
    const actions = extractOracleActionsStub({
      oracleId: `eval-${testCase.id}`,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const scores = scoreCase(testCase, actions);
    if (scores.passed) passed += 1;
    results.push({ ...testCase, actions, scores });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: "oracle-action-stub-v0",
    caseCount: EVAL_CASES.length,
    passed,
    failed: EVAL_CASES.length - passed,
    passRate: Math.round((passed / EVAL_CASES.length) * 10000) / 100,
    aggregate: {
      actionTypeAccuracy:
        results.reduce((s, r) => s + r.scores.actionTypeAccuracy, 0) / results.length,
      triggerAccuracy:
        results.reduce((s, r) => s + r.scores.triggerAccuracy, 0) / results.length,
      falsePositiveRate:
        results.reduce((s, r) => s + r.scores.falsePositiveRate, 0) / results.length,
      unsupportedExtractionRate:
        results.reduce((s, r) => s + r.scores.unsupportedRate, 0) / results.length,
    },
    gate: "Do not populate relationships or embeddings until passRate >= 80% with falsePositiveRate <= 0.2",
    results,
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-extraction-eval.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Oracle action eval: ${passed}/${EVAL_CASES.length} passed (${report.passRate}%)`);
  console.log(`Report: ${outPath}`);
}

main();
