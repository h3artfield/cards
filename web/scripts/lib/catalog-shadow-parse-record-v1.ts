/**
 * Build deterministic shadow parse records — one row per oracleId, not per printing.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  countAcceptedActionOutsideOwnerSpan,
  verifySemanticParseIntegrity,
} from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import {
  ORACLE_ACTION_RC3_PARSER_VERSION,
  parseOracleSemanticsRC3,
} from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { countAcceptedReminderDerivedLayer2 } from "./reminder-derived-leakage-v1";
import { PARSER_BLOB_SCOPE_PATHS } from "./parser-scope-paths-v1";
import {
  computeParserBlobClosureFromDisk,
  sha256FileFromDisk,
} from "./working-tree-provenance-guard-v1";
import type { CatalogOracleRecord } from "./load-catalog-oracle-records-v1";
import { classifyCatalogCardComplexity } from "./catalog-complexity-bucket-v1";

const PARSER_SCOPE = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];

export type CatalogShadowParseRecord = {
  oracleId: string;
  canonicalName: string;
  oracleTextHash: string;
  parserVersion: typeof ORACLE_ACTION_RC3_PARSER_VERSION;
  parserBlobClosure: string;
  complexityBucket: ReturnType<typeof classifyCatalogCardComplexity>["bucket"];
  semantic: {
    abilities: ReturnType<typeof parseOracleSemanticsRC3>["abilities"];
    actions: ReturnType<typeof parseOracleSemanticsRC3>["actions"];
    objects: ReturnType<typeof parseOracleSemanticsRC3>["objects"];
    diagnostics: ReturnType<typeof parseOracleSemanticsRC3>["diagnostics"];
  };
  acceptedActions: ReturnType<typeof parseOracleSemanticsRC3>["actions"];
  needsReviewActions: ReturnType<typeof parseOracleSemanticsRC3>["actions"];
  abstentions: ReturnType<typeof parseOracleSemanticsRC3>["actions"];
  semanticInvalid: boolean;
  idViolations: ReturnType<typeof verifySemanticParseIntegrity>["idViolations"];
  provenanceViolations: ReturnType<typeof verifySemanticParseIntegrity>["provenanceViolations"];
  acceptedReminderDerivedLayer2Count: number;
  acceptedActionOutsideOwnerSpanCount: number;
  forbiddenEmissionCount: number;
  unsupportedConstructCount: number;
  hasDiagnostics: boolean;
  idInvalid: boolean;
  provenanceInvalid: boolean;
  structuralInvalid: boolean;
  publishable: boolean;
  deterministicReasoningEligible: boolean;
  primaryStructuralFailure?: string;
};

let cachedParserBlobClosure: string | undefined;

const RC8_PROVENANCE_MANIFEST = "data/milestones/rc8-development/rc8-provenance-lf-packaging-manifest-v1.json";

export function getCatalogShadowParserBlobClosure(): string {
  if (!cachedParserBlobClosure) {
    try {
      const manifest = JSON.parse(readFileSync(resolve(RC8_PROVENANCE_MANIFEST), "utf8")) as {
        parserBlobClosureHash: string;
      };
      cachedParserBlobClosure = manifest.parserBlobClosureHash;
    } catch {
      cachedParserBlobClosure = computeParserBlobClosureFromDisk(PARSER_SCOPE, sha256FileFromDisk);
    }
  }
  return cachedParserBlobClosure;
}

export function buildCatalogShadowParseRecord(card: CatalogOracleRecord): CatalogShadowParseRecord {
  const parsed = parseOracleSemanticsRC3({
    oracleId: card.oracleId,
    oracleText: card.oracleText,
  });
  const integrity = verifySemanticParseIntegrity(parsed, card.oracleText);
  const acceptedActions = parsed.actions.filter((a) => a.reviewStatus === "accepted");
  const needsReviewActions = parsed.actions.filter((a) => a.reviewStatus === "needs_review");
  const abstentions = parsed.actions.filter((a) => a.reviewStatus === "overridden");
  const unsupportedConstructCount = parsed.diagnostics.filter((d) =>
    /unsupported|abstain|not supported/i.test(d.code ?? d.message ?? ""),
  ).length;

  let forbiddenEmissionCount = 0;
  for (const action of parsed.legacy.actions) {
    if ((action as { forbiddenEmission?: boolean }).forbiddenEmission) forbiddenEmissionCount += 1;
  }

  const { bucket } = classifyCatalogCardComplexity({
    oracleText: card.oracleText,
    layout: card.layout,
  });

  const idInvalid = integrity.idViolations.length > 0;
  const provenanceInvalid = integrity.provenanceViolations.length > 0;
  const structuralInvalid =
    !parsed.semanticValidation.valid || idInvalid || provenanceInvalid;
  const publishable = !structuralInvalid && !idInvalid && !provenanceInvalid;
  const deterministicReasoningEligible = publishable;

  const primaryStructuralFailure = idInvalid
    ? integrity.idViolations[0]?.code
    : provenanceInvalid
      ? integrity.provenanceViolations[0]?.code
      : !parsed.semanticValidation.valid
        ? "semantic_validation_invalid"
        : undefined;

  return {
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    oracleTextHash: card.oracleTextHash,
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserBlobClosure: getCatalogShadowParserBlobClosure(),
    complexityBucket: bucket,
    semantic: {
      abilities: parsed.abilities,
      actions: parsed.actions,
      objects: parsed.objects,
      diagnostics: parsed.diagnostics,
    },
    acceptedActions,
    needsReviewActions,
    abstentions,
    semanticInvalid: structuralInvalid,
    idViolations: integrity.idViolations,
    provenanceViolations: integrity.provenanceViolations,
    acceptedReminderDerivedLayer2Count: countAcceptedReminderDerivedLayer2(card.oracleText, parsed.actions),
    acceptedActionOutsideOwnerSpanCount: countAcceptedActionOutsideOwnerSpan(parsed),
    forbiddenEmissionCount,
    unsupportedConstructCount,
    hasDiagnostics: parsed.diagnostics.length > 0,
    idInvalid,
    provenanceInvalid,
    structuralInvalid,
    publishable,
    deterministicReasoningEligible,
    primaryStructuralFailure,
  };
}

export function stableCatalogShadowDigest(records: readonly CatalogShadowParseRecord[]): string {
  const rows = records.map((r) => ({
    oracleId: r.oracleId,
    oracleTextHash: r.oracleTextHash,
    acceptedCount: r.acceptedActions.length,
    needsReviewCount: r.needsReviewActions.length,
    semanticInvalid: r.semanticInvalid,
    idViolationCount: r.idViolations.length,
    provenanceViolationCount: r.provenanceViolations.length,
  }));
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function gitHeadSha(): string {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
}
