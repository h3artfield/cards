import type {
  CardSuspect,
  CategoryDetectiveGuide,
  ImageEvidenceReport,
  SuspectAssessment,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { formatDetectiveGuideForPrompt } from "./detective-guides";
import type { CardEvidenceInput } from "./types";
import { POKEMON_IMAGE_EVIDENCE_RULES } from "./knowledge/pokemon";

const VISION_SUSPECT_SCHEMA = `Return JSON only:
{
  "assessments": [
    {
      "suspectId": string,
      "matchScore": number between 0 and 1,
      "canConfirm": boolean,
      "canEliminate": boolean,
      "supportingEvidence": string[],
      "contradictingEvidence": string[],
      "missingEvidence": string[],
      "variantRisks": string[],
      "reasoning": string
    }
  ],
  "summary": string
}`;

const VISION_SUSPECT_SYSTEM = `You are a trading-card suspect matcher.

You are given customer images, extracted evidence, category-specific identification guidance, and possible catalog suspects.

Compare the customer card against EACH suspect.

Do NOT price the card.
Do NOT force one answer.
Do NOT lock a final identity.

For each suspect, list supporting evidence, contradicting evidence, missing evidence, and whether the suspect can be eliminated.

If multiple suspects remain possible because key visual evidence is missing, say so clearly.

If artwork matches but set/collector/finish differs, treat as different market products.

Pokémon finish rule: do NOT eliminate reverse holo vs normal at the same collector number based on foil alone unless the customer photo clearly shows uniform solid areas with zero repeating pattern in border AND text box. Modern reverse holos may show pattern on the border/frame. When unclear, keep both suspects and note finish uncertainty.

${POKEMON_IMAGE_EVIDENCE_RULES}

${VISION_SUSPECT_SCHEMA}`;

type RawVisionAssessment = Partial<SuspectAssessment> & { suspectId: string };

export async function runVisionSuspectMatcher(input: {
  customerImages: CardEvidenceInput;
  imageEvidence: ImageEvidenceReport;
  detectiveGuide: CategoryDetectiveGuide;
  suspects: CardSuspect[];
}): Promise<SuspectAssessment[]> {
  if (!input.suspects.length) return [];

  const suspectSummary = input.suspects.map((s, i) => ({
    index: i + 1,
    suspectId: s.suspectId,
    label: s.label,
    setCode: s.setCode,
    collectorNumber: s.collectorNumber,
    finish: s.finish,
    rarity: s.rarity,
    edition: s.edition,
    variantTags: s.variantTags,
    referenceImageUrl: s.referenceImageUrls?.[0],
  }));

  const userContent = buildCustomerImageContent(
    input.customerImages,
    [
      "Compare the customer card to each catalog suspect below.",
      `Extracted evidence summary: ${JSON.stringify({
        usability: input.imageEvidence.imageUsability,
        mode: input.imageEvidence.identificationMode,
        missing: input.imageEvidence.missingCriticalEvidence,
        slots: input.imageEvidence.evidenceSlots
          .filter((s) => s.value)
          .map((s) => ({ field: s.field, value: s.value, status: s.status })),
      })}`,
      `Detective guide:\n${formatDetectiveGuideForPrompt(input.detectiveGuide)}`,
      `Suspects: ${JSON.stringify(suspectSummary)}`,
    ].join("\n"),
  );

  for (const suspect of input.suspects) {
    const ref = suspect.referenceImageUrls?.[0];
    if (ref) {
      userContent.push({
        type: "text",
        text: `Reference art for suspect ${suspect.suspectId} (${suspect.label}):`,
      });
      userContent.push({
        type: "image_url",
        image_url: { url: ref, detail: "low" },
      });
    }
  }

  const model =
    process.env.OPENAI_VISION_MODEL ??
    process.env.OPENAI_EVIDENCE_MODEL ??
    "gpt-4o";

  const raw = await callOpenAiJson<{ assessments?: RawVisionAssessment[] }>(
    VISION_SUSPECT_SYSTEM,
    userContent,
    { model, maxTokens: 1800, temperature: 0.15 },
  );

  return normalizeVisionAssessments(raw.assessments ?? [], input.suspects);
}

function normalizeVisionAssessments(
  raw: RawVisionAssessment[],
  suspects: CardSuspect[],
): SuspectAssessment[] {
  const validIds = new Set(suspects.map((s) => s.suspectId));

  return raw
    .filter((a) => validIds.has(a.suspectId))
    .map((a) => ({
      suspectId: a.suspectId,
      matchScore: clamp(Number(a.matchScore) || 0),
      canConfirm: Boolean(a.canConfirm),
      canEliminate: Boolean(a.canEliminate),
      supportingEvidence: arr(a.supportingEvidence),
      contradictingEvidence: arr(a.contradictingEvidence),
      missingEvidence: arr(a.missingEvidence),
      variantRisks: arr(a.variantRisks),
      reasoning: a.reasoning?.trim() || "Vision comparison complete.",
    }));
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).slice(0, 8) : [];
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function parseVisionSuspectAssessments(
  raw: RawVisionAssessment[],
  suspects: CardSuspect[],
): SuspectAssessment[] {
  return normalizeVisionAssessments(raw, suspects);
}
