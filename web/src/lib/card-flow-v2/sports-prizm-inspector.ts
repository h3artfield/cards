import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  SportsPrizmStampInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { cropSportsPrizmInspectionRegions } from "./sports-image-crops";
import {
  mergeCropQuality,
  normalizeCropQuality,
  normalizeTriState,
} from "./variant-inspection-utils";

const INSPECTOR_PROMPT = `You are the Sports Prizm Back-Stamp Inspector — a micro-vision specialist.

Goal: detect bold "PRIZM" branding on the UPPER BACK of Panini Prizm cards (2013+).

PRIZM STAMP VISIBLE (prizmStampVisible = yes):
- Bold "PRIZM" text/logo visible in the upper back corner crop.
- Indicates a Prizm parallel (e.g. Silver Prizm), NOT a base chrome card.

NO STAMP (prizmStampVisible = no):
- Upper back crop shows no PRIZM branding on a clear image.
- Supports base card when product line is Prizm.

Return JSON only:
{
  "prizmStampVisible": "yes"|"no"|"unknown",
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;

type InspectorRaw = {
  prizmStampVisible?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function notAttempted(reason: string): SportsPrizmStampInspection {
  return {
    attempted: false,
    prizmStampVisible: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

export async function inspectSportsPrizmStamp(
  input: CardEvidenceInput,
  _imageEvidence: ImageEvidenceReport,
): Promise<SportsPrizmStampInspection> {
  if (!input.backImageUrl) {
    return notAttempted("Back image required for Prizm stamp inspection.");
  }

  const crops = await cropSportsPrizmInspectionRegions(input.backImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop upper back for Prizm stamp inspection.");
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" | "low" } }
  > = [
    { type: "text", text: INSPECTOR_PROMPT },
    { type: "text", text: "Back image crop — upper-right corner where PRIZM stamp appears." },
  ];

  for (const crop of crops) {
    if (!crop.dataUrl) continue;
    userContent.push({
      type: "text",
      text: `Crop region: ${crop.region} (quality hint: ${crop.quality})`,
    });
    userContent.push({
      type: "image_url",
      image_url: { url: crop.dataUrl, detail: "high" },
    });
  }

  const model =
    process.env.OPENAI_VISION_MODEL ??
    process.env.OPENAI_EVIDENCE_MODEL ??
    "gpt-4o";

  try {
    const raw = await callOpenAiJson<InspectorRaw>(
      "Sports Prizm Inspector — look for PRIZM text on upper back crop.",
      userContent,
      { model, maxTokens: 450, temperature: 0.05 },
    );

    let prizmStampVisible = normalizeTriState(raw.prizmStampVisible);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);

    if (confidence < 0.5 && prizmStampVisible !== "yes") {
      prizmStampVisible = "unknown";
    }

    return {
      attempted: true,
      prizmStampVisible,
      confidence,
      cropQuality: resolvedQuality,
      inspectedRegions:
        raw.inspectedRegions?.length ?
          raw.inspectedRegions
        : crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: raw.evidenceNotes ?? [],
    };
  } catch (err) {
    return {
      attempted: true,
      prizmStampVisible: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `Prizm stamp inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

export function applySportsPrizmInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: SportsPrizmStampInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.prizmStampVisible === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode:
        imageEvidence.identificationMode === "safe_to_continue"
          ? "continue_with_variant_uncertainty"
          : imageEvidence.identificationMode,
    };
  }

  const parallelValue =
    inspection.prizmStampVisible === "yes" ? "Silver Prizm" : "Base";
  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "parallelName");
  slots.push({
    field: "parallelName",
    value: parallelValue,
    status: "observed",
    confidence: inspection.confidence,
    source: "back_image",
    note: `Prizm back-stamp micro-vision (${inspection.cropQuality}): ${inspection.evidenceNotes.slice(0, 2).join("; ") || parallelValue}`,
  });

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: false,
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage:
      inspection.prizmStampVisible === "yes"
        ? "PRIZM stamp on back — parallel printing, not base."
        : "No PRIZM stamp on clear back crop — likely base card.",
  };
}
