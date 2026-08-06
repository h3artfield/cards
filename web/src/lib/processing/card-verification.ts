import type { CardIdentityVerification, ScannedCard } from "../types";
import { hasBackImage } from "../card-image-utils";
import {
  catalogIdentityFields,
  resolveReferenceImage,
} from "./reference-image";
import {
  needsRecovery,
  recoverIdentityOnMismatch,
  type CardIdentityResult,
} from "./identity-recovery";
import { syncCardIdentityFromCatalog } from "./sync-identity-from-catalog";
import { isGradedSlab, mergeSlabFields } from "./slab-pricing";
import { enrichCardFromSlabLabel } from "./slab-label-read";
import { recoverSlabIdentity } from "./slab-identity-recovery";

export type { CardIdentityResult };

type VisionImageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "high" } };

function sportsBackImages(card: ScannedCard): VisionImageContent[] {
  if (card.category !== "sports" || !hasBackImage(card.backImageUrl)) return [];
  return [
    {
      type: "text",
      text: "Back of sports card — read set year, manufacturer (Donruss/Topps/Sportflics/etc.), card number, team, and stats/copyright.",
    },
    {
      type: "image_url",
      image_url: { url: card.backImageUrl, detail: "high" },
    },
  ];
}

const VERIFY_SCHEMA = `Return JSON only:
{
  "matchScore": number between 0 and 1,
  "verdict": "confirmed|likely|mismatch|inconclusive",
  "sameArtwork": boolean,
  "sameSetAndNumber": boolean,
  "summary": string,
  "notes": string[]
}`;

async function callVisionVerify(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  >,
): Promise<CardIdentityVerification> {
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Identity verification failed: ${err}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(
    data.choices?.[0]?.message?.content,
  ) as Partial<CardIdentityVerification>;

  const verdicts = ["confirmed", "likely", "mismatch", "inconclusive"] as const;
  return {
    verdict: verdicts.includes(parsed.verdict as (typeof verdicts)[number])
      ? (parsed.verdict as CardIdentityVerification["verdict"])
      : "inconclusive",
    matchScore: Math.min(1, Math.max(0, Number(parsed.matchScore) || 0)),
    sameArtwork: Boolean(parsed.sameArtwork),
    sameSetAndNumber: Boolean(parsed.sameSetAndNumber),
    summary: parsed.summary?.trim() || "Verification complete.",
    notes: Array.isArray(parsed.notes)
      ? parsed.notes.map(String).slice(0, 5)
      : [],
    verifiedAt: new Date().toISOString(),
    model,
  };
}

async function verifyWithReferenceImage(
  card: ScannedCard,
  referenceImageUrl: string,
  referenceSource: string,
  apiKey: string,
  model: string,
  options?: { slab?: boolean },
): Promise<CardIdentityVerification> {
  const claimed = {
    name: card.detectedName ?? card.playerName,
    player: card.playerName,
    set: card.setName,
    year: card.year,
    brand: card.brand,
    number: card.cardNumber,
    category: card.category,
    variant: card.variant,
  };

  const slab = options?.slab ?? isGradedSlab(card);
  const slabRefNote = slab
    ? `The customer photo shows a graded slab in a plastic case — glare and reflections are OK.
Compare the ILLUSTRATION visible inside the slab to the reference scan.
Japanese vs English printings with DIFFERENT artwork are a MISMATCH even if the Pokémon name matches.
Character Rare / full-art / alt-art vs standard printing = MISMATCH.
Same name and number in a different set or language with different art = MISMATCH.
Only confirm when the artwork depicts the same scene/illustration (reverse holo may differ in foil only).
Set sameArtwork=false when illustrations clearly differ.`
    : "";

  const result = await callVisionVerify(
    apiKey,
    model,
    `You verify trading card identity by comparing a customer's photo to an official reference scan.
Image 1 = customer photo (may include sleeve, slight angle, wear${slab ? ", graded slab case" : ""}).
Image 2 = official catalog reference art.
${slabRefNote}

Judge whether they are the SAME card printing (name + set + collector number + artwork variant).

Pokémon reverse holo: the catalog image shows standard art; a reverse holo customer photo will have foil energy symbols on the text box but the SAME artwork — treat as likely/confirmed, not mismatch.

- confirmed: same card printing and same artwork, high confidence
- likely: probably same card (incl. reverse holo with shared art)
- mismatch: different card, set, number, language printing, or clearly different artwork
- inconclusive: cannot tell from photos

Do NOT grade condition — only identity.\n${VERIFY_SCHEMA}`,
    [
      {
        type: "text",
        text: `Claimed card: ${JSON.stringify(claimed)}. Compare customer front to reference.${
          card.category === "sports" ? " Use the back image to verify set/year/manufacturer when provided." : ""
        }`,
      },
      {
        type: "image_url",
        image_url: { url: card.frontImageUrl, detail: "high" },
      },
      ...sportsBackImages(card),
      {
        type: "image_url",
        image_url: { url: referenceImageUrl, detail: "high" },
      },
    ],
  );

  return {
    ...result,
    verdict:
      result.sameArtwork === false &&
      (result.verdict === "confirmed" || result.verdict === "likely")
        ? "mismatch"
        : result.verdict,
    matchScore:
      result.sameArtwork === false
        ? Math.min(result.matchScore, 0.45)
        : result.matchScore,
    referenceImageUrl,
    referenceSource,
  };
}

async function verifyFromCustomerPhoto(
  card: ScannedCard,
  apiKey: string,
  model: string,
  catalog?: { raw: Record<string, unknown>; source: string },
): Promise<CardIdentityVerification> {
  const claimed = {
    name: card.detectedName ?? card.playerName,
    player: card.playerName,
    set: card.setName,
    year: card.year,
    brand: card.brand,
    number: card.cardNumber,
    category: card.category,
    slab: card.slabCompany
      ? `${card.slabCompany} ${card.slabGrade ?? ""}`.trim()
      : undefined,
  };

  const catalogFields = catalog
    ? catalogIdentityFields(catalog.raw, catalog.source)
    : null;

  const slab = isGradedSlab(card);
  const slabPrompt = slab
    ? `This is a GRADED SLAB in a ${claimed.slab ?? "PSA/CGC/BGS"} case.
Read the grading label (company, grade, cert #) and card name/set/collector number from the label and visible card face.
Trust the slab label when legible. No catalog reference image is available in this check — identify from photos only.
Do NOT confirm solely from catalog metadata if it contradicts the label or visible artwork.`
    : "";

  const result = await callVisionVerify(
    apiKey,
    model,
    `You identify trading cards from a customer photo for a store buyback program.
Read the card name, set name, and collector number directly from the photo when visible.
${slabPrompt}
SWSH Black Star Promos use codes like SWSH260 — do not confuse with SWSD (Shining Fates Shiny Vault) or SV### codes.
Cards in sleeves or top loaders without a PSA/BGS/CGC grade label are raw cards, not graded slabs.

Compare what you see to the claimed identity and any official catalog record provided.
- confirmed: photo clearly matches claimed card (name, set, number, artwork)
- likely: probably the same card; minor photo issues or reverse holo foil pattern
- mismatch: photo shows a different card than claimed AND label/face contradict claimed identity
- inconclusive: only if the photo is too blurry to read key identifiers

You MUST attempt to read name, set, and collector number from the card face and slab label when present.
For sports cards, also read year, brand, and card number from the back when a back photo is included.
Do NOT grade condition — identity only.\n${VERIFY_SCHEMA}`,
    [
      {
        type: "text",
        text: `Claimed: ${JSON.stringify(claimed)}.${
          catalogFields
            ? ` Official catalog match: ${JSON.stringify(catalogFields)}.`
            : " No catalog art available — identify from the customer photo alone."
        }`,
      },
      {
        type: "image_url",
        image_url: { url: card.frontImageUrl, detail: "high" },
      },
      ...sportsBackImages(card),
    ],
  );

  return {
    ...result,
    referenceSource: catalog?.source ?? "photo_analysis",
    notes: [
      ...(result.notes ?? []),
      catalog
        ? "Verified from customer photo against catalog metadata (no reference art URL)."
        : "Verified from customer photo; catalog lookup did not return a match.",
    ].slice(0, 5),
  };
}

async function runInitialVerification(
  card: ScannedCard,
  apiKey: string,
  model: string,
): Promise<CardIdentityVerification> {
  const reference = await resolveReferenceImage(card);

  // Slabs: compare customer photo to catalog ref when available — never confirm with a mismatched ref.
  if (isGradedSlab(card)) {
    if (reference.url) {
      return verifyWithReferenceImage(
        card,
        reference.url,
        reference.source ?? "catalog",
        apiKey,
        model,
        { slab: true },
      );
    }
    if (reference.catalogRaw && reference.source) {
      return verifyFromCustomerPhoto(card, apiKey, model, {
        raw: reference.catalogRaw,
        source: reference.source,
      });
    }
    return verifyFromCustomerPhoto(card, apiKey, model);
  }

  if (reference.url) {
    return verifyWithReferenceImage(
      card,
      reference.url,
      reference.source ?? "catalog",
      apiKey,
      model,
    );
  }

  if (reference.catalogRaw && reference.source) {
    return verifyFromCustomerPhoto(card, apiKey, model, {
      raw: reference.catalogRaw,
      source: reference.source,
    });
  }

  return verifyFromCustomerPhoto(card, apiKey, model);
}

export async function verifyCardIdentity(
  card: ScannedCard,
): Promise<CardIdentityResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for identity verification.");
  }

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
  let workingCard = mergeSlabFields(card);
  if (isGradedSlab(workingCard)) {
    workingCard = await enrichCardFromSlabLabel(workingCard);
  }

  const initial = await runInitialVerification(workingCard, apiKey, model);

  const cardPatchFromSlab: Partial<ScannedCard> = {};
  if (workingCard.detectedName !== card.detectedName) {
    cardPatchFromSlab.detectedName = workingCard.detectedName;
  }
  if (workingCard.setName !== card.setName) {
    cardPatchFromSlab.setName = workingCard.setName;
  }
  if (workingCard.cardNumber !== card.cardNumber) {
    cardPatchFromSlab.cardNumber = workingCard.cardNumber;
  }
  if (workingCard.visionJson !== card.visionJson) {
    cardPatchFromSlab.visionJson = workingCard.visionJson;
  }
  if (workingCard.itemType !== card.itemType) {
    cardPatchFromSlab.itemType = workingCard.itemType;
  }
  if (workingCard.slabCompany !== card.slabCompany) {
    cardPatchFromSlab.slabCompany = workingCard.slabCompany;
  }
  if (workingCard.slabGrade !== card.slabGrade) {
    cardPatchFromSlab.slabGrade = workingCard.slabGrade;
  }

  if (!needsRecovery(initial)) {
    const confirmed =
      initial.verdict === "confirmed" || initial.verdict === "likely";
    if (confirmed && (!isGradedSlab(workingCard) || initial.referenceImageUrl)) {
      const synced = await syncCardIdentityFromCatalog(workingCard);
      const patch: Partial<typeof card> = { ...cardPatchFromSlab };
      if (synced.detectedName && synced.detectedName !== card.detectedName) {
        patch.detectedName = synced.detectedName;
      }
      if (synced.setName && synced.setName !== card.setName) {
        patch.setName = synced.setName;
      }
      if (synced.cardNumber && synced.cardNumber !== card.cardNumber) {
        patch.cardNumber = synced.cardNumber;
      }
      if (synced.visionJson !== card.visionJson) {
        patch.visionJson = synced.visionJson;
      }
      if (Object.keys(patch).length > 0) {
        return { verification: initial, cardPatch: patch };
      }
    }
    if (Object.keys(cardPatchFromSlab).length > 0) {
      return { verification: initial, cardPatch: cardPatchFromSlab };
    }
    return { verification: initial };
  }

  if (isGradedSlab(workingCard)) {
    const slabFix = await recoverSlabIdentity(workingCard, apiKey, model);
    if (slabFix) {
      return {
        ...slabFix,
        cardPatch: { ...cardPatchFromSlab, ...slabFix.cardPatch },
      };
    }
  }

  const recovered = await recoverIdentityOnMismatch(
    workingCard,
    initial,
    apiKey,
    model,
  );

  if (Object.keys(cardPatchFromSlab).length > 0) {
    return {
      ...recovered,
      cardPatch: { ...cardPatchFromSlab, ...recovered.cardPatch },
    };
  }

  return recovered;
}
