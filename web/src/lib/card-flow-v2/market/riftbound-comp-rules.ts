import type { CompRejectionReason, MarketSearchPlan } from "./types";
import type { CardSuspect } from "../types";
import {
  RIFTBOUND_FORBIDDEN_SEARCH_TERMS,
  identityFieldsFromSuspect,
} from "../knowledge/riftbound";

function titleLower(title: string): string {
  return title.toLowerCase();
}

function hasTerm(title: string, term: string): boolean {
  return titleLower(title).includes(term.toLowerCase());
}

export type RiftboundCompVariantContext = {
  isAltArt: boolean;
  isOvernumbered: boolean;
  isSignature: boolean;
  isBase: boolean;
  isUltimate: boolean;
};

export function riftboundVariantContextFromPlan(
  plan: MarketSearchPlan,
): RiftboundCompVariantContext {
  const tags = plan.requiredTerms.join(" ").toLowerCase();
  const name = plan.marketProductName.toLowerCase();
  return {
    isAltArt:
      tags.includes("alternate art") ||
      name.includes("[alternate art]") ||
      /#\d+a\b/i.test(name),
    isOvernumbered:
      tags.includes("overnumbered") || name.includes("[overnumbered]"),
    isSignature:
      tags.includes("signature") ||
      name.includes("[signature]") ||
      name.includes("*"),
    isBase:
      !tags.includes("alternate art") &&
      !tags.includes("overnumbered") &&
      !tags.includes("signature") &&
      !name.includes("[alternate art]") &&
      !name.includes("[overnumbered]") &&
      !name.includes("[signature]"),
    isUltimate: tags.includes("ultimate") || name.includes("[ultimate]"),
  };
}

export function riftboundVariantContextFromSuspect(
  suspect: CardSuspect,
): RiftboundCompVariantContext {
  const id = identityFieldsFromSuspect(suspect);
  return {
    isAltArt:
      id.rarity === "alternate_art" ||
      Boolean(id.parsedCollectorNumber?.hasAltArtSuffix),
    isOvernumbered:
      id.rarity === "overnumbered" ||
      id.rarity === "signature_overnumbered" ||
      Boolean(id.parsedCollectorNumber?.isOvernumbered),
    isSignature: id.signatureType === "official_signature_overnumber",
    isBase:
      !id.parsedCollectorNumber?.hasAltArtSuffix &&
      !id.parsedCollectorNumber?.isOvernumbered &&
      id.signatureType !== "official_signature_overnumber" &&
      id.rarity !== "ultimate",
    isUltimate: id.rarity === "ultimate",
  };
}

/** Reject comps that mismatch Riftbound variant identity. */
export function assessRiftboundCompVariant(
  title: string,
  ctx: RiftboundCompVariantContext,
): CompRejectionReason | null {
  const lower = titleLower(title);

  if (ctx.isBase) {
    if (hasTerm(lower, "alternate art") || hasTerm(lower, "alt art")) {
      return "wrong_finish";
    }
    if (hasTerm(lower, "overnumbered") || hasTerm(lower, "overnumber")) {
      return "wrong_finish";
    }
    if (hasTerm(lower, "signature") || hasTerm(lower, "signed")) {
      return "wrong_finish";
    }
  }

  if (ctx.isAltArt) {
    if (
      !hasTerm(lower, "alternate art") &&
      !hasTerm(lower, "alt art") &&
      !/#\d+a\b/i.test(lower) &&
      !hasTerm(lower, "alt")
    ) {
      return "wrong_finish";
    }
    if (hasTerm(lower, "overnumbered")) return "wrong_finish";
  }

  if (ctx.isOvernumbered && !ctx.isSignature) {
    if (hasTerm(lower, "signature") || hasTerm(lower, "signed")) {
      return "wrong_finish";
    }
  }

  if (ctx.isSignature) {
    if (
      !hasTerm(lower, "signature") &&
      !hasTerm(lower, "signed") &&
      !lower.includes("*")
    ) {
      return "wrong_finish";
    }
    if (hasTerm(lower, "unsigned") || hasTerm(lower, "non signature")) {
      return "wrong_finish";
    }
    if (hasTerm(lower, "hand signed") || hasTerm(lower, "aftermarket")) {
      return "wrong_finish";
    }
  }

  if (ctx.isUltimate && !hasTerm(lower, "ultimate")) {
    return "wrong_finish";
  }

  return null;
}

export function buildRiftboundForbiddenTerms(
  ctx: RiftboundCompVariantContext,
  gradeCtx: "raw" | "graded",
): string[] {
  const terms: string[] = [];
  if (gradeCtx === "raw") terms.push(...RIFTBOUND_FORBIDDEN_SEARCH_TERMS.raw);
  else terms.push(...RIFTBOUND_FORBIDDEN_SEARCH_TERMS.graded);

  if (ctx.isBase) terms.push(...RIFTBOUND_FORBIDDEN_SEARCH_TERMS.base);
  if (ctx.isOvernumbered && !ctx.isSignature) {
    terms.push(...RIFTBOUND_FORBIDDEN_SEARCH_TERMS.nonSignatureOvernumbered);
  }
  if (ctx.isSignature) {
    terms.push(...RIFTBOUND_FORBIDDEN_SEARCH_TERMS.signatureOvernumbered);
  }

  return [...new Set(terms.map((t) => t.toLowerCase()))];
}

export function riftboundVariantContextFromFields(fields: {
  variantTags?: string[];
  marketProductName?: string;
  collectorNumber?: string;
  cardNumber?: string;
  rarity?: string;
}): RiftboundCompVariantContext {
  const tags = (fields.variantTags ?? []).join(" ").toLowerCase();
  const name = (fields.marketProductName ?? "").toLowerCase();
  const num = fields.collectorNumber ?? fields.cardNumber ?? "";
  return {
    isAltArt:
      tags.includes("alternate_art") ||
      tags.includes("alt_art") ||
      num.endsWith("a") ||
      name.includes("[alternate art]"),
    isOvernumbered:
      tags.includes("overnumbered") || name.includes("[overnumbered]") ||
      (/\d{3,}/.test(num) && !num.includes("/298")),
    isSignature:
      tags.includes("signature") ||
      tags.includes("official_signature_overnumber") ||
      num.includes("*") ||
      name.includes("[signature]"),
    isBase:
      !tags.includes("alternate_art") &&
      !tags.includes("overnumbered") &&
      !tags.includes("signature") &&
      !num.endsWith("a") &&
      !num.includes("*"),
    isUltimate: tags.includes("ultimate") || (fields.rarity ?? "").includes("ultimate"),
  };
}

export function buildRiftboundRequiredTerms(input: {
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  ctx: RiftboundCompVariantContext;
}): string[] {
  const req: string[] = [];
  if (input.name) req.push(input.name);
  if (input.setCode) req.push(input.setCode);
  if (input.collectorNumber) {
    req.push(input.collectorNumber.replace("*", ""));
  }
  if (input.ctx.isAltArt) req.push("Alternate Art");
  if (input.ctx.isOvernumbered && !input.ctx.isSignature) req.push("Overnumbered");
  if (input.ctx.isSignature) req.push("Signature");
  if (input.ctx.isUltimate) req.push("Ultimate");
  return req.filter(Boolean);
}
