import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  YgoEditionInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { cropYgoEditionInspectionRegions } from "./ygo-image-crops";
import { getSlotValue } from "./evidence-utils";
import {
  mergeCropQuality,
  normalizeCropQuality,
  normalizeTriState,
} from "./variant-inspection-utils";

const INSPECTOR_PROMPT = `You are the Yu-Gi-Oh Edition Inspector — a micro-vision specialist.

Goal: distinguish 1st Edition from Unlimited printings of the SAME card in the SAME set.

1ST EDITION (edition = first):
- Gold "1st Edition" text printed under the artwork (right side, below art box).
- edition_line crop should show readable "1st Edition" stamp.

UNLIMITED (edition = unlimited):
- No "1st Edition" text under the artwork on a clear crop.
- Eye of Anubis holo stamp may still be present — that does NOT mean 1st Edition.

Return JSON only:
{
  "edition": "first"|"unlimited"|"unknown",
  "holoStampColor": "gold"|"silver"|"unknown"|string,
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;

type InspectorRaw = {
  edition?: string;
  holoStampColor?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function normalizeEdition(raw: string | undefined): YgoEditionInspection["edition"] {
  const e = raw?.trim().toLowerCase() ?? "";
  if (e.includes("1st") || e.includes("first")) return "first";
  if (e.includes("unlimited") || e === "ue" || e === "no") return "unlimited";
  return "unknown";
}

function notAttempted(reason: string): YgoEditionInspection {
  return {
    attempted: false,
    edition: "unknown",
    holoStampColor: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

export async function inspectYgoEdition(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
): Promise<YgoEditionInspection> {
  const crops = await cropYgoEditionInspectionRegions(input.frontImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop edition line / holo stamp for YGO inspection.");
  }

  const userContent = buildCustomerImageContent(
    input,
    [
      INSPECTOR_PROMPT,
      "",
      "Crop images follow — edition line under art, Eye of Anubis holo stamp.",
      `Current edition slot: ${getSlotValue(imageEvidence, "edition") ?? "unknown"}`,
      `Set code: ${getSlotValue(imageEvidence, "set_code") ?? "?"}`,
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
      "YGO Edition Inspector — look for 1st Edition stamp under artwork.",
      userContent,
      { model, maxTokens: 550, temperature: 0.05 },
    );

    let edition = normalizeEdition(raw.edition);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);
    const holoStampColor = raw.holoStampColor?.trim() || "unknown";

    if (
      edition === "unlimited" &&
      normalizeTriState(raw.edition) === "no" &&
      resolvedQuality === "clear"
    ) {
      edition = "unlimited";
    }

    if (confidence < 0.5 && edition !== "first") {
      edition = "unknown";
    }

    return {
      attempted: true,
      edition,
      holoStampColor,
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
      edition: "unknown",
      holoStampColor: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `Edition inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

export function applyYgoEditionInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: YgoEditionInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.edition === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode:
        imageEvidence.identificationMode === "safe_to_continue"
          ? "continue_with_variant_uncertainty"
          : imageEvidence.identificationMode,
    };
  }

  const editionValue =
    inspection.edition === "first" ? "1st Edition" : "Unlimited";
  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "edition");
  slots.push({
    field: "edition",
    value: editionValue,
    status: "observed",
    confidence: inspection.confidence,
    source: "front_image",
    note: `Edition micro-vision (${inspection.cropQuality}): ${inspection.evidenceNotes.slice(0, 2).join("; ") || editionValue}`,
  });

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: false,
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage:
      inspection.edition === "first"
        ? "1st Edition stamp detected — prefer 1st printing."
        : "No 1st Edition stamp on clear crop — Unlimited may be correct.",
  };
}
