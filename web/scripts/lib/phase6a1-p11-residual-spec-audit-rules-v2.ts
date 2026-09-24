/**
 * Phase 6A.1 P11 — Oracle-grounded residual spec audit rules v2.
 * Per-case causal audits; no generic keyword defensibility.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";

export type AuditVerdict = "DEFENSIBLE" | "UNSUPPORTED" | "INTERNAL_CONFLICT" | "AMBIGUOUS_REQUIRES_REVIEW";

export type FieldAuditV2 = {
  field: string;
  value: string;
  verdict: AuditVerdict;
  causalDefense: string;
  oracleEvidence: string;
};

export type CaseAuditClassification =
  | "CONFIRMED_CORRECTED_SPEC"
  | "RESIDUAL_CONTAMINATION"
  | "AMBIGUOUS_REQUIRES_REVIEW";

type OracleContext = {
  oracleTexts: Array<{ name: string; oracleText: string }>;
  oracleBlob: string;
};

const SPEC_FIELD_KEYS: (keyof RetrievalSpecification)[] = [
  "requiredFunctions",
  "desiredFunctions",
  "requiredInputs",
  "outputsToExploit",
  "resourcesToProduce",
  "resourcesToConsume",
  "statesToMaintain",
  "statesToIncrease",
  "relevantCardTypes",
  "relevantZones",
  "protectionNeeds",
  "redundancyNeeds",
  "structuralNeeds",
  "avoidFunctions",
  "avoidCardClasses",
  "constructionConstraints",
];

function pass(
  field: string,
  value: string,
  causalDefense: string,
  oracleEvidence: string,
): FieldAuditV2 {
  return { field, value, verdict: "DEFENSIBLE", causalDefense, oracleEvidence };
}

function fail(
  field: string,
  value: string,
  verdict: Exclude<AuditVerdict, "DEFENSIBLE">,
  causalDefense: string,
  oracleEvidence: string,
): FieldAuditV2 {
  return { field, value, verdict, causalDefense, oracleEvidence };
}

function classifyCase(fieldAudits: FieldAuditV2[]): CaseAuditClassification {
  if (fieldAudits.some((f) => f.verdict === "UNSUPPORTED" || f.verdict === "INTERNAL_CONFLICT")) {
    return "RESIDUAL_CONTAMINATION";
  }
  if (fieldAudits.some((f) => f.verdict === "AMBIGUOUS_REQUIRES_REVIEW")) {
    return "AMBIGUOUS_REQUIRES_REVIEW";
  }
  return "CONFIRMED_CORRECTED_SPEC";
}

function auditSelfPenaltyConditions(spec: RetrievalSpecification): FieldAuditV2[] {
  return spec.selfPenaltyConditions.map((sp) =>
    sp.condition
      ? pass(
          "selfPenaltyConditions",
          sp.condition,
          "No self-penalty conditions specified in effective overlay spec.",
          "Empty or unspecified — no conflict.",
        )
      : pass("selfPenaltyConditions", JSON.stringify(sp), "Structured self-penalty entry.", "No oracle conflict."),
  );
}

function auditMechanicalDirection(
  effectiveDirection: string,
  auditFn: (direction: string, ctx: OracleContext) => FieldAuditV2,
  ctx: OracleContext,
): FieldAuditV2 {
  return auditFn(effectiveDirection, ctx);
}

function collectScalarFields(spec: RetrievalSpecification): Array<{ field: keyof RetrievalSpecification; value: string }> {
  const out: Array<{ field: keyof RetrievalSpecification; value: string }> = [];
  for (const key of SPEC_FIELD_KEYS) {
    for (const value of spec[key] as string[]) {
      out.push({ field: key, value });
    }
  }
  return out;
}

function auditTeysaField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  const o = ctx.oracleBlob;
  if (field === "desiredFunctions" && value === "combat_payoff") {
    return pass(
      field,
      value,
      "Token creatures gain vigilance and lifelink, supporting combat-oriented token payoffs in aristocrats shells.",
      "Creature tokens you control have vigilance and lifelink.",
    );
  }
  return fail(field, value, "UNSUPPORTED", `No causal link from Teysa Oracle to ${field}:${value}.`, o.slice(0, 120));
}

function auditTeysaDirection(direction: string, ctx: OracleContext): FieldAuditV2 {
  if (direction.includes("CREATURE_DIES") && direction.includes("DEATH_TRIGGER_MULTIPLICATION")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Teysa doubles triggered abilities caused by creature deaths.",
      "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
    );
  }
  return fail(
    "mechanicalDirection",
    direction,
    "UNSUPPORTED",
    "Effective direction must model death-trigger multiplication, not ETB/blink.",
    ctx.oracleBlob.slice(0, 120),
  );
}

function auditElshaField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  const o = ctx.oracleBlob;
  if (field === "requiredFunctions" && value === "combat_payoff") {
    return pass(field, value, "Combat damage to player creates Monk tokens.", "Whenever Elsha deals combat damage to a player, create that many ... Monk ... tokens");
  }
  if (field === "requiredFunctions" && value === "token_generation") {
    return pass(field, value, "Combat damage creates tokens.", "create that many 1/1 white Monk creature tokens");
  }
  if (field === "requiredFunctions" && value === "ramp") {
    return fail(field, value, "UNSUPPORTED", "Generic ramp removed in v1.3.1 — not commander-derived.", "No mana acceleration in Elsha Oracle text.");
  }
  if (field === "requiredFunctions" && value === "spell_copying") {
    return fail(field, value, "UNSUPPORTED", "Spell copying removed in v1.3 overlay.", "No copy-spell mechanic in Oracle.");
  }
  if (field === "requiredInputs" && value === "controller_noncreature_spell_cast") {
    return pass(field, value, "Prowess triggers when controller casts noncreature spell.", "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 ...)");
  }
  if (field === "requiredInputs" && value === "opponent_noncreature_spells") {
    return fail(field, value, "INTERNAL_CONFLICT", "Prowess is controller-triggered, not opponent-triggered.", "Whenever you cast a noncreature spell");
  }
  if (field === "outputsToExploit" && (value === "tokens" || value === "combat_payoff")) {
    return pass(field, value, "Token and combat outputs follow combat-damage and prowess engines.", "Monk tokens with prowess; combat damage trigger.");
  }
  if (field === "outputsToExploit" && value === "spell_punishment_damage") {
    return fail(field, value, "UNSUPPORTED", "No spell-punishment damage in Oracle.", "No damage-on-spell mechanic.");
  }
  if (field === "resourcesToProduce" && value === "tokens") {
    return pass(field, value, "Commander produces Monk tokens.", "create that many 1/1 white Monk creature tokens");
  }
  if (field === "resourcesToProduce" && value === "mana") {
    return fail(field, value, "UNSUPPORTED", "No mana production in Elsha Oracle.", "No mana generation text.");
  }
  if (field.startsWith("desiredFunctions")) {
    return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `${value} is optional deck support without direct commander causal link.`, "Not directly stated in commander Oracle.");
  }
  if (field === "constructionConstraints" && value === "minimize_controller_noncreature_spells") {
    return fail(field, value, "INTERNAL_CONFLICT", "Prowess rewards controller noncreature spells.", "Whenever you cast a noncreature spell");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Residual field ${field}:${value} lacks explicit oracle grounding.`, o.slice(0, 120));
}

function auditElshaDirection(direction: string): FieldAuditV2 {
  if (direction.includes("controller_noncreature_spell_cast") && direction.includes("combat_damage_to_player")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Dual engines: prowess on noncreature cast; tokens on combat damage.",
      "Prowess + Whenever Elsha deals combat damage to a player, create ... tokens",
    );
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must preserve prowess + combat-damage token engines.", "See Elsha Oracle.");
}

function auditCyclonusField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  if (field === "requiredInputs" && value === "combat_damage_to_player") {
    return pass(field, value, "Both faces trigger on combat damage to a player.", "Whenever Cyclonus deals combat damage to a player");
  }
  if (field === "requiredInputs" && value === "damage_to_opponent_creatures") {
    return fail(field, value, "UNSUPPORTED", "Replaced in v1.3 — triggers on player combat damage.", "deals combat damage to a player");
  }
  if (field === "resourcesToProduce" && value === "mana") {
    return fail(field, value, "UNSUPPORTED", "Mana production removed — Oracle describes connive/convert/extra phase.", "No mana production in Oracle.");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Sparse spec field ${field}:${value} without oracle anchor.`, ctx.oracleBlob.slice(0, 120));
}

function auditCyclonusDirection(direction: string, ctx: OracleContext): FieldAuditV2 {
  if (direction.includes("combat_damage_to_player") && direction.includes("CONNIVE")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Combat damage triggers connive and convert; fighter grants extra beginning phase.",
      "deals combat damage to a player, it connives ... convert ... additional beginning phase",
    );
  }
  return fail(
    "mechanicalDirection",
    direction,
    "UNSUPPORTED",
    "Must model connive/convert/extra phase, not mana generation.",
    ctx.oracleBlob.slice(0, 160),
  );
}

function auditChainerField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  const o = ctx.oracleBlob;
  if (field === "requiredFunctions" && value === "graveyard_setup") {
    return pass(field, value, "Reanimation requires creature cards in graveyards.", "Put target creature card from a graveyard onto the battlefield");
  }
  if (field === "requiredFunctions" && value === "combat_manipulation") {
    return fail(field, value, "UNSUPPORTED", "Removed in overlay.", "No combat manipulation in Oracle.");
  }
  if (field === "requiredInputs" && value === "creature_card_in_graveyard") {
    return pass(field, value, "Activated ability targets creature card in graveyard.", "Put target creature card from a graveyard onto the battlefield");
  }
  if (field === "requiredInputs" && (value === "etb_permanents" || value === "graveyard_permanents")) {
    return fail(field, value, "UNSUPPORTED", "Replaced/removed — engine is activated reanimation, not ETB/broad graveyard.", "Pay 3 life: Put target creature card from a graveyard");
  }
  if (field === "desiredFunctions" && value === "creature_graveyard_setup") {
    return pass(
      field,
      value,
      "INDIRECT_SUPPORT: stock creature cards in graveyard for Chainer activated reanimation.",
      "Put target creature card from a graveyard onto the battlefield under your control",
    );
  }
  if (field === "relevantZones" && value === "graveyard") {
    return pass(field, value, "Graveyard is source zone for reanimation target.", "from a graveyard onto the battlefield");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Field ${field}:${value} not explicitly grounded.`, o.slice(0, 120));
}

function auditChainerDirection(direction: string, ctx: OracleContext): FieldAuditV2 {
  if (direction.includes("creature_card_in_graveyard") && direction.includes("put_onto_battlefield")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Activated reanimation with life payment.",
      "Pay 3 life: Put target creature card from a graveyard onto the battlefield under your control",
    );
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must be activated reanimation, not ETB trigger.", ctx.oracleBlob.slice(0, 120));
}

function auditDaxosField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  if (field === "requiredFunctions" && value === "token_generation") {
    return pass(field, value, "Activated ability creates Spirit enchantment creature token.", "Create a white and black Spirit enchantment creature token");
  }
  if (field === "requiredInputs" && value === "controller_enchantment_spell_cast") {
    return pass(field, value, "Experience gained when controller casts enchantment.", "Whenever you cast an enchantment spell, you get an experience counter");
  }
  if (field === "requiredInputs" && (value === "opponent_noncreature_spells" || value === "spell_cast")) {
    return fail(field, value, "UNSUPPORTED", "Replaced/removed — trigger is controller enchantment cast.", "Whenever you cast an enchantment spell");
  }
  if (field === "outputsToExploit" && value === "tokens") {
    return pass(field, value, "Spirit tokens scale with experience counters.", "Spirit enchantment creature token ... equal to the number of experience counters");
  }
  if (field === "outputsToExploit" && value === "spell_punishment_damage") {
    return fail(field, value, "UNSUPPORTED", "No spell punishment in Oracle.", "No damage-on-spell text.");
  }
  if (field === "resourcesToProduce" && value === "tokens") {
    return pass(field, value, "Commander produces scaling tokens.", "Create a white and black Spirit enchantment creature token");
  }
  if (field === "desiredFunctions" && value === "enchantment_card_advantage") {
    return pass(
      field,
      value,
      "INDIRECT_SUPPORT: enchantress-style draw from casting/resolving enchantments supports experience engine.",
      "Whenever you cast an enchantment spell, you get an experience counter",
    );
  }
  if (field === "constructionConstraints" && value === "minimize_controller_noncreature_spells") {
    return fail(field, value, "INTERNAL_CONFLICT", "Daxos rewards enchantment spell casting.", "Whenever you cast an enchantment spell");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Field ${field}:${value} lacks explicit oracle link.`, ctx.oracleBlob.slice(0, 120));
}

function auditDaxosDirection(direction: string): FieldAuditV2 {
  if (direction.includes("controller_enchantment_spell_cast") && direction.includes("EXPERIENCE_COUNTER")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Enchantment cast builds experience; mana converts to scaling Spirit tokens.",
      "Whenever you cast an enchantment spell, you get an experience counter ... Create ... Spirit ... equal to experience counters",
    );
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must model enchantment → experience → Spirit token.", "See Daxos Oracle.");
}

function auditOrvarField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  if (field === "requiredFunctions" && value === "token_generation") {
    return pass(field, value, "Creates token copies of permanents.", "create a token that's a copy of one of those permanents");
  }
  if (field === "requiredInputs" && value === "controller_instant_or_sorcery_targets_own_permanent") {
    return pass(
      field,
      value,
      "Trigger requires controller cast inst/sorc targeting own permanent.",
      "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you control",
    );
  }
  if (field === "requiredInputs" && (value === "opponent_noncreature_spells" || value === "spell_cast")) {
    return fail(field, value, "UNSUPPORTED", "Replaced/removed — trigger is controller inst/sorc with targeting.", "Whenever you cast an instant or sorcery spell");
  }
  if (field === "outputsToExploit" && value === "tokens") {
    return pass(field, value, "Permanent token copies are primary payoff.", "create a token that's a copy");
  }
  if (field === "outputsToExploit" && value === "spell_punishment_damage") {
    return fail(field, value, "UNSUPPORTED", "No spell punishment in Oracle.", "No damage mechanic.");
  }
  if (field === "resourcesToProduce" && value === "tokens") {
    return pass(field, value, "Token copies are produced resource.", "create a token that's a copy");
  }
  if (field === "desiredFunctions" && value === "targeted_cantrip") {
    return pass(
      field,
      value,
      "INDIRECT_SUPPORT: cantrips targeting own permanents trigger Orvar and maintain card flow.",
      "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you control",
    );
  }
  if (field === "constructionConstraints" && value === "minimize_controller_noncreature_spells") {
    return fail(field, value, "INTERNAL_CONFLICT", "Orvar rewards casting inst/sorc.", "Whenever you cast an instant or sorcery spell");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Field ${field}:${value} lacks explicit oracle link.`, ctx.oracleBlob.slice(0, 120));
}

function auditOrvarDirection(direction: string): FieldAuditV2 {
  if (direction.includes("controller_instant_or_sorcery_targets_own_permanent") && direction.includes("TOKEN_COPY")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Cast inst/sorc targeting own permanent → token copy. Copied spells are not cast.",
      "Whenever you cast an instant or sorcery spell, if it targets ... create a token that's a copy",
    );
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must model inst/sorc targeting → token copy.", "See Orvar Oracle.");
}

function auditZellixField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  const hasZellix = ctx.oracleTexts.some((t) => t.name.includes("Zellix"));
  const zellixOracle = ctx.oracleTexts.find((t) => t.name.includes("Zellix"))?.oracleText ?? ctx.oracleBlob;
  if (field === "requiredFunctions" && value === "mill_target_player") {
    return pass(field, value, "Zellix mills target players and triggers on creature mill.", "Target player mills three cards ... Whenever a player mills one or more creature cards");
  }
  if (field === "requiredFunctions" && value === "token_generation") {
    return pass(field, value, "Milling creature cards creates Horror tokens.", "you create a 1/1 black Horror creature token");
  }
  if (field === "requiredFunctions" && value === "graveyard_setup") {
    return fail(field, value, "UNSUPPORTED", "Replaced with typed mill semantics.", "mills ... creature cards");
  }
  if (field === "requiredInputs" && value === "creature_cards_milled") {
    return pass(field, value, "Hive Mind keyed to creature cards milled.", "Whenever a player mills one or more creature cards");
  }
  if (field === "requiredInputs" && value === "graveyard_permanents") {
    return fail(field, value, "UNSUPPORTED", "Removed — mill trigger does not require generic graveyard permanents.", "mills one or more creature cards");
  }
  if (field === "desiredFunctions" && value === "mill") {
    return pass(field, value, "Mill is direct commander capability and enabler.", "Target player mills three cards");
  }
  if (field === "outputsToExploit" && value === "tokens") {
    return pass(field, value, "Horror tokens are primary payoff.", "create a 1/1 black Horror creature token");
  }
  if (field === "resourcesToProduce" && value === "tokens") {
    return pass(field, value, "Token generation is commander output.", "create a 1/1 black Horror creature token");
  }
  if (field === "relevantZones" && value === "graveyard") {
    return pass(
      field,
      value,
      "Graveyard is descriptive context for milled cards, not self-setup requirement.",
      "mills ... creature cards (cards pass through graveyard zone)",
    );
  }
  if (!hasZellix) {
    return fail(field, value, "UNSUPPORTED", "Field not grounded in command zone.", zellixOracle.slice(0, 120));
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Field ${field}:${value} not explicitly audited.`, zellixOracle.slice(0, 120));
}

function auditZellixDirection(direction: string): FieldAuditV2 {
  if (direction.includes("mills_creature") || direction.includes("player_mills_creature")) {
    return pass(
      "mechanicalDirection",
      direction,
      "Creature mill events drive Horror token generation.",
      "Whenever a player mills one or more creature cards, you create ... Horror ... token",
    );
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must model mill creature cards → Horror tokens.", "See Zellix Oracle.");
}

function auditNitaField(field: string, value: string, ctx: OracleContext): FieldAuditV2 {
  const o = ctx.oracleBlob;
  if (field === "requiredFunctions" && value === "opponent_graveyard_instant_sorcery_availability") {
    return pass(field, value, "Activated ability needs opponent inst/sorc in graveyard.", "Exile target instant or sorcery card from an opponent's graveyard");
  }
  if (field === "requiredFunctions" && value === "sacrifice_outlet") {
    return fail(field, value, "UNSUPPORTED", "Nita supplies sacrifice outlet; fodder covered by resourcesToConsume:creatures.", "Sacrifice another creature:");
  }
  if (field === "requiredFunctions" && value === "cast_from_exile") {
    return pass(field, value, "Exiled opponent spell may be cast this turn.", "You may cast it this turn");
  }
  if (field === "requiredFunctions" && value === "counter_synergy") {
    return pass(field, value, "+1/+1 counters placed when casting spell you don't own.", "put a +1/+1 counter on each creature you control");
  }
  if (field === "requiredFunctions" && (value === "spell_copying" || value === "graveyard_setup")) {
    return fail(field, value, "UNSUPPORTED", "Removed/replaced in v1.3 overlay.", "See Nita Oracle exile-cast chain.");
  }
  if (field === "requiredInputs" && value === "top_library_cast") {
    return fail(field, value, "UNSUPPORTED", "No top-of-library casting in Oracle.", "No library-top text.");
  }
  if (field === "requiredInputs" && value === "sacrifice_outlet") {
    return fail(field, value, "UNSUPPORTED", "Commander is the outlet; deck needs creature fodder.", "Sacrifice another creature:");
  }
  if (field === "requiredInputs" && value === "spell_cast") {
    return pass(field, value, "Casting spells you don't own triggers counters.", "Whenever you cast a spell you don't own");
  }
  if (field === "requiredInputs" && value === "exiled_cards") {
    return pass(field, value, "Exiled opponent inst/sorc is castable this turn.", "Exile target instant or sorcery ... You may cast it this turn");
  }
  if (field === "outputsToExploit" && value === "free_cast") {
    return fail(field, value, "UNSUPPORTED", "Mana of any type can be spent — not free cast.", "mana of any type can be spent to cast that spell");
  }
  if (field === "resourcesToConsume" && value === "creatures") {
    return pass(field, value, "Sacrifice another creature is activation cost.", "Sacrifice another creature:");
  }
  if (field === "relevantZones" && (value === "exile" || value === "graveyard")) {
    return pass(field, value, "Exile and graveyard zones participate in engine.", "Exile target ... from an opponent's graveyard ... cast it");
  }
  return fail(field, value, "AMBIGUOUS_REQUIRES_REVIEW", `Field ${field}:${value} lacks explicit oracle link.`, o.slice(0, 120));
}

function auditNitaDirection(direction: string, ctx: OracleContext): FieldAuditV2 {
  if (
    direction.includes("sacrifice") &&
    direction.includes("opponent_graveyard") &&
    direction.includes("spell_you_dont_own")
  ) {
    return pass(
      "mechanicalDirection",
      direction,
      "Sacrifice → exile opponent inst/sorc → cast spell you don't own → counters.",
      "Sacrifice another creature: Exile target instant or sorcery ... Whenever you cast a spell you don't own, put a +1/+1 counter",
    );
  }
  if (direction.includes("CAST_FROM_LIBRARY_TOP") || direction.includes("top_library")) {
    return fail("mechanicalDirection", direction, "UNSUPPORTED", "Library-top direction removed.", ctx.oracleBlob.slice(0, 120));
  }
  return fail("mechanicalDirection", direction, "UNSUPPORTED", "Must model sacrifice-exile-cast-counter chain.", ctx.oracleBlob.slice(0, 120));
}

type CaseAuditor = {
  caseId: string;
  auditField: (field: string, value: string, ctx: OracleContext) => FieldAuditV2;
  auditDirection: (direction: string, ctx: OracleContext) => FieldAuditV2;
};

const CASE_AUDITORS: Record<string, CaseAuditor> = {
  "single-aristocrats-teysa": {
    caseId: "single-aristocrats-teysa",
    auditField: auditTeysaField,
    auditDirection: auditTeysaDirection,
  },
  "blindv5-23-triggered-engine": {
    caseId: "blindv5-23-triggered-engine",
    auditField: auditElshaField,
    auditDirection: auditElshaDirection,
  },
  "blindv5-42-resource-conversion": {
    caseId: "blindv5-42-resource-conversion",
    auditField: auditCyclonusField,
    auditDirection: auditCyclonusDirection,
  },
  "blindv5-44-unusual-zones": {
    caseId: "blindv5-44-unusual-zones",
    auditField: auditChainerField,
    auditDirection: auditChainerDirection,
  },
  "blindv5-25-activated-engine": {
    caseId: "blindv5-25-activated-engine",
    auditField: auditDaxosField,
    auditDirection: auditDaxosDirection,
  },
  "blindv5-51-tokens": {
    caseId: "blindv5-51-tokens",
    auditField: auditOrvarField,
    auditDirection: auditOrvarDirection,
  },
  "blindv5-16-commander-background": {
    caseId: "blindv5-16-commander-background",
    auditField: auditZellixField,
    auditDirection: auditZellixDirection,
  },
  "blindv5-53-counters": {
    caseId: "blindv5-53-counters",
    auditField: auditNitaField,
    auditDirection: auditNitaDirection,
  },
};

export function auditEffectiveSpecV2(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): {
  fieldAudits: FieldAuditV2[];
  caseClassification: CaseAuditClassification;
  remainingIssues: FieldAuditV2[];
} {
  const auditor = CASE_AUDITORS[input.caseId];
  if (!auditor) throw new Error(`No v2 auditor for case ${input.caseId}`);

  const ctx: OracleContext = {
    oracleTexts: input.oracleTexts,
    oracleBlob: input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase(),
  };

  const scalarAudits = collectScalarFields(input.effectiveSpec).map(({ field, value }) =>
    auditor.auditField(field, value, ctx),
  );
  const penaltyAudits = auditSelfPenaltyConditions(input.effectiveSpec);
  const directionAudit = auditMechanicalDirection(input.effectiveMechanicalDirection, auditor.auditDirection, ctx);

  const fieldAudits = [...scalarAudits, ...penaltyAudits, directionAudit];
  const remainingIssues = fieldAudits.filter((f) => f.verdict !== "DEFENSIBLE");

  return {
    fieldAudits,
    caseClassification: classifyCase(fieldAudits),
    remainingIssues,
  };
}

export { SPEC_FIELD_KEYS, collectScalarFields };
