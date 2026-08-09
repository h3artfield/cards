/**
 * Parser-blind semantic-role adjudication for granted benchmark targets.
 * Distinct from target grounding (span existence).
 */
import type {
  MachineGroundedBenchmarkTarget,
  SemanticAdjudicationGold,
  TextSpan,
  GrantedAbilityType,
} from "./benchmark-identity";
import { assertSpanInOracle, spanFromRange } from "./benchmark-identity";
import type { GrammarFamily } from "./granted-grammar-family-query";

export type SemanticAdjudicationStatus = "valid" | "invalid_recipient_boundary" | "invalid_verb_role" | "invalid_complement_role" | "layer2_inconsistent";

export type SemanticAdjudicationRow = {
  regionKey: string;
  status: SemanticAdjudicationStatus;
  failureReasons: SemanticAdjudicationStatus[];
  semanticAdjudication?: SemanticAdjudicationGold;
};

export class BenchmarkSemanticAdjudicationError extends Error {
  constructor(message: string, readonly rows: SemanticAdjudicationRow[]) {
    super(message);
    this.name = "BenchmarkSemanticAdjudicationError";
  }
}

const RECIPIENT_PATTERNS: Record<GrammarFamily, RegExp> = {
  equipment_has: /^Equipped creature$/i,
  enchanted_has: /^Enchanted creature$/i,
  creatures_gain: /^Creatures you control$/i,
  creatures_have: /^Creatures you control$/i,
  target_gains: /^Target (?:creature|permanent|player|spell|artifact|enchantment|planeswalker)$/i,
  token_has: /^(?:Each token you control|This token|tokens you control)$/i,
};

const STATIC_KEYWORD_RE =
  /^(?:")?(?:flying|first strike|double strike|trample|lifelink|deathtouch|hexproof|indestructible|haste|reach|vigilance|menace|shroud|protection from [^,"]+|control of target permanent you control(?:")?)(?: until end of turn)?(?:")?$/i;

function parseDuration(complement: string): "continuous" | "until_end_of_turn" | null {
  if (/until end of turn/i.test(complement)) return "until_end_of_turn";
  return "continuous";
}

function extractLayer2FromComplement(
  oracleText: string,
  complement: string,
  complementSpan: TextSpan,
): { abilityTypes: GrantedAbilityType[]; layer2Gold: SemanticAdjudicationGold["layer2Gold"]; costRegion?: TextSpan; triggerRegion?: TextSpan } {
  const layer2Gold: SemanticAdjudicationGold["layer2Gold"] = [];
  const abilityTypes: GrantedAbilityType[] = [];

  const inner = complement.replace(/^["\u201c]|["\u201d]$/g, "").trim();

  if (/^(When|Whenever)\b/i.test(inner)) {
    abilityTypes.push("triggered");
    const triggerEnd = inner.search(/,\s/);
    const triggerText = triggerEnd > 0 ? inner.slice(0, triggerEnd) : inner.split(".")[0] ?? inner;
    const triggerRegion = spanFromRange(
      oracleText,
      complementSpan.start,
      complementSpan.start + triggerText.length,
    );
    const effectNeedle = inner.slice(triggerText.length + 1).trim();
    if (/you gain \d+ life/i.test(effectNeedle)) {
      layer2Gold.push({ actionType: "gain_life", evidenceContains: effectNeedle.match(/you gain \d+ life/i)![0] });
    }
    if (/draw a card/i.test(effectNeedle)) {
      layer2Gold.push({ actionType: "draw", evidenceContains: "draw a card" });
    }
    if (/Add \{/i.test(effectNeedle)) {
      layer2Gold.push({ actionType: "add_mana", evidenceContains: effectNeedle.match(/Add \{[^}]+\}/i)![0] });
    }
    return { abilityTypes, layer2Gold, triggerRegion };
  }

  if (/\{[^}]+\}[^:]*:|:\s/.test(inner) && !/^This creature has\b/i.test(inner)) {
    abilityTypes.push("activated");
    const colonIdx = inner.indexOf(":");
    const costText = inner.slice(0, colonIdx).trim();
    const effectText = inner.slice(colonIdx + 1).trim();
    const costStart = complementSpan.start + (complement.startsWith('"') || complement.startsWith("\u201c") ? 1 : 0);
    const costRegion = spanFromRange(oracleText, costStart, costStart + costText.length);
    if (/you gain \d+ life/i.test(effectText)) {
      layer2Gold.push({ actionType: "gain_life", evidenceContains: effectText.match(/you gain \d+ life/i)![0] });
    }
    if (/Add \{/i.test(effectText)) {
      layer2Gold.push({ actionType: "add_mana", evidenceContains: effectText.match(/Add \{[^}]+\}/i)![0] });
    }
    if (/Sacrifice this (?:token|creature|artifact)/i.test(effectText)) {
      layer2Gold.push({ actionType: "sacrifice", evidenceContains: effectText.match(/Sacrifice this \w+/i)![0] });
    }
    return { abilityTypes, layer2Gold, costRegion };
  }

  if (/^This creature has\b/i.test(inner) || /^This token can't\b/i.test(inner)) {
    abilityTypes.push("static_ability");
    return { abilityTypes, layer2Gold };
  }

  abilityTypes.push("static_keyword");
  return { abilityTypes, layer2Gold };
}

export function buildSemanticAdjudication(
  target: MachineGroundedBenchmarkTarget,
  oracleText: string,
): SemanticAdjudicationGold {
  const family = target.grammarFamily as GrammarFamily | undefined;
  const recipient = target.recipientSpan?.text.trim() ?? "";
  const verb = target.grantingVerbSpan?.text.trim() ?? "";
  const complement = target.grantedComplementSpan?.text.trim() ?? "";
  const duration = parseDuration(complement);

  const { abilityTypes, layer2Gold, costRegion, triggerRegion } = target.grantedComplementSpan
    ? extractLayer2FromComplement(oracleText, complement, target.grantedComplementSpan)
    : { abilityTypes: ["static_keyword"] as GrantedAbilityType[], layer2Gold: [] };

  const certifiedEmptyLayer2 = layer2Gold.length === 0 && !abilityTypes.includes("activated") && !abilityTypes.includes("triggered");

  return {
    context: target.expectedContext,
    recipient,
    grantingVerb: verb,
    grantedComplement: complement,
    grammarFamily: family,
    grantedAbilityTypes: abilityTypes,
    duration,
    semanticOwner: target.expectedContext === "genuine_granted" ? "granted_object" : "source_card",
    layer1Structure: {
      abilityType: abilityTypes[0] ?? "static_keyword",
      grantingConstruction: family ?? "unknown",
      costRegion,
      triggerRegion,
    },
    layer2Gold,
    certifiedEmptyLayer2,
  };
}

export function validateSemanticRoles(
  target: MachineGroundedBenchmarkTarget,
  oracleText: string,
): SemanticAdjudicationRow {
  const failures: SemanticAdjudicationStatus[] = [];
  const family = target.grammarFamily as GrammarFamily | undefined;
  const regionKey = target.fullRegionSpan?.text.slice(0, 40) ?? "unknown";

  if (target.expectedContext === "genuine_granted") {
    if (!target.recipientSpan || !target.grantingVerbSpan || !target.grantedComplementSpan) {
      failures.push("invalid_recipient_boundary");
    } else {
      if (family && RECIPIENT_PATTERNS[family] && !RECIPIENT_PATTERNS[family].test(target.recipientSpan.text.trim())) {
        failures.push("invalid_recipient_boundary");
      }
      if (/\bgets\b|\bgain\b|\bhave\b|\bgains\b/i.test(target.recipientSpan.text) && !target.nonGrantPredicateSpan) {
        failures.push("invalid_recipient_boundary");
      }
      if (target.nonGrantPredicateSpan) {
        if (!/^gets\s+/i.test(target.nonGrantPredicateSpan.text.trim())) {
          failures.push("invalid_complement_role");
        }
        if (target.recipientSpan.text.includes("gets")) {
          failures.push("invalid_recipient_boundary");
        }
      }
      const verb = target.grantingVerbSpan.text.trim().toLowerCase();
      if (!["has", "have", "gain", "gains"].includes(verb)) {
        failures.push("invalid_verb_role");
      }
      if (family === "equipment_has" || family === "enchanted_has") {
        if (verb !== "has") failures.push("invalid_verb_role");
      }
      if (family === "creatures_have" || family === "token_has") {
        if (verb !== "have") failures.push("invalid_verb_role");
      }
      if (family === "creatures_gain" || family === "target_gains") {
        if (verb !== "gain" && verb !== "gains") failures.push("invalid_verb_role");
      }
    }

    for (const span of [target.recipientSpan, target.nonGrantPredicateSpan, target.grantingVerbSpan, target.grantedComplementSpan, target.fullRegionSpan]) {
      if (span && !assertSpanInOracle(oracleText, span)) failures.push("invalid_complement_role");
    }
  }

  const semanticAdjudication = buildSemanticAdjudication(target, oracleText);
  if (semanticAdjudication.certifiedEmptyLayer2 && semanticAdjudication.layer2Gold.length > 0) {
    failures.push("layer2_inconsistent");
  }
  if (!semanticAdjudication.certifiedEmptyLayer2 && semanticAdjudication.layer2Gold.length === 0 && semanticAdjudication.grantedAbilityTypes.some((t) => t === "activated" || t === "triggered")) {
    failures.push("layer2_inconsistent");
  }

  return {
    regionKey,
    status: failures.length ? failures[0]! : "valid",
    failureReasons: [...new Set(failures)],
    semanticAdjudication,
  };
}

export function assertBenchmarkSemanticAdjudication(
  target: MachineGroundedBenchmarkTarget,
  oracleText: string,
  caseId: string,
): SemanticAdjudicationRow {
  const row = validateSemanticRoles(target, oracleText);
  if (row.status !== "valid") {
    throw new BenchmarkSemanticAdjudicationError(
      `Semantic adjudication failed for ${caseId} region "${row.regionKey}": ${row.failureReasons.join(", ")}`,
      [row],
    );
  }
  return row;
}

export function assertAllBenchmarkSemanticAdjudications(
  cases: Array<{ id: string; oracleText: string; benchmarkTargets?: MachineGroundedBenchmarkTarget[] }>,
  label: string,
): SemanticAdjudicationRow[] {
  const rows: SemanticAdjudicationRow[] = [];
  for (const c of cases) {
    for (const t of c.benchmarkTargets ?? []) {
      if (t.expectedContext === "genuine_granted") {
        rows.push(validateSemanticRoles(t, c.oracleText));
      }
    }
  }
  const invalid = rows.filter((r) => r.status !== "valid");
  if (invalid.length > 0) {
    throw new BenchmarkSemanticAdjudicationError(
      `${label}: ${invalid.length}/${rows.length} semantic adjudication failure(s)`,
      invalid,
    );
  }
  return rows;
}

/** Frozen expected context-control disposition — detector vs router vs semantic. */
export const CONTEXT_CONTROL_ROUTING_GOLD: Record<
  string,
  {
    expectedContext: MachineGroundedBenchmarkTarget["expectedContext"];
    expectedSemanticOwner: "source_card" | "created_object" | "granted_object";
    expectedGrantedRegionCount: number;
    cardNativeLayer2Eligible: boolean;
    /** Router class when a candidate exists and reaches routing. */
    routerContext: "granted_rules" | "token_definition" | "reminder_only" | "card_native" | "other";
    /** Should CandidateRegionDetector emit a span for this control? */
    candidateExpected: boolean;
    /** When candidateExpected, gold span must overlap a detected candidate. */
    candidateMustOverlapGoldSpan?: boolean;
  }
> = {
  token_definition: {
    expectedContext: "token_definition",
    expectedSemanticOwner: "created_object",
    expectedGrantedRegionCount: 0,
    cardNativeLayer2Eligible: false,
    routerContext: "token_definition",
    candidateExpected: true,
    candidateMustOverlapGoldSpan: true,
  },
  source_owned_reference: {
    expectedContext: "source_owned_reference",
    expectedSemanticOwner: "source_card",
    expectedGrantedRegionCount: 0,
    cardNativeLayer2Eligible: true,
    routerContext: "card_native",
    candidateExpected: false,
  },
  created_object_capability: {
    expectedContext: "created_object_capability",
    expectedSemanticOwner: "created_object",
    expectedGrantedRegionCount: 0,
    cardNativeLayer2Eligible: false,
    routerContext: "token_definition",
    candidateExpected: true,
    candidateMustOverlapGoldSpan: true,
  },
  reminder_only: {
    expectedContext: "reminder_only",
    expectedGrantedRegionCount: 0,
    expectedSemanticOwner: "source_card",
    cardNativeLayer2Eligible: true,
    routerContext: "reminder_only",
    candidateExpected: false,
  },
  hard_negative_surface: {
    expectedContext: "no_grant",
    expectedSemanticOwner: "source_card",
    expectedGrantedRegionCount: 0,
    cardNativeLayer2Eligible: true,
    routerContext: "other",
    candidateExpected: false,
  },
};
