import type {
  CardEvidenceInput,
  CardFlowV2EvidenceBundle,
  CardCategory,
} from "./types";
import { runImageEvidenceAgent } from "./image-evidence-agent";
import { runCategoryClassifierAgent } from "./category-classifier-agent";
import { getDetectiveGuide } from "./detective-guides";
import {
  buildCategoryEvidenceIntro,
  refinePokemonFoilEvidence,
} from "./pokemon-foil-evidence";
import { refineMtgVariantEvidence, buildMtgEvidenceIntro } from "./mtg-variant-evidence";

function resolveGuideCategory(
  category: CardCategory,
  possible?: Array<{ category: CardCategory }>,
): CardCategory {
  if (category !== "unknown") return category;
  return possible?.[0]?.category ?? "unknown";
}

export async function runCardEvidenceV2(
  input: CardEvidenceInput,
): Promise<CardFlowV2EvidenceBundle> {
  const categoryClassification = await runCategoryClassifierAgent(input);
  const guideCategory = resolveGuideCategory(
    categoryClassification.category,
    categoryClassification.possibleCategories,
  );
  const detectiveGuide = getDetectiveGuide(
    guideCategory === "unknown" ? "unknown" : guideCategory,
  );

  let imageEvidence = await runImageEvidenceAgent(input, {
    category: guideCategory,
    extraInstructions:
      guideCategory === "mtg"
        ? buildMtgEvidenceIntro(detectiveGuide)
        : buildCategoryEvidenceIntro(guideCategory),
  });

  let detectiveQuestions:
    | import("./detective-question-planner").DetectiveQuestion[]
    | undefined;

  if (guideCategory === "pokemon") {
    imageEvidence = await refinePokemonFoilEvidence(
      input,
      imageEvidence,
      detectiveGuide,
    );
  }

  if (guideCategory === "mtg") {
    const mtgRefined = await refineMtgVariantEvidence(
      input,
      imageEvidence,
      detectiveGuide,
    );
    imageEvidence = mtgRefined.imageEvidence;
    detectiveQuestions = mtgRefined.questionsAsked;
  }

  return {
    ranAt: new Date().toISOString(),
    imageEvidence,
    categoryClassification,
    detectiveGuide,
    detectiveQuestions,
  };
}
