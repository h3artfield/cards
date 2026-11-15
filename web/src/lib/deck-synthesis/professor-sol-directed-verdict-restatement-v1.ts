/**
 * Keeps the shipped review consistent with the shipped decklist.
 *
 * The bracket attainment and ceiling passes are deliberately the last mutations
 * before the terminal gate, which puts them *after* the Head Professor review.
 * When they swap a card the review discussed, the review silently becomes wrong
 * about the deck. A live Fynn build graded B+ and shipped a review praising
 * The Great Henge in bracketFit and Utopia Sprawl in manaAssessment, both of
 * which the attainment pass had just traded for Chrome Mox and Mana Vault.
 *
 * The grounding guard cannot catch this: at review time those cards were
 * genuinely in the deck. So the check has to run again after the final
 * mutations, and the fix is a restatement rather than a re-review.
 *
 * Two properties matter here. Only the descriptive fields that actually went
 * stale are rewritten, so a build whose swaps touched nothing the review
 * mentioned costs no model call at all. And the grade and classification are
 * not in the response schema, so a restatement cannot regrade the deck — that
 * would fight the keep-best logic in the repair loop, which chose this verdict
 * precisely because of its grade.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "../deck-builder/golden-catalog/normalize-name";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import { collectSolDirectedDeckCardNames } from "./professor-sol-directed-deck-enrichment-v1-1-1";
import { solDirectedModelCallOptions } from "./professor-sol-directed-model-config-v1-1-1";
import { checkVerdictCardGroundingV1 } from "./professor-sol-directed-verdict-card-grounding-v1";
import type { VerdictCardGroundingV1 } from "./professor-sol-directed-verdict-card-grounding-v1";
import type { SolDirectedAgentFeedV111 } from "./professor-sol-directed-build-activity-v1-1-1";
import { formatHeadProfessorResponseInForFeed } from "./professor-sol-directed-build-activity-v1-1-1";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

/** Text fields a restatement is allowed to rewrite. Grade is not among them. */
const RESTATABLE_FIELDS_V1 = [
  "bracketFit",
  "strategyCoherence",
  "manaAssessment",
  "earlyMidLateGameAssessment",
  "winConditionAssessment",
  "interactionAssessment",
  "resilienceAssessment",
  "reasoningSummary",
  "selfBuildQuestionAnswer",
  "offPlanCards",
] as const;

export type RestatableFieldV1 = (typeof RESTATABLE_FIELDS_V1)[number];

const RESTATEMENT_SYSTEM_V1 = `You are GPT-5.6 Luna Head Professor performing HEAD_PROFESSOR_REVIEW_RESTATEMENT.

Your earlier review of this Commander deck was accurate when written. The deck was then modified by a deterministic bracket pass, which swapped some cards. A few of your statements now describe cards the deck no longer contains.

Restate only the fields you are given, so that every card you name is one the final deck actually contains.

Rules:
- Do NOT change your assessment, your grade, or your verdict. This is a factual correction, not a re-review.
- Where a card was replaced, describe the replacement if it serves the same role, or drop the reference if it does not.
- Do NOT introduce cards that are absent from the final decklist.
- Keep each field's length, tone, and level of detail close to the original.
- Return ONE JSON object containing only the requested fields.`;

function fieldSchema(field: RestatableFieldV1) {
  return field === "offPlanCards" ? { type: "array", items: { type: "string" } } : { type: "string" };
}

/**
 * Fields whose text names a card the final deck lacks. Restating anything else
 * would be a gratuitous rewrite of prose that is already correct.
 */
export function staleFieldsForRestatementV1(grounding: VerdictCardGroundingV1): RestatableFieldV1[] {
  const affected = new Set<string>();
  for (const violation of grounding.descriptiveViolations) affected.add(violation.field);
  return RESTATABLE_FIELDS_V1.filter((field) => affected.has(field));
}

/** Applies only the requested fields, leaving grade and classification alone. */
export function mergeRestatementV1(args: {
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111;
  parsed: Record<string, unknown>;
  fields: readonly RestatableFieldV1[];
}): Record<string, unknown> {
  const revised = { ...args.verdict } as unknown as Record<string, unknown>;
  for (const field of args.fields) {
    if (args.parsed[field] != null) revised[field] = args.parsed[field];
  }
  return revised;
}

/**
 * A restatement is kept only when it strictly reduces the mismatch. Trading one
 * wrong card for another leaves the review no more trustworthy than before.
 */
export function shouldKeepRestatementV1(args: {
  before: VerdictCardGroundingV1;
  after: VerdictCardGroundingV1;
}): boolean {
  return args.after.descriptiveViolations.length < args.before.descriptiveViolations.length;
}

/** Signature of the model call, injectable so the decision logic is testable. */
export type RestatementModelCallV1 = (input: {
  system: string;
  userContent: string;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
}) => Promise<{ parsed: Record<string, unknown>; model?: string | null; callId?: string | null }>;

export type VerdictRestatementV1 = {
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111;
  grounding: VerdictCardGroundingV1;
  restatedFields: RestatableFieldV1[];
  /** Cards the stale review named that the final deck does not contain. */
  staleCards: string[];
  model: string | null;
  callId: string | null;
};

/**
 * Returns null when nothing needs saying: either the review already matches the
 * final deck, or the mismatch is not in a field a restatement may touch.
 */
export async function restateVerdictForFinalDeckV1(args: {
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111;
  finalDeck: SolDirectedConstructedDeckV11;
  /** Human-readable swap descriptions from the bracket passes, for context. */
  swaps: string[];
  catalog: DeckResolutionCatalog;
  onFeed?: SolDirectedAgentFeedV111;
  callModel?: RestatementModelCallV1;
}): Promise<VerdictRestatementV1 | null> {
  const deckCardNames = collectSolDirectedDeckCardNames(args.finalDeck);
  const isRealCardName = (name: string): boolean =>
    args.catalog.byNormalizedName.has(normalizeOracleName(name));

  const grounding = checkVerdictCardGroundingV1({
    verdict: args.verdict as unknown as Record<string, unknown>,
    deckCardNames,
    isRealCardName,
  });
  if (grounding.grounded) return null;

  const fields = staleFieldsForRestatementV1(grounding);
  if (fields.length === 0) return null;

  const staleCards = [...new Set(grounding.descriptiveViolations.map((v) => v.cited))];

  await args.onFeed?.status(
    `Final bracket swaps removed ${staleCards.join(", ")}, which the review described — asking for a restatement…`,
  );

  const properties: Record<string, unknown> = {};
  for (const field of fields) properties[field] = fieldSchema(field);

  const userPrompt = JSON.stringify(
    {
      purpose: "HEAD_PROFESSOR_REVIEW_RESTATEMENT",
      cardsRemovedAfterYourReview: staleCards,
      swapsApplied: args.swaps,
      finalDecklist: deckCardNames,
      fieldsToRestate: fields,
      yourOriginalText: Object.fromEntries(
        fields.map((field) => [field, (args.verdict as unknown as Record<string, unknown>)[field]]),
      ),
      staleStatements: grounding.descriptiveViolations.map((v) => ({ field: v.field, card: v.cited })),
    },
    null,
    2,
  );

  const callModel: RestatementModelCallV1 =
    args.callModel ??
    ((input) =>
      callHeadProfessorJsonV48<Record<string, unknown>>({
        system: input.system,
        userContent: input.userContent,
        jsonSchema: input.jsonSchema,
        schemaName: input.schemaName,
        useJsonSchema: true,
        ...solDirectedModelCallOptions("HEAD_PROFESSOR"),
        onProgress: args.onFeed?.progress,
      }));

  try {
    const { parsed, model, callId } = await callModel({
      system: RESTATEMENT_SYSTEM_V1,
      userContent: userPrompt,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        properties,
        required: fields,
      },
      schemaName: "sol_directed_head_professor_restatement_v1",
    });

    const revised = mergeRestatementV1({ verdict: args.verdict, parsed, fields });

    const revisedGrounding = checkVerdictCardGroundingV1({
      verdict: revised,
      deckCardNames,
      isRealCardName,
    });

    if (!shouldKeepRestatementV1({ before: grounding, after: revisedGrounding })) {
      await args.onFeed?.status(
        `Restatement did not resolve the mismatch — flagging ${staleCards.join(", ")} as no longer in the deck.`,
      );
      return null;
    }

    await args.onFeed?.in(formatHeadProfessorResponseInForFeed(parsed));

    return {
      verdict: revised as unknown as SolDirectedHeadProfessorWholeDeckVerdictV111,
      grounding: revisedGrounding,
      restatedFields: fields,
      staleCards,
      model: model ?? null,
      callId: callId ?? null,
    };
  } catch {
    // A failed restatement must not fail the build. The original verdict still
    // ships, and the caller reports which statements to distrust.
    return null;
  }
}

/** Message for the build feed when a mismatch survives. */
export function describeUnresolvedStaleReviewV1(staleCards: string[]): string {
  return `Review still describes ${staleCards.join(", ")}, which the final bracket pass replaced. Treat those statements as out of date.`;
}
