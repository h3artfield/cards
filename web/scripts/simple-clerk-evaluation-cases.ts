/**
 * Golden evaluation suite for simple clerk — 100+ unique behaviorally meaningful cases.
 */

export type EvalPrimaryCategory =
  | "card_fact"
  | "commander_eligibility"
  | "inventory_availability"
  | "price_quantity"
  | "color_card_type_filter"
  | "terminology"
  | "rules_legality"
  | "commander_recommendation"
  | "mixed_knowledge_inventory"
  | "ambiguity_misspelling"
  | "unresolved_conflict";

export type AssertionTier = "critical" | "explanatory";

export type ColorFilterOperator =
  | "colorIdentityExact"
  | "colorIdentityContainsAny"
  | "colorIdentitySubsetOf";

export interface ColorFilterExpectation {
  operator: ColorFilterOperator;
  colors: string[];
}

export interface SimpleClerkEvalCase {
  id: string;
  primaryCategory: EvalPrimaryCategory;
  question: string;
  /** Safety-critical assertions — must pass 100%. */
  criticalMustInclude?: string[];
  criticalMustExclude?: string[];
  /** Quality assertions — threshold-based. */
  explanatoryMustInclude?: string[];
  /** Structured color filter validation — replaces prose color keywords for filter tests. */
  colorFilterExpectation?: ColorFilterExpectation;
  /** Rules answers graded by semantic proposition, not exact inflection. */
  rulesSemanticMustInclude?: string[];
  /** Pass when resolved identity matches after accent/normalization stripping. */
  accentNormalizedMatch?: string[];
  /** Empty inventory is acceptable when fixture may lack qualifying stock. */
  allowEmptyInventory?: boolean;
  /** Every recommendation must pass commander eligibility oracle check. */
  requireEligibleCommanderOnly?: boolean;
  /** Document why assertions changed from prior brittle wording checks. */
  assertionChangeNote?: string;
  /** @deprecated use criticalMustInclude */
  mustInclude?: string[];
  /** @deprecated use criticalMustExclude */
  mustExclude?: string[];
  requireOracleId?: boolean;
  requireRuleNumbers?: string[];
  expectedIntent?: string;
  regression?: string;
}

function c(
  id: string,
  primaryCategory: EvalPrimaryCategory,
  question: string,
  opts: Partial<SimpleClerkEvalCase> = {},
): SimpleClerkEvalCase {
  return {
    id,
    primaryCategory,
    question,
    criticalMustInclude: opts.criticalMustInclude ?? opts.mustInclude,
    criticalMustExclude: opts.criticalMustExclude ?? opts.mustExclude,
    explanatoryMustInclude: opts.explanatoryMustInclude,
    colorFilterExpectation: opts.colorFilterExpectation,
    rulesSemanticMustInclude: opts.rulesSemanticMustInclude,
    accentNormalizedMatch: opts.accentNormalizedMatch,
    allowEmptyInventory: opts.allowEmptyInventory,
    requireEligibleCommanderOnly: opts.requireEligibleCommanderOnly,
    assertionChangeNote: opts.assertionChangeNote,
    requireOracleId: opts.requireOracleId,
    requireRuleNumbers: opts.requireRuleNumbers,
    expectedIntent: opts.expectedIntent,
    regression: opts.regression,
  };
}

/** Raw cases before deduplication — includes intentional overlap for dedup reporting. */
export const SIMPLE_CLERK_EVAL_CASES_RAW: SimpleClerkEvalCase[] = [
  // ── Card facts (15) ──
  c("cf-01", "card_fact", "What type of card is Sol Ring?", { criticalMustInclude: ["artifact", "sol ring"], requireOracleId: true }),
  c("cf-02", "card_fact", "What colors is Prosper, Tome-Bound?", { criticalMustInclude: ["prosper", "red", "black"], requireOracleId: true }),
  c("cf-03", "card_fact", "Is Sol Ring legendary?", { criticalMustInclude: ["no", "sol ring"], requireOracleId: true }),
  c("cf-04", "card_fact", "What colors is Sol Ring?", { criticalMustInclude: ["colorless", "sol ring"], requireOracleId: true }),
  c("cf-05", "card_fact", "What type of card is Rhystic Study?", { criticalMustInclude: ["rhystic study"], requireOracleId: true }),
  c("cf-06", "card_fact", "What type of card is Cultivate?", { criticalMustInclude: ["cultivate"], requireOracleId: true }),
  c("cf-07", "card_fact", "What type of card is Command Tower?", { criticalMustInclude: ["command tower", "land"], requireOracleId: true }),
  c("cf-08", "card_fact", "What type of card is Arcane Signet?", { criticalMustInclude: ["arcane signet", "artifact"], requireOracleId: true }),
  c("cf-09", "card_fact", "What type of card is Krenko, Mob Boss?", { criticalMustInclude: ["krenko"], requireOracleId: true }),
  c("cf-10", "card_fact", "What type of card is Narset, Parter of Veils?", { criticalMustInclude: ["narset"], requireOracleId: true }),
  c("cf-11", "card_fact", "Is Lightning Bolt legendary?", { criticalMustInclude: ["no"], requireOracleId: true }),
  c("cf-12", "card_fact", "Is Rhystic Study legendary?", { criticalMustInclude: ["no", "rhystic study"], requireOracleId: true }),
  c("cf-13", "card_fact", "What type of card is Swords to Plowshares?", { criticalMustInclude: ["swords"], requireOracleId: true }),
  c("cf-14", "card_fact", "What colors is Thalia, Guardian of Thraben?", { criticalMustInclude: ["thalia", "white"], requireOracleId: true }),
  c("cf-15", "card_fact", "What type of card is Smothering Tithe?", { criticalMustInclude: ["smothering tithe"], requireOracleId: true }),

  // ── Commander eligibility (15) ──
  c("cmd-01", "commander_eligibility", "Is Lórien Revealed a commander?", {
    criticalMustInclude: ["no", "lórien revealed"],
    criticalMustExclude: ["yes —", "legal commander"],
    regression: "lorien_revealed_as_commander",
    requireOracleId: true,
  }),
  c("cmd-02", "commander_eligibility", "Is Embrace the Unknown a commander?", {
    criticalMustInclude: ["embrace the unknown"],
    criticalMustExclude: ["is a legal commander"],
    regression: "embrace_unknown_commander_confusion",
    requireOracleId: true,
  }),
  c("cmd-03", "commander_eligibility", "Can Embrace the Unknown be my commander?", {
    criticalMustInclude: ["embrace the unknown"],
    criticalMustExclude: ["is a legal commander"],
    regression: "embrace_unknown_commander_confusion",
    requireOracleId: true,
  }),
  c("cmd-04", "commander_eligibility", "Is Counterspell a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-05", "commander_eligibility", "Is Rhystic Study a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-06", "commander_eligibility", "Is Cultivate a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-07", "commander_eligibility", "Is Command Tower a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-08", "commander_eligibility", "Is Arcane Signet a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-09", "commander_eligibility", "Can Atraxa, Praetors' Voice be my commander?", {
    criticalMustInclude: ["yes", "atraxa"],
    criticalMustExclude: ["not eligible"],
    requireOracleId: true,
  }),
  c("cmd-10", "commander_eligibility", "Is Krenko, Mob Boss a commander?", {
    criticalMustInclude: ["yes", "krenko"],
    requireOracleId: true,
  }),
  c("cmd-11", "commander_eligibility", "Is Thalia, Guardian of Thraben a commander?", {
    criticalMustInclude: ["yes", "thalia"],
    requireOracleId: true,
  }),
  c("cmd-12", "commander_eligibility", "Is Swords to Plowshares a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-13", "commander_eligibility", "Is Lightning Bolt a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),
  c("cmd-14", "commander_eligibility", "Can Narset, Parter of Veils be my commander?", {
    criticalMustInclude: ["narset"],
    requireOracleId: true,
  }),
  c("cmd-15", "commander_eligibility", "Is Smothering Tithe a commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),

  // ── Inventory availability (15) ──
  c("inv-01", "inventory_availability", "Do you have Sol Ring?", { criticalMustInclude: ["sol ring"], expectedIntent: "inventory_lookup" }),
  c("inv-02", "inventory_availability", "Do you have Lightning Bolt in stock?", { criticalMustInclude: ["lightning bolt"] }),
  c("inv-03", "inventory_availability", "Do you have Command Tower?", { criticalMustInclude: ["command tower"] }),
  c("inv-04", "inventory_availability", "Do you have Arcane Signet?", { criticalMustInclude: ["arcane signet"] }),
  c("inv-05", "inventory_availability", "Do you have any Birds?", { criticalMustInclude: ["bird"] }),
  c("inv-06", "inventory_availability", "Do you have any Elves?", { criticalMustInclude: ["elf"] }),
  c("inv-07", "inventory_availability", "Do you have Rhystic Study?", { criticalMustInclude: ["rhystic study"] }),
  c("inv-08", "inventory_availability", "Do you have Cultivate?", { criticalMustInclude: ["cultivate"] }),
  c("inv-09", "inventory_availability", "Got any ramp spells?", { explanatoryMustInclude: ["ramp"] }),
  c("inv-10", "inventory_availability", "Do you have any counterspells?", { criticalMustInclude: ["counter"] }),
  c("inv-11", "inventory_availability", "Do you have any board wipes?", { explanatoryMustInclude: ["wipe"] }),
  c("inv-12", "inventory_availability", "Do you have any planeswalkers?", { explanatoryMustInclude: ["planeswalker"] }),
  c("inv-13", "inventory_availability", "Do you have any legendary creatures?", { criticalMustInclude: ["legendary"] }),
  c("inv-14", "inventory_availability", "Do you have Swords to Plowshares?", { criticalMustInclude: ["swords"] }),
  c("inv-15", "inventory_availability", "Do you have any Goblins?", { criticalMustInclude: ["goblin"] }),

  // ── Price and quantity (8) ──
  c("prc-01", "price_quantity", "How much is Sol Ring?", { criticalMustInclude: ["sol ring"] }),
  c("prc-02", "price_quantity", "How much is Arcane Signet?", { criticalMustInclude: ["arcane signet"] }),
  c("prc-03", "price_quantity", "How much is Command Tower?", { criticalMustInclude: ["command tower"] }),
  c("prc-04", "price_quantity", "What counterspells do you have under $5?", {
    allowEmptyInventory: true,
    explanatoryMustInclude: ["counter"],
    assertionChangeNote: "Empty inventory is valid when fixture lacks qualifying counterspells under $5.",
  }),
  c("prc-05", "price_quantity", "What removal do you have under $3?", { explanatoryMustInclude: ["removal"] }),
  c("prc-06", "price_quantity", "What ramp do you have under $5?", { explanatoryMustInclude: ["ramp"] }),
  c("prc-07", "price_quantity", "Do you have any artifacts under $2?", { explanatoryMustInclude: ["artifact"] }),
  c("prc-08", "price_quantity", "Cheapest mono-blue commander in stock?", {
    requireEligibleCommanderOnly: true,
    expectedIntent: "commander_recommendation",
    explanatoryMustInclude: ["commander"],
    assertionChangeNote: "Routes through getVerifiedCommanderCandidates; prose commander keyword is explanatory only.",
  }),

  // ── Color and card-type filters (10) ──
  c("flt-01", "color_card_type_filter", "Show me mono-blue cards", {
    colorFilterExpectation: { operator: "colorIdentityExact", colors: ["U"] },
    explanatoryMustInclude: ["blue"],
    regression: "mono_blue_vs_blue",
    assertionChangeNote: "Critical checks structured mono-blue filter, not prose echo.",
  }),
  c("flt-02", "color_card_type_filter", "Show me blue cards", {
    colorFilterExpectation: { operator: "colorIdentityContainsAny", colors: ["U"] },
    explanatoryMustInclude: ["blue"],
    regression: "mono_blue_vs_blue",
    assertionChangeNote: "Critical checks colorIdentityContainsAny U, not reply wording.",
  }),
  c("flt-03", "color_card_type_filter", "Show me mono-green cards", {
    colorFilterExpectation: { operator: "colorIdentityExact", colors: ["G"] },
    explanatoryMustInclude: ["green"],
  }),
  c("flt-04", "color_card_type_filter", "Show me red cards", {
    colorFilterExpectation: { operator: "colorIdentityContainsAny", colors: ["R"] },
    explanatoryMustInclude: ["red"],
  }),
  c("flt-05", "color_card_type_filter", "Show me mono-red cards", {
    colorFilterExpectation: { operator: "colorIdentityExact", colors: ["R"] },
    explanatoryMustInclude: ["red"],
  }),
  c("flt-06", "color_card_type_filter", "Show me green cards", {
    colorFilterExpectation: { operator: "colorIdentityContainsAny", colors: ["G"] },
    explanatoryMustInclude: ["green"],
  }),
  c("flt-07", "color_card_type_filter", "Show me legendary creatures", {
    allowEmptyInventory: true,
    explanatoryMustInclude: ["legendary"],
    assertionChangeNote: "Legendary creature filter may legitimately return empty stock.",
  }),
  c("flt-08", "color_card_type_filter", "mono-blue commanders in stock", {
    requireEligibleCommanderOnly: true,
    colorFilterExpectation: { operator: "colorIdentityExact", colors: ["U"] },
    expectedIntent: "commander_recommendation",
    explanatoryMustInclude: ["commander"],
    regression: "mono_blue_vs_blue",
  }),
  c("flt-09", "color_card_type_filter", "blue commanders in stock", {
    requireEligibleCommanderOnly: true,
    colorFilterExpectation: { operator: "colorIdentityContainsAny", colors: ["U"] },
    expectedIntent: "commander_recommendation",
    explanatoryMustInclude: ["commander"],
  }),
  c("flt-10", "color_card_type_filter", "mono-white commanders in stock", {
    requireEligibleCommanderOnly: true,
    colorFilterExpectation: { operator: "colorIdentityExact", colors: ["W"] },
    expectedIntent: "commander_recommendation",
    explanatoryMustInclude: ["commander"],
  }),

  // ── Terminology (8) ──
  c("term-01", "terminology", "What is blink?", { criticalMustInclude: ["blink"] }),
  c("term-02", "terminology", "What is flicker?", { criticalMustInclude: ["flicker"] }),
  c("term-03", "terminology", "What is an attack Harmonicon?", { criticalMustInclude: ["harmonicon"] }),
  c("term-04", "terminology", "What is an Elf tribal deck?", { criticalMustInclude: ["elf"] }),
  c("term-05", "terminology", "What is card advantage?", { criticalMustInclude: ["card advantage"] }),
  c("term-06", "terminology", "What is Voltron?", { criticalMustInclude: ["voltron"] }),
  c("term-07", "terminology", "What is a mana dork?", { criticalMustInclude: ["mana"] }),
  c("term-08", "terminology", "What is a board wipe?", { criticalMustInclude: ["wipe"] }),

  // ── Rules and legality (10) ──
  c("rul-01", "rules_legality", "Does ward stop a board wipe?", {
    criticalMustInclude: ["ward"],
    requireRuleNumbers: ["702.21"],
  }),
  c("rul-02", "rules_legality", "Does copying a spell count as casting it?", {
    criticalMustInclude: ["copy"],
    requireRuleNumbers: ["707.10"],
  }),
  c("rul-03", "rules_legality", "Can I cast this card from exile?", {
    criticalMustInclude: ["exile"],
    requireRuleNumbers: ["400.7"],
  }),
  c("rul-04", "rules_legality", "Can this card go in my commander's deck?", {
    criticalMustInclude: ["color identity"],
    requireRuleNumbers: ["903.4"],
  }),
  c("rul-05", "rules_legality", "What is priority?", { criticalMustInclude: ["priority"], requireRuleNumbers: ["117"] }),
  c("rul-06", "rules_legality", "What is the stack?", { criticalMustInclude: ["stack"], requireRuleNumbers: ["405"] }),
  c("rul-07", "rules_legality", "Does hexproof stop board wipes?", { criticalMustInclude: ["hexproof"], requireRuleNumbers: ["702.11"] }),
  c("rul-08", "rules_legality", "What are state-based actions?", { criticalMustInclude: ["state"], requireRuleNumbers: ["704"] }),
  c("rul-09", "rules_legality", "Can a sorcery be my commander?", {
    rulesSemanticMustInclude: ["no", "commander", "903"],
    requireRuleNumbers: ["903"],
    assertionChangeNote: "Semantic proposition graded; Sorceries vs sorcery capitalization is not critical.",
  }),
  c("rul-10", "rules_legality", "Can Counterspell be my commander?", {
    criticalMustInclude: ["no"],
    criticalMustExclude: ["legal commander"],
    requireOracleId: true,
  }),

  // ── Commander recommendations (10) ──
  c("rec-01", "commander_recommendation", "What are the best mono-blue commanders you have under $100?", {
    criticalMustInclude: ["commander"],
    criticalMustExclude: ["lórien revealed", "lorien revealed", "counterspell", "sorcery"],
    regression: "noncommander_in_mono_blue_rec",
  }),
  c("rec-02", "commander_recommendation", "Recommend an Elf commander in stock", { criticalMustInclude: ["commander"] }),
  c("rec-03", "commander_recommendation", "What are good Bird commanders?", {
    requireEligibleCommanderOnly: true,
    criticalMustInclude: ["bird"],
    explanatoryMustInclude: ["commander"],
    assertionChangeNote: "Theme relevance required; popularity alone must not override Bird theme.",
  }),
  c("rec-04", "commander_recommendation", "Best mono-blue commander under $10", {
    criticalMustInclude: ["commander"],
    criticalMustExclude: ["sorcery"],
    regression: "noncommander_in_mono_blue_rec",
  }),
  c("rec-05", "commander_recommendation", "What commander cares about casting spells from exile?", {
    requireEligibleCommanderOnly: true,
    expectedIntent: "commander_recommendation",
    explanatoryMustInclude: ["commander"],
    assertionChangeNote: "Must route to commander candidate pipeline, not generic inventory.",
  }),
  c("rec-06", "commander_recommendation", "Best mono-white commander under $20", { criticalMustInclude: ["commander"] }),
  c("rec-07", "commander_recommendation", "Recommend a Goblin commander in stock", { criticalMustInclude: ["commander", "goblin"] }),
  c("rec-08", "commander_recommendation", "What are good artifact commanders?", {
    requireEligibleCommanderOnly: true,
    criticalMustInclude: ["artifact"],
    explanatoryMustInclude: ["commander"],
  }),
  c("rec-09", "commander_recommendation", "Recommend a budget commander under $5", { criticalMustInclude: ["commander"] }),
  c("rec-10", "commander_recommendation", "Best mono-black commander under $30", { criticalMustInclude: ["commander"] }),

  // ── Mixed knowledge + inventory (10) ──
  c("mix-01", "mixed_knowledge_inventory", "What is blink, and do you have any blink cards?", { criticalMustInclude: ["blink"] }),
  c("mix-02", "mixed_knowledge_inventory", "What is a mana dork, and which ones are in stock?", { criticalMustInclude: ["mana"] }),
  c("mix-03", "mixed_knowledge_inventory", "Explain board wipes and show me some under $10", {
    criticalMustInclude: ["wipe"],
    assertionChangeNote: "Mixed path must include education; inventory may be empty.",
    allowEmptyInventory: true,
  }),
  c("mix-04", "mixed_knowledge_inventory", "What is blink, and which blink cards are in stock?", { criticalMustInclude: ["blink"] }),
  c("mix-05", "mixed_knowledge_inventory", "What is a mana dork, and do you have any under $5?", { criticalMustInclude: ["mana"] }),
  c("mix-06", "mixed_knowledge_inventory", "What commanders care about casting from exile, and which are in stock?", { criticalMustInclude: ["commander"] }),
  c("mix-07", "mixed_knowledge_inventory", "What is Voltron, and do you have any equipment?", {
    criticalMustInclude: ["voltron"],
    allowEmptyInventory: true,
  }),
  c("mix-08", "mixed_knowledge_inventory", "What is flicker, and do you have any flicker cards?", { criticalMustInclude: ["flicker"] }),
  c("mix-09", "mixed_knowledge_inventory", "What is ramp, and show me ramp cards under $5", {
    criticalMustInclude: ["ramp"],
    allowEmptyInventory: true,
  }),
  c("mix-10", "mixed_knowledge_inventory", "What is an Elf tribal deck, and do you have Elf commanders?", { criticalMustInclude: ["elf"] }),

  // ── Ambiguity and misspellings (8) ──
  c("amb-01", "ambiguity_misspelling", "Do you have Sol Rng?", {
    criticalMustInclude: ["sol ring"],
    assertionChangeNote: "Controlled misspelling resolution to canonical Sol Ring.",
  }),
  c("amb-02", "ambiguity_misspelling", "Is Atraxa a commander?", { criticalMustInclude: ["atraxa"] }),
  c("amb-03", "ambiguity_misspelling", "Do you have Lightng Bolt?", { criticalMustInclude: ["lightning bolt"] }),
  c("amb-04", "ambiguity_misspelling", "Is Lorien Revealed a commander?", {
    accentNormalizedMatch: ["lorien"],
    criticalMustExclude: ["legal commander", "yes —"],
    assertionChangeNote: "Accent omission in input is not a critical failure when oracle resolves to Lórien Revealed.",
  }),
  c("amb-09", "ambiguity_misspelling", "Do you have Ataxa, Praetors Voice?", { criticalMustInclude: ["atraxa"] }),
  c("amb-10", "ambiguity_misspelling", "Is Rhystic Stdy a commander?", { criticalMustInclude: ["rhystic"], criticalMustExclude: ["legal commander"] }),
  c("amb-11", "ambiguity_misspelling", "Do you have Comand Tower?", { criticalMustInclude: ["command tower"] }),
  c("amb-12", "ambiguity_misspelling", "What colors is Prospur, Tome-Bound?", { criticalMustInclude: ["prosper"] }),

  // ── Unresolved / conflict (6) ──
  c("unr-01", "unresolved_conflict", "Do you have Xxxyyzz Nonexistent Card?", { criticalMustExclude: ["yes. we currently have"] }),
  c("unr-02", "unresolved_conflict", "Is ZzzFakeCardName a commander?", { criticalMustExclude: ["legal commander"] }),
  c("unr-03", "unresolved_conflict", "What type of card is QqqInvalidCard?", { criticalMustExclude: ["is a legendary creature"] }),
  c("unr-04", "unresolved_conflict", "How much is Xxxyyzz Nonexistent Card?", { criticalMustExclude: ["$"] }),
  c("unr-05", "unresolved_conflict", "Recommend a QqqFakeTribe commander in stock", { criticalMustExclude: ["legal commander"] }),
  c("unr-06", "unresolved_conflict", "Do you have Smaug the Magnificent?", { explanatoryMustInclude: ["smaug"] }),
];

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

export interface EvalSuiteDedupReport {
  totalBeforeDedup: number;
  exactDuplicatesRemoved: Array<{ id: string; duplicateOf: string; question: string }>;
  nearDuplicatesConsolidated: Array<{ removedId: string; keptId: string; question: string }>;
  finalCount: number;
  finalCountByCategory: Record<EvalPrimaryCategory, number>;
  finalTestIds: string[];
}

export function buildEvalSuiteDedupReport(
  raw: SimpleClerkEvalCase[],
): EvalSuiteDedupReport {
  const exactDuplicatesRemoved: EvalSuiteDedupReport["exactDuplicatesRemoved"] = [];
  const nearDuplicatesConsolidated: EvalSuiteDedupReport["nearDuplicatesConsolidated"] = [];
  const seenExact = new Map<string, string>();
  const seenNear = new Map<string, string>();
  const final: SimpleClerkEvalCase[] = [];

  for (const testCase of raw) {
    const exactKey = normalizeQuestion(testCase.question);
    if (seenExact.has(exactKey)) {
      exactDuplicatesRemoved.push({
        id: testCase.id,
        duplicateOf: seenExact.get(exactKey)!,
        question: testCase.question,
      });
      continue;
    }

    const nearKey = exactKey.replace(/\b(the|a|an|my|any|some|in stock|under \$\d+)\b/g, "").trim();
    if (nearKey.length > 10 && seenNear.has(nearKey) && testCase.primaryCategory === final.find(f => f.id === seenNear.get(nearKey))?.primaryCategory) {
      nearDuplicatesConsolidated.push({
        removedId: testCase.id,
        keptId: seenNear.get(nearKey)!,
        question: testCase.question,
      });
      continue;
    }

    seenExact.set(exactKey, testCase.id);
    if (nearKey.length > 10) seenNear.set(nearKey, testCase.id);
    final.push(testCase);
  }

  const finalCountByCategory = {} as Record<EvalPrimaryCategory, number>;
  for (const testCase of final) {
    finalCountByCategory[testCase.primaryCategory] =
      (finalCountByCategory[testCase.primaryCategory] ?? 0) + 1;
  }

  return {
    totalBeforeDedup: raw.length,
    exactDuplicatesRemoved,
    nearDuplicatesConsolidated,
    finalCount: final.length,
    finalCountByCategory,
    finalTestIds: final.map((t) => t.id),
  };
}

const dedupReport = buildEvalSuiteDedupReport(SIMPLE_CLERK_EVAL_CASES_RAW);

function rebuildFinalCases(): SimpleClerkEvalCase[] {
  const exactDuplicatesRemoved = new Set(
    dedupReport.exactDuplicatesRemoved.map((d) => d.id),
  );
  const nearRemoved = new Set(
    dedupReport.nearDuplicatesConsolidated.map((d) => d.removedId),
  );
  return SIMPLE_CLERK_EVAL_CASES_RAW.filter(
    (t) => !exactDuplicatesRemoved.has(t.id) && !nearRemoved.has(t.id),
  );
}

export const SIMPLE_CLERK_EVAL_SUITE_REPORT = dedupReport;
export const SIMPLE_CLERK_EVAL_CASES = rebuildFinalCases();

export const SIMPLE_CLERK_REGRESSION_CASES = SIMPLE_CLERK_EVAL_CASES.filter(
  (c) => c.regression,
);

export const SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT = 85;

/** Records why assertions changed from brittle prose checks to structured grading. */
export const EVAL_ASSERTION_CHANGELOG: Array<{ id: string; note: string }> =
  SIMPLE_CLERK_EVAL_CASES.filter((c) => c.assertionChangeNote).map((c) => ({
    id: c.id,
    note: c.assertionChangeNote!,
  }));

export const CRITICAL_ASSERTION_CATEGORIES: EvalPrimaryCategory[] = [
  "card_fact",
  "commander_eligibility",
  "inventory_availability",
  "price_quantity",
  "color_card_type_filter",
  "rules_legality",
  "commander_recommendation",
  "unresolved_conflict",
];

/** @deprecated use SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT */
export const SIMPLE_CLERK_EVAL_PASS_THRESHOLD_PCT = SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT;
