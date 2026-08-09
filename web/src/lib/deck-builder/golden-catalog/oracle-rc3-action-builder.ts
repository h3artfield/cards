/**
 * Build a clause-native action with required V1 fields + RC3 metadata.
 */
import { createHash } from "node:crypto";
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import type { SegmentedAbility } from "./oracle-action-schema";
import type { PrimitiveActionType } from "./oracle-action-taxonomy";
import { attachOptionalityToAction } from "./oracle-action-optionality";
import type { RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";

export function buildNativeAction(input: {
  oracleId: string;
  oracleText: string;
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
  optionalEffect?: boolean;
  siblingActions?: Array<{
    actionId: string;
    evidenceStart: number;
    evidenceEnd: number;
    evidenceText: string;
    abilityIndex: number;
    abilityType: OracleActionV1["abilityType"];
  }>;
  extensions?: RC3ActionExtensions;
}): OracleActionV1 & RC3ActionExtensions {
  const actionId = createHash("sha256")
    .update(`${input.oracleId}:${input.actionType}:${input.evidenceStart}:${input.evidenceText}`)
    .digest("hex")
    .slice(0, 24);

  const attach =
    input.optionalEffect !== undefined
      ? {
          optionalEffect: input.optionalEffect,
          optionalCost: false,
          optionalityCertain: input.optionalEffect,
        }
      : attachOptionalityToAction({
          action: {
            actionId,
            evidenceStart: input.evidenceStart,
            evidenceEnd: input.evidenceEnd,
            evidenceText: input.evidenceText,
            abilityIndex: input.ability.abilityIndex,
            abilityType: input.ability.abilityType as OracleActionV1["abilityType"],
          },
          ability: input.ability,
          oracleText: input.oracleText,
          siblingActions: input.siblingActions ?? [],
        });

  return {
    actionId,
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
    optional: attach.optionalEffect,
    optionalEffect: attach.optionalEffect,
    optionalCost: attach.optionalCost || undefined,
    optionalityEvidenceText: attach.optionalityEvidenceText,
    optionalityEvidenceStart: attach.optionalityEvidenceStart,
    optionalityEvidenceEnd: attach.optionalityEvidenceEnd,
    optionalityScopeId: attach.optionalityScopeId,
    optionalityController: attach.optionalityController,
    optionalityCertain: attach.optionalityCertain,
    confidence: 0.92,
    reviewStatus: "accepted",
    extractionMethod: "deterministic",
    parserVersion: "oracle-action-v1.37-rc3-granted-nested-complete",
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
