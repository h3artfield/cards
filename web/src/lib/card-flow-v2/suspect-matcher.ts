import type {
  CardSuspect,
  CategoryDetectiveGuide,
  ImageEvidenceReport,
  SuspectAssessment,
} from "./types";
import {
  getSlotValue,
  isSlotObserved,
  isSlotUnknown,
  normalizeText,
  numberMatches,
  textMatches,
  getEvidenceSlot,
} from "./evidence-utils";
import {
  pokemonCatalogNamesMatch,
  pokemonJapaneseNameToEnglish,
  pokemonNumbersMatch,
} from "../processing/pokemon-utils";

type FieldRule = {
  evidenceField: string;
  suspectField: keyof CardSuspect;
  label: string;
  weight: number;
  requiredForConfirm?: boolean;
};

const COMMON_RULES: FieldRule[] = [
  { evidenceField: "card_name", suspectField: "canonicalName", label: "name", weight: 0.2, requiredForConfirm: true },
  { evidenceField: "set_name", suspectField: "setName", label: "set", weight: 0.15 },
  { evidenceField: "set_code", suspectField: "setCode", label: "set code", weight: 0.15 },
  {
    evidenceField: "collector_number",
    suspectField: "collectorNumber",
    label: "collector number",
    weight: 0.2,
    requiredForConfirm: true,
  },
  { evidenceField: "card_number", suspectField: "cardNumber", label: "card number", weight: 0.15 },
  { evidenceField: "language", suspectField: "language", label: "language", weight: 0.05 },
  { evidenceField: "rarity", suspectField: "rarity", label: "rarity", weight: 0.08 },
  { evidenceField: "foil_pattern", suspectField: "finish", label: "finish/foil", weight: 0.12 },
  { evidenceField: "edition", suspectField: "edition", label: "edition", weight: 0.1 },
  { evidenceField: "player_name", suspectField: "canonicalName", label: "player", weight: 0.2 },
  { evidenceField: "slab_company", suspectField: "gradingCompany", label: "slab company", weight: 0.1 },
  { evidenceField: "slab_grade", suspectField: "grade", label: "slab grade", weight: 0.1 },
];

function suspectValue(suspect: CardSuspect, field: keyof CardSuspect): string | null {
  const v = suspect[field];
  if (v == null) return null;
  return String(v);
}

function finishMatches(evidenceFinish: string, suspectFinish: string): boolean {
  const e = normalizeText(evidenceFinish);
  const s = normalizeText(suspectFinish);
  if (e === s) return true;

  const evidenceIsArtRare =
    /\bart rare\b/.test(e) ||
    /\bar\b/.test(e) ||
    e.includes("illustration rare") ||
    e.includes("special art");
  const suspectIsArtRare =
    s.includes("art") ||
    s.includes("illustration") ||
    s.includes("special");

  if (evidenceIsArtRare) {
    if (s.includes("reverse")) return false;
    return suspectIsArtRare || s.includes("holo");
  }
  if (suspectIsArtRare && (e.includes("reverse") || e.includes("standard reverse"))) {
    return false;
  }

  if (e.includes("reverse") && s.includes("reverse")) return true;
  if (e.includes("holo") && s.includes("holo") && !evidenceIsArtRare && !suspectIsArtRare) {
    return true;
  }
  if ((e === "foil" || e.includes("foil")) && (s === "foil" || s.includes("foil"))) return true;
  if ((e === "nonfoil" || e === "normal") && (s === "nonfoil" || s === "normal")) return true;
  return false;
}

function hasParallelFinishAtSameNumber(
  suspects: CardSuspect[],
  suspect: CardSuspect,
): boolean {
  const num = suspect.collectorNumber ?? suspect.cardNumber;
  const name = normalizeText(suspect.canonicalName ?? "");
  if (!num || !name) return false;

  const finishes = new Set<string>();
  for (const s of suspects) {
    if (normalizeText(s.canonicalName ?? "") !== name) continue;
    const sNum = s.collectorNumber ?? s.cardNumber;
    if (sNum !== num) continue;
    if (s.finish) finishes.add(normalizeText(s.finish));
  }
  return finishes.size >= 2;
}

function finishEvidenceIsSoft(
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
  allSuspects: CardSuspect[],
  suspect: CardSuspect,
): boolean {
  if (detectiveGuide.category !== "pokemon") return false;
  if (!hasParallelFinishAtSameNumber(allSuspects, suspect)) return false;

  const slot = getEvidenceSlot(imageEvidence, "foil_pattern");
  if (!slot || slot.status === "unknown") return true;

  const v = normalizeText(slot.value ?? "");
  if (v.includes("normal") || v.includes("non-holo") || v.includes("nonholo")) {
    return slot.confidence < 0.95;
  }
  if (v.includes("reverse")) {
    return slot.confidence < 0.9;
  }
  return slot.confidence < 0.85;
}

function isFinishRule(rule: FieldRule): boolean {
  return rule.label.includes("finish") || rule.label.includes("foil");
}

function getEvidenceValue(
  imageEvidence: ImageEvidenceReport,
  field: string,
): string | null {
  const direct = getSlotValue(imageEvidence, field);
  if (direct) return direct;
  if (field === "card_number") {
    return getSlotValue(imageEvidence, "collector_number");
  }
  if (field === "collector_number") {
    return getSlotValue(imageEvidence, "card_number");
  }
  return null;
}

function isNonEnglishLanguage(value: string | null): boolean {
  if (!value) return false;
  const v = normalizeText(value);
  return v !== "en" && v !== "english" && v.length > 0;
}

function observedPokemonEnglishName(
  imageEvidence: ImageEvidenceReport,
): string | null {
  const raw = getEvidenceValue(imageEvidence, "card_name");
  if (!raw || !isSlotObserved(imageEvidence, "card_name")) return null;
  return pokemonJapaneseNameToEnglish(raw) ?? raw;
}

function pokemonNameContradicts(
  imageEvidence: ImageEvidenceReport,
  suspect: CardSuspect,
): boolean {
  if (suspect.catalogSource === "scan_derived_fallback") return false;
  const expected = observedPokemonEnglishName(imageEvidence);
  if (!expected || !suspect.canonicalName) return false;
  return !pokemonCatalogNamesMatch(expected, suspect.canonicalName);
}

function setAndNumberMatchEvidence(
  imageEvidence: ImageEvidenceReport,
  suspect: CardSuspect,
): boolean {
  const evNum = getEvidenceValue(imageEvidence, "collector_number");
  const evSet =
    getEvidenceValue(imageEvidence, "set_code") ??
    getEvidenceValue(imageEvidence, "set_name");
  const suspectNum = suspect.collectorNumber ?? suspect.cardNumber ?? "";
  const numOk = evNum
    ? pokemonNumbersMatch(evNum, suspectNum) ||
      numberMatches(evNum, suspectNum)
    : false;
  const setOk = evSet
    ? textMatches(evSet, suspect.setCode) || textMatches(evSet, suspect.setName)
    : false;
  return numOk && setOk;
}

function assessField(
  imageEvidence: ImageEvidenceReport,
  suspect: CardSuspect,
  rule: FieldRule,
  allSuspects: CardSuspect[],
  detectiveGuide: CategoryDetectiveGuide,
): {
  score: number;
  supporting?: string;
  contradicting?: string;
  missing?: string;
  variantRisk?: string;
} {
  const observed = getEvidenceValue(imageEvidence, rule.evidenceField);
  const suspectVal = suspectValue(suspect, rule.suspectField);

  if (!suspectVal && !observed) {
    return { score: 0.5 * rule.weight };
  }

  if (isSlotUnknown(imageEvidence, rule.evidenceField) && suspectVal) {
    if (rule.label.includes("finish") || rule.label.includes("foil")) {
      return {
        score: 0.35 * rule.weight,
        missing: `${rule.label} unknown in photo`,
        variantRisk: `Finish unclear — ${suspect.label} may or may not match`,
      };
    }
    return {
      score: 0.4 * rule.weight,
      missing: `${rule.label} not visible in evidence`,
    };
  }

  if (!observed) {
    return { score: 0.45 * rule.weight };
  }

  if (!suspectVal) {
    return { score: 0.5 * rule.weight, missing: `Suspect missing ${rule.label}` };
  }

  const evLang = getEvidenceValue(imageEvidence, "language");
  const foreignCard = isNonEnglishLanguage(evLang);
  const setNumberLocked = setAndNumberMatchEvidence(imageEvidence, suspect);

  if (foreignCard && setNumberLocked) {
    if (rule.label === "name") {
      return {
        score: rule.weight,
        supporting:
          "Non-English card — set + collector number match (name transliteration expected)",
      };
    }
    if (rule.label === "language") {
      return {
        score: rule.weight,
        supporting:
          "Non-English card matched to English catalog printing by set + number",
      };
    }
  }

  let matches = false;
  if (rule.label.includes("number")) {
    matches =
      pokemonNumbersMatch(observed, suspectVal) || numberMatches(observed, suspectVal);
  } else if (rule.label.includes("finish") || rule.label.includes("foil")) {
    matches = finishMatches(observed, suspectVal);
  } else {
    matches = textMatches(observed, suspectVal);
  }

  if (matches) {
    if (
      isFinishRule(rule) &&
      finishEvidenceIsSoft(imageEvidence, detectiveGuide, allSuspects, suspect)
    ) {
      return {
        score: 0.35 * rule.weight,
        missing: "finish unclear — normal vs reverse holo both possible at this number",
        variantRisk: `Do not lock finish — ${suspect.label} still possible`,
      };
    }
    return {
      score: rule.weight,
      supporting: `${rule.label}: "${observed}" matches suspect`,
    };
  }

  if (isSlotObserved(imageEvidence, rule.evidenceField)) {
    if (
      isFinishRule(rule) &&
      finishEvidenceIsSoft(imageEvidence, detectiveGuide, allSuspects, suspect)
    ) {
      return {
        score: 0.35 * rule.weight,
        missing: "finish unclear — normal vs reverse holo both possible at this number",
        variantRisk: `Do not eliminate ${suspect.label} on finish alone`,
      };
    }
    return {
      score: 0,
      contradicting: `${rule.label}: evidence "${observed}" ≠ suspect "${suspectVal}"`,
    };
  }

  return { score: 0.2 * rule.weight };
}

export function scoreSuspectDeterministic(
  suspect: CardSuspect,
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
  allSuspects: CardSuspect[] = [],
): SuspectAssessment {
  let totalWeight = 0;
  let earned = 0;
  const supportingEvidence: string[] = [];
  const contradictingEvidence: string[] = [];
  const missingEvidence: string[] = [];
  const variantRisks: string[] = [];

  for (const rule of COMMON_RULES) {
    const observed = getSlotValue(imageEvidence, rule.evidenceField);
    const suspectVal = suspectValue(suspect, rule.suspectField);
    const slot = getEvidenceSlot(imageEvidence, rule.evidenceField);
    const applicable =
      suspectVal != null ||
      observed != null ||
      (slot && slot.status !== "not_applicable");
    if (!applicable) continue;

    totalWeight += rule.weight;
    const result = assessField(
      imageEvidence,
      suspect,
      rule,
      allSuspects.length ? allSuspects : [suspect],
      detectiveGuide,
    );
    earned += result.score;
    if (result.supporting) supportingEvidence.push(result.supporting);
    if (result.contradicting) contradictingEvidence.push(result.contradicting);
    if (result.missing) missingEvidence.push(result.missing);
    if (result.variantRisk) variantRisks.push(result.variantRisk);
  }

  for (const trap of detectiveGuide.variantTraps.slice(0, 2)) {
    if (
      isSlotUnknown(imageEvidence, "foil_pattern") ||
      isSlotUnknown(imageEvidence, "parallel_indicator")
    ) {
      variantRisks.push(trap);
    }
  }

  const matchScoreRaw =
    totalWeight > 0 ? Math.min(1, Math.max(0, earned / totalWeight)) : 0;

  let matchScore = matchScoreRaw;
  let canEliminate = contradictingEvidence.length >= 2 || matchScore < 0.25;
  const canConfirm =
    matchScore >= 0.92 &&
    contradictingEvidence.length === 0 &&
    missingEvidence.filter((m) =>
      detectiveGuide.lockRequirements.some((r) =>
        m.toLowerCase().includes(r.toLowerCase()),
      ),
    ).length === 0;

  if (
    detectiveGuide.category === "pokemon" &&
    pokemonNameContradicts(imageEvidence, suspect)
  ) {
    const expected = observedPokemonEnglishName(imageEvidence);
    contradictingEvidence.push(
      `name: evidence "${expected}" ≠ suspect "${suspect.canonicalName}"`,
    );
    matchScore = Math.min(0.12, matchScore * 0.15);
    canEliminate = true;
  }

  const reasoning =
    contradictingEvidence.length > 0
      ? `Elimination likely: ${contradictingEvidence.join("; ")}`
      : missingEvidence.length > 0
        ? `Possible match with gaps: ${missingEvidence.join("; ")}`
        : supportingEvidence.length > 0
          ? `Supported by: ${supportingEvidence.slice(0, 4).join("; ")}`
          : "Insufficient overlapping evidence.";

  return {
    suspectId: suspect.suspectId,
    matchScore,
    canConfirm,
    canEliminate,
    supportingEvidence,
    contradictingEvidence,
    missingEvidence: [...new Set(missingEvidence)],
    variantRisks: [...new Set(variantRisks)].slice(0, 5),
    reasoning,
  };
}

export function scoreSuspectsDeterministic(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
): SuspectAssessment[] {
  return suspects
    .map((s) => scoreSuspectDeterministic(s, imageEvidence, detectiveGuide, suspects))
    .sort((a, b) => b.matchScore - a.matchScore);
}

/** Whether strong vision comparison is warranted. */
export function needsVisionSuspectMatcher(
  assessments: SuspectAssessment[],
  imageEvidence: ImageEvidenceReport,
): boolean {
  if (assessments.length === 0) return false;
  if (assessments.length === 1) return false;

  const top = assessments[0]!;
  const second = assessments[1]!;
  const gap = top.matchScore - second.matchScore;

  if (gap <= 0.08 && top.matchScore >= 0.5) return true;
  if (top.matchScore < 0.85 && assessments.length >= 2) return true;
  if (
    imageEvidence.identificationMode === "candidate_list_only" ||
    imageEvidence.identificationMode === "continue_with_variant_uncertainty"
  ) {
    return assessments.length >= 2 && top.matchScore < 0.92;
  }

  const slabCompany = getSlotValue(imageEvidence, "slab_company");
  const cardName = getSlotValue(imageEvidence, "card_name");
  if (slabCompany && cardName && top.matchScore < 0.9) return true;

  return false;
}

export function mergeVisionAssessments(
  deterministic: SuspectAssessment[],
  vision: SuspectAssessment[],
  detectiveGuide?: CategoryDetectiveGuide,
): SuspectAssessment[] {
  const byId = new Map(deterministic.map((a) => [a.suspectId, a]));
  for (const v of vision) {
    const base = byId.get(v.suspectId);
    if (!base) continue;
    byId.set(v.suspectId, {
      ...base,
      matchScore: (() => {
        const nameConflict = base.contradictingEvidence.some((c) =>
          c.startsWith("name:"),
        );
        const blended = Math.min(1, base.matchScore * 0.45 + v.matchScore * 0.55);
        return nameConflict ? Math.min(blended, 0.22) : blended;
      })(),
      supportingEvidence: [...new Set([...base.supportingEvidence, ...v.supportingEvidence])],
      contradictingEvidence: [
        ...new Set([...base.contradictingEvidence, ...v.contradictingEvidence]),
      ],
      missingEvidence: [...new Set([...base.missingEvidence, ...v.missingEvidence])],
      variantRisks: [...new Set([...base.variantRisks, ...v.variantRisks])],
      canEliminate:
        base.canEliminate ||
        (v.canEliminate &&
          !isPokemonFinishOnlyElimination(base, v, detectiveGuide)),
      canConfirm: base.canConfirm && v.canConfirm,
      reasoning: v.reasoning || base.reasoning,
    });
  }
  return [...byId.values()].sort((a, b) => b.matchScore - a.matchScore);
}

function isPokemonFinishOnlyElimination(
  base: SuspectAssessment,
  vision: SuspectAssessment,
  guide?: CategoryDetectiveGuide,
): boolean {
  if (guide?.category !== "pokemon") return false;
  const finishContradiction = vision.contradictingEvidence.some((c) =>
    /finish|foil|holo|pattern/i.test(c),
  );
  if (!finishContradiction) return false;
  return base.matchScore >= 0.65;
}

export type NarrowSuspectsOptions = {
  /** Skip when The List path is active — bottom line may be origin ref, not actual set. */
  skipWhenListInvestigation?: boolean;
};

/** Drop unrelated printings when set + collector number are observed with high confidence. */
export function narrowSuspectsByObservedSetAndNumber(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
  options?: NarrowSuspectsOptions,
): { suspects: CardSuspect[]; note?: string } {
  if (options?.skipWhenListInvestigation) {
    return { suspects };
  }

  const setSlot = getEvidenceSlot(imageEvidence, "set_code");
  const numSlot =
    getEvidenceSlot(imageEvidence, "collector_number") ??
    getEvidenceSlot(imageEvidence, "card_number");

  const setVal =
    getEvidenceValue(imageEvidence, "set_code") ??
    getEvidenceValue(imageEvidence, "set_name");
  const numVal = getEvidenceValue(imageEvidence, "collector_number");

  if (!setVal || !numVal) return { suspects };

  const slotConfident = (slot: ReturnType<typeof getEvidenceSlot>) =>
    slot != null &&
    (slot.status === "observed" || slot.status === "inferred") &&
    slot.confidence >= 0.75;

  if (!slotConfident(setSlot) || !slotConfident(numSlot)) {
    return { suspects };
  }

  const filtered = suspects.filter((s) => setAndNumberMatchEvidence(imageEvidence, s));
  if (filtered.length === 0 || filtered.length === suspects.length) {
    return { suspects };
  }

  return {
    suspects: filtered,
    note: `High-confidence set + number (${setVal} #${numVal}) — narrowed to ${filtered.length} printing(s).`,
  };
}

export function topSuspectsForVision(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  limit = 6,
): CardSuspect[] {
  const ranked = assessments
    .filter((a) => !a.canEliminate)
    .slice(0, limit)
    .map((a) => suspects.find((s) => s.suspectId === a.suspectId))
    .filter(Boolean) as CardSuspect[];

  if (ranked.length >= 2) return ranked.slice(0, limit);

  return suspects.slice(0, limit);
}
