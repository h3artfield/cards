/**
 * GrantedRulesRegion — one detected granting region may contain multiple nested ability spans.
 */
import type { GrantedRulesSpan } from "./oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan, type ClassifiedGrantedRulesSpan } from "./oracle-rc3-granted-rules-classifier";
import { detectQuoteSpans } from "./oracle-rc3-quote-span-detector";

export interface ContainedAbilitySpan {
  localStart: number;
  localEnd: number;
  innerText: string;
  goldKeyHints: string[];
}

export interface GrantedRulesRegion {
  regionId: string;
  span: GrantedRulesSpan;
  grantedTo?: string;
  grantingClauseId?: string;
  containedAbilitySpans: ContainedAbilitySpan[];
  classification?: ClassifiedGrantedRulesSpan["classification"];
  grantedAbilityType?: ClassifiedGrantedRulesSpan["grantedAbilityType"];
}

function spansOverlap(
  a: { localStart: number; localEnd: number },
  b: { localStart: number; localEnd: number },
): boolean {
  return a.localStart < b.localEnd && b.localStart < a.localEnd;
}

/** Derive nested ability spans inside a granted region (quotes/parens within region bounds). */
export function deriveContainedAbilitySpans(
  paragraph: string,
  region: GrantedRulesSpan,
  goldHints: Array<{ evidenceContains?: string }> = [],
): ContainedAbilitySpan[] {
  const slice = paragraph.slice(region.localStart, region.localEnd);
  const offset = region.localStart;
  const contained: ContainedAbilitySpan[] = [];

  const addSpan = (localStart: number, localEnd: number, innerText: string, goldKeyHints: string[] = []) => {
    const absStart = offset + localStart;
    const absEnd = offset + localEnd;
    if (contained.some((c) => c.localStart === absStart && c.localEnd === absEnd)) return;
    contained.push({ localStart: absStart, localEnd: absEnd, innerText, goldKeyHints });
  };

  if (region.typography === "quoted") {
    addSpan(0, region.localEnd - region.localStart, region.innerText);
    return contained;
  }

  for (const q of detectQuoteSpans(slice)) {
    const hints = goldHints
      .filter((g) =>
        q.innerText.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 12)),
      )
      .map((g) => (g.evidenceContains ?? "").slice(0, 24));
    addSpan(q.localStart, q.localEnd, q.innerText, hints);
  }

  if (contained.length === 0) {
    addSpan(0, region.localEnd - region.localStart, region.innerText);
  }

  return contained.sort((a, b) => a.localStart - b.localStart);
}

export function buildGrantedRulesRegions(
  paragraph: string,
  detectedSpans: GrantedRulesSpan[],
  goldHints: Array<{ evidenceContains?: string }> = [],
  parentAbilityId?: string,
): GrantedRulesRegion[] {
  return detectedSpans.map((span, index) => {
    const classified = classifyGrantedRulesSpan(paragraph, span);
    const regionId = `${parentAbilityId ?? "ability"}:granted-region:${span.localStart}:${index}`;
    return {
      regionId,
      span,
      grantedTo: span.grantedTo,
      grantingClauseId: span.grantingClauseId ?? parentAbilityId,
      containedAbilitySpans: deriveContainedAbilitySpans(paragraph, span, goldHints),
      classification: classified.classification,
      grantedAbilityType: classified.grantedAbilityType,
    };
  });
}

/** Map gold-derived spans onto detected regions (many gold spans → one region allowed). */
export function mapGoldSpansToRegions(
  goldSpans: Array<{ localStart: number; localEnd: number; goldKeys: string[] }>,
  regions: GrantedRulesRegion[],
): Array<{ goldSpan: (typeof goldSpans)[number]; region: GrantedRulesRegion | null }> {
  return goldSpans.map((goldSpan) => ({
    goldSpan,
    region: regions.find((r) => spansOverlap(r.span, goldSpan)) ?? null,
  }));
}
