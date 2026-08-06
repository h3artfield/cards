import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  MtgFrameTreatmentInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { cropMtgFrameInspectionRegions } from "./mtg-image-crops";
import { getSlotValue } from "./evidence-utils";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";
import {
  mergeCropQuality,
  normalizeCropQuality,
} from "./variant-inspection-utils";

const INSPECTOR_PROMPT = `You are the MTG Frame Treatment Inspector — a micro-vision specialist.

Goal: distinguish frame treatments for the SAME card name when regular framed and special-frame printings both exist.

BORDERLESS / EXTENDED:
- Artwork extends to the card edge — no standard black border on left/right (or all sides).
- Left edge crop shows art/color bleeding to the physical card edge.

SHOWCASE:
- Distinct showcase frame design (often textured frame, special art box shape) — NOT a plain black border regular frame.

REGULAR:
- Standard black (or colored) border clearly visible between art and card edge.

Return JSON only:
{
  "frameTreatment": "borderless"|"showcase"|"extended"|"regular"|"unknown",
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;

type InspectorRaw = {
  frameTreatment?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function normalizeFrameTreatment(
  raw: string | undefined,
): MtgFrameTreatmentInspection["frameTreatment"] {
  const t = raw?.trim().toLowerCase() ?? "";
  if (t.includes("borderless")) return "borderless";
  if (t.includes("showcase")) return "showcase";
  if (t.includes("extended")) return "extended";
  if (t === "regular" || t.includes("standard")) return "regular";
  return "unknown";
}

function notAttempted(reason: string): MtgFrameTreatmentInspection {
  return {
    attempted: false,
    frameTreatment: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

export async function inspectMtgFrameTreatment(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
): Promise<MtgFrameTreatmentInspection> {
  const crops = await cropMtgFrameInspectionRegions(input.frontImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop art/edge regions for frame inspection.");
  }

  const userContent = buildCustomerImageContent(
    input,
    [
      INSPECTOR_PROMPT,
      "",
      MTG_IMAGE_EVIDENCE_RULES,
      "",
      "Crop images follow — art window, left edge strip, frame border strip.",
      `Current frameTreatment slot: ${getSlotValue(imageEvidence, "frameTreatment") ?? "unknown"}`,
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
      "MTG Frame Inspector — report frame treatment from edge and art crops.",
      userContent,
      { model, maxTokens: 550, temperature: 0.05 },
    );

    let frameTreatment = normalizeFrameTreatment(raw.frameTreatment);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);

    if (confidence < 0.5 && frameTreatment !== "borderless") {
      frameTreatment = "unknown";
    }

    return {
      attempted: true,
      frameTreatment,
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
      frameTreatment: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `Frame inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

export function applyFrameInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: MtgFrameTreatmentInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.frameTreatment === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode:
        imageEvidence.identificationMode === "safe_to_continue"
          ? "continue_with_variant_uncertainty"
          : imageEvidence.identificationMode,
    };
  }

  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "frameTreatment");
  slots.push({
    field: "frameTreatment",
    value: inspection.frameTreatment,
    status: "observed",
    confidence: inspection.confidence,
    source: "front_image",
    note: `Frame micro-vision (${inspection.cropQuality}): ${inspection.evidenceNotes.slice(0, 2).join("; ") || inspection.frameTreatment}`,
  });

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: false,
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage:
      inspection.frameTreatment === "regular"
        ? "Standard frame border visible — prefer regular framed printing."
        : `Frame inspection: ${inspection.frameTreatment} — prefer matching treatment.`,
  };
}
