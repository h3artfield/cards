import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
  CardEvidenceInput,
  ImageEvidenceReport,
  MtgFoilWashInspection,
  MtgFrameTreatmentInspection,
  MtgListMarkInspection,
  PokemonReversePatternInspection,
  SportsPrizmStampInspection,
  YgoEditionInspection,
} from "./types";
import { generateCatalogCandidates } from "./catalog-candidates";
import {
  mergeVisionAssessments,
  narrowSuspectsByObservedSetAndNumber,
  needsVisionSuspectMatcher,
  scoreSuspectsDeterministic,
  topSuspectsForVision,
} from "./suspect-matcher";
import { runVisionSuspectMatcher } from "./vision-suspect-matcher";
import { runIdentityLockGate } from "./identity-lock-gate";
import {
  augmentRiftboundSuspectAssessments,
  applyRiftboundIdentityLockAdjustments,
} from "./riftbound-suspect-scoring";
import {
  augmentMtgSuspectAssessments,
  applyMtgFoilIdentityLockAdjustments,
  applyMtgFrameIdentityLockAdjustments,
  applyMtgListIdentityLockAdjustments,
} from "./mtg-suspect-scoring";
import {
  applyFoilInspectionToEvidence,
  inspectMtgFoilWash,
} from "./mtg-foil-inspector";
import {
  applyListInspectionToEvidence,
  inspectMtgListMark,
} from "./mtg-list-mark-inspector";
import {
  buildMtgFoilStaffExplanation,
  detectMtgFoilFinishTrap,
} from "./mtg-foil-trap";
import {
  applyFrameInspectionToEvidence,
  inspectMtgFrameTreatment,
} from "./mtg-frame-inspector";
import {
  buildMtgFrameStaffExplanation,
  detectMtgFrameTreatmentTrap,
} from "./mtg-frame-trap";
import {
  buildMtgListStaffExplanation,
  detectMtgListOriginRefTrap,
} from "./mtg-list-trap";
import {
  assessMtgListInvestigation,
  buildMtgListEvidenceStaffExplanation,
  listInvestigationBlocksSetNumberNarrowing,
  shouldRunMtgListMarkInspection,
} from "./mtg-list-evidence";
import { injectMtgPlstSuspects, recoverMtgCatalogSuspects } from "./mtg-plst-candidates";
import {
  ensurePokemonScanDerivedFallback,
  filterJapaneseCatalogSuspects,
  isJapanesePokemonEvidence,
  recoverPokemonCatalogSuspects,
} from "./pokemon-japanese-fallback";
import { enrichPokemonScanDerivedTcgplayerJapan } from "./tcgplayer-japan-catalog";
import {
  planMtgDetectiveQuestions,
  shouldRunMtgQuestion,
} from "./detective-question-planner";
import { microVisionResolvedSlot } from "./evidence-utils";
import {
  applyReversePatternInspectionToEvidence,
  inspectPokemonReversePattern,
} from "./pokemon-reverse-pattern-inspector";
import {
  augmentPokemonSuspectAssessments,
  applyPokemonReversePatternLockAdjustments,
} from "./pokemon-suspect-scoring";
import {
  buildPokemonReversePatternStaffExplanation,
  detectPokemonReversePatternTrap,
  expandPokemonPatternSuspects,
} from "./pokemon-reverse-trap";
import {
  augmentSportsSuspectAssessments,
  applySportsPrizmIdentityLockAdjustments,
} from "./sports-suspect-scoring";
import {
  applySportsPrizmInspectionToEvidence,
  inspectSportsPrizmStamp,
} from "./sports-prizm-inspector";
import {
  buildSportsPrizmStaffExplanation,
  detectSportsPrizmTrap,
} from "./sports-prizm-trap";
import {
  augmentYgoSuspectAssessments,
  applyYgoEditionIdentityLockAdjustments,
} from "./ygo-suspect-scoring";
import {
  applyYgoEditionInspectionToEvidence,
  inspectYgoEdition,
} from "./ygo-edition-inspector";
import {
  buildYgoEditionStaffExplanation,
  detectYgoEditionTrap,
} from "./ygo-edition-trap";

export type CardIdentityV2Input = CardEvidenceInput & {
  evidence: CardFlowV2EvidenceBundle;
  visionFallback?: Partial<import("../types").VisionResult>;
};

export async function runCardIdentityV2(
  input: CardIdentityV2Input,
): Promise<CardCandidateBundle> {
  const { evidence } = input;
  let { imageEvidence, categoryClassification, detectiveGuide } = evidence;

  const category =
    categoryClassification.category !== "unknown"
      ? categoryClassification.category
      : categoryClassification.possibleCategories?.[0]?.category ?? "unknown";

  const candidateResult = await generateCatalogCandidates({
    imageEvidence,
    categoryClassification,
    detectiveGuide,
    declaredItemType: input.declaredItemType,
    visionFallback: input.visionFallback,
  });

  const recoveredPokemonAssessments: import("./types").SuspectAssessment[] = [];

  if (category === "mtg" && candidateResult.suspects.length === 0) {
    try {
      const recovered = await recoverMtgCatalogSuspects({
        imageEvidence,
        visionFallback: input.visionFallback,
      });
      if (recovered.suspects.length) {
        candidateResult.suspects = recovered.suspects;
        candidateResult.notes.push(...recovered.notes);
      }
    } catch (err) {
      console.error("[card-flow-v2] MTG catalog recovery:", err);
      candidateResult.notes.push("MTG catalog recovery failed.");
    }
  }

  if (category === "pokemon" && candidateResult.suspects.length === 0) {
    try {
      const recovered = await recoverPokemonCatalogSuspects({
        imageEvidence,
        visionFallback: input.visionFallback,
      });
      if (recovered.suspects.length) {
        candidateResult.suspects = recovered.suspects;
        candidateResult.notes.push(...recovered.notes);
        if (recovered.assessments.length) {
          recoveredPokemonAssessments.push(...recovered.assessments);
        }
      }
    } catch (err) {
      console.error("[card-flow-v2] Pokémon catalog recovery:", err);
      candidateResult.notes.push("Pokémon catalog recovery failed.");
    }
  }

  let assessments = scoreSuspectsDeterministic(
    candidateResult.suspects,
    imageEvidence,
    detectiveGuide,
  );

  if (category === "pokemon" && isJapanesePokemonEvidence(imageEvidence)) {
    const jpFiltered = filterJapaneseCatalogSuspects({
      suspects: candidateResult.suspects,
      assessments,
      imageEvidence,
    });
    if (jpFiltered.suspects.length !== candidateResult.suspects.length) {
      candidateResult.suspects = jpFiltered.suspects;
      assessments = jpFiltered.assessments;
      candidateResult.notes.push(...jpFiltered.notes);
    }
  }

  if (category === "pokemon") {
    const scanPrioritized = ensurePokemonScanDerivedFallback({
      suspects: candidateResult.suspects,
      assessments,
      imageEvidence,
    });
    candidateResult.suspects = scanPrioritized.suspects;
    assessments = scanPrioritized.assessments;
    if (scanPrioritized.notes.length) {
      candidateResult.notes.push(...scanPrioritized.notes);
    }
  }

  if (recoveredPokemonAssessments.length) {
    const byId = new Map(assessments.map((a) => [a.suspectId, a]));
    for (const a of recoveredPokemonAssessments) {
      byId.set(a.suspectId, a);
    }
    assessments = [...byId.values()];
  }

  if (category === "pokemon" && isJapanesePokemonEvidence(imageEvidence)) {
    const narrowed = narrowSuspectsByObservedSetAndNumber(
      candidateResult.suspects,
      imageEvidence,
    );
    if (
      narrowed.suspects.length > 0 &&
      narrowed.suspects.length < candidateResult.suspects.length
    ) {
      candidateResult.suspects = narrowed.suspects;
      if (narrowed.note) candidateResult.notes.push(narrowed.note);
      assessments = scoreSuspectsDeterministic(
        candidateResult.suspects,
        imageEvidence,
        detectiveGuide,
      );
    }
  }

  if (
    needsVisionSuspectMatcher(assessments, imageEvidence) &&
    candidateResult.suspects.length > 0
  ) {
    try {
      const visionSuspects = topSuspectsForVision(
        candidateResult.suspects,
        assessments,
        6,
      );
      const visionAssessments = await runVisionSuspectMatcher({
        customerImages: input,
        imageEvidence,
        detectiveGuide,
        suspects: visionSuspects,
      });
      if (visionAssessments.length) {
        assessments = mergeVisionAssessments(
          assessments,
          visionAssessments,
          detectiveGuide,
        );
        candidateResult.notes.push(
          `Vision suspect matcher ran on top ${visionSuspects.length} suspect(s).`,
        );
      }
    } catch (err) {
      console.error("[card-flow-v2] vision suspect matcher:", err);
      candidateResult.notes.push(
        "Vision suspect matcher failed — using deterministic scores only.",
      );
    }
  }

  let mtgListMarkInspection: MtgListMarkInspection | undefined;
  let mtgFoilWashInspection: MtgFoilWashInspection | undefined;
  let mtgFrameTreatmentInspection: MtgFrameTreatmentInspection | undefined;
  let pokemonReversePatternInspection: PokemonReversePatternInspection | undefined;
  let ygoEditionInspection: YgoEditionInspection | undefined;
  let sportsPrizmStampInspection: SportsPrizmStampInspection | undefined;

  if (category === "pokemon") {
    const pokeTrap = detectPokemonReversePatternTrap(
      candidateResult.suspects,
      imageEvidence,
    );

    if (pokeTrap) {
      const expanded = expandPokemonPatternSuspects(
        candidateResult.suspects,
        pokeTrap,
      );
      if (expanded.length > candidateResult.suspects.length) {
        candidateResult.suspects = expanded;
        candidateResult.notes.push(
          "Added Master Ball / Poké Ball reverse suspects for pattern-eligible set.",
        );
        assessments = scoreSuspectsDeterministic(
          candidateResult.suspects,
          imageEvidence,
          detectiveGuide,
        );
      }

      try {
        pokemonReversePatternInspection = await inspectPokemonReversePattern(
          input,
          imageEvidence,
        );
        imageEvidence = applyReversePatternInspectionToEvidence(
          imageEvidence,
          pokemonReversePatternInspection,
        );
        pokemonReversePatternInspection = {
          ...pokemonReversePatternInspection,
          staffSummary: buildPokemonReversePatternStaffExplanation({
            trap: pokeTrap,
            inspection: pokemonReversePatternInspection,
          }),
        };
        candidateResult.notes.push(
          `Pokémon reverse pattern inspection: ${pokemonReversePatternInspection.reversePattern} (${pokemonReversePatternInspection.cropQuality} crop).`,
        );
        assessments = augmentPokemonSuspectAssessments(
          candidateResult.suspects,
          assessments,
          pokemonReversePatternInspection,
        );
      } catch (err) {
        console.error("[card-flow-v2] Pokémon reverse pattern inspector:", err);
        candidateResult.notes.push(
          "Pokémon reverse pattern inspection failed — finish comparison only.",
        );
      }
    }
  }

  if (category === "mtg") {
    const guideQuestions = planMtgDetectiveQuestions(detectiveGuide, imageEvidence);

    let listInvestigation = assessMtgListInvestigation(
      imageEvidence,
      candidateResult.suspects,
    );

    if (listInvestigation.investigate) {
      candidateResult.notes.push(
        `The List investigation: ${listInvestigation.reasons.join(", ")}.`,
      );
      try {
        const injected = await injectMtgPlstSuspects(
          candidateResult.suspects,
          imageEvidence,
        );
        if (injected.notes.length) {
          candidateResult.notes.push(...injected.notes);
        }
        if (injected.suspects.length > candidateResult.suspects.length) {
          candidateResult.suspects = injected.suspects;
          assessments = scoreSuspectsDeterministic(
            candidateResult.suspects,
            imageEvidence,
            detectiveGuide,
          );
          listInvestigation = assessMtgListInvestigation(
            imageEvidence,
            candidateResult.suspects,
          );
        }
      } catch (err) {
        console.error("[card-flow-v2] MTG plst candidate injection:", err);
        candidateResult.notes.push(
          "The List plst catalog fetch failed — continuing with existing suspects.",
        );
      }
    }

    const listTrap = detectMtgListOriginRefTrap(
      candidateResult.suspects,
      imageEvidence,
    );
    const runListInspector =
      listInvestigation.investigate &&
      shouldRunMtgListMarkInspection(imageEvidence, listInvestigation);

    if (runListInspector) {
      try {
        mtgListMarkInspection = await inspectMtgListMark(input, imageEvidence);
        imageEvidence = applyListInspectionToEvidence(
          imageEvidence,
          mtgListMarkInspection,
        );
        const staffSummary = listTrap
          ? buildMtgListStaffExplanation({
              trap: listTrap,
              inspection: mtgListMarkInspection,
            })
          : buildMtgListEvidenceStaffExplanation({
              inspection: mtgListMarkInspection,
              reasons: listInvestigation.reasons,
              imageEvidence,
            });
        mtgListMarkInspection = { ...mtgListMarkInspection, staffSummary };
        candidateResult.notes.push(
          `MTG List mark inspection: ${mtgListMarkInspection.listMarkVisible} (${mtgListMarkInspection.cropQuality} crop).`,
        );
      } catch (err) {
        console.error("[card-flow-v2] MTG List mark inspector:", err);
        candidateResult.notes.push(
          "MTG List mark inspection failed — using evidence slots only.",
        );
      }
    }

    const narrowed = narrowSuspectsByObservedSetAndNumber(
      candidateResult.suspects,
      imageEvidence,
      {
        skipWhenListInvestigation:
          listInvestigationBlocksSetNumberNarrowing(listInvestigation),
      },
    );
    if (narrowed.suspects.length < candidateResult.suspects.length) {
      candidateResult.suspects = narrowed.suspects;
      if (narrowed.note) candidateResult.notes.push(narrowed.note);
      assessments = scoreSuspectsDeterministic(
        candidateResult.suspects,
        imageEvidence,
        detectiveGuide,
      );
    }

    const foilTrap = detectMtgFoilFinishTrap(
      candidateResult.suspects,
      imageEvidence,
    );
    const runFoilInspector =
      (foilTrap || shouldRunMtgQuestion("mtg_foil_finish", guideQuestions)) &&
      !microVisionResolvedSlot(imageEvidence, "foil_pattern");

    if (runFoilInspector) {
      try {
        mtgFoilWashInspection = await inspectMtgFoilWash(input, imageEvidence);
        imageEvidence = applyFoilInspectionToEvidence(
          imageEvidence,
          mtgFoilWashInspection,
        );
        mtgFoilWashInspection = {
          ...mtgFoilWashInspection,
          staffSummary: foilTrap
            ? buildMtgFoilStaffExplanation({
                trap: foilTrap,
                inspection: mtgFoilWashInspection,
              })
            : `Guide-driven foil check: ${mtgFoilWashInspection.foilWashVisible} (${mtgFoilWashInspection.cropQuality} crop).`,
        };
        candidateResult.notes.push(
          `MTG foil wash inspection: ${mtgFoilWashInspection.foilWashVisible} (${mtgFoilWashInspection.cropQuality} crop).`,
        );
      } catch (err) {
        console.error("[card-flow-v2] MTG foil wash inspector:", err);
        candidateResult.notes.push(
          "MTG foil wash inspection failed — finish remains uncertain.",
        );
      }
    }

    const frameTrap = detectMtgFrameTreatmentTrap(
      candidateResult.suspects,
      imageEvidence,
    );
    const runFrameInspector =
      (frameTrap || shouldRunMtgQuestion("mtg_frame_treatment", guideQuestions)) &&
      !microVisionResolvedSlot(imageEvidence, "frameTreatment");

    if (runFrameInspector) {
      try {
        mtgFrameTreatmentInspection = await inspectMtgFrameTreatment(
          input,
          imageEvidence,
        );
        imageEvidence = applyFrameInspectionToEvidence(
          imageEvidence,
          mtgFrameTreatmentInspection,
        );
        mtgFrameTreatmentInspection = {
          ...mtgFrameTreatmentInspection,
          staffSummary: frameTrap
            ? buildMtgFrameStaffExplanation({
                trap: frameTrap,
                inspection: mtgFrameTreatmentInspection,
              })
            : `Guide-driven frame check: ${mtgFrameTreatmentInspection.frameTreatment} (${mtgFrameTreatmentInspection.cropQuality} crop).`,
        };
        candidateResult.notes.push(
          `MTG frame inspection: ${mtgFrameTreatmentInspection.frameTreatment} (${mtgFrameTreatmentInspection.cropQuality} crop).`,
        );
      } catch (err) {
        console.error("[card-flow-v2] MTG frame inspector:", err);
        candidateResult.notes.push(
          "MTG frame inspection failed — frame treatment remains uncertain.",
        );
      }
    }

    assessments = augmentMtgSuspectAssessments(
      candidateResult.suspects,
      assessments,
      imageEvidence,
      mtgListMarkInspection,
      mtgFoilWashInspection,
      mtgFrameTreatmentInspection,
    );
  }

  if (category === "yugioh") {
    const ygoTrap = detectYgoEditionTrap(
      candidateResult.suspects,
      imageEvidence,
    );

    if (ygoTrap) {
      try {
        ygoEditionInspection = await inspectYgoEdition(input, imageEvidence);
        imageEvidence = applyYgoEditionInspectionToEvidence(
          imageEvidence,
          ygoEditionInspection,
        );
        ygoEditionInspection = {
          ...ygoEditionInspection,
          staffSummary: buildYgoEditionStaffExplanation({
            trap: ygoTrap,
            inspection: ygoEditionInspection,
          }),
        };
        candidateResult.notes.push(
          `YGO edition inspection: ${ygoEditionInspection.edition} (${ygoEditionInspection.cropQuality} crop).`,
        );
        assessments = augmentYgoSuspectAssessments(
          candidateResult.suspects,
          assessments,
          ygoEditionInspection,
        );
      } catch (err) {
        console.error("[card-flow-v2] YGO edition inspector:", err);
        candidateResult.notes.push(
          "YGO edition inspection failed — 1st vs Unlimited remains uncertain.",
        );
      }
    }
  }

  if (category === "sports") {
    const prizmTrap = detectSportsPrizmTrap(
      candidateResult.suspects,
      imageEvidence,
      input,
    );

    if (prizmTrap) {
      try {
        sportsPrizmStampInspection = await inspectSportsPrizmStamp(
          input,
          imageEvidence,
        );
        if (sportsPrizmStampInspection.attempted) {
          imageEvidence = applySportsPrizmInspectionToEvidence(
            imageEvidence,
            sportsPrizmStampInspection,
          );
        }
        sportsPrizmStampInspection = {
          ...sportsPrizmStampInspection,
          staffSummary: buildSportsPrizmStaffExplanation({
            trap: prizmTrap,
            inspection: sportsPrizmStampInspection,
          }),
        };
        candidateResult.notes.push(
          sportsPrizmStampInspection.attempted
            ? `Sports Prizm stamp inspection: ${sportsPrizmStampInspection.prizmStampVisible} (${sportsPrizmStampInspection.cropQuality} crop).`
            : "Sports Prizm stamp inspection skipped — back image required.",
        );
        assessments = augmentSportsSuspectAssessments(
          candidateResult.suspects,
          assessments,
          sportsPrizmStampInspection,
        );
      } catch (err) {
        console.error("[card-flow-v2] Sports Prizm inspector:", err);
        candidateResult.notes.push(
          "Sports Prizm stamp inspection failed — base vs parallel remains uncertain.",
        );
      }
    }
  }

  if (category === "riftbound") {
    assessments = augmentRiftboundSuspectAssessments(
      candidateResult.suspects,
      assessments,
      imageEvidence,
    );
  }

  let lockedIdentity = runIdentityLockGate({
    suspects: candidateResult.suspects,
    assessments,
    detectiveGuide,
    imageEvidence,
    category,
  });

  if (category === "riftbound") {
    lockedIdentity = applyRiftboundIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
    );
  }

  if (category === "mtg" && mtgListMarkInspection?.attempted) {
    lockedIdentity = applyMtgListIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      mtgListMarkInspection,
    );
  }

  if (category === "mtg" && mtgFoilWashInspection?.attempted) {
    lockedIdentity = applyMtgFoilIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      mtgFoilWashInspection,
    );
  }

  if (category === "mtg" && mtgFrameTreatmentInspection?.attempted) {
    lockedIdentity = applyMtgFrameIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      mtgFrameTreatmentInspection,
    );
  }

  if (category === "pokemon" && pokemonReversePatternInspection?.attempted) {
    lockedIdentity = applyPokemonReversePatternLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      pokemonReversePatternInspection,
    );
  }

  if (category === "yugioh" && ygoEditionInspection?.attempted) {
    lockedIdentity = applyYgoEditionIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      ygoEditionInspection,
    );
  }

  if (category === "sports" && sportsPrizmStampInspection?.attempted) {
    lockedIdentity = applySportsPrizmIdentityLockAdjustments(
      lockedIdentity,
      candidateResult.suspects,
      assessments,
      sportsPrizmStampInspection,
    );
  }

  if (category === "pokemon") {
    const ensured = ensurePokemonScanDerivedFallback({
      suspects: candidateResult.suspects,
      assessments,
      imageEvidence,
    });
    candidateResult.suspects = ensured.suspects;
    assessments = ensured.assessments;
    candidateResult.notes.push(...ensured.notes);

    try {
      const tcgEnriched = await enrichPokemonScanDerivedTcgplayerJapan({
        suspects: candidateResult.suspects,
        imageEvidence,
      });
      if (tcgEnriched.suspects !== candidateResult.suspects) {
        candidateResult.suspects = tcgEnriched.suspects;
      }
      if (tcgEnriched.notes.length) {
        candidateResult.notes.push(...tcgEnriched.notes);
      }
    } catch (err) {
      console.error("[card-flow-v2] TCGplayer Japan catalog enrich:", err);
      candidateResult.notes.push("TCGplayer Japan catalog enrichment failed.");
    }
  }

  return {
    category,
    suspects: candidateResult.suspects,
    suspectAssessments: assessments,
    lockedIdentity,
    candidateGenerationNotes: candidateResult.notes,
    mtgListMarkInspection,
    mtgFoilWashInspection,
    mtgFrameTreatmentInspection,
    pokemonReversePatternInspection,
    ygoEditionInspection,
    sportsPrizmStampInspection,
    createdAt: new Date().toISOString(),
  };
}
