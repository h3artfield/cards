/**
 * Professor v4.17 — coerce live Sol json_object responses into proposal schema shape.
 */
import type { RequirementFunctionV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_SOL_BLUEPRINT_COERCION_V4_17_V1_VERSION = "professor-sol-blueprint-coercion-v4-17-v1";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    const parts = v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim());
    if (parts.length) return parts.join("\n");
  }
  return null;
}

const FUNCTION_PATTERNS: Array<{ pattern: RegExp; fn: RequirementFunctionV417 }> = [
  { pattern: /recurs|reanim|return.*graveyard|graveyard.*battlefield/i, fn: "RETURN_FROM_GRAVEYARD" },
  { pattern: /surveil|self[- ]mill|mill|graveyard setup|stock.*graveyard|fill.*graveyard/i, fn: "GRAVEYARD_ENABLER" },
  { pattern: /ramp|accelerat|mana development|add mana|fast mana|color fix/i, fn: "ACCELERATION" },
  { pattern: /draw|selection|cantrip|filter|card advantage|velocity|tutor/i, fn: "CARD_VELOCITY" },
  { pattern: /counter|removal|destroy|exile target|interaction|stack|sweeper/i, fn: "INTERACTION" },
  { pattern: /protect|hexproof|indestructible|ward|save.*commander|defend.*win/i, fn: "PROTECTION" },
  { pattern: /search.*library|find.*card|^access$/i, fn: "ACCESS" },
  { pattern: /token|create.*token|go-wide|wide board/i, fn: "RESOURCE_PRODUCTION" },
  { pattern: /sacrifice|aristocrat|drain when.*dies|consume.*resource/i, fn: "RESOURCE_CONSUMER" },
  { pattern: /win|payoff|finisher|close|lethal|combo|depletion|outlet|deterministic/i, fn: "WIN_COMPONENT" },
  { pattern: /recovery|rebuild|resilience|recur.*after|metagame/i, fn: "RECOVERY" },
  { pattern: /engine|value|synergy/i, fn: "ENGINE_ENABLER" },
];

function inferFunctionsFromTexts(texts: string[]): RequirementFunctionV417[] {
  const out = new Set<RequirementFunctionV417>();
  for (const text of texts) {
    if (!text.trim()) continue;
    for (const { pattern, fn } of FUNCTION_PATTERNS) {
      if (pattern.test(text)) out.add(fn);
    }
  }
  return out.size ? [...out] : ["ENGINE_ENABLER"];
}

function flattenKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [k, v] of Object.entries(raw)) {
    if (k.includes("_")) out[snakeToCamel(k)] = v;
  }
  const nested = (raw.strategy ?? raw.strategic_plan ?? raw.blueprint) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") {
    for (const [k, v] of Object.entries(nested)) {
      if (out[k] == null) out[k] = v;
      const camel = snakeToCamel(k);
      if (out[camel] == null) out[camel] = v;
    }
  }
  return out;
}

function coercePlayPattern(v: unknown): string {
  return asString(v) ?? "Develop mana, deploy packages, execute win architecture.";
}

function coerceStructuredText(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    if (o.plan) parts.push(String(o.plan));
    if (o.summary) parts.push(String(o.summary));
    if (o.concept) parts.push(String(o.concept));
    for (const key of ["priorities", "purpose", "minimumShape", "failureAvoidance", "structure", "steps"]) {
      const arr = asArray<string>(o[key]);
      if (arr.length) parts.push(arr.map((x) => `- ${x}`).join("\n"));
    }
    return parts.join("\n\n").trim() || null;
  }
  return null;
}

function coerceWinLineEntry(key: string, line: unknown, status: string): Record<string, unknown> | null {
  if (typeof line === "string" && line.trim()) {
    return {
      planId: `win-${slug(key) || "line"}`,
      plan: line.trim(),
      status: status.includes("VERIFIED") ? "VERIFIED" : "HYPOTHESIZED",
      mechanicallyVerified: false,
      requiredFunctions: inferFunctionsFromTexts([line]),
      requiredCardsOrEquivalents: [],
    };
  }
  if (line && typeof line === "object") {
    const l = line as Record<string, unknown>;
    const concept = String(l.concept ?? l.plan ?? l.name ?? key);
    const structure = asArray<string>(l.structure ?? l.steps).join("; ");
    const role = l.commanderRole ? ` Commander role: ${l.commanderRole}` : "";
    const limitations = asArray<string>(l.limitations).length
      ? ` Limitations: ${asArray<string>(l.limitations).join("; ")}`
      : "";
    return {
      planId: `win-${slug(key) || slug(concept) || "line"}`,
      plan: `${concept}${structure ? `: ${structure}` : ""}${role}${limitations}`.trim(),
      status: status.includes("VERIFIED") ? "VERIFIED" : "HYPOTHESIZED",
      mechanicallyVerified: false,
      requiredFunctions: inferFunctionsFromTexts([concept, structure]),
      requiredCardsOrEquivalents: asArray<string>(l.requiredCards ?? l.cards),
    };
  }
  return null;
}

function coerceWinArchitecture(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) {
    return v.map((w, i) => {
      const win = flattenKeys(w as Record<string, unknown>);
      if (win.mechanicallyVerified == null) win.mechanicallyVerified = false;
      if (win.status == null) win.status = "HYPOTHESIZED";
      if (win.requiredFunctions == null) win.requiredFunctions = win.required_functions ?? ["WIN_COMPONENT"];
      if (win.requiredCardsOrEquivalents == null) win.requiredCardsOrEquivalents = win.required_cards ?? [];
      if (win.planId == null) win.planId = win.plan_id ?? `win-${i + 1}`;
      if (win.plan == null && win.concept) win.plan = String(win.concept);
      return win;
    });
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const status = String(o.verificationStatus ?? o.status ?? "HYPOTHESIZED");
    const wins: Record<string, unknown>[] = [];

    const lineKeys = [
      "primaryLine",
      "secondaryLine",
      "tertiaryLine",
      "quaternaryLine",
      "primaryWinPath",
      "secondaryWinPath",
      "tertiaryWinPath",
      "fallbackLine",
      "backupLine",
    ];
    for (const key of lineKeys) {
      const entry = coerceWinLineEntry(key, o[key], status);
      if (entry) wins.push(entry);
    }

    for (const [key, arrKey] of [
      ["primaryLines", "primaryLines"],
      ["secondaryLines", "secondaryLines"],
      ["winHypotheses", "winHypotheses"],
      ["winPaths", "winPaths"],
      ["lines", "lines"],
    ] as const) {
      const arr = o[arrKey];
      if (Array.isArray(arr)) {
        for (const [i, line] of arr.entries()) {
          const entry = coerceWinLineEntry(`${key}-${i}`, line, status);
          if (entry) wins.push(entry);
        }
      }
    }

    if (wins.length === 0 && (o.concept || o.plan || o.structure)) {
      const entry = coerceWinLineEntry("primaryLine", o, status);
      if (entry) wins.push(entry);
    }
    return wins;
  }
  if (typeof v === "string" && v.trim()) {
    return [coerceWinLineEntry("primaryLine", v, "HYPOTHESIZED")!];
  }
  return [];
}

function coerceFunctionalBudgets(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) {
    return v.map((b) => {
      const bud = flattenKeys(b as Record<string, unknown>);
      if (bud.functionalCoverageSelected == null) bud.functionalCoverageSelected = 0;
      const fn = bud.function != null ? String(bud.function) : undefined;
      const category = String(bud.category ?? bud.name ?? "GENERAL");
      if ((category === "GENERAL" || !category.trim()) && fn) {
        bud.category = fn;
      } else if (bud.category == null) {
        bud.category = fn ?? "GENERAL";
      }
      const range = (bud.range ?? {}) as Record<string, unknown>;
      if (bud.minimum == null) bud.minimum = range.min ?? range.minimum ?? 0;
      if (bud.maximum == null) bud.maximum = range.max ?? range.maximum ?? bud.minimum ?? 0;
      return bud;
    });
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const budgets: Record<string, unknown>[] = [];
    for (const [key, val] of Object.entries(o)) {
      if (key === "budgetNotes" || key === "notes") continue;
      if (val && typeof val === "object") {
        const range = val as Record<string, unknown>;
        if ("min" in range || "max" in range || "minimum" in range || "maximum" in range) {
          budgets.push({
            category: key,
            minimum: range.min ?? range.minimum ?? 0,
            maximum: range.max ?? range.maximum ?? range.min ?? range.minimum ?? 0,
            functionalCoverageSelected: 0,
          });
        }
      } else if (typeof val === "number") {
        budgets.push({ category: key, minimum: val, maximum: val, functionalCoverageSelected: 0 });
      }
    }
    return budgets;
  }
  return [];
}

function coerceRequirementGroup(
  group: Record<string, unknown>,
  pkgSlug: string,
  idx: number,
): Record<string, unknown> {
  const flat = flattenKeys(group);
  const name = String(flat.name ?? flat.group ?? flat.groupId ?? `group-${idx + 1}`);
  const groupId = String(flat.groupId ?? flat.group_id ?? `grp-${pkgSlug}-${slug(name)}`);
  const slotRange = (flat.slotRange ?? flat.slot_range ?? {}) as Record<string, unknown>;
  const minSlots = Number(flat.minimumPhysicalSlots ?? slotRange.min ?? flat.min ?? 1);
  const maxSlots = Number(flat.preferredPhysicalSlots ?? slotRange.max ?? flat.max ?? minSlots);
  const reqId = String(flat.relatedRequirementIds?.[0] ?? flat.requirementId ?? `req-${pkgSlug}-${slug(name)}`);
  return {
    groupId,
    name,
    mandatory: flat.mandatory !== false,
    relatedRequirementIds: asArray<string>(flat.relatedRequirementIds).length
      ? asArray<string>(flat.relatedRequirementIds)
      : [reqId],
    minimumPhysicalSlots: minSlots,
    preferredPhysicalSlots: maxSlots,
  };
}

function coercePackage(pkg: unknown, idx: number): Record<string, unknown> {
  const p = flattenKeys(pkg as Record<string, unknown>);
  const name = String(p.name ?? p.packageId ?? `Package ${idx + 1}`);
  const pkgSlug = slug(name) || `pkg-${idx + 1}`;
  const packageId = String(p.packageId ?? p.package_id ?? `pkg-${pkgSlug}`);

  const groups = asArray<Record<string, unknown>>(p.requirementGroups ?? p.requirement_groups).map((g, gi) =>
    coerceRequirementGroup(g, pkgSlug, gi),
  );

  const functionTexts: string[] = [name, String(p.purpose ?? "")];
  for (const g of asArray<Record<string, unknown>>(p.requirementGroups ?? p.requirement_groups)) {
    const fg = flattenKeys(g);
    functionTexts.push(...asArray<string>(fg.requiredFunctions ?? fg.required_functions));
    functionTexts.push(...asArray<string>(fg.preferredFunctions ?? fg.preferred_functions));
    functionTexts.push(String(fg.group ?? fg.name ?? ""));
  }
  functionTexts.push(...asArray<string>(p.requiredFunctions ?? p.required_functions));

  const inferredFns = inferFunctionsFromTexts(functionTexts);
  const requiredFunctions = asArray<string>(p.requiredFunctions).length
    ? [...new Set(asArray<string>(p.requiredFunctions).flatMap((t) => inferFunctionsFromTexts([t])))]
    : inferredFns;
  const preferredFunctions = [
    ...new Set(asArray<string>(p.preferredFunctions ?? p.preferred_functions).flatMap((t) => inferFunctionsFromTexts([t]))),
  ];

  const minSlots =
    groups.reduce((s, g) => s + Number(g.minimumPhysicalSlots ?? 0), 0) ||
    Number(p.minimumPhysicalSlots ?? p.minimum_physical_slots ?? 2);
  const prefSlots =
    groups.reduce((s, g) => s + Number(g.preferredPhysicalSlots ?? 0), 0) ||
    Number(p.preferredPhysicalSlots ?? p.preferred_physical_slots ?? minSlots);
  const maxSlots = Number(p.maximumPhysicalSlots ?? p.maximum_physical_slots ?? prefSlots + 2);

  const coreNames = /primary|engine|win|graveyard|commander|core|mana|card access|interaction/i;
  const core = p.core !== undefined ? Boolean(p.core) : coreNames.test(name) || idx < 4;

  return {
    packageId,
    name,
    purpose: String(p.purpose ?? `${name} package`),
    core,
    minimumPhysicalSlots: minSlots,
    preferredPhysicalSlots: prefSlots,
    maximumPhysicalSlots: maxSlots,
    minimumPhysicalContribution: Number(p.minimumPhysicalContribution ?? minSlots),
    preferredPhysicalContribution: Number(p.preferredPhysicalContribution ?? prefSlots),
    requirementGroups: groups,
    requiredFunctions,
    preferredFunctions,
    relatedRequirementIds: groups.flatMap((g) => asArray<string>(g.relatedRequirementIds)),
    status: p.status ?? "OPEN",
    selectedCardIds: asArray<string>(p.selectedCardIds),
  };
}

function parseBracketNumber(v: unknown, fallback = 4): number {
  if (typeof v === "number" && v >= 1 && v <= 5) return v;
  if (typeof v === "string") {
    const m = v.match(/[1-5]/);
    if (m) return Number(m[0]);
  }
  return fallback;
}

function coerceBracketContract(v: unknown, requestedBracket?: number): Record<string, unknown> {
  if (!v || typeof v !== "object") {
    const br = requestedBracket ?? 4;
    return {
      requestedBracket: br,
      accelerationExpectation: "moderate",
      interactionExpectation: "high",
      cardQualityExpectation: "high",
      tutorExpectation: "limited",
      protectionExpectation: "some",
      redundancyExpectation: "high",
      threatSpeedExpectation: "mid",
      recoveryExpectation: "recursion",
      winCompactnessExpectation: "compact",
      comboPolicy: "no infinite combos",
      commanderDependenceTarget: "medium",
    };
  }
  const o = flattenKeys(v as Record<string, unknown>);
  const br = parseBracketNumber(o.requestedBracket ?? o.requested_bracket, requestedBracket ?? 4);
  const disclosure = asArray<string>(o.gamePlanDisclosure ?? o.game_plan_disclosure).join("; ");
  const b4 = br >= 4;
  return {
    requestedBracket: br,
    accelerationExpectation: String(
      o.accelerationExpectation ??
        o.acceleration_expectation ??
        (b4 ? "fast mana and efficient ramp" : "moderate ramp"),
    ),
    interactionExpectation: String(
      o.interactionExpectation ??
        o.interaction_expectation ??
        (b4 ? "premium instant-speed interaction" : "targeted removal"),
    ),
    cardQualityExpectation: String(
      o.cardQualityExpectation ?? o.card_quality_expectation ?? (b4 ? "high efficiency premium" : "solid"),
    ),
    tutorExpectation: String(
      o.tutorExpectation ?? o.tutor_expectation ?? (b4 ? "compact tutor suite" : "limited"),
    ),
    protectionExpectation: String(
      o.protectionExpectation ?? o.protection_expectation ?? "stack and permanent protection",
    ),
    redundancyExpectation: String(o.redundancyExpectation ?? o.redundancy_expectation ?? "multiple lines"),
    threatSpeedExpectation: String(
      o.threatSpeedExpectation ?? o.threat_speed_expectation ?? (b4 ? "fast compact wins" : "midrange"),
    ),
    recoveryExpectation: String(o.recoveryExpectation ?? o.recovery_expectation ?? "graveyard or recursion recovery"),
    winCompactnessExpectation: String(
      o.winCompactnessExpectation ?? o.win_compactness_expectation ?? (b4 ? "compact deterministic wins" : "battlecruiser"),
    ),
    comboPolicy: String(
      o.comboPolicy ?? o.combo_policy ?? (disclosure.includes("combo") ? "compact combos permitted" : "no infinite combos"),
    ),
    commanderDependenceTarget: String(o.commanderDependenceTarget ?? o.commander_dependence_target ?? "medium"),
  };
}

export type CoerceSolBlueprintOptionsV417 = {
  requestedBracket?: number;
};

export function coerceSolBlueprintProposalRawV417(
  raw: Record<string, unknown>,
  opts?: CoerceSolBlueprintOptionsV417,
): Record<string, unknown> {
  const o = flattenKeys(raw);

  if (o.expectedPlayPattern == null && o.playPattern != null) o.expectedPlayPattern = o.playPattern;
  o.expectedPlayPattern = coercePlayPattern(o.expectedPlayPattern);

  if (typeof o.commanderExploit !== "string") {
    const text = coerceStructuredText(o.commanderExploit);
    if (text) o.commanderExploit = text;
  }
  if (typeof o.independentEngine !== "string") {
    const text = coerceStructuredText(o.independentEngine);
    if (text) o.independentEngine = text;
  }

  const wins = coerceWinArchitecture(o.winArchitecture ?? o.winHypotheses ?? o.win_hypotheses ?? o.winPlans);
  if (wins.length) o.winArchitecture = wins;

  const budgets = coerceFunctionalBudgets(o.functionalBudgets ?? o.functional_budgets ?? o.budgets ?? o.functionalBudget);
  if (budgets.length) o.functionalBudgets = budgets;

  if (o.strategicConcepts == null) {
    o.strategicConcepts = o.concepts ?? o.strategic_concepts ?? o.normalizedConcepts ?? [];
  }
  if (o.researchSeeds == null) o.researchSeeds = o.research_seeds ?? o.cardSeeds ?? [];
  if (o.bracketConstructionGuidance == null) {
    o.bracketConstructionGuidance = o.bracketGuidance ?? o.bracket_construction_guidance ?? o.bracketNotes ?? [];
  }
  if (!asArray(o.bracketConstructionGuidance).length) {
    o.bracketConstructionGuidance = ["Follow requested bracket construction norms."];
  }
  if (!asArray(o.weaknesses).length) o.weaknesses = ["Needs external verification"];
  if (!asArray(o.strengths).length) o.strengths = ["Coherent architecture"];
  if (!Array.isArray(o.accessNeeds)) o.accessNeeds = asArray<string>(o.accessNeeds ?? o.access_needs);
  if (!Array.isArray(o.protectionNeeds)) o.protectionNeeds = asArray<string>(o.protectionNeeds ?? o.protection_needs);
  if (!Array.isArray(o.dependencies)) o.dependencies = asArray<string>(o.dependencies);

  o.packages = asArray(o.packages).map((pkg, i) => coercePackage(pkg, i));
  o.bracketContract = coerceBracketContract(o.bracketContract ?? o.bracket_contract, opts?.requestedBracket);

  return o;
}
