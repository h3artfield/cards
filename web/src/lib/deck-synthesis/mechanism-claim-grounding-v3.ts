/**
 * Structural mechanism claim grounding — validates strategic text against cited mechanism facts.
 * Lexical phrase lists are not the primary authority; action/object/zone/permission dimensions are.
 */
import type { IndependentMechanismFact } from "./independent-truth-types-v1";

export const MECHANISM_CLAIM_GROUNDING_V3_VERSION = "mechanism-claim-grounding-v3";

export type MechanismCapability = {
  action: string;
  object?: string;
  zone?: string;
  quantity?: number;
  perTurnLimit?: number;
  constraint?: string;
};

export type StructuralClaimIssue = {
  code:
    | "REJECTED_BROADENED_PERMISSION"
    | "REJECTED_INVENTED_MECHANIC"
    | "UNGROUNDED_STRATEGIC_CLAIM";
  message: string;
  claimedAction?: string;
  claimedObject?: string;
};

const FORBIDDEN_BROADENING_PHRASES = [
  "additional land drop",
  "extra land drop",
  "extra land play",
  "grants an additional land",
] as const;

type ClaimPattern = {
  action: string;
  object?: string;
  zone?: string;
  code: StructuralClaimIssue["code"];
  patterns: RegExp[];
  message: string;
};

const STRUCTURAL_CLAIM_PATTERNS: ClaimPattern[] = [
  {
    action: "ADDITIONAL_LAND_PLAY",
    code: "REJECTED_BROADENED_PERMISSION",
    patterns: [
      /\bsecond land\b/i,
      /\btwo lands?\b/i,
      /\bplay (?:a )?land.*(?:and|then).*(?:another|second|additional|extra)\b/i,
      /\bbeyond (?:the )?normal land\b/i,
      /\bin addition to (?:your )?(?:normal )?land play\b/i,
      /\bmultiple lands? per turn\b/i,
      /\bextra land\b/i,
    ],
    message: "Claim asserts additional land-play permission not present in cited mechanism facts",
  },
  {
    action: "CAST_FROM_GRAVEYARD",
    object: "INSTANT",
    zone: "GRAVEYARD",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [
      /\bcast(?:s|ing)? instants? (?:spells? )?from (?:the )?graveyard\b/i,
      /\bplay instants? from (?:the )?graveyard\b/i,
      /\binstant(?:s)? (?:spells? )?from (?:the )?graveyard\b/i,
    ],
    message: "Claim asserts graveyard instant permission not present in cited mechanism facts",
  },
  {
    action: "DRAW_CARD",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [
      /\bdraws? (?:two|extra|additional|\d+) cards?\b/i,
      /\bdraws? cards? when(?:ever)? you cast\b/i,
      /\bdraw (?:two|extra|additional) cards?\b/i,
    ],
    message: "Claim asserts card-draw mechanic not present in cited mechanism facts",
  },
  {
    action: "DEAL_DAMAGE",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [/\bdeal(?:s|ing)? (?:direct )?damage\b/i, /\bdeals? \d+ damage\b/i],
    message: "Claim asserts damage-dealing mechanic not present in cited mechanism facts",
  },
  {
    action: "CREATE_TOKEN",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [/\bcreate(?:s|d)? (?:a )?(?:token|tokens)\b/i],
    message: "Claim asserts token-creation mechanic not present in cited mechanism facts",
  },
  {
    action: "ADD_MANA",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [/\badd(?:s|ing)? (?:two|extra|\{[^}]+\}) mana\b/i, /\bmana ability\b/i],
    message: "Claim asserts mana-production mechanic not present in cited mechanism facts",
  },
  {
    action: "PUT_COUNTER",
    code: "REJECTED_INVENTED_MECHANIC",
    patterns: [/\bput(?:s|ting)? \+1\/\+1 counters?\b/i, /\b\+1\/\+1 counters? on\b/i],
    message: "Claim asserts counter-placement mechanic not present in cited mechanism facts",
  },
];

function actionList(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
}

export function extractCapabilitiesFromFacts(facts: IndependentMechanismFact[]): MechanismCapability[] {
  const caps: MechanismCapability[] = [];
  for (const fact of facts) {
    for (const action of actionList(fact)) {
      caps.push({
        action: String(action.type ?? ""),
        object: action.object ? String(action.object) : undefined,
        zone: action.zone ? String(action.zone) : undefined,
        quantity: typeof action.quantity === "number" ? action.quantity : undefined,
        perTurnLimit: typeof action.perTurnLimit === "number" ? action.perTurnLimit : undefined,
        constraint: action.constraint ? String(action.constraint) : undefined,
      });
    }
    if (fact.keyword) {
      caps.push({ action: "KEYWORD", object: String(fact.keyword) });
    }
  }
  return caps.filter((c) => c.action.length > 0);
}

function capabilityMatches(
  claimed: Pick<MechanismCapability, "action" | "object" | "zone">,
  supported: MechanismCapability[],
): boolean {
  if (claimed.action === "ADDITIONAL_LAND_PLAY") {
    return supported.some((s) => s.action === "ADDITIONAL_LAND_PLAY");
  }

  return supported.some((s) => {
    if (s.action !== claimed.action) return false;
    if (claimed.object && s.object) {
      const co = claimed.object.toUpperCase();
      const so = s.object.toUpperCase();
      if (co === "INSTANT" && so === "PERMANENT_SPELL") return false;
      if (!(so.includes(co) || co.includes(so) || co === so)) return false;
    } else if (claimed.object && !s.object) {
      return false;
    }
    if (claimed.zone && s.zone && claimed.zone.toUpperCase() !== s.zone.toUpperCase()) return false;
    return true;
  });
}

export function auditStructuralMechanismClaims(args: {
  claimText: string;
  citedFacts: IndependentMechanismFact[];
}): StructuralClaimIssue[] {
  const issues: StructuralClaimIssue[] = [];
  const blob = args.claimText.toLowerCase();
  const supported = extractCapabilitiesFromFacts(args.citedFacts);

  for (const phrase of FORBIDDEN_BROADENING_PHRASES) {
    if (blob.includes(phrase)) {
      issues.push({
        code: "REJECTED_BROADENED_PERMISSION",
        message: `Defense-in-depth broadening phrase detected: "${phrase}"`,
        claimedAction: "ADDITIONAL_LAND_PLAY",
      });
    }
  }

  for (const rule of STRUCTURAL_CLAIM_PATTERNS) {
    if (!rule.patterns.some((p) => p.test(args.claimText))) continue;
    const claimed = { action: rule.action, object: rule.object, zone: rule.zone };
    if (!capabilityMatches(claimed, supported)) {
      issues.push({
        code: rule.code,
        message: rule.message,
        claimedAction: rule.action,
        claimedObject: rule.object,
      });
    }
  }

  return issues;
}

export function factRequiresCommanderMechanism(fact: IndependentMechanismFact): boolean {
  return actionList(fact).some((a) => {
    const type = String(a.type ?? "");
    return (
      type === "CAST_FROM_GRAVEYARD" ||
      type === "PLAY_FROM_GRAVEYARD" ||
      type === "GRANTED_STATIC_ABILITY" ||
      type === "PLAY_PERMISSION"
    );
  });
}

export function packageEvidenceRequiresCommander(args: {
  evidenceFactIds: string[];
  mechanismFacts: IndependentMechanismFact[];
}): boolean {
  const factById = new Map(args.mechanismFacts.map((f) => [f.mechanismId, f]));
  return args.evidenceFactIds.some((id) => {
    const fact = factById.get(id);
    return fact ? factRequiresCommanderMechanism(fact) : false;
  });
}

export function resourcesOverlap(producer: string[], consumer: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const pSet = new Set(producer.map(norm).filter(Boolean));
  return consumer.map(norm).filter(Boolean).some((c) => pSet.has(c));
}
