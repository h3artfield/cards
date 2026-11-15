/**
 * Populate eval case card identity from catalogOracleCards — seeds select by name only.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import {
  buildCatalogResolverIndexes,
  resolveCatalogSeed,
} from "./catalog-resolver";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  lookupGoldenByName,
  type GoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./load-golden-catalog-index";

export const EVALUATION_LABEL_VERSION = "eval-catalog-backed-v1";

export interface CatalogBackedIdentity {
  cardName: string;
  oracleId: string;
  oracleText: string;
  layout?: string;
  cardFace?: string;
  faceIndex?: number;
  faceName?: string;
  colorIdentity: string[];
  goldenCatalogVersion: string;
  goldenOracleTextHash: string;
  evaluationLabelVersion: string;
  reviewer: string;
  matchedBy?: string;
  correctedName?: string;
}

export interface NamedCardSeedBase {
  name: string;
  layout?: string;
  face?: string;
  oracleId?: string;
  /** @deprecated Seeds must not supply replacement oracle text for named cards. */
  text?: string;
}

export class CatalogSeedResolutionError extends Error {
  constructor(
    message: string,
    readonly seedName: string,
  ) {
    super(message);
    this.name = "CatalogSeedResolutionError";
  }
}

export function resolveNamedCardFromCatalog(
  catalog: GoldenCatalogIndex,
  seed: NamedCardSeedBase,
  reviewer: string,
): CatalogBackedIdentity {
  const indexes = buildCatalogResolverIndexes(catalog);
  const resolved = resolveCatalogSeed(catalog, indexes, {
    name: seed.name,
    oracleId: seed.oracleId,
    layout: seed.layout,
    face: seed.face,
  });

  const golden = resolved?.card ?? lookupGoldenByName(catalog, seed.name);
  if (!golden) {
    throw new CatalogSeedResolutionError(
      `Card "${seed.name}" not found in catalogOracleCards`,
      seed.name,
    );
  }

  if (seed.text?.trim()) {
    // Legacy seeds may still carry hand-authored text — always ignore; catalog is authoritative.
  }

  const oracleText = resolved?.oracleText ?? combinedGoldenOracleText(golden);
  return {
    cardName: resolved?.canonicalName ?? golden.canonicalName,
    oracleId: golden.oracleId,
    oracleText,
    layout: golden.layout ?? seed.layout,
    cardFace: resolved?.faceId ?? seed.face,
    faceIndex: resolved?.faceIndex,
    faceName: resolved?.faceName,
    colorIdentity: [...(golden.colorIdentity ?? [])],
    goldenCatalogVersion: catalog.catalogVersion,
    goldenOracleTextHash: goldenOracleTextHash(oracleText),
    evaluationLabelVersion: EVALUATION_LABEL_VERSION,
    reviewer,
    matchedBy: resolved?.matchedBy,
    correctedName: resolved?.correctedName,
  };
}

export function assertEvidenceInOracleText(
  oracleText: string,
  evidenceContains: string,
  context: string,
): boolean {
  if (!evidenceContains.trim()) return true;
  if (oracleText.toLowerCase().includes(evidenceContains.toLowerCase())) return true;
  console.warn(`[evidence-warning] ${context}: "${evidenceContains}" not found in catalog oracle text`);
  return false;
}

export function attachCatalogProvenance(
  testCase: OracleActionEvalCaseV2,
  identity: CatalogBackedIdentity,
): OracleActionEvalCaseV2 & CatalogBackedIdentity {
  return {
    ...testCase,
    oracleId: identity.oracleId,
    oracleText: identity.oracleText,
    layout: identity.layout ?? testCase.layout,
    cardName: identity.cardName,
    colorIdentity: identity.colorIdentity,
    goldenCatalogVersion: identity.goldenCatalogVersion,
    goldenOracleTextHash: identity.goldenOracleTextHash,
    evaluationLabelVersion: identity.evaluationLabelVersion,
    reviewer: identity.reviewer,
  };
}

export function catalogCardSummary(card: GoldenCatalogOracleCard): string {
  return `${card.canonicalName} (${card.oracleId}) layout=${card.layout ?? "normal"}`;
}
