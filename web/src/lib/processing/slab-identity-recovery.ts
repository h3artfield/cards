import type { CardIdentityVerification, ScannedCard, VisionResult } from "../types";
import { hasBackImage } from "../card-image-utils";
import { isGradedSlab } from "./slab-pricing";
import { enrichCardFromSlabLabel } from "./slab-label-read";
import { findCatalogCandidates, lookupMarketPrice } from "./pricing";
import {
  buildCardPatchFromCatalog,
  compareAgainstCandidates,
  type CardIdentityResult,
} from "./identity-recovery";

const SLAB_CONFIRM_SCHEMA = `Return JSON only:
{
  "matchScore": number between 0 and 1,
  "verdict": "confirmed|likely|mismatch|inconclusive",
  "sameArtwork": boolean,
  "sameSetAndNumber": boolean,
  "cardName": string,
  "setName": string|null,
  "cardNumber": string|null,
  "summary": string,
  "notes": string[]
}`;

/** Vision-only identity for slabs when no catalog ref matches artwork. */
async function confirmSlabFromPhotos(
  card: ScannedCard,
  apiKey: string,
  model: string,
): Promise<CardIdentityVerification | null> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: `Identify this graded slab from the photos. Read the label (grader, grade, cert #) and card name/set/number.
Prior claimed identity (may be wrong): ${JSON.stringify({
        name: card.detectedName,
        set: card.setName,
        number: card.cardNumber,
        slab: card.slabCompany ? `${card.slabCompany} ${card.slabGrade}` : undefined,
      })}`,
    },
    {
      type: "image_url",
      image_url: { url: card.frontImageUrl, detail: "high" },
    },
  ];
  if (hasBackImage(card.backImageUrl)) {
    content.push({
      type: "image_url",
      image_url: { url: card.backImageUrl!, detail: "high" },
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
          content: `You identify graded trading cards from customer photos for a buyback shop.
Read the slab label and visible card. The plastic case may glare — still read label text when visible.
- confirmed: you can read name + grader + grade and the card face matches
- likely: minor glare but identity is clear from label
- mismatch: only if photos are unreadable or show unrelated items
- inconclusive: only when label and card face are both unreadable

Do NOT compare to external catalog images — only what is in the customer photos.
${SLAB_CONFIRM_SCHEMA}`,
        },
        { role: "user", content },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content) as {
    verdict?: CardIdentityVerification["verdict"];
    matchScore?: number;
    sameArtwork?: boolean;
    sameSetAndNumber?: boolean;
    cardName?: string;
    setName?: string | null;
    cardNumber?: string | null;
    summary?: string;
    notes?: string[];
  };

  const verdicts = ["confirmed", "likely", "mismatch", "inconclusive"] as const;
  const verdict = verdicts.includes(parsed.verdict as (typeof verdicts)[number])
    ? (parsed.verdict as CardIdentityVerification["verdict"])
    : "inconclusive";
  const score = Math.min(1, Math.max(0, Number(parsed.matchScore) || 0));

  if (verdict === "mismatch" || verdict === "inconclusive" || score < 0.55) {
    return null;
  }

  return {
    verdict: score >= 0.85 ? "confirmed" : "likely",
    matchScore: Math.max(score, 0.75),
    sameArtwork: true,
    sameSetAndNumber: Boolean(parsed.sameSetAndNumber ?? true),
    summary:
      parsed.summary?.trim() ??
      `Slab identity read from photos: ${parsed.cardName ?? card.detectedName}.`,
    notes: [
      ...(Array.isArray(parsed.notes) ? parsed.notes.map(String) : []),
      "Slab photo identity (label + card face; no catalog ref matched artwork).",
    ].slice(0, 5),
    verifiedAt: new Date().toISOString(),
    model,
    correctedMatch: true,
    referenceSource: "slab_photos",
  };
}

/** Re-read label, vision-pick catalog ref by artwork, or confirm from photos only. */
export async function recoverSlabIdentity(
  card: ScannedCard,
  apiKey: string,
  model: string,
): Promise<CardIdentityResult | null> {
  if (!isGradedSlab(card)) return null;

  const working = await enrichCardFromSlabLabel(card);
  const vision = working.visionJson as unknown as VisionResult;

  const candidates = await findCatalogCandidates(vision, 12);
  if (candidates.length) {
    const { verification, winningCatalog, detectedFinish } =
      await compareAgainstCandidates(
        working,
        candidates,
        apiKey,
        model,
        vision,
      );

    if (
      winningCatalog &&
      verification.verdict !== "mismatch" &&
      verification.verdict !== "inconclusive" &&
      verification.sameArtwork !== false
    ) {
      const cardPatch = await buildCardPatchFromCatalog(
        working,
        winningCatalog,
        detectedFinish,
      );
      return {
        verification: {
          ...verification,
          correctedMatch: true,
          summary: `${verification.summary} Slab catalog match selected by artwork.`,
        },
        cardPatch,
      };
    }
  }

  const photoConfirm = await confirmSlabFromPhotos(working, apiKey, model);
  if (!photoConfirm) return null;

  const pricing = await lookupMarketPrice(vision, { card: working });

  return {
    verification: photoConfirm,
    cardPatch: {
      detectedName: working.detectedName,
      setName: working.setName,
      cardNumber: working.cardNumber,
      slabCompany: working.slabCompany,
      slabGrade: working.slabGrade,
      visionJson: working.visionJson,
      pricingJson: pricing as unknown as Record<string, unknown>,
    },
  };
}
