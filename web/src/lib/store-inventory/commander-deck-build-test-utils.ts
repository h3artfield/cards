/**
 * Test-only deck build utilities — do NOT import from production routes.
 */
import {
  commanderNameToSlug,
  fetchEdhrecCommanderMeta,
} from "../deck-builder/edhrec-client";
import type { ClerkDeckList } from "./clerk-types";
import { resolveDeckBuildRequest } from "./resolved-clerk-request";
import { runDeckBuildStep } from "./commander-deck-build-service";

/** @deprecated Production code must use runDeckBuildStep with message-based resolution. */
export async function runFullDeckBuildForTests(input: {
  storeId: string;
  storeSlug: string;
  message: string;
  conversationSummary?: string;
  budget?: number;
}): Promise<ClerkDeckList> {
  let session: Awaited<ReturnType<typeof runDeckBuildStep>>["session"] | undefined;
  let step: Awaited<ReturnType<typeof runDeckBuildStep>>;

  do {
    step = await runDeckBuildStep({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      message: input.message,
      conversationSummary: input.conversationSummary,
      budget: input.budget,
      session,
    });
    session = step.session;
  } while (!step.complete);

  return step.deckList;
}

export async function resolveCommanderForTests(input: {
  question: string;
  storeId: string;
  storeSlug: string;
}) {
  return resolveDeckBuildRequest({
    question: input.question,
    conversationSummary: "",
    storeId: input.storeId,
    storeSlug: input.storeSlug,
  });
}

export async function fetchEdhrecForOracleCanonicalName(canonicalName: string) {
  return fetchEdhrecCommanderMeta(commanderNameToSlug(canonicalName));
}
