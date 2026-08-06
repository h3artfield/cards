import { createHash } from "node:crypto";
import type { CardRuling } from "./schemas";

export interface ParsedRulingResult {
  ruling: CardRuling | null;
  exclusionReason?: string;
}

export function rulingContentHash(input: {
  oracleId: string;
  publishedAt: string;
  rulingText: string;
  source: string;
}): string {
  return createHash("sha256")
    .update(`${input.oracleId}|${input.publishedAt}|${input.rulingText}|${input.source}`)
    .digest("hex");
}

export function parseRulingFromBulk(
  raw: Record<string, unknown>,
  bulkUpdatedAt: string,
  importedAt: string,
): ParsedRulingResult {
  const oracleId = String(raw.oracle_id ?? "").trim();
  const publishedAt = String(raw.published_at ?? "").trim();
  const rawComment = String(raw.comment ?? raw.text ?? "");
  const rulingText = rawComment.trim();
  const source = String(raw.source ?? "scryfall").trim();

  if (!oracleId || !publishedAt) {
    return {
      ruling: null,
      exclusionReason: "missing_oracle_or_date",
    };
  }

  if (!rulingText) {
    return {
      ruling: null,
      exclusionReason: "empty_ruling_text",
    };
  }

  const contentHash = rulingContentHash({ oracleId, publishedAt, rulingText, source });
  const docId = contentHash;

  return {
    ruling: {
      id: docId,
      rulingId: docId,
      oracleId,
      publishedAt,
      rulingText,
      source,
      sourceVersion: RULINGS_SOURCE_VERSION,
      importedAt,
      contentHash,
    },
  };
}

export const RULINGS_SOURCE_VERSION = "scryfall-rulings-bulk-v1";

export const INTENTIONAL_RULING_EXCLUSIONS = new Set(["empty_ruling_text"]);
