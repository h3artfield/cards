/**
 * Shared seal-time gates for phase6a1 semantic closure benchmarks v6.
 */
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { verifySnapshotCommanderPins } from "./phase6a1-closure-commander-canonical-facts-v6";
import {
  PROXY_ROLE_TAGS,
  validateIndependentLensInvariants,
  validateSnapshotGraph,
  type SemanticSnapshot,
} from "./phase6a1-closure-semantic-inference-dev-template-v6";

export function detectProxyRoleLabels(snapshot: SemanticSnapshot): string[] {
  const hits: string[] = [];
  for (const lens of Object.keys(snapshot.lenses) as Array<keyof SemanticSnapshot["lenses"]>) {
    const data = snapshot.lenses[lens];
    for (const pkg of data.validatedPackages) {
      for (const field of ["semanticRequirements", "payoffs"] as const) {
        for (const tag of pkg[field] ?? []) {
          if (PROXY_ROLE_TAGS.has(tag)) hits.push(`${snapshot.caseId}/${lens}: proxy tag ${tag} in ${field}`);
        }
      }
      for (const tx of pkg.resourceTransformations ?? []) {
        if (tx === "cross_engine_link") hits.push(`${snapshot.caseId}/${lens}: proxy transformation cross_engine_link`);
      }
    }
  }
  return hits;
}

export function validateCommanderHypothesisEvidenceLinkage(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  const abilities = new Set(snapshot.frozenFacts.commanderRelevantAbilities ?? []);
  for (const lens of Object.keys(snapshot.lenses) as Array<keyof SemanticSnapshot["lenses"]>) {
    const hyp = snapshot.lenses[lens].hypotheses[0];
    if (!hyp) continue;
    if (lens === "DEPENDENT_SYNERGY" && (hyp.commanderEvidenceRefs?.length ?? 0) === 0 && abilities.size > 0) {
      errors.push(`${snapshot.caseId}/${lens}: hypothesis missing commanderEvidenceRefs`);
    }
    for (const ref of hyp.commanderEvidenceRefs ?? []) {
      if (!abilities.has(ref) && !ref.startsWith("oracle:")) {
        errors.push(`${snapshot.caseId}/${lens}: commanderEvidenceRef ${ref} not in frozenFacts.commanderRelevantAbilities`);
      }
    }
  }
  return errors;
}

export function validateHypothesisPackageLinkage(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  for (const lens of Object.keys(snapshot.lenses) as Array<keyof SemanticSnapshot["lenses"]>) {
    const lensData = snapshot.lenses[lens];
    if (lensData.hypotheses.length === 0) continue;
    const outputs = new Set(lensData.hypotheses.flatMap((h) => h.engineOutputs ?? []));
    const inputs = new Set(lensData.hypotheses.flatMap((h) => h.engineInputs ?? []));
    for (const pkg of lensData.validatedPackages) {
      if (pkg.hypothesisRef && lensData.hypotheses.length === 1 && pkg.hypothesisRef !== lensData.hypotheses[0]?.hypothesisId) {
        errors.push(`${snapshot.caseId}/${lens}: package ${pkg.packageRefId} hypothesisRef mismatch`);
      }
      const producesHypOutput = (pkg.producedResources ?? []).some((r) => outputs.has(r));
      const producesHypInput = (pkg.producedResources ?? []).some((r) => inputs.has(r));
      const consumesHypInput = (pkg.requiredResources ?? []).some((r) => inputs.has(r) || outputs.has(r));
      if (!producesHypOutput && !producesHypInput && !consumesHypInput && lens !== "HARMONY") {
        errors.push(`${snapshot.caseId}/${lens}: package ${pkg.packageRefId} not linked to hypothesis engine IO`);
      }
    }
  }
  return errors;
}

export function validateCommanderStrategyCoherence(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  const oracleLower = (snapshot.frozenFacts.commanderOracleText ?? "").toLowerCase();
  const dep = snapshot.lenses.DEPENDENT_SYNERGY.hypotheses[0];
  if (!dep) return errors;
  const stmt = (dep.strategyStatement ?? "").toLowerCase();
  if (/extra turn/.test(stmt) && !/end the turn|extra turn/.test(oracleLower)) {
    errors.push(`${snapshot.caseId}: dependent strategy claims extra turns not supported by oracle`);
  }
  if (/etb draw|enters the battlefield.*draw/.test(stmt) && !/draw/.test(oracleLower)) {
    errors.push(`${snapshot.caseId}: dependent strategy claims ETB draw not supported by oracle`);
  }
  if (/combat damage.*mill/.test(stmt) && !/combat damage.*mill|mill/.test(oracleLower)) {
    if (/mill/.test(stmt) && !/mill/.test(oracleLower)) {
      errors.push(`${snapshot.caseId}: dependent strategy claims mill mechanic not in oracle`);
    }
  }
  return errors;
}

export function runSnapshotSealGates(
  catalog: GoldenCatalogIndex,
  snapshot: SemanticSnapshot,
  opts: { strictHypothesisLinkage?: boolean } = {},
): string[] {
  const strict = opts.strictHypothesisLinkage ?? true;
  return [
    ...verifySnapshotCommanderPins(catalog, snapshot),
    ...validateSnapshotGraph(snapshot),
    ...validateIndependentLensInvariants(snapshot),
    ...detectProxyRoleLabels(snapshot),
    ...validateCommanderHypothesisEvidenceLinkage(snapshot),
    ...(strict ? validateHypothesisPackageLinkage(snapshot) : []),
    ...validateCommanderStrategyCoherence(snapshot),
  ];
}
