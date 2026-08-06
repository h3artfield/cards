import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  MtgListMarkInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { cropMtgListInspectionRegions } from "./mtg-image-crops";
import { getSlotValue, normalizeText } from "./evidence-utils";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";

const INSPECTOR_PROMPT = `You are the MTG List Mark Inspector — a micro-vision specialist.

Inspect ONLY the bottom-left margin and collector-line crops for Magic: The Gathering "The List" reprints.

THE LIST MARK:
- Small white Planeswalker / fork-like symbol in the bottom-left corner (below text box, above bottom border).
- NOT the expansion symbol on the type line.
- NOT the oval security stamp.

COLLECTOR LINE TRAP:
- List cards often show origin set code + number (e.g. "198 AFC EN") while the actual printing is plst with collector AFC-198.

Return JSON only:
{
  "listMarkVisible": "yes"|"no"|"unknown",
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;

type InspectorRaw = {
  listMarkVisible?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function normalizeCropQuality(
  raw: string | undefined,
  fallback: MtgListMarkInspection["cropQuality"],
): MtgListMarkInspection["cropQuality"] {
  const q = normalizeText(raw);
  if (q === "clear" || q === "usable" || q === "poor" || q === "blocked") return q;
  return fallback;
}

function normalizeListMark(
  raw: string | undefined,
): MtgListMarkInspection["listMarkVisible"] {
  const m = normalizeText(raw);
  if (m === "yes" || m === "present" || m === "visible") return "yes";
  if (m === "no" || m === "absent" || m === "not visible") return "no";
  return "unknown";
}

function mergeCropQuality(
  crops: Awaited<ReturnType<typeof cropMtgListInspectionRegions>>,
): MtgListMarkInspection["cropQuality"] {
  if (crops.every((c) => c.quality === "blocked" || !c.dataUrl)) return "blocked";
  if (crops.some((c) => c.quality === "clear")) return "clear";
  if (crops.some((c) => c.quality === "usable")) return "usable";
  if (crops.some((c) => c.quality === "poor")) return "poor";
  return "unknown";
}

function notAttempted(reason: string): MtgListMarkInspection {
  return {
    attempted: false,
    listMarkVisible: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

/** Focused crop-level inspection for The List fork symbol. */
export async function inspectMtgListMark(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
): Promise<MtgListMarkInspection> {
  const crops = await cropMtgListInspectionRegions(input.frontImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop bottom margin regions for List mark inspection.");
  }

  const userContent = buildCustomerImageContent(
    input,
    [
      INSPECTOR_PROMPT,
      "",
      MTG_IMAGE_EVIDENCE_RULES,
      "",
      "Additional crop images follow — each is a zoom of the bottom-left margin or full bottom collector strip.",
      `Observed bottom line: set_code=${getSlotValue(imageEvidence, "set_code") ?? "?"}, collector_number=${getSlotValue(imageEvidence, "collector_number") ?? "?"}`,
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
      "MTG List Mark Inspector — report only what you see in the bottom margin crops.",
      userContent,
      { model, maxTokens: 550, temperature: 0.05 },
    );

    const listMarkVisible = normalizeListMark(raw.listMarkVisible);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);

    return {
      attempted: true,
      listMarkVisible:
        confidence < 0.5 && listMarkVisible !== "yes" ? "unknown" : listMarkVisible,
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
      listMarkVisible: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `List mark inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

/** Sync the_list_mark evidence slot from micro-vision when confident. */
export function applyListInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: MtgListMarkInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.listMarkVisible === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode:
        imageEvidence.identificationMode === "safe_to_continue"
          ? "continue_with_variant_uncertainty"
          : imageEvidence.identificationMode,
    };
  }

  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "the_list_mark");
  slots.push({
    field: "the_list_mark",
    value: inspection.listMarkVisible,
    status: "observed",
    confidence: inspection.confidence,
    source: "front_image",
    note: `List mark micro-vision (${inspection.cropQuality} crop): ${inspection.evidenceNotes.slice(0, 2).join("; ") || inspection.listMarkVisible}`,
  });

  const listYes = inspection.listMarkVisible === "yes";
  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: listYes ? false : imageEvidence.canAutoLockIdentity,
    identificationMode: listYes
      ? "continue_with_variant_uncertainty"
      : imageEvidence.identificationMode,
    staffMessage: listYes
      ? "List mark micro-vision: fork icon detected — prefer plst printing."
      : inspection.listMarkVisible === "no" && inspection.cropQuality === "clear"
        ? "List mark micro-vision: not visible on clear crop — origin printing may be correct."
        : imageEvidence.staffMessage,
  };
}
