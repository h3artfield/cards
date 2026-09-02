/**
 * Phase 6A.1 — Typed functional semantic matching.
 * Evidence-backed; no broad role alias conflation.
 */
export const FUNCTIONAL_MATCH_V1_VERSION = "functional-match-v1";

export type FunctionalMatchType = "EXACT" | "DIRECT_SUPPORT" | "INDIRECT_SUPPORT" | "ADJACENT" | "NONE";

export type CounterAction =
  | "COUNTER_SPELL"
  | "PLACE_COUNTER"
  | "REMOVE_COUNTER"
  | "MULTIPLY_COUNTER"
  | "MOVE_COUNTER";

export type CounterKind =
  | "PLUS_ONE_PLUS_ONE"
  | "LOYALTY"
  | "CHARGE"
  | "EXPERIENCE"
  | "OTHER";

export type ZoneTransition = {
  sourceZone: string;
  destinationZone: string;
  objectClass: string;
  ownerScope?: string;
  controllerScope?: string;
  repeatability?: string;
  condition?: string;
};

export type FunctionalMatch = {
  requirementId: string;
  requirementToken: string;
  candidateOracleId: string;
  matchType: FunctionalMatchType;
  mechanism: string;
  sourceZone?: string;
  destinationZone?: string;
  objectClass?: string;
  objectOwner?: string;
  objectController?: string;
  action?: string;
  resource?: string;
  counterAction?: CounterAction;
  counterKind?: CounterKind;
  targetClass?: string;
  repeatability?: string;
  conditionalRequirements: string[];
  evidenceRefs: string[];
};

export type CardFunctionalCapabilities = {
  zoneTransitions: ZoneTransition[];
  counterActions: Array<{ action: CounterAction; kind: CounterKind; evidence: string }>;
  untapProvider: boolean;
  tapForManaOnly: boolean;
  castFromExileActions: string[];
  blinkFlickerCycle: boolean;
  millActions: boolean;
  tokenGeneration: boolean;
  cardDraw: boolean;
  ramp: boolean;
  sacrificeOutlet: boolean;
  topOfLibraryManipulation: boolean;
  interactionRemoval: boolean;
  protection: boolean;
  tutorSearch: boolean;
};

const MATCH_SCORE: Record<FunctionalMatchType, number> = {
  EXACT: 1,
  DIRECT_SUPPORT: 0.82,
  INDIRECT_SUPPORT: 0.58,
  ADJACENT: 0.35,
  NONE: 0,
};

export function matchTypeScore(matchType: FunctionalMatchType): number {
  return MATCH_SCORE[matchType];
}

function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractCardFunctionalCapabilities(oracleText: string, typeLine: string): CardFunctionalCapabilities {
  const text = norm(oracleText);
  const tl = norm(typeLine);
  const caps: CardFunctionalCapabilities = {
    zoneTransitions: [],
    counterActions: [],
    untapProvider: false,
    tapForManaOnly: false,
    castFromExileActions: [],
    blinkFlickerCycle: false,
    millActions: false,
    tokenGeneration: /\bcreate .* token/.test(text),
    cardDraw: /\bdraw (a|one|two|three|\d+) card/.test(text),
    ramp: /\badd \{/.test(text) || /search your library for .* land/.test(text),
    sacrificeOutlet: /\bsacrifice (a|another|target) /.test(text),
    topOfLibraryManipulation: /look at the top|scry|surveil|put .* on top of your library/.test(text),
    interactionRemoval:
      /destroy target (creature|permanent|artifact|enchantment)/.test(text) ||
      /exile target (creature|permanent)/.test(text) ||
      /deals .* damage to (any target|target)/.test(text),
    protection:
      /hexproof|indestructible|shroud|protection from|can't be (the targets of|targeted)/.test(text),
    tutorSearch:
      (/search your library for a card/.test(text) ||
        /search your library for an /.test(text) ||
        (/search your library for a /.test(text) && !/basic land/.test(text)) ||
        (/search your library for up to/.test(text) && !/basic land/.test(text))),
  };

  if (/\buntap target/.test(text) || /\buntap all/.test(text) || /\buntap each/.test(text)) {
    caps.untapProvider = true;
  }
  if (/\b\{t\}: add/.test(text) || /\btap: add/.test(text) || (/\btap\b/.test(text) && /\badd \{/.test(text) && !caps.untapProvider)) {
    caps.tapForManaOnly = true;
  }

  if (/counter target spell/.test(text)) {
    caps.counterActions.push({ action: "COUNTER_SPELL", kind: "OTHER", evidence: "counter target spell" });
  }
  if (/put .* \+1\/\+1 counter/.test(text) || /put a \+1\/\+1 counter/.test(text)) {
    caps.counterActions.push({ action: "PLACE_COUNTER", kind: "PLUS_ONE_PLUS_ONE", evidence: "+1/+1 counter placement" });
  }
  if (/proliferate/.test(text)) {
    caps.counterActions.push({ action: "MULTIPLY_COUNTER", kind: "OTHER", evidence: "proliferate" });
  }
  if (/remove .* counter/.test(text)) {
    caps.counterActions.push({ action: "REMOVE_COUNTER", kind: "OTHER", evidence: "remove counter" });
  }
  if (/loyalty counter/.test(text)) {
    caps.counterActions.push({ action: "PLACE_COUNTER", kind: "LOYALTY", evidence: "loyalty counter" });
  }
  if (/experience counter/.test(text)) {
    caps.counterActions.push({ action: "PLACE_COUNTER", kind: "EXPERIENCE", evidence: "experience counter" });
  }
  if (/charge counter/.test(text)) {
    caps.counterActions.push({ action: "PLACE_COUNTER", kind: "CHARGE", evidence: "charge counter" });
  }

  const pushTransition = (zt: ZoneTransition, evidence: string) => {
    caps.zoneTransitions.push({ ...zt, condition: zt.condition ?? evidence });
  };

  if (/return target creature card from your graveyard to the battlefield/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "creature", repeatability: "single" },
      "creature graveyard to battlefield",
    );
  } else if (/put target creature card from a graveyard onto the battlefield/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "creature", repeatability: "single" },
      "creature graveyard onto battlefield",
    );
  } else if (/return target creature card from your graveyard/.test(text) && /to your hand/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "hand", objectClass: "creature", repeatability: "single" },
      "creature graveyard to hand",
    );
  } else if (/return .* creature .* from your graveyard to the battlefield/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "creature", repeatability: "single" },
      "creature graveyard to battlefield (variant)",
    );
  } else if (/return enchanted creature card to the battlefield/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "creature", repeatability: "single" },
      "enchanted creature graveyard to battlefield",
    );
  }

  if (/return .* land card.* from your graveyard to the battlefield/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "land", repeatability: "single" },
      "land graveyard to battlefield",
    );
  }

  if (/put .* on top of your library/.test(text) && /from your graveyard/.test(text)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "library_top", objectClass: "card", repeatability: "single" },
      "graveyard to library top",
    );
  }

  if (/exile .* then return .* to the battlefield/.test(text) || /exile .* return it to the battlefield at/.test(text)) {
    caps.blinkFlickerCycle = true;
    pushTransition(
      { sourceZone: "battlefield", destinationZone: "exile", objectClass: "permanent", repeatability: "bounded" },
      "blink exile phase",
    );
    pushTransition(
      { sourceZone: "exile", destinationZone: "battlefield", objectClass: "permanent", repeatability: "bounded" },
      "blink return phase",
    );
  }

  if (/you may play .* from exile/.test(text) || /cast .* from exile/.test(text)) {
    caps.castFromExileActions.push("PLAY_FROM_EXILE_PERMISSION");
  }
  if (/exile .* you may cast/.test(text)) {
    caps.castFromExileActions.push("EXILE_CARD_FOR_LATER_USE");
  }
  if (/cast .* exiled card/.test(text)) {
    caps.castFromExileActions.push("CAST_EXILED_CARD");
  }

  if (/mill \d+|target player mills|put the top .* cards .* into .* graveyard/.test(text)) {
    caps.millActions = true;
  }

  if (/unearth/.test(text) && /creature/.test(tl)) {
    pushTransition(
      { sourceZone: "graveyard", destinationZone: "battlefield", objectClass: "creature", repeatability: "limited" },
      "unearth",
    );
  }

  return caps;
}

function wantsCounterSynergy(token: string): boolean {
  return token.includes("counter_synergy") || (token.includes("counter") && token.includes("synergy"));
}

function wantsCountermagic(token: string): boolean {
  return token.includes("countermagic") || token === "counter";
}

function wantsUntap(token: string): boolean {
  return token.includes("untap") || token.includes("required_input:untap");
}

function wantsCastFromExile(token: string): boolean {
  return token.includes("cast_from_exile") || token.includes("exile") && token.includes("cast");
}

function wantsBlink(token: string): boolean {
  return token.includes("blink") || token.includes("flicker");
}

function wantsRecursion(token: string): boolean {
  return token.includes("recursion") || token.includes("reanimation");
}

function wantsGraveyardSetup(token: string): boolean {
  return token.includes("graveyard_setup") || token.includes("graveyard") && token.includes("setup");
}

function wantsInteraction(token: string): boolean {
  return token.includes("interaction");
}

function wantsProtection(token: string): boolean {
  return token.includes("protection");
}

function wantsAccessTutor(token: string): boolean {
  return token.includes("access_tutor") || (token.includes("access") && !token.includes("interaction"));
}

function wantsWinComponent(token: string): boolean {
  return token.includes("win_component");
}

function wantsEngineEnabler(token: string): boolean {
  return token.includes("engine_enabler");
}

function wantsEnginePayoff(token: string): boolean {
  return token.includes("engine_payoff");
}

function wantsRecovery(token: string): boolean {
  return token.includes("recovery");
}

function wantsMill(token: string): boolean {
  return token.includes("mill");
}

function wantsTopOfLibrary(token: string): boolean {
  return token.includes("top_of_library") || token.includes("top of library");
}

export function evaluateFunctionalMatch(input: {
  requirementId: string;
  requirementToken: string;
  candidateOracleId: string;
  oracleText: string;
  typeLine: string;
}): FunctionalMatch {
  const token = input.requirementToken.toLowerCase();
  const caps = extractCardFunctionalCapabilities(input.oracleText, input.typeLine);
  const base: FunctionalMatch = {
    requirementId: input.requirementId,
    requirementToken: input.requirementToken,
    candidateOracleId: input.candidateOracleId,
    matchType: "NONE",
    mechanism: "no_evidence",
    conditionalRequirements: [],
    evidenceRefs: [],
  };

  if (wantsCountermagic(token)) {
    const hit = caps.counterActions.find((c) => c.action === "COUNTER_SPELL");
    if (hit) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "COUNTER_SPELL",
        counterAction: "COUNTER_SPELL",
        counterKind: hit.kind,
        action: "counter_spell",
        evidenceRefs: [hit.evidence],
      };
    }
    return base;
  }

  if (wantsCounterSynergy(token)) {
    const hit = caps.counterActions.find((c) => c.action !== "COUNTER_SPELL");
    if (hit) {
      return {
        ...base,
        matchType: hit.action === "PLACE_COUNTER" || hit.action === "MULTIPLY_COUNTER" ? "EXACT" : "DIRECT_SUPPORT",
        mechanism: "COUNTER_PLACEMENT_OR_MODIFICATION",
        counterAction: hit.action,
        counterKind: hit.kind,
        evidenceRefs: [hit.evidence],
      };
    }
    if (caps.counterActions.some((c) => c.action === "COUNTER_SPELL")) {
      return {
        ...base,
        matchType: "NONE",
        mechanism: "COUNTER_SPELL_NOT_COUNTER_SYNERGY",
        counterAction: "COUNTER_SPELL",
        evidenceRefs: ["counter target spell — not counter placement synergy"],
      };
    }
    return base;
  }

  if (wantsUntap(token)) {
    if (caps.untapProvider) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "UNTAP_PROVIDER",
        action: "untap",
        evidenceRefs: ["untap target/all/each"],
      };
    }
    if (caps.tapForManaOnly) {
      return {
        ...base,
        matchType: "NONE",
        mechanism: "TAP_FOR_MANA_NOT_UNTAP",
        action: "tap",
        evidenceRefs: ["tap for mana — not untap support"],
      };
    }
    return base;
  }

  if (wantsCastFromExile(token)) {
    if (caps.castFromExileActions.length) {
      return {
        ...base,
        matchType: caps.castFromExileActions.includes("PLAY_FROM_EXILE_PERMISSION") ? "EXACT" : "DIRECT_SUPPORT",
        mechanism: caps.castFromExileActions[0]!,
        action: "cast_from_exile",
        sourceZone: "exile",
        evidenceRefs: caps.castFromExileActions,
      };
    }
    if (caps.ramp || caps.tokenGeneration) {
      return {
        ...base,
        matchType: "NONE",
        mechanism: "GENERIC_ENABLER_NOT_CAST_FROM_EXILE",
        evidenceRefs: ["generic ramp/token — not exile cast permission"],
      };
    }
    return base;
  }

  if (wantsBlink(token)) {
    if (caps.blinkFlickerCycle) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "BLINK_FLICKER_CYCLE",
        sourceZone: "battlefield",
        destinationZone: "battlefield",
        objectClass: "permanent",
        evidenceRefs: ["exile then return to battlefield"],
      };
    }
    if (caps.zoneTransitions.some((z) => z.destinationZone === "exile" && !caps.blinkFlickerCycle)) {
      return {
        ...base,
        matchType: "ADJACENT",
        mechanism: "PARTIAL_EXILE_NOT_BLINK",
        evidenceRefs: ["exile without bounded return cycle"],
      };
    }
    return base;
  }

  if (wantsRecursion(token)) {
    const creatureBf = caps.zoneTransitions.find(
      (z) => z.objectClass === "creature" && z.sourceZone === "graveyard" && z.destinationZone === "battlefield",
    );
    if (creatureBf) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "CREATURE_GY_TO_BATTLEFIELD",
        sourceZone: "graveyard",
        destinationZone: "battlefield",
        objectClass: "creature",
        repeatability: creatureBf.repeatability,
        evidenceRefs: ["creature graveyard → battlefield"],
      };
    }
    const creatureHand = caps.zoneTransitions.find(
      (z) => z.objectClass === "creature" && z.sourceZone === "graveyard" && z.destinationZone === "hand",
    );
    if (creatureHand) {
      return {
        ...base,
        matchType: "DIRECT_SUPPORT",
        mechanism: "CREATURE_GY_TO_HAND",
        sourceZone: "graveyard",
        destinationZone: "hand",
        objectClass: "creature",
        evidenceRefs: ["creature graveyard → hand"],
      };
    }
    const landBf = caps.zoneTransitions.find(
      (z) => z.objectClass === "land" && z.sourceZone === "graveyard" && z.destinationZone === "battlefield",
    );
    if (landBf) {
      return {
        ...base,
        matchType: "ADJACENT",
        mechanism: "LAND_GY_TO_BATTLEFIELD",
        sourceZone: "graveyard",
        destinationZone: "battlefield",
        objectClass: "land",
        evidenceRefs: ["land graveyard → battlefield — not creature recursion"],
      };
    }
    const libTop = caps.zoneTransitions.find((z) => z.destinationZone === "library_top");
    if (libTop) {
      return {
        ...base,
        matchType: "ADJACENT",
        mechanism: "GY_TO_LIBRARY_TOP",
        sourceZone: "graveyard",
        destinationZone: "library_top",
        evidenceRefs: ["graveyard → library top — not battlefield recursion"],
      };
    }
    return base;
  }

  if (wantsGraveyardSetup(token)) {
    if (caps.millActions || caps.zoneTransitions.some((z) => z.sourceZone === "graveyard")) {
      return {
        ...base,
        matchType: caps.millActions ? "DIRECT_SUPPORT" : "INDIRECT_SUPPORT",
        mechanism: "GRAVEYARD_SETUP",
        sourceZone: "library",
        destinationZone: "graveyard",
        evidenceRefs: caps.millActions ? ["mill/self-mill"] : ["graveyard zone interaction"],
      };
    }
    return base;
  }

  if (wantsMill(token)) {
    if (caps.millActions) {
      return { ...base, matchType: "EXACT", mechanism: "MILL", evidenceRefs: ["mill action"] };
    }
    return base;
  }

  if (wantsTopOfLibrary(token)) {
    if (caps.topOfLibraryManipulation) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "TOP_OF_LIBRARY_MANIPULATION",
        destinationZone: "library_top",
        evidenceRefs: ["top-of-library manipulation"],
      };
    }
    return base;
  }

  if (token.includes("card_draw") || token.includes("draw")) {
    if (caps.cardDraw) {
      return { ...base, matchType: "EXACT", mechanism: "CARD_DRAW", evidenceRefs: ["draw cards"] };
    }
    return base;
  }

  if (token.includes("ramp") || token.includes("mana")) {
    if (caps.ramp) {
      return { ...base, matchType: "EXACT", mechanism: "MANA_RAMP", evidenceRefs: ["mana ramp"] };
    }
    return base;
  }

  if (token.includes("token")) {
    if (caps.tokenGeneration) {
      return { ...base, matchType: "EXACT", mechanism: "TOKEN_GENERATION", evidenceRefs: ["create token"] };
    }
    return base;
  }

  if (token.includes("sacrifice")) {
    if (caps.sacrificeOutlet) {
      return { ...base, matchType: "EXACT", mechanism: "SACRIFICE_OUTLET", evidenceRefs: ["sacrifice outlet"] };
    }
    return base;
  }

  if (wantsInteraction(token)) {
    if (caps.counterActions.some((c) => c.action === "COUNTER_SPELL")) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: "COUNTER_SPELL",
        counterAction: "COUNTER_SPELL",
        evidenceRefs: ["counter target spell"],
      };
    }
    if (caps.interactionRemoval) {
      return { ...base, matchType: "EXACT", mechanism: "INTERACTION_REMOVAL", evidenceRefs: ["destroy/exile/damage interaction"] };
    }
    if (caps.ramp || caps.tokenGeneration || caps.cardDraw) {
      return {
        ...base,
        matchType: "NONE",
        mechanism: "GENERIC_ENABLER_NOT_INTERACTION",
        evidenceRefs: ["generic engine — not interaction"],
      };
    }
    return base;
  }

  if (wantsProtection(token)) {
    if (caps.protection) {
      return { ...base, matchType: "EXACT", mechanism: "PROTECTION", evidenceRefs: ["hexproof/indestructible/shroud/protection"] };
    }
    return base;
  }

  if (wantsAccessTutor(token)) {
    if (caps.tutorSearch) {
      return { ...base, matchType: "EXACT", mechanism: "TUTOR_SEARCH", evidenceRefs: ["search library for card"] };
    }
    if (caps.ramp) {
      return { ...base, matchType: "NONE", mechanism: "RAMP_NOT_ACCESS", evidenceRefs: ["land search — not general access"] };
    }
    return base;
  }

  if (wantsWinComponent(token)) {
    if (/you win the game|each opponent loses|infinite combat damage|extra turn|take an extra turn/.test(norm(input.oracleText))) {
      return { ...base, matchType: "EXACT", mechanism: "WIN_LINE", evidenceRefs: ["verified win pattern text"] };
    }
    if (/flying|double strike|trample|menace/.test(norm(input.oracleText)) && /creature/.test(norm(input.typeLine))) {
      return { ...base, matchType: "DIRECT_SUPPORT", mechanism: "COMBAT_THREAT", evidenceRefs: ["combat threat creature"] };
    }
    return base;
  }

  if (wantsEngineEnabler(token) || wantsEnginePayoff(token)) {
    if (caps.tokenGeneration || caps.sacrificeOutlet || caps.millActions) {
      return {
        ...base,
        matchType: "EXACT",
        mechanism: wantsEnginePayoff(token) ? "ENGINE_PAYOFF" : "ENGINE_ENABLER",
        evidenceRefs: ["engine enabler/payoff pattern"],
      };
    }
    if (caps.cardDraw && wantsEngineEnabler(token)) {
      return { ...base, matchType: "DIRECT_SUPPORT", mechanism: "ENGINE_SUPPORT", evidenceRefs: ["draw as engine support"] };
    }
    return base;
  }

  if (wantsRecovery(token)) {
    const creatureBf = caps.zoneTransitions.find(
      (z) => z.objectClass === "creature" && z.sourceZone === "graveyard" && z.destinationZone === "battlefield",
    );
    if (creatureBf || caps.cardDraw) {
      return {
        ...base,
        matchType: creatureBf ? "EXACT" : "DIRECT_SUPPORT",
        mechanism: creatureBf ? "CREATURE_GY_TO_BATTLEFIELD" : "CARD_DRAW_RECOVERY",
        evidenceRefs: creatureBf ? ["graveyard recursion recovery"] : ["card draw recovery"],
      };
    }
    return base;
  }

  return base;
}

export function aggregateFunctionalRoleFit(matches: FunctionalMatch[]): number {
  if (!matches.length) return 0;
  return Math.max(...matches.map((m) => matchTypeScore(m.matchType)));
}

export function rankCandidatesForRequirement(
  candidates: Array<{ oracleId: string; functionalMatches: FunctionalMatch[] }>,
  requirementId: string,
): Map<string, number> {
  const scored = candidates
    .map((c) => {
      const match = c.functionalMatches.find((m) => m.requirementId === requirementId);
      const score = match ? matchTypeScore(match.matchType) : 0;
      return { oracleId: c.oracleId, score, matchType: match?.matchType ?? "NONE" };
    })
    .sort((a, b) => b.score - a.score || a.oracleId.localeCompare(b.oracleId));

  const ranks = new Map<string, number>();
  scored.forEach((s, idx) => ranks.set(s.oracleId, idx + 1));
  return ranks;
}
