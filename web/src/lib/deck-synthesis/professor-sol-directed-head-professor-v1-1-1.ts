/**
 * P6 — Head Professor whole-deck adjudication for Sol-directed v1.1.1.
 */
import { PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE } from "./professor-predictive-layer-boundary-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { SolDirectedAgentFeedV111 } from "./professor-sol-directed-build-activity-v1-1-1";
import {
  formatAgentPromptOutForFeed,
  formatAgentSystemOutForFeed,
  formatHeadProfessorResponseInForFeed,
} from "./professor-sol-directed-build-activity-v1-1-1";
import { solDirectedModelCallOptions } from "./professor-sol-directed-model-config-v1-1-1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import type {
  ArchitectRawPlanV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { SolDirectedValidationV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import { collectSolDirectedDeckCardNames } from "./professor-sol-directed-deck-enrichment-v1-1-1";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import {
  buildGroundingCorrectionNoticeV1,
  checkVerdictCardGroundingV1,
  type VerdictCardGroundingV1,
} from "./professor-sol-directed-verdict-card-grounding-v1";

export const PROFESSOR_SOL_DIRECTED_HEAD_PROFESSOR_V1_1_1_VERSION =
  "professor-sol-directed-head-professor-v1-1-1";

export type SolDirectedHeadProfessorWholeDeckVerdictV111 = {
  classification: "CONSTRUCTION_SUCCESS" | "OPTIONAL_REFINEMENT" | "CONSTRUCTION_DEFECT";
  bracketFit: string;
  strategyCoherence: string;
  manaAssessment: string;
  earlyMidLateGameAssessment: string;
  winConditionAssessment: string;
  interactionAssessment: string;
  resilienceAssessment: string;
  offPlanCards: string[];
  requiredChanges: string[];
  optionalChanges: string[];
  grade: string;
  reasoningSummary: string;
  selfBuildQuestionAnswer: string;
};

const HEAD_PROFESSOR_WHOLE_DECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    classification: {
      type: "string",
      enum: ["CONSTRUCTION_SUCCESS", "OPTIONAL_REFINEMENT", "CONSTRUCTION_DEFECT"],
    },
    bracketFit: { type: "string" },
    strategyCoherence: { type: "string" },
    manaAssessment: { type: "string" },
    earlyMidLateGameAssessment: { type: "string" },
    winConditionAssessment: { type: "string" },
    interactionAssessment: { type: "string" },
    resilienceAssessment: { type: "string" },
    offPlanCards: { type: "array", items: { type: "string" } },
    requiredChanges: { type: "array", items: { type: "string" } },
    optionalChanges: { type: "array", items: { type: "string" } },
    grade: { type: "string" },
    reasoningSummary: { type: "string" },
    selfBuildQuestionAnswer: { type: "string" },
  },
  required: [
    "classification",
    "bracketFit",
    "strategyCoherence",
    "manaAssessment",
    "earlyMidLateGameAssessment",
    "winConditionAssessment",
    "interactionAssessment",
    "resilienceAssessment",
    "offPlanCards",
    "requiredChanges",
    "optionalChanges",
    "grade",
    "reasoningSummary",
    "selfBuildQuestionAnswer",
  ],
} as const;

const HEAD_PROFESSOR_SYSTEM_V111 = `You are GPT-5.6 Luna Head Professor performing HEAD_PROFESSOR_WHOLE_DECK_ADJUDICATION.

You are evaluating whether a two-call Sol-directed construction (Architect + Constructor) produced a genuinely good Commander deck.
You are NOT rescuing construction. Do not propose rebuilding the deck from scratch unless classification is CONSTRUCTION_DEFECT.

Use architectRequirementRealization and selected cards with canonical Oracle facts as authoritative strategic evidence.
Ignore legacyHeuristicAudit counts — they are NON_AUTHORITATIVE_DIAGNOSTIC and may disagree with Architect allocations.

Adjudicate the deck as a whole. Do not independently grade all 99 cards in isolation.

Answer explicitly whether, given the same Commander, Bracket, and player intent, this is substantially the deck you would have wanted constructed. Put that answer in selfBuildQuestionAnswer.

Classification guidance:
- CONSTRUCTION_SUCCESS: executes the plan with only minor quibbles
- OPTIONAL_REFINEMENT: same core strategy/win architecture with normal tuning suggestions
- CONSTRUCTION_DEFECT: requires substantial package replacement, changes fundamental win architecture, or >~10% of nonlands need required strategic corrections

requiredChanges vs optionalChanges:
- requiredChanges: ONLY blocking package/role failures that would embarrass a shipped customer deck (misallocated slots, missing package density, off-plan cards with no strategic excuse). Do NOT put "consider replacing X", marginal sidegrades, or reclassification notes here.
- optionalChanges: tuning suggestions, marginal upgrades, "could also run Y instead of Z", and soft improvements that do not block shipping.

When deckPreferences constrain the card pool (for example only Lord of the Rings or Hobbit sets), grade leniently on role-allocation perfection. If slot counts are met, cards are legal, and the list respects deckPreferences, prefer OPTIONAL_REFINEMENT over CONSTRUCTION_DEFECT unless the deck is fundamentally unplayable. Do not require off-preference staples that violate deckPreferences.

reasoningSummary is the customer-facing pilot brief — 2 to 4 short sentences for the player who will sit down with this list. Say how the deck wins, give one or two early/mid piloting tips, and name the key combo or variant lines if they are in the 99. Do not write a construction verdict, allocation recap, or a sentence that starts by describing what the deck "is built to" do.

${PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE}`;

function buildCanonicalDeckEvidence(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
}) {
  return args.deck.nonlands.map((card) => {
    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId,
      catalog: args.catalog,
    });
    const golden = args.catalog.byOracleId.get(card.oracleId);
    return {
      name: card.name,
      oracleId: card.oracleId,
      primaryArchitectRequirement: card.primaryArchitectRequirement,
      primaryRole: card.primaryRole,
      secondaryRoles: card.secondaryRoles,
      packageMembership: card.packageMembership,
      whyInThisDeck: card.whyInThisDeck,
      structuralNecessity: card.structuralNecessity,
      typeLine: truth.typeLine,
      manaValue: truth.manaValue,
      colorIdentity: truth.colorIdentity,
      oracleText: golden ? combinedGoldenOracleText(golden) : truth.oracleText,
    };
  });
}

export function interpretTwoCallConstructionProofV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
): "PASS" | "FAIL" {
  return isSolDirectedHeadProfessorShippableV111(verdict) ? "PASS" : "FAIL";
}

function asSubmittedGradeLetter(grade: string): string | null {
  return grade.match(/^([A-F][+-]?)\s+as submitted/i)?.[1] ?? null;
}

/** Decks with CONSTRUCTION_DEFECT or an F "as submitted" grade must not ship to users. */
export function isSolDirectedHeadProfessorShippableV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
): boolean {
  if (verdict.classification === "CONSTRUCTION_DEFECT") return false;
  const submitted = asSubmittedGradeLetter(verdict.grade);
  if (submitted?.startsWith("F")) return false;
  return true;
}

/** Run Critic repair when the deck cannot ship or the Professor listed required fixes. */
export function shouldRunProfessorRepairCriticV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
): boolean {
  if (!isSolDirectedHeadProfessorShippableV111(verdict)) return true;
  return verdict.requiredChanges.length > 0;
}

export function formatHeadProfessorQualityFailureDetailV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
): string {
  const parts = [verdict.grade, verdict.classification.replace(/_/g, " ")];
  if (verdict.requiredChanges.length > 0) {
    parts.push(`Required: ${verdict.requiredChanges.slice(0, 4).join("; ")}`);
  }
  if (verdict.offPlanCards.length > 0) {
    parts.push(`Off-plan: ${verdict.offPlanCards.slice(0, 6).join(", ")}`);
  }
  return parts.join(" · ");
}

export async function runSolDirectedHeadProfessorWholeDeckV111(args: {
  deck: SolDirectedConstructedDeckV11;
  architectRawPlan: ArchitectRawPlanV11;
  retrievalContract: RetrievalContractV11;
  validation: SolDirectedValidationV111;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle?: string;
  deckPreferences?: string;
  catalog: DeckResolutionCatalog;
  onFeed?: SolDirectedAgentFeedV111;
}): Promise<{
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111;
  /** Which cards the shipped review named that the deck does not contain. */
  grounding: VerdictCardGroundingV1;
  record: SolDirectedModelCallRecordV1;
}> {
  const userPrompt = JSON.stringify(
    {
      purpose: "HEAD_PROFESSOR_WHOLE_DECK_ADJUDICATION",
      commander: args.commander,
      bracket: args.bracket,
      playstyle: args.playstyle,
      deckTheme: args.deckTheme?.trim() || null,
      winPreference: args.winPreference?.trim() || null,
      commanderStyle: args.commanderStyle?.trim() || null,
      deckPreferences: args.deckPreferences?.trim() || null,
      architectRawPlan: args.architectRawPlan,
      retrievalContract: {
        strategicThesis: args.retrievalContract.strategicThesis,
        cardRequirements: args.retrievalContract.cardRequirements,
        comboAndPowerGuardrails: args.retrievalContract.comboAndPowerGuardrails,
        tutorPolicy: args.retrievalContract.tutorPolicy,
      },
      constructedDeck: {
        landCount: args.deck.landCount,
        lands: args.deck.lands,
        nonlands: buildCanonicalDeckEvidence({ deck: args.deck, catalog: args.catalog }),
        primaryWinPaths: args.deck.primaryWinPaths,
        secondaryWinPaths: args.deck.secondaryWinPaths,
        expectedPlayPattern: args.deck.expectedPlayPattern,
      },
      deterministicLegality: {
        pass: args.validation.pass,
        violations: args.validation.violations,
      },
      architectRequirementRealization: args.validation.architectRequirementRealization,
      legacyHeuristicAudit: args.validation.legacyHeuristicAudit,
      question:
        "If you had been given this Commander, Bracket, and player intent and were building the deck yourself, is this substantially the deck you would have wanted constructed?",
    },
    null,
    2,
  );

  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const modelOpts = solDirectedModelCallOptions("HEAD_PROFESSOR");
  await args.onFeed?.status("Grading the finished 99…");
  await args.onFeed?.out(formatAgentSystemOutForFeed(HEAD_PROFESSOR_SYSTEM_V111));
  await args.onFeed?.out(formatAgentPromptOutForFeed(userPrompt));
  const { parsed, model, usage, callId } =
    await callHeadProfessorJsonV48<SolDirectedHeadProfessorWholeDeckVerdictV111>({
      system: HEAD_PROFESSOR_SYSTEM_V111,
      userContent: userPrompt,
      jsonSchema: HEAD_PROFESSOR_WHOLE_DECK_SCHEMA,
      schemaName: "sol_directed_head_professor_whole_deck_v1_1_1",
      useJsonSchema: true,
      ...modelOpts,
      onProgress: args.onFeed?.progress,
      telemetry: { collector, purpose: "HEAD_PROFESSOR_REVIEW", planned: true },
    });

  await args.onFeed?.in(formatHeadProfessorResponseInForFeed(parsed as unknown as Record<string, unknown>));

  // A review that describes cards the deck does not contain cannot be acted
  // on, and the player has no way to tell which parts to trust. One corrective
  // re-ask, naming the offending cards, then ship whichever pass is grounded.
  const deckCardNames = collectSolDirectedDeckCardNames(args.deck);
  const isRealCardName = (name: string): boolean =>
    args.catalog.byNormalizedName.has(normalizeOracleName(name));

  let verdict = parsed;
  let grounding = checkVerdictCardGroundingV1({
    verdict: verdict as unknown as Record<string, unknown>,
    deckCardNames,
    isRealCardName,
  });
  let groundingRetryRecord: { model: string; callId: string | null } | null = null;

  if (!grounding.grounded) {
    const offDeck = [...new Set(grounding.descriptiveViolations.map((v) => v.cited))];
    await args.onFeed?.status(
      `Review cited ${offDeck.length} card(s) not in the deck (${offDeck.join(", ")}) — asking for a correction…`,
    );

    const correctedPrompt = `${userPrompt}\n\n${buildGroundingCorrectionNoticeV1(grounding)}`;
    try {
      const retry = await callHeadProfessorJsonV48<SolDirectedHeadProfessorWholeDeckVerdictV111>({
        system: HEAD_PROFESSOR_SYSTEM_V111,
        userContent: correctedPrompt,
        jsonSchema: HEAD_PROFESSOR_WHOLE_DECK_SCHEMA,
        schemaName: "sol_directed_head_professor_whole_deck_v1_1_1",
        useJsonSchema: true,
        ...modelOpts,
        onProgress: args.onFeed?.progress,
        telemetry: { collector, purpose: "HEAD_PROFESSOR_REVIEW", planned: false },
      });

      const retryGrounding = checkVerdictCardGroundingV1({
        verdict: retry.parsed as unknown as Record<string, unknown>,
        deckCardNames,
        isRealCardName,
      });

      // Keep the retry only when it is actually better, so a correction pass
      // cannot make the review worse than the one it replaced.
      if (retryGrounding.descriptiveViolations.length < grounding.descriptiveViolations.length) {
        verdict = retry.parsed;
        grounding = retryGrounding;
        groundingRetryRecord = { model: retry.model, callId: retry.callId ?? null };
        await args.onFeed?.in(
          formatHeadProfessorResponseInForFeed(verdict as unknown as Record<string, unknown>),
        );
      }
    } catch {
      // A failed correction leaves the original verdict in place; the grounding
      // report below still records what was wrong with it.
    }

    if (!grounding.grounded) {
      const remaining = [...new Set(grounding.descriptiveViolations.map((v) => v.cited))];
      await args.onFeed?.status(
        `Review still cites ${remaining.join(", ")} — not in this deck. Treat those statements as unreliable.`,
      );
    }
  }

  return {
    verdict,
    grounding,
    record: {
      purpose: "HEAD_PROFESSOR",
      systemPrompt: HEAD_PROFESSOR_SYSTEM_V111,
      userPrompt,
      rawResponse: verdict,
      model: groundingRetryRecord?.model ?? model,
      callId: groundingRetryRecord?.callId ?? callId,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
      outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}
