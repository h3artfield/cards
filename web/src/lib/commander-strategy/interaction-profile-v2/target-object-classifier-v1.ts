/**
 * Deterministic target/object classifier — outside RC8 parser, versioned separately.
 */
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { TARGET_OBJECT_CLASSIFIER_VERSION } from "./types";

export type ObjectClass =
  | "creature"
  | "artifact"
  | "enchantment"
  | "land"
  | "permanent"
  | "spell"
  | "graveyard_card"
  | "card"
  | "unknown";

export type EffectScope = "single" | "multiple" | "all" | "each" | "unknown";
export type EffectSide = "mine" | "opponent" | "any" | "unknown";

export type ClassifiedEffect = {
  objectClass: ObjectClass;
  scope: EffectScope;
  side: EffectSide;
  classifierVersion: typeof TARGET_OBJECT_CLASSIFIER_VERSION;
  evidence: string;
};

export type ActionClassificationContext = {
  oracleText: string;
  abilities: SemanticAbility[];
  /** Index among same actionType on this card (for modal bullets). */
  actionIndexAmongType?: number;
};

const ACTION_TYPE_HINTS: Partial<Record<string, RegExp[]>> = {
  destroy: [/\bdestroy\b/i],
  exile: [/\bexile\b/i],
  counter: [/\bcounter\b/i],
  return_to_battlefield: [/\bonto the battlefield\b/i, /\breturn .* to the battlefield\b/i],
  put_onto_battlefield: [/\bonto the battlefield\b/i],
  search_library: [/\bsearch (?:your )?library\b/i],
  create_token: [/\bcreate .* token\b/i],
  mill: [/\bmill\b/i],
  discard: [/\bdiscard\b/i],
  draw: [/\bdraw\b/i],
};

function textOf(action: SemanticAction): string {
  return (
    action.arguments.object?.evidence?.text ??
    action.evidence?.text ??
    action.arguments.sourceZone?.join(" ") ??
    ""
  ).toLowerCase();
}

function modalClauses(oracleText: string): string[] {
  if (!/choose one/i.test(oracleText)) return [oracleText];
  return oracleText
    .split(/[•\n]|(?:\r\n)/)
    .map((s) => s.replace(/^[-–—]\s*/, "").trim())
    .filter((s) => s.length > 0 && !/^choose one/i.test(s));
}

function clausesMatchingActionType(actionType: string, context: ActionClassificationContext): string[] {
  const hints = ACTION_TYPE_HINTS[actionType] ?? [];
  const fromAbilities = context.abilities
    .map((a) => a.abilitySpan.text)
    .filter((t) => hints.length === 0 || hints.some((h) => h.test(t)));
  const fromModal = modalClauses(context.oracleText).filter((t) =>
    hints.length === 0 ? true : hints.some((h) => h.test(t)),
  );
  const merged = [...fromAbilities, ...fromModal, context.oracleText];
  const seen = new Set<string>();
  return merged.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveActionEvidenceText(
  action: SemanticAction,
  context: ActionClassificationContext,
): string {
  const direct = textOf(action);
  if (direct.trim()) return direct;

  const clauses = clausesMatchingActionType(action.actionType, context);
  const idx = context.actionIndexAmongType ?? 0;
  if (clauses[idx]) return clauses[idx]!.toLowerCase();
  if (clauses[0]) return clauses[0]!.toLowerCase();
  return context.oracleText.toLowerCase();
}

function sideFromAction(action: SemanticAction, text: string): EffectSide {
  const ap = action.arguments.affectedPlayer ?? action.arguments.affectedController;
  if (ap === "you" || ap === "controller") return "mine";
  if (ap === "target_opponent" || ap === "each_opponent" || ap === "opponent") return "opponent";
  if (ap === "each_player" || ap === "target_player") return "any";
  if (/\byou don't control\b/.test(text)) return "opponent";
  return "unknown";
}

function scopeFromText(text: string): EffectScope {
  if (/\bdestroy all\b|\bexile all\b|\ball creatures\b|\ball artifacts\b|\ball enchantments\b/.test(text)) {
    return "all";
  }
  if (/\ball\b/.test(text)) return "all";
  if (/\beach\b/.test(text)) return "each";
  if (/\bup to\b/.test(text) || /\btarget\b/.test(text)) return "single";
  if (/\btwo target\b|\bthree target\b/.test(text)) return "multiple";
  return "unknown";
}

function objectClassFromText(text: string, action: SemanticAction): ObjectClass {
  const objType = action.arguments.object?.type?.toLowerCase();
  if (objType === "creature") return "creature";
  if (objType === "permanent") return "permanent";
  if (objType === "spell" || objType === "spell_or_ability") return "spell";
  if (objType === "card") return "card";

  const srcZones = action.arguments.sourceZone ?? [];
  const destZones = action.arguments.destinationZone ?? [];

  if (srcZones.includes("graveyard") || destZones.includes("graveyard")) return "graveyard_card";
  if (/\bgraveyard\b/.test(text) && /\bexile target card\b/.test(text)) return "graveyard_card";
  if (/\bartifact/.test(text)) return "artifact";
  if (/\benchantment/.test(text)) return "enchantment";
  if (/\bland/.test(text)) return "land";
  if (/\bcreature/.test(text)) return "creature";
  if (/\bpermanent/.test(text)) return "permanent";
  if (/\bspell/.test(text)) return "spell";
  return "unknown";
}

export function classifyActionEffect(
  action: SemanticAction,
  context?: ActionClassificationContext,
): ClassifiedEffect {
  const text = context ? resolveActionEvidenceText(action, context) : textOf(action);
  return {
    objectClass: objectClassFromText(text, action),
    scope: scopeFromText(text),
    side: sideFromAction(action, text),
    classifierVersion: TARGET_OBJECT_CLASSIFIER_VERSION,
    evidence: text.slice(0, 120),
  };
}

export function isMassRemoval(action: SemanticAction, context?: ActionClassificationContext): boolean {
  const c = classifyActionEffect(action, context);
  return (
    (action.actionType === "destroy" || action.actionType === "exile") &&
    (c.scope === "all" || c.scope === "each") &&
    (c.objectClass === "creature" ||
      c.objectClass === "permanent" ||
      c.objectClass === "unknown" ||
      /\ball creatures\b/.test(c.evidence))
  );
}

export function isLandDenial(action: SemanticAction, context?: ActionClassificationContext): boolean {
  const c = classifyActionEffect(action, context);
  return action.actionType === "destroy" && c.objectClass === "land";
}
