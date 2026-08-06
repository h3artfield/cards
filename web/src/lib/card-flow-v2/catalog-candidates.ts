import type { CatalogMatch } from "../processing/pricing";
import { findCatalogCandidates } from "../processing/pricing";
import type {
  CardCategory,
  CardSuspect,
  CategoryClassificationReport,
  CategoryDetectiveGuide,
  ImageEvidenceReport,
} from "./types";
import {
  catalogMatchToSuspects,
  expectedEvidenceFromSuspect,
} from "./catalog-normalizers";
import { evidenceToVisionHint, getSlotValue, mergeVisionHintFallback } from "./evidence-utils";
import { generateRiftboundCandidates } from "./riftbound-candidate-generator";
import { resolveMtgVisionSetCode } from "../processing/mtg-catalog-set";
import type { VisionResult } from "../types";

export type CandidateGeneratorInput = {
  imageEvidence: ImageEvidenceReport;
  categoryClassification: CategoryClassificationReport;
  detectiveGuide: CategoryDetectiveGuide;
  declaredItemType?: string;
  /** Card-level name/set/number when evidence slots are empty. */
  visionFallback?: Partial<VisionResult>;
};

export type CandidateGeneratorResult = {
  suspects: CardSuspect[];
  notes: string[];
};

const MAX_SUSPECTS = 12;
const CATALOG_RETRY_ATTEMPTS = 3;
const CATALOG_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findCatalogCandidatesWithRetry(
  vision: import("../types").VisionResult,
  limit: number,
): Promise<CatalogMatch[]> {
  for (let attempt = 0; attempt < CATALOG_RETRY_ATTEMPTS; attempt++) {
    const matches = await findCatalogCandidates(vision, limit);
    if (matches.length) return matches;
    if (attempt < CATALOG_RETRY_ATTEMPTS - 1) {
      await sleep(CATALOG_RETRY_BASE_MS * (attempt + 1));
    }
  }
  return [];
}

function resolveCategory(input: CandidateGeneratorInput): CardCategory {
  const { categoryClassification } = input;
  if (categoryClassification.category !== "unknown") {
    return categoryClassification.category;
  }
  return categoryClassification.possibleCategories?.[0]?.category ?? "unknown";
}

function dedupeSuspects(suspects: CardSuspect[]): CardSuspect[] {
  const seen = new Set<string>();
  const out: CardSuspect[] = [];
  for (const s of suspects) {
    if (seen.has(s.suspectId)) continue;
    seen.add(s.suspectId);
    out.push({
      ...s,
      expectedEvidence:
        s.expectedEvidence.length > 0
          ? s.expectedEvidence
          : expectedEvidenceFromSuspect(s),
    });
  }
  return out;
}

async function generateFromLegacyCatalog(
  input: CandidateGeneratorInput,
): Promise<CandidateGeneratorResult> {
  const category = resolveCategory(input);
  const notes: string[] = [];
  const vision = mergeVisionHintFallback(
    evidenceToVisionHint(
      input.imageEvidence,
      category,
      input.declaredItemType,
    ),
    input.visionFallback,
  );

  let catalogVision = vision;
  if (category === "mtg") {
    catalogVision = await resolveMtgVisionSetCode(vision);
  }

  if (
    !catalogVision.cardName?.trim() &&
    category !== "sports" &&
    !(category === "mtg" && catalogVision.setCode && catalogVision.cardNumber)
  ) {
    notes.push("No card name extracted — catalog search skipped.");
    return { suspects: [], notes };
  }

  const matches = await findCatalogCandidatesWithRetry(catalogVision, MAX_SUSPECTS);
  if (!matches.length) {
    notes.push(`No catalog matches from legacy helpers for ${category}.`);
    return { suspects: [], notes };
  }

  const slabCompany = getSlotValue(input.imageEvidence, "slab_company");
  const slabGrade = getSlotValue(input.imageEvidence, "slab_grade");
  const isGraded = Boolean(slabCompany);

  const suspects: CardSuspect[] = [];
  for (const match of matches) {
    const converted = catalogMatchToSuspects(
      match.raw,
      match.source,
      category,
      {
        graded: isGraded,
        gradingCompany: slabCompany ?? undefined,
        grade: slabGrade ?? undefined,
      },
    );
    suspects.push(...converted);
  }

  notes.push(
    `Legacy catalog returned ${matches.length} record(s) → ${suspects.length} suspect(s).`,
  );

  return { suspects: dedupeSuspects(suspects).slice(0, MAX_SUSPECTS), notes };
}

function placeholderResult(category: CardCategory, reason: string): CandidateGeneratorResult {
  return {
    suspects: [],
    notes: [`${category}: ${reason}`],
  };
}

const GENERATORS: Partial<
  Record<CardCategory, (input: CandidateGeneratorInput) => Promise<CandidateGeneratorResult>>
> = {
  pokemon: generateFromLegacyCatalog,
  mtg: generateFromLegacyCatalog,
  yugioh: generateFromLegacyCatalog,
  sports: generateFromLegacyCatalog,
  riftbound: generateRiftboundCandidates,
  onepiece: async () =>
    placeholderResult("onepiece", "No official catalog adapter yet — Phase 2 placeholder."),
  lorcana: async () =>
    placeholderResult("lorcana", "No official catalog adapter yet — Phase 2 placeholder."),
  unknown: async (input) => {
    const alt = input.categoryClassification.possibleCategories?.[0]?.category;
    if (alt && alt !== "unknown" && GENERATORS[alt]) {
      return GENERATORS[alt]!(input);
    }
    return placeholderResult("unknown", "Category unknown — no candidates generated.");
  },
};

export async function generateCatalogCandidates(
  input: CandidateGeneratorInput,
): Promise<CandidateGeneratorResult> {
  const category = resolveCategory(input);
  const generator =
    category === "unknown"
      ? GENERATORS.unknown!
      : GENERATORS[category] ?? GENERATORS.unknown!;

  const result = await generator(input);

  if (
    getSlotValue(input.imageEvidence, "foil_pattern") == null &&
    result.suspects.some(
      (s) => s.finish && !["normal", "nonfoil", "raw"].includes(s.finish),
    )
  ) {
    result.notes.push(
      "Foil treatment unknown in evidence — keeping separate finish suspects.",
    );
  }

  return result;
}
