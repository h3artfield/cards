/**
 * CALL 2 — Sol Deck Constructor (v1.1 — raw plan + dictionary pools).
 */
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { ConstructorInputBundleV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import {
  SOL_DIRECTED_CONSTRUCTED_DECK_JSON_SCHEMA_V1_1,
  SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1,
} from "./professor-sol-directed-constructor-input-v1-1";
import type { SolDirectedAgentFeedV111 } from "./professor-sol-directed-build-activity-v1-1-1";
import {
  formatAgentPromptOutForFeed,
  formatAgentSystemOutForFeed,
  formatConstructorResponseInForFeed,
} from "./professor-sol-directed-build-activity-v1-1-1";
import { solDirectedModelCallOptions } from "./professor-sol-directed-model-config-v1-1-1";
import { resolveCanonicalCardIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";
import {
  candidateHydrationContextFromBundle,
  hydrateSolDirectedConstructedDeckV111,
  type CandidateHydrationContextV111,
} from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";

export const PROFESSOR_SOL_DIRECTED_CONSTRUCTOR_V1_1_VERSION = "professor-sol-directed-constructor-v1-1";

type RawConstructedDeckV11 = Omit<SolDirectedConstructedDeckV11, "commander">;

export function normalizeSolDirectedConstructedDeckV11(args: {
  raw: Partial<RawConstructedDeckV11>;
  commander: CommanderBlueprintV417;
  catalog: DeckResolutionCatalog;
  candidateContext?: CandidateHydrationContextV111;
}): SolDirectedConstructedDeckV11 {
  if (args.candidateContext) {
    return hydrateSolDirectedConstructedDeckV111({
      raw: args.raw,
      commander: args.commander,
      context: args.candidateContext,
    }).deck;
  }

  const lands = (args.raw.lands ?? []).map((l) => ({
    name: l.name ?? "Unknown",
    copies: Math.max(1, Number(l.copies ?? 1)),
  }));
  const nonlands = (args.raw.nonlands ?? []).map((c) => {
    const identity = resolveCanonicalCardIdentity({ name: c.name ?? "", catalog: args.catalog });
    return {
      oracleId: identity.oracleId ?? "",
      name: identity.canonicalName || c.name || "Unknown",
      primaryArchitectRequirement: c.primaryArchitectRequirement ?? c.primaryRole ?? "unknown",
      primaryRole: c.primaryRole ?? "",
      secondaryRoles: c.secondaryRoles ?? [],
      packageMembership: c.packageMembership ?? [],
      whyInThisDeck: c.whyInThisDeck ?? "",
      structuralNecessity: c.structuralNecessity ?? "FLEX",
    };
  });
  return {
    commander: args.commander,
    landCount: args.raw.landCount ?? lands.reduce((s, l) => s + l.copies, 0),
    lands,
    nonlands,
    primaryWinPaths: args.raw.primaryWinPaths ?? [],
    secondaryWinPaths: args.raw.secondaryWinPaths ?? [],
    expectedPlayPattern: args.raw.expectedPlayPattern ?? "",
    structuralNecessities: args.raw.structuralNecessities ?? [],
    replaceableFlex: args.raw.replaceableFlex ?? [],
  };
}

export async function runSolDirectedConstructorV11(args: {
  bundle: ConstructorInputBundleV11;
  commander: CommanderBlueprintV417;
  catalog: DeckResolutionCatalog;
  onFeed?: SolDirectedAgentFeedV111;
}): Promise<{
  deck: SolDirectedConstructedDeckV11;
  record: SolDirectedModelCallRecordV1;
  identityLedger: import("./professor-sol-directed-candidate-hydration-v1-1-1").IdentityResolutionLedgerEntryV111[];
  hydrationErrors: string[];
}> {
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const modelOpts = solDirectedModelCallOptions("CONSTRUCTOR");
  const promptKb = Math.round(args.bundle.userPrompt.length / 1024);
  await args.onFeed?.status(`Picking 99 cards from ${promptKb}KB candidate pool…`);
  await args.onFeed?.out(formatAgentSystemOutForFeed(args.bundle.systemPrompt));
  await args.onFeed?.out(formatAgentPromptOutForFeed(args.bundle.userPrompt));
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<Partial<RawConstructedDeckV11>>({
    system: args.bundle.systemPrompt,
    userContent: args.bundle.userPrompt,
    jsonSchema: SOL_DIRECTED_CONSTRUCTED_DECK_JSON_SCHEMA_V1_1,
    schemaName: "sol_directed_constructed_deck_v1_1",
    useJsonSchema: true,
    ...modelOpts,
    backgroundFirst: args.bundle.userPrompt.length >= 120_000,
    onProgress: args.onFeed?.progress,
    telemetry: { collector, purpose: "OTHER", planned: true },
  });

  await args.onFeed?.in(formatConstructorResponseInForFeed(parsed ?? {}));

  const candidateContext = candidateHydrationContextFromBundle(args.bundle, {
    catalog: args.catalog,
    commanderColorIdentity: args.commander.colorIdentity,
  });
  const hydrated = hydrateSolDirectedConstructedDeckV111({
    raw: parsed,
    commander: args.commander,
    context: candidateContext,
  });

  return {
    deck: hydrated.deck,
    identityLedger: hydrated.ledger,
    hydrationErrors: hydrated.errors,
    record: {
      purpose: "CONSTRUCTOR",
      systemPrompt: args.bundle.systemPrompt,
      userPrompt: args.bundle.userPrompt,
      rawResponse: parsed,
      model,
      callId,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
      outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}

export function isConstructorOutputCatastrophicallyIncompleteV11(args: {
  deck: SolDirectedConstructedDeckV11;
  requiredNonlands: number;
  requiredLands: number;
}): { incomplete: boolean; reason: string | null } {
  const nonlandCount = args.deck.nonlands.length;
  const landCopies = args.deck.lands.reduce((s, l) => s + l.copies, 0);
  const total = nonlandCount + landCopies;
  if (nonlandCount === 0 && landCopies === 0) {
    return { incomplete: true, reason: "ZERO_CARD_OUTPUT" };
  }
  if (total < 50) {
    return { incomplete: true, reason: `TOTAL_CARDS_${total}_BELOW_HALF_DECK` };
  }
  if (nonlandCount < args.requiredNonlands - 10) {
    return { incomplete: true, reason: `NONLANDS_${nonlandCount}_FAR_BELOW_${args.requiredNonlands}` };
  }
  return { incomplete: false, reason: null };
}
