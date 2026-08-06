import type { ScannedCard, VisionResult } from "../types";
import { hasBackImage } from "../card-image-utils";
import { isGradedSlab, mergeSlabFields } from "./slab-pricing";

export interface SlabLabelRead {
  cardName?: string;
  setName?: string;
  cardNumber?: string;
  slabCompany?: string;
  slabGrade?: string;
  slabCertNumber?: string;
  language?: string;
  variant?: string;
  category?: VisionResult["category"];
  confidence: number;
  summary?: string;
}

const SLAB_READ_SCHEMA = `Return JSON only:
{
  "cardName": string,
  "setName": string|null,
  "cardNumber": string|null,
  "slabCompany": string|null,
  "slabGrade": string|null,
  "slabCertNumber": string|null,
  "language": string|null,
  "variant": string|null,
  "category": "pokemon|magic|yugioh|sports|other",
  "confidence": number between 0 and 1,
  "summary": string
}`;

/** Read card identity and grade from slab label + visible card face. */
export async function readSlabLabelFromPhotos(
  card: ScannedCard,
): Promise<SlabLabelRead | null> {
  if (!isGradedSlab(card)) return null;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: "Read this graded trading card slab. Extract everything visible on the grading label and card face.",
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

  try {
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
            content: `You read graded trading card slabs for a buyback shop.
Read the grading company (PSA, CGC, BGS, SGC, etc.), numeric grade, cert number, card name, set name, and collector number from the slab label and visible card.
The card is inside a plastic case — read text printed on the label, not OpenCV condition.
For Pokémon: collector number format like 073/167 or SV123. Note language (Japanese, English) and special variants (Character Rare, full art, alt art) from the label.
If the label says Japanese, include the English set name when readable (e.g. Battle Region, Astral Radiance, Star Birth).
Prioritize label text over guessing from artwork when the label is legible.
${SLAB_READ_SCHEMA}`,
          },
          { role: "user", content },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const parsed = JSON.parse(
      data.choices?.[0]?.message?.content,
    ) as Partial<SlabLabelRead>;

    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
    if (confidence < 0.45) return null;

    return {
      cardName: parsed.cardName?.trim() || undefined,
      setName: parsed.setName?.trim() || undefined,
      cardNumber: parsed.cardNumber?.trim() || undefined,
      slabCompany: parsed.slabCompany?.trim() || undefined,
      slabGrade: parsed.slabGrade?.trim() || undefined,
      slabCertNumber: parsed.slabCertNumber?.trim() || undefined,
      language: parsed.language?.trim() || undefined,
      variant: parsed.variant?.trim() || undefined,
      category: parsed.category,
      confidence,
      summary: parsed.summary?.trim(),
    };
  } catch {
    return null;
  }
}

/** Apply slab label read onto card + visionJson. */
export function applySlabLabelRead(
  card: ScannedCard,
  read: SlabLabelRead,
): ScannedCard {
  const vision = (card.visionJson ?? {}) as unknown as VisionResult;
  const updatedVision: VisionResult = {
    ...vision,
    category: read.category ?? vision.category ?? card.category ?? "pokemon",
    itemType: "graded",
    cardName: read.cardName ?? vision.cardName,
    setName: read.setName ?? vision.setName,
    cardNumber: read.cardNumber ?? vision.cardNumber,
    variant: read.variant ?? vision.variant,
    slabGrade: read.slabGrade ?? vision.slabGrade ?? card.slabGrade,
    slabCertNumber:
      read.slabCertNumber ?? vision.slabCertNumber ?? card.slabCertNumber,
    conditionEstimate: "NM",
    confidence: Math.max(vision.confidence ?? 0, read.confidence),
  };

  return mergeSlabFields({
    ...card,
    category: updatedVision.category,
    detectedName: read.cardName ?? card.detectedName,
    setName: read.setName ?? card.setName,
    cardNumber: read.cardNumber ?? card.cardNumber,
    variant: updatedVision.variant ?? card.variant,
    slabCompany: updatedVision.slabCompany,
    slabGrade: updatedVision.slabGrade,
    slabCertNumber: updatedVision.slabCertNumber,
    visionJson: updatedVision as unknown as Record<string, unknown>,
  });
}

export async function enrichCardFromSlabLabel(
  card: ScannedCard,
): Promise<ScannedCard> {
  const merged = mergeSlabFields(card);
  if (!isGradedSlab(merged)) return merged;
  const read = await readSlabLabelFromPhotos(merged);
  if (!read) return merged;
  return applySlabLabelRead(merged, read);
}
