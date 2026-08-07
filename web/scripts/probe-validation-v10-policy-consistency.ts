/**
 * Policy-consistency probe on frozen validation_set_v10.
 * Does NOT consult RC1/parser predictions — oracle text + policy only.
 * Run: npx tsx scripts/probe-validation-v10-policy-consistency.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  detectPolicyViolations,
  type PolicyViolation,
  type PolicyViolationFamily,
} from "./lib/validation-gold-policy-v11";

const V10_HASH = "2af9eafaf0b021fd3c73193e1629b6b8fe06a402a7baea30c8e5999852041a81";

function main() {
  const v10Path = resolve(process.cwd(), "data/oracle-action-eval-validation-v10.json");
  const v10 = JSON.parse(readFileSync(v10Path, "utf8"));
  if (v10.contentHash !== V10_HASH) {
    throw new Error(`Expected v10 hash ${V10_HASH}, got ${v10.contentHash}`);
  }

  const allViolations: PolicyViolation[] = [];
  for (const c of v10.cases as OracleActionEvalCaseV2[]) {
    allViolations.push(...detectPolicyViolations(c));
  }

  const byFamily: Record<PolicyViolationFamily, PolicyViolation[]> = {
    gy_to_hand_primitive: [],
    activated_cost_sacrifice: [],
    trigger_event_sacrifice: [],
    mechanic_reminder_primitive: [],
    static_restriction_draw: [],
    static_restriction_cast_sacrifice: [],
    trigger_event_draw: [],
    missing_gy_to_hand: [],
    missing_variable_lose_life: [],
  };
  for (const v of allViolations) byFamily[v.family].push(v);

  const affectedCases = new Set(allViolations.map((v) => v.caseId));

  const report = {
    generatedAt: new Date().toISOString(),
    validationSet: "validation_set_v10",
    validationV10Hash: V10_HASH,
    purpose: "Policy-consistency probe — three-layer semantics vs v10 gold",
    parserOutputConsulted: false,
    totalViolations: allViolations.length,
    affectedCaseCount: affectedCases.size,
    byFamily: Object.fromEntries(
      Object.entries(byFamily).map(([family, items]) => [
        family,
        {
          violationCount: items.length,
          affectedCases: [...new Set(items.map((i) => i.caseId))],
          items: items.map((i) => ({
            caseId: i.caseId,
            cardName: i.cardName,
            oracleSnippet: i.oracleSnippet,
            currentGold: i.currentGold,
            correctPolicy: i.correctPolicy,
            verdict: i.verdict,
          })),
        },
      ]),
    ),
  };

  const outDir = resolve(process.cwd(), "data/milestones/validation-v11-policy-probe");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "v10-policy-consistency-probe.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath, totalViolations: allViolations.length, affectedCaseCount: affectedCases.size }, null, 2));
}

main();
