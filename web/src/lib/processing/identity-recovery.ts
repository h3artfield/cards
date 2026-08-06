import type {
  CardIdentityVerification,
  ScannedCard,
  VisionResult,
} from "../types";
import type { PricingRaw } from "./reference-image";
import {
  catalogIdentityFields,
  getCatalogImageUrl,
} from "./reference-image";
import {
  findCatalogCandidates,
  lookupMarketPrice,
  type CatalogMatch,
} from "./pricing";
import { enrichVisionFromPokemonCard, scorePokemonCatalogCard } from "./pokemon-utils";
import type { PriceChartingProduct } from "./pricing/pricecharting-pricing";
import { enrichVisionFromPriceCharting } from "./pricing/pricecharting-utils";
import { recoverSlabIdentity } from "./slab-identity-recovery";
import { enrichCardFromSlabLabel } from "./slab-label-read";
import { isGradedSlab } from "./slab-pricing";

const CANDIDATE_SCHEMA = `Return JSON only:
{
  "bestCandidateIndex": number or null,
  "matchScore": number between 0 and 1,
  "verdict": "confirmed|likely|mismatch|inconclusive",
  "detectedFinish": "reverse_holo|holo|normal|unknown",
  "sameArtwork": boolean,
  "sameSetAndNumber": boolean,
  "summary": string,
  "notes": string[]
}`;

export interface CardIdentityResult {
  verification: CardIdentityVerification;
  /** Set when recovery finds a better catalog match. */
  cardPatch?: Partial<ScannedCard>;
}

function candidateLabel(
  index: number,
  catalog: CatalogMatch,
): string {
  const fields = catalogIdentityFields(catalog.raw, catalog.source);
  const extras: string[] = [];
  if (fields.rarity) extras.push(fields.rarity);
  if (catalog.source === "pokemon_tcg") {
    const prices = (
      catalog.raw.tcgplayer as
        | { prices?: Record<string, unknown> }
        | undefined
    )?.prices;
    if (prices?.reverseHolofoil) extras.push("has reverse holo pricing");
    if (prices?.holofoil) extras.push("has holo pricing");
    if (prices?.normal) extras.push("has normal pricing");
  }
  return `Candidate ${index}: ${fields.name} · ${fields.set ?? "?"} · ${fields.number ?? "?"}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}

function needsRecovery(verification: CardIdentityVerification): boolean {
  if (
    verification.referenceImageUrl &&
    verification.sameArtwork === false
  ) {
    return true;
  }
  return (
    verification.verdict === "mismatch" ||
    verification.verdict === "inconclusive" ||
    verification.matchScore < 0.55
  );
}

function rankCandidates(
  candidates: CatalogMatch[],
  vision: VisionResult,
): CatalogMatch[] {
  const name = vision.cardName?.trim().toLowerCase();
  const ranked = [...candidates].sort(
    (a, b) =>
      scorePokemonCatalogCard(b.raw, vision) -
      scorePokemonCatalogCard(a.raw, vision),
  );
  if (!name) return ranked;
  const sameName = ranked.filter(
    (c) => String(c.raw.name ?? "").toLowerCase() === name,
  );
  return sameName.length ? sameName : ranked;
}

function inferFinishFromCatalog(
  catalog: CatalogMatch,
  detectedFinish?: string,
  variant?: string,
): string | undefined {
  if (detectedFinish && detectedFinish !== "unknown") return detectedFinish;
  const v = variant?.toLowerCase() ?? "";
  if (v.includes("reverse")) return "reverse_holo";
  if (catalog.source === "pokemon_tcg") {
    const prices = (
      catalog.raw.tcgplayer as { prices?: Record<string, unknown> } | undefined
    )?.prices;
    if (prices?.reverseHolofoil && !prices?.holofoil) return "reverse_holo";
  }
  return detectedFinish;
}

async function metadataFallbackRecovery(
  card: ScannedCard,
  candidates: CatalogMatch[],
  vision: VisionResult,
  apiKey: string,
  model: string,
): Promise<{
  verification: CardIdentityVerification;
  winningCatalog?: CatalogMatch;
  detectedFinish?: string;
} | null> {
  const ranked = rankCandidates(candidates, vision);
  const top = ranked[0];
  if (!top) return null;

  const topScore = scorePokemonCatalogCard(top.raw, vision);
  if (topScore < 50) return null;

  const url = getCatalogImageUrl(top.raw as PricingRaw, top.source);
  if (url) {
    const content = [
      {
        type: "text" as const,
        text: `Customer photo (image 1) vs catalog reference (image 2).
Claimed: ${card.detectedName} · ${card.setName} · ${card.cardNumber}

This is a recovery check — the catalog record may have a different finish (reverse holo) than the reference scan.
If artwork/name/set match aside from holo foil on the text box, return confirmed or likely.`,
      },
      {
        type: "image_url" as const,
        image_url: { url: card.frontImageUrl, detail: "high" as const },
      },
      {
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Verify whether the customer photo shows the same Pokémon card as the catalog reference.
Reverse holo foil on the text box is NOT a mismatch when artwork matches.\n${CANDIDATE_SCHEMA}`,
          },
          { role: "user", content },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content) as {
        verdict?: CardIdentityVerification["verdict"];
        matchScore?: number;
        detectedFinish?: string;
        sameArtwork?: boolean;
        sameSetAndNumber?: boolean;
        summary?: string;
        notes?: string[];
      };

      if (
        parsed.verdict === "confirmed" ||
        parsed.verdict === "likely" ||
        (parsed.matchScore ?? 0) >= 0.55
      ) {
        return {
          verification: {
            verdict:
              parsed.verdict === "mismatch" || parsed.verdict === "inconclusive"
                ? "likely"
                : (parsed.verdict ?? "likely"),
            matchScore: Math.min(
              1,
              Math.max(0.65, Number(parsed.matchScore) || 0.75),
            ),
            referenceImageUrl: url,
            referenceSource: top.source,
            sameArtwork: Boolean(parsed.sameArtwork ?? true),
            sameSetAndNumber: Boolean(parsed.sameSetAndNumber),
            summary:
              parsed.summary?.trim() ??
              "Catalog match recovered via metadata and artwork check.",
            notes: [
              ...(Array.isArray(parsed.notes) ? parsed.notes.map(String) : []),
              `Metadata fallback selected top catalog match (score ${topScore}).`,
            ].slice(0, 6),
            verifiedAt: new Date().toISOString(),
            model,
            candidatesChecked: candidates.length,
            correctedMatch: true,
          },
          winningCatalog: top,
          detectedFinish: parsed.detectedFinish,
        };
      }
    }
  }

  if (topScore >= 70) {
    const fields = catalogIdentityFields(top.raw, top.source);
    return {
      verification: {
        verdict: "likely",
        matchScore: 0.72,
        referenceImageUrl: url,
        referenceSource: top.source,
        sameArtwork: true,
        sameSetAndNumber: Boolean(
          fields.number &&
            card.cardNumber &&
            fields.number.includes(
              String(card.cardNumber).replace(/^0+(\d)/, "$1"),
            ),
        ),
        summary: `Recovered catalog match: ${fields.name ?? card.detectedName} · ${fields.set ?? "?"} · ${fields.number ?? "?"}. Vision set/number may have been misread.`,
        notes: [
          `Metadata fallback (score ${topScore}) — finish inferred from photo/catalog.`,
        ],
        verifiedAt: new Date().toISOString(),
        model,
        candidatesChecked: candidates.length,
        correctedMatch: true,
      },
      winningCatalog: top,
      detectedFinish: inferFinishFromCatalog(top, undefined, card.variant),
    };
  }

  return null;
}

export async function compareAgainstCandidates(
  card: ScannedCard,
  candidates: CatalogMatch[],
  apiKey: string,
  model: string,
  vision: VisionResult,
): Promise<{
  verification: CardIdentityVerification;
  winningCatalog?: CatalogMatch;
  detectedFinish?: string;
}> {
  const ranked = rankCandidates(candidates, vision);
  const withImages = ranked
    .map((catalog) => ({
      catalog,
      url: getCatalogImageUrl(catalog.raw as PricingRaw, catalog.source),
    }))
    .filter((c): c is { catalog: CatalogMatch; url: string } => Boolean(c.url))
    .slice(0, 6);

  if (!withImages.length) {
    return {
      verification: {
        verdict: "inconclusive",
        matchScore: 0,
        sameArtwork: false,
        sameSetAndNumber: false,
        summary: "No catalog reference images found for candidate printings.",
        notes: [`Checked ${candidates.length} catalog records.`],
        verifiedAt: new Date().toISOString(),
        model,
        candidatesChecked: candidates.length,
      },
    };
  }

  const slab = isGradedSlab(card);
  const labels = withImages.map((c, i) => candidateLabel(i, c.catalog));
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: `Customer photo is image 1${slab ? " (graded slab in plastic case — compare visible illustration through the case)" : ""}. Official catalog references follow (images 2-${withImages.length + 1}).
Claimed: ${card.detectedName} · ${card.setName} · ${card.cardNumber}${card.slabCompany ? ` · ${card.slabCompany} ${card.slabGrade ?? ""}` : ""}

${labels.join("\n")}

Pick the candidate whose artwork matches the customer photo (same card printing, set, collector number, and illustration).
Japanese vs English with different artwork = different candidates — pick the one that matches the visible art.
Character Rare / full-art vs standard printing = different artwork.
For Pokémon: reverse holo uses the SAME artwork as the catalog scan but has a holo foil pattern on the text box — that is NOT a mismatch.
If none match, set bestCandidateIndex to null.`,
    },
    {
      type: "image_url",
      image_url: { url: card.frontImageUrl, detail: "high" },
    },
  ];

  for (const c of withImages) {
    content.push({
      type: "image_url",
      image_url: { url: c.url, detail: "high" },
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You match customer trading card photos to the correct catalog printing.
Compare artwork, name, set, and collector number. Handle reverse holo correctly.
${CANDIDATE_SCHEMA}`,
        },
        { role: "user", content },
      ],
      max_tokens: 600,
      temperature: 0.15,
    }),
  });

  if (!response.ok) {
    throw new Error(`Candidate identity compare failed: ${await response.text()}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content) as {
    bestCandidateIndex?: number | null;
    matchScore?: number;
    verdict?: CardIdentityVerification["verdict"];
    detectedFinish?: string;
    sameArtwork?: boolean;
    sameSetAndNumber?: boolean;
    summary?: string;
    notes?: string[];
  };

  const verdicts = ["confirmed", "likely", "mismatch", "inconclusive"] as const;
  const idx = parsed.bestCandidateIndex;
  const winner =
    idx != null && idx >= 0 && idx < withImages.length
      ? withImages[idx]
      : undefined;

  const verification: CardIdentityVerification = {
    verdict: verdicts.includes(parsed.verdict as (typeof verdicts)[number])
      ? (parsed.verdict as CardIdentityVerification["verdict"])
      : winner
        ? "likely"
        : "inconclusive",
    matchScore: Math.min(1, Math.max(0, Number(parsed.matchScore) || 0)),
    referenceImageUrl: winner?.url,
    referenceSource: winner?.catalog.source,
    sameArtwork: Boolean(parsed.sameArtwork),
    sameSetAndNumber: Boolean(parsed.sameSetAndNumber),
    summary:
      parsed.summary?.trim() ??
      (winner
        ? `Matched catalog candidate ${idx}.`
        : "No catalog candidate matched the customer photo."),
    notes: [
      ...(Array.isArray(parsed.notes) ? parsed.notes.map(String) : []),
      `Recovery checked ${candidates.length} catalog record(s), compared ${withImages.length} reference image(s).`,
    ].slice(0, 6),
    verifiedAt: new Date().toISOString(),
    model,
    candidatesChecked: candidates.length,
    correctedMatch: Boolean(winner),
  };

  return {
    verification,
    winningCatalog: winner?.catalog,
    detectedFinish: parsed.detectedFinish,
  };
}

export async function buildCardPatchFromCatalog(
  card: ScannedCard,
  catalog: CatalogMatch,
  detectedFinish?: string,
): Promise<Partial<ScannedCard>> {
  const vision = (card.visionJson ?? {}) as unknown as VisionResult;
  let updatedVision: VisionResult = { ...vision };

  if (catalog.source === "pokemon_tcg") {
    updatedVision = enrichVisionFromPokemonCard(updatedVision, catalog.raw);
  }
  if (catalog.source === "pricecharting") {
    updatedVision = enrichVisionFromPriceCharting(
      updatedVision,
      catalog.raw as PriceChartingProduct,
    );
  }

  if (detectedFinish === "reverse_holo") {
    updatedVision = {
      ...updatedVision,
      variant: updatedVision.variant ?? "Reverse Holo",
    };
  } else if (detectedFinish === "holo") {
    updatedVision = {
      ...updatedVision,
      variant: updatedVision.variant ?? "Holo",
    };
  }

  const pricing = await lookupMarketPrice(updatedVision);
  const fields = catalogIdentityFields(catalog.raw, catalog.source);

  return {
    category: updatedVision.category ?? card.category,
    detectedName: updatedVision.cardName ?? fields.name ?? card.detectedName,
    setName: updatedVision.setName ?? fields.set ?? card.setName,
    cardNumber: updatedVision.cardNumber ?? fields.number ?? card.cardNumber,
    variant: updatedVision.variant ?? card.variant,
    visionJson: updatedVision as unknown as Record<string, unknown>,
    pricingJson: {
      ...pricing,
      raw: catalog.raw,
      source: catalog.source,
      sourceUrl: catalog.sourceUrl,
    } as unknown as Record<string, unknown>,
  };
}

export async function recoverIdentityOnMismatch(
  card: ScannedCard,
  initial: CardIdentityVerification,
  apiKey: string,
  model: string,
): Promise<CardIdentityResult> {
  let workingCard = card;
  if (isGradedSlab(card)) {
    workingCard = await enrichCardFromSlabLabel(card);
  }

  const vision = workingCard.visionJson as VisionResult | undefined;
  if (!vision) {
    if (isGradedSlab(workingCard)) {
      const slabFix = await recoverSlabIdentity(workingCard, apiKey, model);
      if (slabFix) return slabFix;
    }
    return { verification: initial };
  }

  const candidates = await findCatalogCandidates(vision);
  if (!candidates.length) {
    if (isGradedSlab(workingCard)) {
      const slabFix = await recoverSlabIdentity(workingCard, apiKey, model);
      if (slabFix) return slabFix;
    }
    return {
      verification: {
        ...initial,
        notes: [
          ...(initial.notes ?? []),
          "Recovery: no alternate catalog printings found.",
        ],
      },
    };
  }

  const { verification, winningCatalog, detectedFinish } =
    await compareAgainstCandidates(workingCard, candidates, apiKey, model, vision);

  if (
    winningCatalog &&
    verification.verdict !== "mismatch" &&
    verification.verdict !== "inconclusive"
  ) {
    const cardPatch = await buildCardPatchFromCatalog(
      workingCard,
      winningCatalog,
      detectedFinish,
    );

    return {
      verification: {
        ...verification,
        correctedMatch: true,
        summary: `${verification.summary} Catalog match corrected after recovery.`,
      },
      cardPatch,
    };
  }

  const fallback = await metadataFallbackRecovery(
    workingCard,
    candidates,
    vision,
    apiKey,
    model,
  );
  if (fallback?.winningCatalog) {
    const finish = inferFinishFromCatalog(
      fallback.winningCatalog,
      fallback.detectedFinish,
      workingCard.variant,
    );
    const cardPatch = await buildCardPatchFromCatalog(
      workingCard,
      fallback.winningCatalog,
      finish,
    );
    return { verification: fallback.verification, cardPatch };
  }

  if (isGradedSlab(workingCard)) {
    const slabFix = await recoverSlabIdentity(workingCard, apiKey, model);
    if (slabFix) return slabFix;
  }

  return { verification };
}

export { needsRecovery };
