/**
 * Catalog identity vs benchmark target — permanently split validation axes.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import {
  combinedGoldenOracleText,
  goldenFaceRecords,
  goldenOracleTextHash,
  normalizeOracleTextForCompare,
  type GoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./load-golden-catalog-index";

export type CatalogIdentityStatus =
  | "exact"
  | "missing_oracle_id"
  | "invalid_oracle_id"
  | "name_mismatch"
  | "oracle_text_mismatch"
  | "face_mismatch";

export type BenchmarkTargetStatus =
  | "valid"
  | "invalid_selection_rule"
  | "target_span_not_found"
  | "semantic_context_mismatch"
  | "intended_card_mismatch"
  | "requires_readjudication";

export type TextSpan = {
  start: number;
  end: number;
  text: string;
};

export type GrantedAbilityType =
  | "static_keyword"
  | "static_ability"
  | "activated"
  | "triggered"
  | "replacement";

export type SemanticAdjudicationGold = {
  context: MachineGroundedBenchmarkTarget["expectedContext"];
  recipient: string;
  grantingVerb: string;
  grantedComplement: string;
  grammarFamily?: string;
  grantedAbilityTypes: GrantedAbilityType[];
  duration?: "continuous" | "until_end_of_turn" | null;
  semanticOwner: "granted_object" | "source_card" | "created_object";
  layer1Structure: {
    abilityType: GrantedAbilityType;
    grantingConstruction: string;
    costRegion?: TextSpan;
    triggerRegion?: TextSpan;
  };
  layer2Gold: Layer2GoldEntry[];
  layer2ChoiceGroups?: Layer2ChoiceGroupGold[];
  certifiedEmptyLayer2: boolean;
};

export type Layer2GoldEntry = {
  actionType: string;
  evidenceContains: string;
  evidenceSpan?: TextSpan;
  optionalEffect?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  targetContains?: string;
};

export type Layer2ChoiceGroupGold = {
  choiceGroupId: string;
  optional: boolean;
  mutuallyExclusive: boolean;
  optionalityCueContains?: string;
  effectClauseContains?: string;
};

export type MachineGroundedBenchmarkTarget = {
  grammarFamily?: string;
  expectedContext:
    | "genuine_granted"
    | "token_definition"
    | "source_owned_reference"
    | "created_object_capability"
    | "reminder_only"
    | "no_grant";
  recipientSpan?: TextSpan;
  nonGrantPredicateSpan?: TextSpan;
  grantingVerbSpan?: TextSpan;
  grantedComplementSpan?: TextSpan;
  fullRegionSpan?: TextSpan;
  oracleTextHash: string;
  adjudicationStatus: "parser_blind_adjudicated" | "pending";
  semanticAdjudication?: SemanticAdjudicationGold;
};

export type CatalogIdentityRow = {
  caseId: string;
  intendedName: string;
  oracleId: string;
  catalogName: string | null;
  catalogOracleText: string | null;
  storedOracleText: string;
  catalogOracleTextHash: string | null;
  storedOracleTextHash: string;
  catalogIdentityStatus: CatalogIdentityStatus;
  layout?: string;
  catalogLayout?: string;
  requestedFace?: string;
};

export type BenchmarkTargetRow = {
  caseId: string;
  oracleId: string;
  benchmarkTargetStatus: BenchmarkTargetStatus;
  failureReasons: BenchmarkTargetStatus[];
  selectionRule?: string;
  targetSubstring?: string;
  benchmarkTargets?: MachineGroundedBenchmarkTarget[];
};

export class BenchmarkIdentityError extends Error {
  constructor(
    message: string,
    readonly rows: CatalogIdentityRow[],
  ) {
    super(message);
    this.name = "BenchmarkIdentityError";
  }
}

export class BenchmarkTargetValidityError extends Error {
  constructor(
    message: string,
    readonly rows: BenchmarkTargetRow[],
  ) {
    super(message);
    this.name = "BenchmarkTargetValidityError";
  }
}

export function selectionRuleTargetFragment(selectionRule: string | undefined): string | undefined {
  if (!selectionRule?.trim()) return undefined;
  const primary = selectionRule.split(/\s+[—–-]\s+/)[0]?.trim();
  return primary && primary.length >= 8 ? primary : selectionRule.trim();
}

export function targetSubstringInOracle(oracleText: string, target: string | undefined): boolean {
  if (!target?.trim()) return true;
  return oracleText.toLowerCase().includes(target.trim().toLowerCase());
}

export function spanFromRange(text: string, start: number, end: number): TextSpan {
  return { start, end, text: text.slice(start, end) };
}

export function assertSpanInOracle(oracleText: string, span: TextSpan | undefined): boolean {
  if (!span) return false;
  return oracleText.slice(span.start, span.end) === span.text;
}

function normalizeOracleNameLoose(name: string): string {
  return name.trim().toLowerCase();
}

export function auditCatalogIdentity(
  catalog: GoldenCatalogIndex,
  testCase: OracleActionEvalCaseV2 & {
    cardName?: string;
    goldenOracleTextHash?: string;
    cardFace?: string;
  },
): CatalogIdentityRow {
  const intendedName = testCase.cardName ?? testCase.id;
  const storedOracleText = testCase.oracleText ?? "";
  const storedOracleTextHash = goldenOracleTextHash(storedOracleText);

  if (!testCase.oracleId) {
    return {
      caseId: testCase.id,
      intendedName,
      oracleId: "",
      catalogName: null,
      catalogOracleText: null,
      storedOracleText,
      catalogOracleTextHash: null,
      storedOracleTextHash,
      catalogIdentityStatus: "missing_oracle_id",
      layout: testCase.layout,
      requestedFace: testCase.cardFace,
    };
  }

  const catalogCard = catalog.byOracleId.get(testCase.oracleId) ?? null;
  if (!catalogCard) {
    return {
      caseId: testCase.id,
      intendedName,
      oracleId: testCase.oracleId,
      catalogName: null,
      catalogOracleText: null,
      storedOracleText,
      catalogOracleTextHash: null,
      storedOracleTextHash,
      catalogIdentityStatus: "invalid_oracle_id",
      layout: testCase.layout,
      requestedFace: testCase.cardFace,
    };
  }

  const catalogOracleText = combinedGoldenOracleText(catalogCard);
  const catalogHash = goldenOracleTextHash(catalogOracleText);

  let status: CatalogIdentityStatus = "exact";

  if (normalizeOracleNameLoose(catalogCard.canonicalName) !== normalizeOracleNameLoose(intendedName)) {
    status = "name_mismatch";
  } else if (normalizeOracleTextForCompare(storedOracleText) !== normalizeOracleTextForCompare(catalogOracleText)) {
    status = "oracle_text_mismatch";
  } else if (testCase.goldenOracleTextHash && testCase.goldenOracleTextHash !== catalogHash) {
    status = "oracle_text_mismatch";
  } else if (testCase.cardFace) {
    const faces = goldenFaceRecords(catalogCard);
    const faceOk = faces.some((f) => f.faceId === testCase.cardFace);
    if (!faceOk) status = "face_mismatch";
  } else if (testCase.layout && catalogCard.layout && testCase.layout !== catalogCard.layout) {
    // layout recorded but not a hard fail unless face requested
  }

  return {
    caseId: testCase.id,
    intendedName,
    oracleId: testCase.oracleId,
    catalogName: catalogCard.canonicalName,
    catalogOracleText,
    storedOracleText,
    catalogOracleTextHash: catalogHash,
    storedOracleTextHash,
    catalogIdentityStatus: status,
    layout: testCase.layout,
    catalogLayout: catalogCard.layout,
    requestedFace: testCase.cardFace,
  };
}

export function auditBenchmarkTargetValidity(
  testCase: OracleActionEvalCaseV2 & {
    selectionRule?: string;
    scopeReason?: string;
    benchmarkTargets?: MachineGroundedBenchmarkTarget[];
    expectedContext?: MachineGroundedBenchmarkTarget["expectedContext"];
  },
  catalogOracleText: string,
): BenchmarkTargetRow {
  const selectionRule = testCase.selectionRule ?? testCase.scopeReason;
  const targetSubstring = selectionRuleTargetFragment(selectionRule);
  const oracleHash = goldenOracleTextHash(catalogOracleText);
  const failureReasons: BenchmarkTargetStatus[] = [];

  if (testCase.benchmarkTargets?.length) {
    for (const target of testCase.benchmarkTargets) {
      if (target.oracleTextHash !== oracleHash) {
        failureReasons.push("semantic_context_mismatch");
      }
      if (target.fullRegionSpan && !assertSpanInOracle(catalogOracleText, target.fullRegionSpan)) {
        failureReasons.push("target_span_not_found");
      }
      if (target.recipientSpan && !assertSpanInOracle(catalogOracleText, target.recipientSpan)) {
        failureReasons.push("target_span_not_found");
      }
      if (target.grantingVerbSpan && !assertSpanInOracle(catalogOracleText, target.grantingVerbSpan)) {
        failureReasons.push("target_span_not_found");
      }
      if (target.grantedComplementSpan && !assertSpanInOracle(catalogOracleText, target.grantedComplementSpan)) {
        failureReasons.push("target_span_not_found");
      }
    }
    const status: BenchmarkTargetStatus = failureReasons.length ? failureReasons[0]! : "valid";
    return {
      caseId: testCase.id,
      oracleId: testCase.oracleId,
      benchmarkTargetStatus: status,
      failureReasons: [...new Set(failureReasons)],
      selectionRule,
      targetSubstring,
      benchmarkTargets: testCase.benchmarkTargets,
    };
  }

  // Legacy v135 cases: validate selectionRule substring only
  if (targetSubstring && !targetSubstringInOracle(catalogOracleText, targetSubstring)) {
    failureReasons.push("invalid_selection_rule");
    failureReasons.push("target_span_not_found");
    if (testCase.expectedContext && testCase.expectedContext === "genuine_granted") {
      failureReasons.push("semantic_context_mismatch");
    }
  }

  const status: BenchmarkTargetStatus =
    failureReasons.length === 0
      ? "valid"
      : failureReasons.includes("semantic_context_mismatch")
        ? "semantic_context_mismatch"
        : failureReasons.includes("intended_card_mismatch")
          ? "intended_card_mismatch"
          : "invalid_selection_rule";

  return {
    caseId: testCase.id,
    oracleId: testCase.oracleId,
    benchmarkTargetStatus: status,
    failureReasons: [...new Set(failureReasons)],
    selectionRule,
    targetSubstring,
  };
}

export function assertBenchmarkIdentity(
  catalog: GoldenCatalogIndex,
  testCase: OracleActionEvalCaseV2 & { cardName?: string; goldenOracleTextHash?: string; cardFace?: string },
): CatalogIdentityRow {
  const row = auditCatalogIdentity(catalog, testCase);
  if (row.catalogIdentityStatus !== "exact") {
    throw new BenchmarkIdentityError(
      `Catalog identity failed for ${testCase.id}: ${row.catalogIdentityStatus}`,
      [row],
    );
  }
  return row;
}

export function assertBenchmarkTargetValidity(
  testCase: OracleActionEvalCaseV2 & {
    selectionRule?: string;
    scopeReason?: string;
    benchmarkTargets?: MachineGroundedBenchmarkTarget[];
  },
  catalogOracleText: string,
): BenchmarkTargetRow {
  const row = auditBenchmarkTargetValidity(testCase, catalogOracleText);
  if (row.benchmarkTargetStatus !== "valid") {
    throw new BenchmarkTargetValidityError(
      `Benchmark target validity failed for ${testCase.id}: ${row.failureReasons.join(", ")}`,
      [row],
    );
  }
  return row;
}

export function assertAllBenchmarkIdentities(
  catalog: GoldenCatalogIndex,
  cases: Array<OracleActionEvalCaseV2 & { cardName?: string; goldenOracleTextHash?: string; cardFace?: string }>,
  label: string,
): CatalogIdentityRow[] {
  const rows = cases.map((c) => auditCatalogIdentity(catalog, c));
  const invalid = rows.filter((r) => r.catalogIdentityStatus !== "exact");
  if (invalid.length > 0) {
    throw new BenchmarkIdentityError(
      `${label}: ${invalid.length}/${cases.length} catalog identity failure(s) — ABORT EVALUATION`,
      invalid,
    );
  }
  return rows;
}

export function assertAllBenchmarkTargetValidities(
  catalog: GoldenCatalogIndex,
  cases: Array<
    OracleActionEvalCaseV2 & {
      selectionRule?: string;
      scopeReason?: string;
      benchmarkTargets?: MachineGroundedBenchmarkTarget[];
      expectedContext?: string;
    }
  >,
  label: string,
): BenchmarkTargetRow[] {
  const rows = cases.map((c) => {
    const card = catalog.byOracleId.get(c.oracleId);
    const oracleText = card ? combinedGoldenOracleText(card) : c.oracleText;
    return auditBenchmarkTargetValidity(c, oracleText);
  });
  const invalid = rows.filter((r) => r.benchmarkTargetStatus !== "valid");
  if (invalid.length > 0) {
    throw new BenchmarkTargetValidityError(
      `${label}: ${invalid.length}/${cases.length} benchmark target validity failure(s) — ABORT EVALUATION`,
      invalid,
    );
  }
  return rows;
}

/** Combined audit for reporting — does not conflate axes. */
export function auditBenchmarkValidationSplit(
  catalog: GoldenCatalogIndex,
  testCase: OracleActionEvalCaseV2 & {
    cardName?: string;
    selectionRule?: string;
    scopeReason?: string;
    goldenOracleTextHash?: string;
    benchmarkTargets?: MachineGroundedBenchmarkTarget[];
    expectedContext?: string;
  },
): { catalogIdentity: CatalogIdentityRow; benchmarkTarget: BenchmarkTargetRow } {
  const catalogIdentity = auditCatalogIdentity(catalog, testCase);
  const oracleText =
    catalogIdentity.catalogOracleText ??
    (catalog.byOracleId.get(testCase.oracleId)?.oracleText ?? testCase.oracleText);
  const benchmarkTarget = auditBenchmarkTargetValidity(testCase, oracleText);
  return { catalogIdentity, benchmarkTarget };
}

// Legacy export shim — deprecated combined row
export type BenchmarkIdentityRow = CatalogIdentityRow & {
  /** @deprecated use catalogIdentityStatus */
  identityExact: boolean;
  benchmarkTargetStatus?: BenchmarkTargetStatus;
};

export function auditBenchmarkIdentity(
  catalog: GoldenCatalogIndex,
  testCase: Parameters<typeof auditCatalogIdentity>[1] &
    Parameters<typeof auditBenchmarkTargetValidity>[0],
): BenchmarkIdentityRow {
  const split = auditBenchmarkValidationSplit(catalog, testCase);
  return {
    ...split.catalogIdentity,
    identityExact: split.catalogIdentity.catalogIdentityStatus === "exact",
    benchmarkTargetStatus: split.benchmarkTarget.benchmarkTargetStatus,
  };
}
