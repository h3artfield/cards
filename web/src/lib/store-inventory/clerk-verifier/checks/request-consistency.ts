import type { ClerkOrchestratorContext, ClerkRouterResult, SpecialistResponse } from "../../clerk-types";
import type { VerifierCheckDetail } from "../types";
import {
  COMMANDER_CONSISTENCY_FAILURE_MESSAGES,
  type CommanderConsistencyFailureCode,
  commanderOracleIdsMatch,
} from "../../commander-oracle-contract";
import {
  commanderNamesMatch,
  explicitRequestedCommanderNames,
  inferPolicyFromRoute,
} from "../../resolved-clerk-request";
import { cardCatalogLookupByName } from "../../clerk-tools/card-catalog";
import { extractPotentialCardMentions } from "../../allowed-card-registry";

export type RequestConsistencyResult = VerifierCheckDetail & {
  failureCode?: CommanderConsistencyFailureCode;
};

function fail(
  code: CommanderConsistencyFailureCode,
  warnings?: string[],
): RequestConsistencyResult {
  return {
    score: 0,
    passed: false,
    failureCode: code,
    reason: COMMANDER_CONSISTENCY_FAILURE_MESSAGES[code],
    warnings,
  };
}

/** Deterministic check: deck identity verified against locked commander Oracle ID. */
export async function checkRequestConsistency(input: {
  route: ClerkRouterResult;
  specialist: SpecialistResponse | null;
  ctx: ClerkOrchestratorContext;
  lockedCommanderOracleId?: string;
}): Promise<RequestConsistencyResult> {
  const warnings: string[] = [];
  const policy = inferPolicyFromRoute({
    routeEntities: input.route.entities,
    question: input.ctx.user_question,
    conversationSummary: input.ctx.conversation_summary,
  });

  const deck = input.specialist?.deckList;
  const lockedOracleId =
    input.lockedCommanderOracleId ??
    input.specialist?.commanderOracleId ??
    deck?.commanderOracleId;

  if (policy === "exact_commander_required") {
    const requestedNames = explicitRequestedCommanderNames({
      routeEntities: input.route.entities,
      question: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });

    if (requestedNames.length > 0 && !lockedOracleId) {
      return fail("requested_commander_unresolved");
    }

    if (deck && requestedNames.length > 0 && !deck.commanderOracleId) {
      return fail("requested_commander_unresolved");
    }
  }

  if (!deck || !lockedOracleId) {
    return { score: 100, passed: true };
  }

  if (deck.commanderOracleId && !commanderOracleIdsMatch(deck.commanderOracleId, lockedOracleId)) {
    return fail("commander_oracle_id_changed", [
      `Locked: ${lockedOracleId}`,
      `Deck: ${deck.commanderOracleId}`,
    ]);
  }

  if (
    deck.commanderColorIdentity === undefined &&
    deck.commanderOracleId
  ) {
    return fail("commander_color_identity_unverified");
  }

  const commanderLine = deck.lines.find((l) => l.category === "commander");
  if (commanderLine?.oracleId && deck.commanderOracleId) {
    if (!commanderOracleIdsMatch(commanderLine.oracleId, deck.commanderOracleId)) {
      return fail("commander_slot_oracle_id_mismatch", [
        `Slot: ${commanderLine.oracleId}`,
        `Deck: ${deck.commanderOracleId}`,
      ]);
    }
  }

  if (
    commanderLine &&
    deck.commanderCanonicalName &&
    commanderLine.name &&
    !commanderNamesMatch(commanderLine.name, deck.commanderCanonicalName) &&
    commanderLine.inStock
  ) {
    return fail("commander_slot_oracle_id_mismatch", [
      `Slot name: ${commanderLine.name}`,
      `Canonical: ${deck.commanderCanonicalName}`,
    ]);
  }

  const deckTitle = deck.commanderCanonicalName ?? deck.archetype?.trim();
  if (policy === "exact_commander_required") {
    const requestedNames = explicitRequestedCommanderNames({
      routeEntities: input.route.entities,
      question: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });

    if (requestedNames.length > 0 && deckTitle) {
      const titleMatches = requestedNames.some((requested) =>
        commanderNamesMatch(deckTitle, requested),
      );
      if (!titleMatches) {
        let requestedOracleId: string | undefined;
        for (const name of requestedNames) {
          const catalog = await cardCatalogLookupByName(name);
          if (catalog?.oracleId) {
            requestedOracleId = catalog.oracleId;
            break;
          }
        }
        if (
          requestedOracleId &&
          deck.commanderOracleId &&
          !commanderOracleIdsMatch(requestedOracleId, deck.commanderOracleId)
        ) {
          return fail("commander_oracle_id_changed");
        }
        if (!requestedOracleId) {
          return fail("requested_commander_unresolved");
        }
      }
    }
  }

  const prose = [
    input.specialist?.direct_answer ?? "",
    deck.strategy ?? "",
  ].join("\n");
  const mentions = extractPotentialCardMentions(prose);
  for (const mention of mentions) {
    const isDeckCommander = deckTitle && commanderNamesMatch(mention, deckTitle);
    if (!isDeckCommander && /\bcommander\b/i.test(prose)) {
      const catalog = await cardCatalogLookupByName(mention);
      if (
        catalog?.oracleId &&
        deck.commanderOracleId &&
        !commanderOracleIdsMatch(catalog.oracleId, deck.commanderOracleId)
      ) {
        return fail("deck_strategy_commander_mismatch", [
          `Prose mentions ${mention} (${catalog.oracleId})`,
          `Deck locked to ${deck.commanderOracleId}`,
        ]);
      }
    }
  }

  if (warnings.length > 0) {
    return {
      score: 40,
      passed: false,
      failureCode: "deck_strategy_commander_mismatch",
      reason: warnings[0],
      warnings,
    };
  }

  return { score: 100, passed: true };
}
