/**
 * Candidate supply gate — block Constructor when singleton math or per-requirement supply fails.
 */
import type {
  ConstructorSupplyGateV11,
  RetrievalContractV11,
  RetrievalResultV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_SUPPLY_GATE_V1_1_VERSION = "professor-sol-directed-supply-gate-v1-1";

export function evaluateConstructorSupplyGateV11(args: {
  contract: RetrievalContractV11;
  retrieval: RetrievalResultV11;
}): ConstructorSupplyGateV11 {
  const reasons: string[] = [];
  const requiredNonlandSlots = args.contract.nonlandSlotsRequired;
  const preferredUniqueTarget = Math.min(requiredNonlandSlots * 3, 200);

  const perRequirement = args.retrieval.requirementPools.map((pool) => {
    const availableCount = pool.oracleIds.length;
    const satisfied = availableCount >= pool.requestedCount;
    if (!satisfied) {
      reasons.push(
        `${pool.requirementId}: available ${availableCount} < requested ${pool.requestedCount}`,
      );
    }
    return {
      requirementId: pool.requirementId,
      requestedCount: pool.requestedCount,
      availableCount,
      targetPoolSize: pool.targetPoolSize,
      satisfied,
    };
  });

  if (args.retrieval.uniqueNonlandCount < requiredNonlandSlots) {
    reasons.push(
      `uniqueNonlandCount ${args.retrieval.uniqueNonlandCount} < required ${requiredNonlandSlots}`,
    );
  }

  if (args.retrieval.uniqueNonlandCount < preferredUniqueTarget) {
    reasons.push(
      `uniqueNonlandCount ${args.retrieval.uniqueNonlandCount} below preferred recall target ${preferredUniqueTarget}`,
    );
  }

  const landTarget = args.contract.landSlotsRequired;
  const landBasics = args.retrieval.landPool.basicForestSlots + args.retrieval.landPool.basicSwampSlots;
  if (args.retrieval.landPool.targetCount !== landTarget) {
    reasons.push(`landPool.targetCount ${args.retrieval.landPool.targetCount} != ${landTarget}`);
  }
  if (landBasics + args.retrieval.landPool.nonBasicOracleIds.length < 10) {
    reasons.push("land pool too thin for 36-land construction");
  }

  const mandatoryPass =
    args.retrieval.uniqueNonlandCount >= requiredNonlandSlots &&
    perRequirement.every((r) => r.satisfied);

  const preferredPass = args.retrieval.uniqueNonlandCount >= preferredUniqueTarget;

  return {
    pass: mandatoryPass && preferredPass,
    failure: mandatoryPass ? (preferredPass ? null : "CONSTRUCTOR_INPUT_INSUFFICIENT") : "CONSTRUCTOR_INPUT_INSUFFICIENT",
    reasons,
    uniqueNonlandCount: args.retrieval.uniqueNonlandCount,
    requiredNonlandSlots,
    preferredUniqueTarget,
    perRequirement,
  };
}

/** Absolute minimum gate — 63 unique + each requirement has requested count. */
export function evaluateConstructorSupplyGateMandatoryV11(args: {
  contract: RetrievalContractV11;
  retrieval: RetrievalResultV11;
}): ConstructorSupplyGateV11 {
  const full = evaluateConstructorSupplyGateV11(args);
  const mandatoryReasons = full.reasons.filter(
    (r) =>
      r.includes("uniqueNonlandCount") && r.includes("< required") ||
      r.includes(": available"),
  );
  const mandatoryPass =
    full.uniqueNonlandCount >= full.requiredNonlandSlots &&
    full.perRequirement.every((r) => r.satisfied);
  return {
    ...full,
    pass: mandatoryPass,
    failure: mandatoryPass ? null : "CONSTRUCTOR_INPUT_INSUFFICIENT",
    reasons: mandatoryReasons.length ? mandatoryReasons : full.reasons,
  };
}
