import type {
  CardEvidenceInput,
  ImageEvidenceReport,
  PokemonReversePatternInspection,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { cropPokemonReversePatternRegions } from "./pokemon-image-crops";
import { getSlotValue } from "./evidence-utils";
import {
  POKEMON_IMAGE_EVIDENCE_RULES,
} from "./knowledge/pokemon";
import { POKEMON_REVERSE_PATTERN_RULES } from "./knowledge/pokemon-patterns";
import {
  cropIsClear,
  mergeCropQuality,
  normalizeCropQuality,
} from "./variant-inspection-utils";

type InspectorRaw = {
  reversePattern?: string;
  confidence?: number;
  cropQuality?: string;
  inspectedRegions?: string[];
  evidenceNotes?: string[];
};

function normalizePattern(
  raw: string | undefined,
): PokemonReversePatternInspection["reversePattern"] {
  const p = raw?.trim().toLowerCase() ?? "";
  if (p === "master_ball" || p === "master ball" || p.includes("master ball")) {
    return "master_ball";
  }
  if (p === "poke_ball" || p === "poke ball" || p.includes("poke ball")) {
    return "poke_ball";
  }
  if (p === "standard_reverse" || p === "reverse" || p.includes("standard")) {
    return "standard_reverse";
  }
  if (p === "none" || p === "normal" || p === "non-holo" || p === "non holo") {
    return "none";
  }
  return "unknown";
}

function notAttempted(reason: string): PokemonReversePatternInspection {
  return {
    attempted: false,
    reversePattern: "unknown",
    confidence: 0,
    cropQuality: "unknown",
    inspectedRegions: [],
    evidenceNotes: [reason],
  };
}

export async function inspectPokemonReversePattern(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
): Promise<PokemonReversePatternInspection> {
  const crops = await cropPokemonReversePatternRegions(input.frontImageUrl);
  const cropQuality = mergeCropQuality(crops);
  const hasCrop = crops.some((c) => c.dataUrl);

  if (!hasCrop) {
    return notAttempted("Could not crop text box / border for reverse pattern inspection.");
  }

  const userContent = buildCustomerImageContent(
    input,
    [
      POKEMON_REVERSE_PATTERN_RULES,
      "",
      POKEMON_IMAGE_EVIDENCE_RULES,
      "",
      "Crop images: text box and left border/frame — look for repeating ball icons or generic reverse texture.",
      `Current foil_pattern: ${getSlotValue(imageEvidence, "foil_pattern") ?? "unknown"}`,
    ].join("\n"),
  );

  for (const crop of crops) {
    if (!crop.dataUrl) continue;
    userContent.push({
      type: "text",
      text: `Crop region: ${crop.region} (quality: ${crop.quality})`,
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
      "Pokémon reverse pattern inspector — pattern vs solid, Master Ball M on ball.",
      userContent,
      { model, maxTokens: 550, temperature: 0.05 },
    );

    let reversePattern = normalizePattern(raw.reversePattern);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const resolvedQuality = normalizeCropQuality(raw.cropQuality, cropQuality);

    if (confidence < 0.5 && reversePattern !== "master_ball") {
      reversePattern = "unknown";
    }

    return {
      attempted: true,
      reversePattern,
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
      reversePattern: "unknown",
      confidence: 0,
      cropQuality,
      inspectedRegions: crops.filter((c) => c.dataUrl).map((c) => c.region),
      evidenceNotes: [
        `Reverse pattern inspection failed: ${err instanceof Error ? err.message : "error"}`,
      ],
    };
  }
}

export function applyReversePatternInspectionToEvidence(
  imageEvidence: ImageEvidenceReport,
  inspection: PokemonReversePatternInspection,
): ImageEvidenceReport {
  if (!inspection.attempted || inspection.reversePattern === "unknown") {
    return {
      ...imageEvidence,
      canAutoLockIdentity: false,
      identificationMode: "continue_with_variant_uncertainty",
    };
  }

  const foilValue =
    inspection.reversePattern === "none"
      ? "normal"
      : inspection.reversePattern === "master_ball"
        ? "master ball reverse"
        : inspection.reversePattern === "poke_ball"
          ? "poke ball reverse"
          : "reverse holo";

  const slots = imageEvidence.evidenceSlots.filter((s) => s.field !== "foil_pattern");
  slots.push({
    field: "foil_pattern",
    value: foilValue,
    status: "observed",
    confidence: inspection.confidence,
    source: "front_image",
    note: `Reverse pattern micro-vision (${inspection.cropQuality}): ${inspection.evidenceNotes.slice(0, 2).join("; ") || foilValue}`,
  });

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    canAutoLockIdentity: false,
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage:
      inspection.reversePattern === "master_ball"
        ? "Master Ball reverse pattern detected on border/text box."
        : inspection.reversePattern === "none"
          ? "No reverse pattern on clear crops — prefer normal."
          : imageEvidence.staffMessage,
  };
}

export { cropIsClear };
