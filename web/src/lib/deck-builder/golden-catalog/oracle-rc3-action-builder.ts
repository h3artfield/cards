/**
 * Build a clause-native action with required V1 fields + RC3 metadata.
 */
import { createHash } from "node:crypto";
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import type { SegmentedAbility } from "./oracle-action-schema";
import type { PrimitiveActionType } from "./oracle-action-taxonomy";
import type { RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";

export function buildNativeAction(input: {
  oracleId: string;
  ability: SegmentedAbility;
  faceId: string;
  actionType: PrimitiveActionType;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  actionIndex: number;
  textRole?: OracleActionV1["textRole"];
  clauseId?: string;
  sourceZones?: string[];
  destinationZones?: string[];
  extensions?: RC3ActionExtensions;
}): OracleActionV1 & RC3ActionExtensions {
  return {
    actionId: createHash("sha256")
      .update(`${input.oracleId}:${input.actionType}:${input.evidenceStart}:${input.evidenceText}`)
      .digest("hex")
      .slice(0, 24),
    oracleId: input.oracleId,
    faceId: input.faceId,
    faceIndex: 0,
    componentType: "single_face",
    abilityIndex: input.ability.abilityIndex,
    actionIndex: input.actionIndex,
    abilityType: input.ability.abilityType as OracleActionV1["abilityType"],
    actionType: input.actionType,
    evidenceText: input.evidenceText,
    evidenceStart: input.evidenceStart,
    evidenceEnd: input.evidenceEnd,
    cardEvidenceStart: input.evidenceStart,
    cardEvidenceEnd: input.evidenceEnd,
    faceEvidenceStart: input.evidenceStart - input.ability.paragraphStart,
    faceEvidenceEnd: input.evidenceEnd - input.ability.paragraphStart,
    optional: false,
    optionalEffect: /\bYou may\b/i.test(input.evidenceText),
    confidence: 0.92,
    reviewStatus: "accepted",
    extractionMethod: "deterministic",
    parserVersion: "oracle-action-v1.34-rc3-ast-dev",
    sourceZones: input.sourceZones,
    destinationZones: input.destinationZones,
    affectedObjects: ["card"],
    textRole: input.textRole,
    clauseId: input.clauseId,
    extractionSource: "rc3_clause_native",
    executionContext: "immediate",
    ...input.extensions,
  };
}
