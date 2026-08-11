/**
 * Parser-blind deterministic complexity buckets for catalog coverage studies.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

export type CatalogComplexityBucket = "simple" | "normal" | "complex" | "pathological";

export const CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION = "catalog-complexity-bucket-v1";

export type CatalogComplexityFeatures = {
  oracleTextLength: number;
  paragraphCount: number;
  modalSyntax: boolean;
  grantedAbilityWording: boolean;
  replacementWording: boolean;
  nestedQuoteDepth: number;
  multiFaceLayout: boolean;
  sagaOrPlaneswalker: boolean;
  conditionalChainCount: number;
  referentChainCount: number;
  score: number;
};

function countMatches(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m?.length ?? 0;
}

function maxNestedQuoteDepth(text: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of text) {
    if (ch === '"') {
      depth += 1;
      max = Math.max(max, depth);
    }
  }
  return max;
}

export function extractCatalogComplexityFeatures(input: {
  oracleText: string;
  layout?: string;
}): CatalogComplexityFeatures {
  const oracleText = input.oracleText.replace(/\r\n/g, "\n");
  const faces = segmentCardFaces(oracleText);
  const paragraphs = faces.flatMap((face) =>
    segmentAbilities("complexity", face.faceId, face.text, face.start),
  );

  const modalSyntax = /\bchoose (?:one|two|three|four|five|any number)\b/i.test(oracleText);
  const grantedAbilityWording = /\b(?:you control )?have "[^"]+"\b/i.test(oracleText);
  const replacementWording = /\b(?:instead|as though|would\b|rather than)/i.test(oracleText);
  const nestedQuoteDepth = maxNestedQuoteDepth(oracleText);
  const multiFaceLayout =
    Boolean(input.layout && !["normal", "split", "flip"].includes(input.layout)) ||
    faces.length > 1 ||
    /\/\//.test(oracleText);
  const sagaOrPlaneswalker =
    /\b(?:Chapter|Saga|loyalty:)\b/i.test(oracleText) ||
    ["saga", "planar", "vanguard", "scheme"].includes(input.layout ?? "");
  const conditionalChainCount =
    countMatches(oracleText, /\b(?:if|whenever|when|unless|as long as)\b/gi) +
    countMatches(oracleText, /\bthen\b/gi);
  const referentChainCount =
    countMatches(oracleText, /\b(?:that|those|it|they|this|these)\b/gi) +
    countMatches(oracleText, /\b(?:exiled with|attached to|under your control)\b/gi);

  let score = 0;
  score += oracleText.length > 220 ? 2 : oracleText.length > 120 ? 1 : 0;
  score += paragraphs.length > 4 ? 2 : paragraphs.length > 2 ? 1 : 0;
  if (modalSyntax) score += 1;
  if (grantedAbilityWording) score += 1;
  if (replacementWording) score += 1;
  if (nestedQuoteDepth >= 4) score += 2;
  else if (nestedQuoteDepth >= 2) score += 1;
  if (multiFaceLayout) score += 1;
  if (sagaOrPlaneswalker) score += 1;
  if (conditionalChainCount >= 6) score += 2;
  else if (conditionalChainCount >= 3) score += 1;
  if (referentChainCount >= 10) score += 2;
  else if (referentChainCount >= 5) score += 1;

  return {
    oracleTextLength: oracleText.length,
    paragraphCount: paragraphs.length,
    modalSyntax,
    grantedAbilityWording,
    replacementWording,
    nestedQuoteDepth,
    multiFaceLayout,
    sagaOrPlaneswalker,
    conditionalChainCount,
    referentChainCount,
    score,
  };
}

/** Deterministic bucket from parser-blind features only. */
export function assignCatalogComplexityBucket(features: CatalogComplexityFeatures): CatalogComplexityBucket {
  if (features.score >= 8) return "pathological";
  if (features.score >= 5) return "complex";
  if (features.score >= 2) return "normal";
  return "simple";
}

export function classifyCatalogCardComplexity(input: {
  oracleText: string;
  layout?: string;
}): { bucket: CatalogComplexityBucket; features: CatalogComplexityFeatures } {
  const features = extractCatalogComplexityFeatures(input);
  return { bucket: assignCatalogComplexityBucket(features), features };
}
