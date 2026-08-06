import type {
  CardEvidenceInput,
  CategoryDetectiveGuide,
  ImageEvidenceReport,
  MtgFoilWashInspection,
  MtgFrameTreatmentInspection,
  MtgListMarkInspection,
} from "./types";
import { formatDetectiveGuideForPrompt } from "./detective-guides";
import {
  planMtgDetectiveQuestions,
  shouldRunMtgQuestion,
  type DetectiveQuestion,
} from "./detective-question-planner";
import {
  applyFoilInspectionToEvidence,
  inspectMtgFoilWash,
} from "./mtg-foil-inspector";
import {
  applyFrameInspectionToEvidence,
  inspectMtgFrameTreatment,
} from "./mtg-frame-inspector";
import {
  applyListInspectionToEvidence,
  inspectMtgListMark,
} from "./mtg-list-mark-inspector";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";
import { getEvidenceSlot } from "./evidence-utils";

export type MtgVariantEvidenceResult = {
  imageEvidence: ImageEvidenceReport;
  questionsAsked: DetectiveQuestion[];
  notes: string[];
  mtgListMarkInspection?: MtgListMarkInspection;
  mtgFoilWashInspection?: MtgFoilWashInspection;
  mtgFrameTreatmentInspection?: MtgFrameTreatmentInspection;
};

function appendStaffNote(
  report: ImageEvidenceReport,
  note: string,
): ImageEvidenceReport {
  const prior = report.staffMessage?.trim();
  return {
    ...report,
    staffMessage: prior ? `${prior}\n${note}` : note,
    canAutoLockIdentity: false,
  };
}

/**
 * Pass 2 — guide-driven MTG detective questions using the category knowledge base.
 * Runs focused micro-vision inspectors to narrow variant uncertainty before catalog.
 */
export async function refineMtgVariantEvidence(
  input: CardEvidenceInput,
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
): Promise<MtgVariantEvidenceResult> {
  const questions = planMtgDetectiveQuestions(detectiveGuide, imageEvidence);
  const notes: string[] = [];
  let report = imageEvidence;

  if (!questions.length) {
    return { imageEvidence: report, questionsAsked: [], notes };
  }

  notes.push(
    `MTG detective planned ${questions.length} guide-driven question(s): ${questions.map((q) => q.field).join(", ")}.`,
  );
  report = appendStaffNote(
    report,
    `Detective follow-ups (${questions.length}): ${questions.map((q) => q.id.replace("mtg_", "")).join(", ")}.`,
  );

  let mtgListMarkInspection: MtgListMarkInspection | undefined;
  let mtgFoilWashInspection: MtgFoilWashInspection | undefined;
  let mtgFrameTreatmentInspection: MtgFrameTreatmentInspection | undefined;

  if (shouldRunMtgQuestion("mtg_list_mark", questions)) {
    const q = questions.find((x) => x.id === "mtg_list_mark")!;
    try {
      mtgListMarkInspection = await inspectMtgListMark(input, report);
      report = applyListInspectionToEvidence(report, mtgListMarkInspection);
      notes.push(
        `List mark check: ${mtgListMarkInspection.listMarkVisible} — ${q.reason}`,
      );
    } catch (err) {
      console.error("[card-flow-v2] MTG evidence List mark:", err);
      notes.push("List mark micro-vision failed during evidence refinement.");
    }
  }

  if (shouldRunMtgQuestion("mtg_foil_finish", questions)) {
    const q = questions.find((x) => x.id === "mtg_foil_finish")!;
    try {
      mtgFoilWashInspection = await inspectMtgFoilWash(input, report);
      report = applyFoilInspectionToEvidence(report, mtgFoilWashInspection);
      notes.push(
        `Foil finish check: ${mtgFoilWashInspection.foilWashVisible} — ${q.reason}`,
      );
    } catch (err) {
      console.error("[card-flow-v2] MTG evidence foil wash:", err);
      notes.push("Foil wash micro-vision failed during evidence refinement.");
    }
  }

  if (shouldRunMtgQuestion("mtg_frame_treatment", questions)) {
    const q = questions.find((x) => x.id === "mtg_frame_treatment")!;
    try {
      mtgFrameTreatmentInspection = await inspectMtgFrameTreatment(input, report);
      report = applyFrameInspectionToEvidence(report, mtgFrameTreatmentInspection);
      notes.push(
        `Frame treatment check: ${mtgFrameTreatmentInspection.frameTreatment} — ${q.reason}`,
      );
    } catch (err) {
      console.error("[card-flow-v2] MTG evidence frame:", err);
      notes.push("Frame micro-vision failed during evidence refinement.");
    }
  }

  if (
    report.identificationMode === "safe_to_continue" &&
    questions.some((q) => q.field === "foil_pattern" || q.field === "the_list_mark")
  ) {
    report = {
      ...report,
      identificationMode: "continue_with_variant_uncertainty",
    };
  }

  return {
    imageEvidence: report,
    questionsAsked: questions,
    notes,
    mtgListMarkInspection,
    mtgFoilWashInspection,
    mtgFrameTreatmentInspection,
  };
}

export function buildMtgEvidenceIntro(guide: CategoryDetectiveGuide): string {
  return [
    "Category is Magic: The Gathering.",
    "Use the detective guide below to populate evidence slots — pass 2 will ask focused follow-up questions for any uncertain variant fields.",
    "",
    MTG_IMAGE_EVIDENCE_RULES,
    "",
    formatDetectiveGuideForPrompt(guide, { maxTraps: 8, maxTips: 6 }),
  ].join("\n");
}

/** True when evidence phase already resolved this field via micro-vision. */
export function mtgEvidenceQuestionAlreadyResolved(
  field: string,
  imageEvidence: ImageEvidenceReport,
): boolean {
  const slot = getEvidenceSlot(imageEvidence, field);
  return Boolean(slot?.note?.includes("micro-vision") && slot.confidence >= 0.85);
}
