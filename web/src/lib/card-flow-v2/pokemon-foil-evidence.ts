import type { CardCategory, CategoryDetectiveGuide, ImageEvidenceReport } from "./types";
import type { CardEvidenceInput } from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { getSlotValue, getEvidenceSlot, normalizeText } from "./evidence-utils";
import {
  POKEMON_FOIL_FOLLOWUP_PROMPT,
  POKEMON_IMAGE_EVIDENCE_RULES,
} from "./knowledge/pokemon";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";

type FoilFollowUpResult = {
  foil_pattern?: string;
  status?: string;
  confidence?: number;
  reasoning?: string;
  patternRegions?: string[];
};

function isNormalFinishClaim(value: string | null): boolean {
  if (!value) return false;
  const v = normalizeText(value);
  return (
    v.includes("normal") ||
    v.includes("non-holo") ||
    v.includes("nonholo") ||
    v === "nonfoil"
  );
}

function shouldRunPokemonFoilFollowUp(imageEvidence: ImageEvidenceReport): boolean {
  const foil = getSlotValue(imageEvidence, "foil_pattern");
  const slot = getEvidenceSlot(imageEvidence, "foil_pattern");

  if (!foil || slot?.status === "unknown") return true;
  if (isNormalFinishClaim(foil)) return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

/** Downgrade weak "normal" claims — pattern ambiguity should stay unknown. */
export function applyPokemonFoilSafetyRules(
  imageEvidence: ImageEvidenceReport,
): ImageEvidenceReport {
  const slot = getEvidenceSlot(imageEvidence, "foil_pattern");
  if (!slot) return imageEvidence;

  const weakNormal =
    slot.status === "observed" &&
    isNormalFinishClaim(slot.value) &&
    slot.confidence < 0.88;

  if (!weakNormal) return imageEvidence;

  const slots = imageEvidence.evidenceSlots.map((s) =>
    s.field === "foil_pattern"
      ? {
          ...s,
          value: null,
          status: "unknown" as const,
          note: "Normal finish claim had low confidence — treating as unknown for variant comparison.",
        }
      : s,
  );

  return {
    ...imageEvidence,
    evidenceSlots: slots,
    identificationMode: "continue_with_variant_uncertainty",
    canAutoLockIdentity: false,
    staffMessage:
      "Pokémon finish unclear from photo — compare normal vs reverse holo candidates; do not auto-lock normal.",
  };
}

export async function refinePokemonFoilEvidence(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
): Promise<ImageEvidenceReport> {
  let report = applyPokemonFoilSafetyRules(imageEvidence);
  if (!shouldRunPokemonFoilFollowUp(report)) return report;

  const userContent = buildCustomerImageContent(
    input,
    [
      POKEMON_FOIL_FOLLOWUP_PROMPT,
      "",
      POKEMON_IMAGE_EVIDENCE_RULES,
      "",
      "Detective tips:",
      `- ${detectiveGuide.staffTips.slice(0, 4).join("\n- ")}`,
      "",
      `Current foil slot: ${JSON.stringify(getEvidenceSlot(report, "foil_pattern") ?? null)}`,
    ].join("\n"),
  );

  const model =
    process.env.OPENAI_VISION_MODEL ??
    process.env.OPENAI_EVIDENCE_MODEL ??
    "gpt-4o";

  try {
    const raw = await callOpenAiJson<FoilFollowUpResult>(
      "You are a Pokémon card finish specialist. Pattern vs solid — never guess normal when pattern may be present in border or text box.",
      userContent,
      { model, maxTokens: 600, temperature: 0.1 },
    );

    const finish = raw.foil_pattern?.trim();
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const status =
      raw.status === "observed" && finish && finish !== "unknown"
        ? "observed"
        : "unknown";

    if (!finish || finish === "unknown" || confidence < 0.55) {
      return applyPokemonFoilSafetyRules({
        ...report,
        identificationMode: "continue_with_variant_uncertainty",
      });
    }

    const slots = report.evidenceSlots.filter((s) => s.field !== "foil_pattern");
    slots.push({
      field: "foil_pattern",
      value: finish,
      status,
      confidence,
      source: "front_image",
      note: raw.reasoning?.trim() || "Pokémon foil follow-up pass",
    });

    const isReverse = normalizeText(finish).includes("reverse");
    return {
      ...report,
      evidenceSlots: slots,
      identificationMode: isReverse
        ? "continue_with_variant_uncertainty"
        : report.identificationMode,
      canAutoLockIdentity: false,
      staffMessage: isReverse
        ? `Pokémon reverse holo pattern detected (${raw.patternRegions?.join(", ") || "border/text box"}). Compare against normal at same number before locking.`
        : report.staffMessage,
    };
  } catch {
    return applyPokemonFoilSafetyRules(report);
  }
}

export function buildCategoryEvidenceIntro(category: CardCategory): string {
  if (category === "pokemon") {
    return `Category is Pokémon. Apply these finish rules carefully:\n${POKEMON_IMAGE_EVIDENCE_RULES}\n`;
  }
  if (category === "mtg") {
    return `Category is Magic: The Gathering. Apply these rules carefully:\n${MTG_IMAGE_EVIDENCE_RULES}\n`;
  }
  return category !== "unknown" ? `Category hint: ${category}.\n` : "";
}
