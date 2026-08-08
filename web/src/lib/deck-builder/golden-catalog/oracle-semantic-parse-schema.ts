/**
 * Canonical Oracle semantic parse — single representation for parser, eval, deck builder, KG.
 *
 * ## Stable ID contract
 *
 * Semantic IDs (`abilityId`, `optionId`, `actionId`, `clauseId`, `objectId`) are deterministic
 * for a particular canonical Oracle-text version identified by `oracleTextHash`. They are scoped to:
 *
 * - `oracleId` — card identity
 * - `oracleTextHash` — SHA-256 of the exact Oracle text used for this parse
 * - `faceId` — segmented face within multi-face layouts
 * - semantic span — character offsets within that face/card text
 *
 * Ordinal fields (`segmentAbilityIndex`, `option.ordinal`) are presentation order and may change
 * when segmentation changes across parser revisions. Semantic IDs do **not** need to survive a
 * real Oracle text change — only the same `(oracleId, oracleTextHash, faceId, span)` tuple.
 *
 * Invariants enforced during migration:
 * - all referenced `abilityId`s exist in `abilities[]`
 * - all `modalOptionId`s exist under their parent ability
 * - all `clauseId`s exist on the owning ability/option
 * - all `referentObjectId`s resolve in `objects[]`
 * - no duplicate IDs within a parse
 */
import { createHash } from "node:crypto";
import type { PrimitiveActionType } from "./oracle-action-taxonomy";
import type { VariableQuantityFields } from "./oracle-variable-quantity";

export type SemanticAbilityType =
  | "static"
  | "activated"
  | "triggered"
  | "spell_effect"
  | "modal"
  | "loyalty"
  | "replacement";

export type SemanticMechanic = "spree" | "entwine" | "kicker" | "flashback" | "none";

export interface EvidenceSpan {
  text: string;
  cardStart: number;
  cardEnd: number;
}

export interface SemanticChooseConstraint {
  minimum: number;
  maximum: number | "all";
  rawText?: string;
  evidence?: EvidenceSpan;
}

export interface SemanticAdditionalCost {
  mana?: string[];
  rawText?: string;
  evidence?: EvidenceSpan;
}

export interface SemanticOption {
  /** Stable id, e.g. oracle:front:ability-0.opt-1 */
  optionId: string;
  /** 1-based presentation order within parent ability */
  ordinal: number;
  /** Segmented paragraph index for this option line */
  segmentAbilityIndex: number;
  additionalCost?: SemanticAdditionalCost;
  optionSpan: EvidenceSpan;
  clauseIds: string[];
}

export interface SemanticAbility {
  abilityId: string;
  segmentAbilityIndex: number;
  faceId: string;
  abilityType: SemanticAbilityType;
  mechanic?: SemanticMechanic;
  choose?: SemanticChooseConstraint;
  loyaltyCost?: string;
  options?: SemanticOption[];
  abilitySpan: EvidenceSpan;
  clauseIds: string[];
}

export interface SemanticObjectRef {
  objectId: string;
  kind: "token" | "permanent" | "card" | "player" | "zone_contents";
  tokenCopyOf?: string;
  referentActionId?: string;
}

export interface SemanticActionChoice {
  chooser?: "affected_player" | "controller" | "you" | "opponent";
  evidence?: EvidenceSpan;
}

export interface SemanticActionObject {
  type?: string;
  zone?: string;
  controller?: "affected_player" | "you" | "opponent" | "their_controller";
  evidence?: EvidenceSpan;
}

export interface SemanticActionQuantity extends VariableQuantityFields {
  evidence?: EvidenceSpan;
  roundingEvidence?: EvidenceSpan;
}

export interface SemanticActionCondition {
  type: "unless" | "if" | "when";
  payment?: string;
  evidence?: EvidenceSpan;
}

export interface SemanticActionArguments {
  actor?: "you" | "controller" | "spell_controller";
  affectedPlayer?: "target_opponent" | "each_opponent" | "each_player" | "target_player" | "you";
  affectedController?: "opponent" | "you" | "controller";
  object?: SemanticActionObject;
  sourceZone?: string[];
  destinationZone?: string[];
  quantity?: SemanticActionQuantity;
  choice?: SemanticActionChoice;
  condition?: SemanticActionCondition;
  timing?: string;
  dependency?: string;
  referentObjectId?: string;
}

export interface SemanticActionProvenance {
  actionSpan: EvidenceSpan;
  targetSpan?: EvidenceSpan;
  quantitySpan?: EvidenceSpan;
  roundingSpan?: EvidenceSpan;
  costSpan?: EvidenceSpan;
  actorSpan?: EvidenceSpan;
  objectSpan?: EvidenceSpan;
}

export interface SemanticAction {
  actionId: string;
  parentAbilityId: string;
  modalOptionId?: string;
  clauseId?: string;
  segmentAbilityIndex: number;
  actionType: PrimitiveActionType;
  arguments: SemanticActionArguments;
  provenance: SemanticActionProvenance;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  reviewStatus: "accepted" | "needs_review" | "overridden";
  parserVersion: string;
}

export interface SemanticDiagnostic {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  abilityId?: string;
  actionId?: string;
}

export interface OracleSemanticParse {
  oracleId: string;
  /** SHA-256 of canonical Oracle text — semantic IDs are stable for this text version only. */
  oracleTextHash: string;
  parserVersion: string;
  abilities: SemanticAbility[];
  actions: SemanticAction[];
  objects: SemanticObjectRef[];
  diagnostics: SemanticDiagnostic[];
}

/** Canonical hash of Oracle text for semantic ID stability scoping. */
export function hashOracleText(oracleText: string): string {
  return createHash("sha256").update(oracleText).digest("hex");
}

/** Stable ability id — segment index is presentation order from segmentation. */
export function stableAbilityId(oracleId: string, faceId: string, segmentAbilityIndex: number): string {
  return `${oracleId}:${faceId}:ability-${segmentAbilityIndex}`;
}

/** Stable option id under a modal/spree parent ability. */
export function stableOptionId(parentAbilityId: string, ordinal: number): string {
  return `${parentAbilityId}.opt-${ordinal}`;
}

/** Short option key used in legacy gold (opt-1, opt-2). */
export function optionOrdinalKey(ordinal: number): string {
  return `opt-${ordinal}`;
}
