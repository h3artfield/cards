/**
 * BuildPath audit v2 — path overlap matrix + LOW_PATH_SEPARATION reasons.
 */
import type { BuildPathClass } from "../../src/lib/deck-synthesis/build-path-types-v1";
import {
  normalizeSignature,
  signatureKey,
  type BuildPathProposalV2,
  type CoreIntentSemanticSignature,
  type PathOverlapCell,
  type PathOverlapMatrix,
  type PathSeparationAudit,
} from "../../src/lib/deck-synthesis/build-path-types-v2";

export const BUILD_PATH_AUDIT_V2_VERSION = "phase6a1-build-path-audit-v2";

const PAIRS: [BuildPathClass, BuildPathClass][] = [
  ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY"],
  ["DEPENDENT_SYNERGY", "HARMONY"],
  ["INDEPENDENT_SYNERGY", "HARMONY"],
];

function coreSignatures(path: BuildPathProposalV2): CoreIntentSemanticSignature[] {
  return path.requiredCandidateIntents.map(normalizeSignature);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function partialMechanicOverlap(a: BuildPathProposalV2, b: BuildPathProposalV2): string[] {
  const mechA = new Set(a.requiredCandidateIntents.map((i) => i.targetMechanic.toLowerCase()));
  const mechB = new Set(b.requiredCandidateIntents.map((i) => i.targetMechanic.toLowerCase()));
  return [...mechA].filter((m) => mechB.has(m));
}

export function buildOverlapMatrix(paths: BuildPathProposalV2[]): PathOverlapMatrix {
  const byClass = Object.fromEntries(paths.map((p) => [p.pathClass, p])) as Record<
    BuildPathClass,
    BuildPathProposalV2
  >;

  const cells: PathOverlapCell[] = PAIRS.map(([a, b]) => {
    const pa = byClass[a]!;
    const pb = byClass[b]!;
    const sigA = coreSignatures(pa);
    const sigB = coreSignatures(pb);
    const setA = new Set(sigA.map(signatureKey));
    const setB = new Set(sigB.map(signatureKey));
    const overlapSigs = sigA.filter((sa) => setB.has(signatureKey(sa)));
    const partial = partialMechanicOverlap(pa, pb);
    return {
      pair: [a, b],
      exactCoreOverlapCount: overlapSigs.length,
      exactCoreOverlapSignatures: overlapSigs,
      dependentCoreCount: a === "DEPENDENT_SYNERGY" ? sigA.length : sigB.length,
      otherCoreCount: a === "DEPENDENT_SYNERGY" ? sigB.length : sigA.length,
      exactCoreJaccard: jaccard(setA, setB),
      partialMechanicOverlapCount: partial.length,
      partialSharedMechanics: partial,
    };
  });

  return { cells };
}

export function auditPathSeparation(paths: BuildPathProposalV2[]): PathSeparationAudit {
  const reasons: string[] = [];
  const byClass = Object.fromEntries(paths.map((p) => [p.pathClass, p])) as Record<
    BuildPathClass,
    BuildPathProposalV2
  >;
  const dep = byClass.DEPENDENT_SYNERGY!;
  const ind = byClass.INDEPENDENT_SYNERGY!;
  const harm = byClass.HARMONY!;

  const depSigs = new Set(coreSignatures(dep).map(signatureKey));
  const indSigs = new Set(coreSignatures(ind).map(signatureKey));
  const harmSigs = new Set(coreSignatures(harm).map(signatureKey));

  if (depSigs.size === indSigs.size && jaccard(depSigs, indSigs) === 1) {
    reasons.push("DEPENDENT_CORE_SIGNATURE_SET_EQUALS_INDEPENDENT");
  }
  if (harmSigs.size === depSigs.size && jaccard(harmSigs, depSigs) === 1) {
    reasons.push("HARMONY_CORE_SIGNATURE_SET_EQUALS_DEPENDENT");
  }
  if (harmSigs.size === indSigs.size && jaccard(harmSigs, indSigs) === 1) {
    reasons.push("HARMONY_CORE_SIGNATURE_SET_EQUALS_INDEPENDENT");
  }

  if (!ind.pathThesis.independentEngine.present) {
    reasons.push("INDEPENDENT_PATH_NO_SELF_CONTAINED_ENGINE");
  }
  if (ind.requiredCandidateIntents.length < 2) {
    reasons.push("INDEPENDENT_PATH_MISSING_ENABLER_PAYOFF_PAIR");
  }

  const depHasInput = dep.pathThesis.primaryCausalChain.some((c) => c.stage === "DECK_INPUT");
  const depHasOutput = dep.pathThesis.primaryCausalChain.some((c) => c.stage === "COMMANDER_OUTPUT");
  if (!depHasInput && !depHasOutput) {
    reasons.push("DEPENDENT_PATH_NO_COMMANDER_DEPENDENT_CHAIN");
  }

  if (harm.pathThesis.bridgeMechanisms.length === 0 || harm.requiredCandidateIntents.length === 0) {
    reasons.push("HARMONY_PATH_NO_EXPLICIT_BRIDGE_MECHANISM");
  }

  const allThreeSame =
    depSigs.size === indSigs.size &&
    indSigs.size === harmSigs.size &&
    jaccard(depSigs, indSigs) === 1 &&
    jaccard(indSigs, harmSigs) === 1;
  if (allThreeSame) {
    reasons.push("PATHS_DIFFER_ONLY_IN_PRIORITY_OR_BOOLEAN_METADATA");
  }

  const matrix = buildOverlapMatrix(paths);
  for (const cell of matrix.cells) {
    if (cell.exactCoreJaccard >= 0.85 && cell.exactCoreOverlapCount > 0) {
      reasons.push(
        `LOW_PATH_SEPARATION:${cell.pair[0]}<->${cell.pair[1]}:exactJaccard=${cell.exactCoreJaccard.toFixed(2)}`,
      );
    }
  }

  return { lowPathSeparation: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function countMateriallyDistinctPaths(paths: BuildPathProposalV2[]): 1 | 2 | 3 {
  const sigs = paths.map((p) => new Set(coreSignatures(p).map(signatureKey)));
  const unique = new Set(sigs.map((s) => [...s].sort().join("|")));
  if (unique.size >= 3) return 3;
  if (unique.size === 2) return 2;
  return 1;
}

export type CasePathAuditV2 = {
  caseId: string;
  commanders: string[];
  oracleMechanism: string;
  paths: Array<{
    pathClass: BuildPathClass;
    pathThesis: BuildPathProposalV2["pathThesis"];
    coreIntentCount: number;
    sharedCoreSignatures: number;
    pathExclusiveCoreCount: number;
    normalizedCoreSignatures: CoreIntentSemanticSignature[];
    lowPathSeparationReasons: string[];
  }>;
  overlapMatrix: PathOverlapMatrix;
  materiallyDistinctPathCount: 1 | 2 | 3;
  separation: PathSeparationAudit;
};

export function auditCasePathsV2(
  bundle: {
    caseId: string;
    commanders: string[];
    commanderMechanismSummary: string;
    buildPaths: [BuildPathProposalV2, BuildPathProposalV2, BuildPathProposalV2];
  },
): CasePathAuditV2 {
  const separation = auditPathSeparation(bundle.buildPaths);
  const matrix = buildOverlapMatrix(bundle.buildPaths);
  const allCoreKeys = bundle.buildPaths.flatMap((p) =>
    coreSignatures(p).map(signatureKey),
  );
  const keyCounts = new Map<string, number>();
  for (const k of allCoreKeys) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);

  for (const p of bundle.buildPaths) {
    p.lowPathSeparationReasons = separation.reasons;
    p.pathSeparationWarnings = separation.reasons.filter((r) => r.startsWith("LOW_PATH_SEPARATION"));
  }

  return {
    caseId: bundle.caseId,
    commanders: bundle.commanders,
    oracleMechanism: bundle.commanderMechanismSummary,
    paths: bundle.buildPaths.map((p) => {
      const sigs = coreSignatures(p);
      const shared = sigs.filter((s) => (keyCounts.get(signatureKey(s)) ?? 0) > 1).length;
      return {
        pathClass: p.pathClass,
        pathThesis: p.pathThesis,
        coreIntentCount: p.requiredCandidateIntents.length,
        sharedCoreSignatures: shared,
        pathExclusiveCoreCount: sigs.length - shared,
        normalizedCoreSignatures: sigs,
        lowPathSeparationReasons: separation.reasons,
      };
    }),
    overlapMatrix: matrix,
    materiallyDistinctPathCount: countMateriallyDistinctPaths(bundle.buildPaths),
    separation,
  };
}
