/**
 * Professor v4.16.3 — access as a graph, not tutor count.
 * v4.16.4: delegates to Oracle-verified access routes.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import {
  adaptAccessArchitectureV4165ToV4163,
  buildAccessArchitectureV4165,
} from "./professor-verified-access-route-v4-16-5-v1";

export const PROFESSOR_ACCESS_ARCHITECTURE_V4_16_3_V1_VERSION = "professor-access-architecture-v4-16-3-v1";

export type AccessTargetKindV4163 = "engine" | "win" | "protection" | "recovery";

export type AccessTargetV4163 = {
  name: string;
  kind: AccessTargetKindV4163;
  cardType: string;
  manaValue: number;
  artifact: boolean;
  creature: boolean;
  enchantment: boolean;
  land: boolean;
};

export type AccessRouteV4163 = {
  sourceCard: string;
  targets: string[];
  restriction: string;
  repeatable: boolean;
  putsIntoHand: boolean;
  putsOntoBattlefield: boolean;
  recursion: boolean;
  reliability: "HIGH" | "MEDIUM" | "LOW";
};

export type AccessArchitectureV4163 = {
  version: typeof PROFESSOR_ACCESS_ARCHITECTURE_V4_16_3_V1_VERSION;
  criticalEnginePieces: AccessTargetV4163[];
  primaryWinPieces: AccessTargetV4163[];
  protectionPieces: AccessTargetV4163[];
  routes: AccessRouteV4163[];
  engineAccess: number;
  winAccess: number;
  protectionAccess: number;
  recoveryAccess: number;
  criticalAccessFailure: boolean;
  summary: string;
};

export function buildAccessArchitectureV4163(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  theory?: WorkingDeckTheoryV4 | null;
  catalog?: DeckResolutionCatalog | null;
}): AccessArchitectureV4163 {
  return adaptAccessArchitectureV4165ToV4163(
    buildAccessArchitectureV4165({
      selectedCards: args.selectedCards,
      charter: args.charter,
      theory: args.theory,
      catalog: args.catalog,
    }),
  );
}
