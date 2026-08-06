import type { CardCategory, CategoryDetectiveGuide, ImageEvidenceReport } from "./types";
import {
  getSlotValue,
  hasBottomCollectorLine,
  hasHighConfidenceSetAndNumber,
  slotNeedsFollowUp,
} from "./evidence-utils";
import { parseListOriginRef } from "./mtg-suspect-scoring-shared";

export type DetectiveQuestionId =
  | "mtg_list_mark"
  | "mtg_foil_finish"
  | "mtg_frame_treatment";

export type DetectiveQuestion = {
  id: DetectiveQuestionId;
  /** Evidence slot this question resolves. */
  field: string;
  /** Why the guide requires this check. */
  reason: string;
  /** Matching variant trap or lock requirement from the guide. */
  guideReference: string;
  priority: number;
};

function trapMatching(guide: CategoryDetectiveGuide, pattern: RegExp): string {
  return (
    guide.variantTraps.find((t) => pattern.test(t)) ??
    guide.lockRequirements.find((r) => pattern.test(r)) ??
    guide.staffTips.find((t) => pattern.test(t)) ??
    "Detective guide"
  );
}

/** Plan MTG follow-up questions from the category knowledge base + pass-1 evidence. */
export function planMtgDetectiveQuestions(
  guide: CategoryDetectiveGuide,
  imageEvidence: ImageEvidenceReport,
): DetectiveQuestion[] {
  const questions: DetectiveQuestion[] = [];
  const bottomLine = hasBottomCollectorLine(imageEvidence);
  const highConfidencePrinting = hasHighConfidenceSetAndNumber(imageEvidence);
  const cardName = getSlotValue(imageEvidence, "card_name");

  if (!cardName && !highConfidencePrinting) {
    return questions;
  }

  if (
    bottomLine &&
    guide.keyFields.includes("the_list_mark") &&
    slotNeedsFollowUp(imageEvidence, "the_list_mark", {
      minConfidence: 0.9,
      rerunIfInferredNo: true,
    })
  ) {
    questions.push({
      id: "mtg_list_mark",
      field: "the_list_mark",
      reason: highConfidencePrinting
        ? "Set and collector number are confident — verify List fork symbol before locking printing."
        : "Bottom collector line visible — guide requires List mark check.",
      guideReference: trapMatching(guide, /list/i),
      priority: highConfidencePrinting ? 1 : 2,
    });
  }

  if (
    guide.keyFields.includes("foil_pattern") &&
    (highConfidencePrinting ||
      slotNeedsFollowUp(imageEvidence, "foil_pattern", { minConfidence: 0.85 }))
  ) {
    questions.push({
      id: "mtg_foil_finish",
      field: "foil_pattern",
      reason: highConfidencePrinting
        ? "Same set + number often exists in foil and nonfoil — finish must be confirmed."
        : "Finish unclear from pass 1 — guide requires foil vs nonfoil check.",
      guideReference: trapMatching(guide, /foil|nonfoil|finish/i),
      priority: 3,
    });
  }

  if (
    guide.keyFields.includes("frameTreatment") &&
    slotNeedsFollowUp(imageEvidence, "frameTreatment", { minConfidence: 0.85 })
  ) {
    questions.push({
      id: "mtg_frame_treatment",
      field: "frameTreatment",
      reason:
        "Frame or treatment variant may change market identity — borderless/showcase/extended must be ruled in or out.",
      guideReference: trapMatching(guide, /frame|borderless|showcase|extended/i),
      priority: 4,
    });
  }

  const collector =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  if (collector && parseListOriginRef(collector) && !questions.some((q) => q.id === "mtg_list_mark")) {
    questions.unshift({
      id: "mtg_list_mark",
      field: "the_list_mark",
      reason: "Collector line uses origin-ref format (SET-###) — List printing likely.",
      guideReference: trapMatching(guide, /list|SET-/i),
      priority: 0,
    });
  }

  return questions.sort((a, b) => a.priority - b.priority);
}

export function planDetectiveQuestions(
  category: CardCategory,
  guide: CategoryDetectiveGuide,
  imageEvidence: ImageEvidenceReport,
): DetectiveQuestion[] {
  if (category === "mtg") {
    return planMtgDetectiveQuestions(guide, imageEvidence);
  }
  return [];
}

export function shouldRunMtgQuestion(
  questionId: DetectiveQuestionId,
  questions: DetectiveQuestion[],
): boolean {
  return questions.some((q) => q.id === questionId);
}
