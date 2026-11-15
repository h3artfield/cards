/**
 * Seal-time gates v8 — clause evidence, strategy coherence, role coverage helpers.
 */
import { readFileSync } from "node:fs";
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { isOracleClauseRef } from "./phase6a1-oracle-clause-evidence-v8";
import { verifySnapshotCommanderPins } from "./phase6a1-closure-commander-canonical-facts-v6";
import {
  PROXY_ROLE_TAGS,
  adjudicateLens,
  validateIndependentLensInvariants,
  validateSnapshotGraph,
  type SemanticSnapshot,
} from "./phase6a1-closure-semantic-inference-dev-template-v6";
import { LENSES, type FunctionalRole } from "./phase6a1-closure-design-v3-matrix";
import { runSnapshotSealGates as runSnapshotSealGatesV6 } from "./phase6a1-closure-benchmark-gates-v6";

export function validateCommanderHypothesisEvidenceLinkageV8(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  const oracleText = (snapshot.frozenFacts as { commanderOracleText?: string; oracleText?: string }).commanderOracleText
    ?? (snapshot.frozenFacts as { oracleText?: string }).oracleText
    ?? "";
  const dep = snapshot.lenses.DEPENDENT_SYNERGY.hypotheses[0];
  if (!dep) return errors;

  const refs = dep.commanderEvidenceRefs ?? [];
  if (oracleText.trim().length > 0 && refs.length === 0) {
    errors.push(`${snapshot.caseId}/DEPENDENT_SYNERGY: non-empty oracle requires commanderEvidenceRefs`);
  }
  for (const ref of refs) {
    if (!isOracleClauseRef(ref)) {
      errors.push(`${snapshot.caseId}/DEPENDENT_SYNERGY: invalid oracle clause ref ${ref}`);
    }
  }
  return errors;
}

export function validateCommanderStrategyCoherenceV8(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  const dep = snapshot.lenses.DEPENDENT_SYNERGY.hypotheses[0];
  if (!dep) return errors;
  const refs = dep.commanderEvidenceRefs ?? [];
  if (refs.length === 0) return errors;

  const outputs = new Set(dep.engineOutputs ?? []);
  const pkgOutputs = snapshot.lenses.DEPENDENT_SYNERGY.validatedPackages.flatMap((p) => p.producedResources ?? []);
  const linked = pkgOutputs.some((r) => outputs.has(r)) || (dep.engineInputs ?? []).some((i) => pkgOutputs.includes(i));
  if (!linked && snapshot.lenses.DEPENDENT_SYNERGY.validatedPackages.length > 0) {
    errors.push(`${snapshot.caseId}: dependent packages do not trace to hypothesis engine IO`);
  }
  return errors;
}

export function runSnapshotSealGatesV8(
  catalog: GoldenCatalogIndex,
  snapshot: SemanticSnapshot,
  opts: { strictHypothesisLinkage?: boolean } = {},
): string[] {
  const base = runSnapshotSealGatesV6(catalog, snapshot, opts).filter(
    (e) => !e.includes("commanderEvidenceRef") && !e.includes("commanderEvidenceRefs") && !e.includes("dependent strategy claims"),
  );
  return [
    ...base,
    ...validateCommanderHypothesisEvidenceLinkageV8(snapshot),
    ...validateCommanderStrategyCoherenceV8(snapshot),
  ];
}

const CORE_ROLES: FunctionalRole[] = [
  "ENGINE",
  "ENABLER",
  "FUEL",
  "PAYOFF",
  "CONVERSION",
  "PROTECTION",
  "RECOVERY",
  "FINISHER",
  "COMMANDER_MAINTENANCE",
  "CROSS_ENGINE_BRIDGE",
];

export function summarizeDevRoleCoverage(adjudicationPath: string): Record<
  FunctionalRole,
  { SATISFIED: number; MISSING: number; NOT_APPLICABLE: number }
> {
  const adj = JSON.parse(readFileSync(adjudicationPath, "utf8")) as {
    cases: Array<{ lenses: Record<string, { expectedSatisfaction: Record<string, { state: string }> }> }>;
  };
  const out = Object.fromEntries(CORE_ROLES.map((r) => [r, { SATISFIED: 0, MISSING: 0, NOT_APPLICABLE: 0 }])) as Record<
    FunctionalRole,
    { SATISFIED: number; MISSING: number; NOT_APPLICABLE: number }
  >;
  for (const c of adj.cases) {
    for (const lens of LENSES) {
      const sat = c.lenses[lens]?.expectedSatisfaction ?? {};
      for (const role of CORE_ROLES) {
        const state = sat[role]?.state ?? "NOT_APPLICABLE";
        if (state === "SATISFIED" || state === "MISSING" || state === "NOT_APPLICABLE") {
          out[role][state]++;
        }
      }
    }
  }
  return out;
}

export function validateDevRoleCoverage(adjudicationPath: string): string[] {
  const summary = summarizeDevRoleCoverage(adjudicationPath);
  const adj = JSON.parse(readFileSync(adjudicationPath, "utf8")) as {
    cases: Array<{ lenses: Record<string, { expectedSatisfaction: Record<string, { state: string }>; structuralRoleGaps?: Array<{ role: string }> }> }>;
  };
  const gapCounts: Record<string, number> = {};
  for (const c of adj.cases) {
    for (const lens of Object.values(c.lenses)) {
      for (const gap of lens.structuralRoleGaps ?? []) {
        gapCounts[gap.role] = (gapCounts[gap.role] ?? 0) + 1;
      }
    }
  }
  const errors: string[] = [];
  for (const role of ["FUEL", "PROTECTION", "RECOVERY", "FINISHER"] as FunctionalRole[]) {
    const missing = summary[role].MISSING + (gapCounts[role] ?? 0);
    if (summary[role].SATISFIED === 0) errors.push(`DEV role coverage: ${role} has zero SATISFIED cases`);
    if (missing === 0) errors.push(`DEV role coverage: ${role} has zero MISSING cases`);
  }
  if (summary.FUEL.NOT_APPLICABLE === 108) errors.push("DEV role coverage: FUEL is NOT_APPLICABLE in all lens results");
  return errors;
}

export { PROXY_ROLE_TAGS, detectProxyRoleLabels } from "./phase6a1-closure-benchmark-gates-v6";
