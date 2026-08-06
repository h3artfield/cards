import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  MtgFoilWashInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { cropMtgFoilInspectionRegions } from "./mtg-image-crops";
import { getSlotValue } from "./evidence-utils";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";
import {
  cropIsClear,
  mergeCropQuality,
  normalizeCropQuality,
  normalizeTriState,
} from "./variant-inspection-utils";

const INSPECTOR_PROMPT = `You are the MTG Foil Wash Inspector — a micro-vision specialist for finish detection from a SINGLE STATIC PHOTO (no tilt available).

Goal: distinguish full-card FOIL from NONFOIL when both printings share the same set code and collector number.

FULL-CARD FOIL (foilWashVisible = yes):
- Subtle prismatic / rainbow / metallic color wash across the ARTWORK and/or FRAME BORDER.
- Iridescent patches — hints of full spectrum (pink, green, blue, gold) shifting across art or black/colored frame.
- Shimmer is BROAD — not confined to one tiny spot.

NONFOIL (foilWashVisible = no):
- Art and frame appear mostly matte/flat in the photo.
- Any shine is LOCALIZED to the small bottom-center oval/triangle SECURITY STAMP only — set stampOnlyShine = yes.
- Do NOT call full-card foil from stamp shine alone.

UNKNOWN:
- Glare, blur, sleeves, or low resolution hide art/frame surface — cannot tell.

Return JSON only:
{
  "foilWashVisible": "yes"|"no"|"unknown",
  "stampOnlyShine": "yes"|"no"|"unknown",
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;

type InspectorRaw = {
  foilWashVisible?: string;
  stampOnlyShine?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function notAttempted(reason: string): MtgFoilWashInspection {
  return {
    attempted: false,
    foilWashVisible: "unknown",
    stampOnlyShine: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

export async function inspectMtgFoilWash(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
): Promise<MtgFoilWashInspection> {
  const crops = await cropMtgFoilInspectionRegions(input.frontImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop art/frame regions for foil wash inspection.");
  }

  const userContent = buildCustomerImageContent(
    input,
    [
      INSPECTOR_PROMPT,
      "",
      MTG_IMAGE_EVIDENCE_RULES,
      "",
      "Crop images follow — art window, frame border strip, and bottom security stamp.",
      `Current foil_pattern slot: ${getSlotValue(imageEvidence, "foil_pattern") ?? "unknown"}`,
    ].join("\n"),
  );

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
      "MTG Foil Wash Inspector — look for broad prismatic wash on art/frame in static photo.",
      userContent,
      { model, maxTokens: 550, temperature: 0.05 },
    );

    let foilWashVisible = normalizeTriState(raw.foilWashVisible);
    const stampOnlyShine = normalizeTriState(raw.stampOnlyShine);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);

    if (
      stampOnlyShine === "yes" &&
      foilWashVisible !== "yes" &&
      cropIsClear(resolvedQuality)
    ) {
      foilWashVisible = "no";
    }

    if (confidence < 0.5 && foilWashVisible !== "yes") {
      foilWashVisible = "unknown";
    }

    return {
      attempted: true,
      foilWashVisible,
      stampOnlyShine,
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
      foilWashVisible: "unknown",
      stampOnlyShine: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `Foil wash inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

export function applyFoilInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: MtgFoilWashInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.foilWashVisible === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode:
        imageEvidence.identificationMode === "safe_to_continue"
          ? "continue_with_variant_uncertainty"
          : imageEvidence.identificationMode,
    };
  }

  const finishValue =
    inspection.foilWashVisible === "yes" ? "foil" : "nonfoil";
  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "foil_pattern");
  slots.push({
    field: "foil_pattern",
    value: finishValue,
    status: "observed",
    confidence: inspection.confidence,
    source: "front_image",
    note: `Foil wash micro-vision (${inspection.cropQuality}): ${inspection.evidenceNotes.slice(0, 2).join("; ") || finishValue}`,
  });

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: false,
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage:
      inspection.foilWashVisible === "yes"
        ? "Foil wash detected on art/frame — prefer foil printing."
        : "No broad foil wash on clear crops — prefer nonfoil printing.",
  };
}
