/**
 * Mechanical spent-v15/v16 RC7 target recovery census — diagnostics only.
 * Run: cd web && npx tsx scripts/_rc7-spent-regression.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const V16_LEDGER_PATH = "data/milestones/validation-v16-certification/validation-v16-root-cause-ledger-v1.json";

type TargetSpec = {
  holdout: "v15" | "v16";
  caseId: string;
  family: "player_possessive_discard_your_hand" | "replacement_consequence_exile_instead";
  goldTargets: Array<{ actionType: string; evidenceContains: string }>;
};

const RC7_TARGETS: TargetSpec[] = [
  {
    holdout: "v15",
    caseId: "vh15-0064",
    family: "player_possessive_discard_your_hand",
    goldTargets: [{ actionType: "discard", evidenceContains: "discard your hand" }],
  },
  {
    holdout: "v16",
    caseId: "vh16-0047",
    family: "player_possessive_discard_your_hand",
    goldTargets: [
      { actionType: "discard", evidenceContains: "Discard your hand, then draw cards equal to the number of cards in target opponent's hand" },
      { actionType: "discard", evidenceContains: "Discard your hand, then draw cards equal to the number of cards discarded this way" },
    ],
  },
  {
    holdout: "v16",
    caseId: "vh16-0027",
    family: "replacement_consequence_exile_instead",
    goldTargets: [{ actionType: "exile", evidenceContains: "exile it instead" }],
  },
  {
    holdout: "v16",
    caseId: "vh16-0038",
    family: "replacement_consequence_exile_instead",
    goldTargets: [{ actionType: "exile", evidenceContains: "exile it instead" }],
  },
];

const V16_GENUINE_FN = [
  ...new Set(
    (
      JSON.parse(readFileSync(resolve(V16_LEDGER_PATH), "utf8")) as {
        ledger: Array<{ caseId: string }>;
      }
    ).ledger.map((row) => row.caseId),
  ),
];

function loadCases(path: string): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases;
}

function goldMatches(g: ExpectedPrimitiveAction, spec: { actionType: string; evidenceContains: string }): boolean {
  if (g.negative || g.actionType !== spec.actionType) return false;
  const a = (g.evidenceContains ?? "").toLowerCase();
  const b = spec.evidenceContains.toLowerCase();
  return a.includes(b.slice(0, Math.min(24, b.length))) || b.includes(a.slice(0, Math.min(24, a.length)));
}

function scoreTarget(tc: OracleActionEvalCaseV2, spec: TargetSpec) {
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
  const row = evaluateCaseSemantic(tc, parse);
  const perTarget = spec.goldTargets.map((target) => {
    const gold = tc.expectedPrimitiveActions.find((g) => goldMatches(g, target));
    const accepted = parse.actions.filter((a) => a.reviewStatus === "accepted");
    const hit = accepted.some(
      (a) =>
        a.actionType === target.actionType &&
        a.provenance.actionSpan.text.toLowerCase().includes(target.evidenceContains.toLowerCase().slice(0, 20)),
    );
    return { target, goldPresent: Boolean(gold), recovered: hit };
  });
  return {
    caseId: spec.caseId,
    holdout: spec.holdout,
    family: spec.family,
    acceptedFn: row.accepted.fn,
    acceptedFp: row.accepted.fp,
    perTarget,
    allTargetsRecovered: perTarget.every((t) => t.recovered),
  };
}

function main() {
  const v15Cases = loadCases("data/milestones/validation-v15-certification/validation-v15-certified-300929da9a640b93.json");
  const v16Cases = loadCases("data/oracle-action-eval-validation-v16.json");

  const rc7Results = RC7_TARGETS.map((spec) => {
    const cases = spec.holdout === "v15" ? v15Cases : v16Cases;
    const tc = cases.find((c) => c.id === spec.caseId);
    if (!tc) throw new Error(`Missing case ${spec.caseId}`);
    return scoreTarget(tc, spec);
  });

  const recoveredGoldTargets = rc7Results.flatMap((r) =>
    r.perTarget.filter((t) => t.recovered).map((t) => `${r.caseId}:${t.target.actionType}`),
  );
  const missedGoldTargets = rc7Results.flatMap((r) =>
    r.perTarget.filter((t) => !t.recovered).map((t) => `${r.caseId}:${t.target.evidenceContains.slice(0, 40)}`),
  );

  const remainingV16Fn: Array<{ id: string; fn: number }> = [];
  for (const id of V16_GENUINE_FN) {
    const tc = v16Cases.find((c) => c.id === id);
    if (!tc) continue;
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    const row = evaluateCaseSemantic(tc, parse);
    if (row.accepted.fn > 0) remainingV16Fn.push({ id, fn: row.accepted.fn });
  }

  const incidentalFp = rc7Results.filter((r) => r.acceptedFp > 0).map((r) => ({ caseId: r.caseId, fp: r.acceptedFp }));

  console.log(
    JSON.stringify(
      {
        rc7TargetCensus: {
          v15GoldActionTargets: 1,
          v16GoldActionTargets: 3,
          totalIndependentOracleClauses: 3,
          scoredGoldTargets: 5,
        },
        rc7Recoveries: rc7Results,
        exactGenuineTargetRecoveries: recoveredGoldTargets,
        missedRc7Targets: missedGoldTargets,
        remainingV16GenuineFn: {
          baseline: 26,
          remainingCaseCount: remainingV16Fn.length,
          remainingCases: remainingV16Fn,
          rc7CasesStillFn: remainingV16Fn.filter((r) =>
            ["vh16-0027", "vh16-0038", "vh16-0047"].includes(r.id),
          ),
        },
        incidentalEmissions: incidentalFp,
        newFp: incidentalFp.length,
        note: "Diagnostics only — not a certification gate",
      },
      null,
      2,
    ),
  );
}

main();
