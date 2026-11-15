"""
K v1.1 mechanism cards and review overrides.

Exposure mass ranks UNKNOWN cells. Review is mechanical, not cosine.
CONDITIONAL_RELATION is a first-class status when the pair is real but the
current dependency is too coarse.
"""

from __future__ import annotations

from mechanical_k_v1 import CAP_MECH as CAP_V1
from mechanical_k_v1 import DEP_MECH, DOMAIN_ALIASES, RES_MECH
from mechanical_k_v1 import derive_pressure as derive_pressure_v1
from mechanical_k_v1 import domain_relation, relate as relate_v1

CAP_MECH = {
    **CAP_V1,
    "LIFE_LOSS": {"domain": "life", "operation": "drain", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"loses? .{0,8}life",)},
    "DEAL_DAMAGE": {"domain": "damage", "operation": "damage", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"deals? .{0,12}damage",)},
    "DESTROY": {"domain": "permanents", "operation": "destroy", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"destroy target",)},
    "EXILE": {"domain": "permanents", "operation": "exile", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"exile target",)},
    "BOUNCE": {"domain": "permanents", "operation": "bounce", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"return .{0,24} to (?:its owner's|their) hand",)},
    "REMOVAL": {"domain": "permanents", "operation": "destroy", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"destroy target", r"exile target")},
    "RECURSION": {"domain": "graveyard", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"return .{0,24} from .{0,12}graveyard",)},
    "REANIMATION": {"domain": "graveyard", "operation": "enable_resource", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"return .{0,24} from .{0,12}graveyard .* battlefield",)},
    "GRAVEYARD_TO_HAND": {"domain": "graveyard", "operation": "enable_resource", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"return .{0,24} from .{0,12}graveyard to .{0,8}hand",)},
    "GRAVEYARD_SETUP": {"domain": "graveyard", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"mill", r"discard")},
    "MILL": {"domain": "graveyard", "operation": "enable_resource", "scope": "varies", "persistence": "one_shot", "timing": "proactive", "textHints": (r"\bmill\b",)},
    "DRAW_CARD": {"domain": "drawing", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"draw .{0,8}card",)},
    "DISCARD_CARD": {"domain": "hand", "operation": "discard", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"discard",)},
    "ADD_MANA": {"domain": "mana", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"add \{",)},
    "SEARCH_LIBRARY": {"domain": "library", "operation": "tutor", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"search your library",)},
    "COPY_SPELL": {"domain": "stack", "operation": "copy", "scope": "point", "persistence": "one_shot", "timing": "reactive", "textHints": (r"copy target spell",)},
    "CAST_TRIGGER": {"domain": "casting", "operation": "trigger_from", "scope": "repeatable", "persistence": "static", "timing": "reactive", "textHints": (r"whenever you cast",)},
    "LANDFALL": {"domain": "lands", "operation": "trigger_from", "scope": "repeatable", "persistence": "static", "timing": "reactive", "textHints": (r"landfall", r"land you control enters")},
    "DEATH_PAYOFF": {"domain": "death", "operation": "trigger_from", "scope": "repeatable", "persistence": "static", "timing": "reactive", "textHints": (r"whenever .{0,24} dies",)},
    "PROTECTION": {"domain": "one_creature", "operation": "enable_resource", "scope": "point", "persistence": "varies", "timing": "reactive", "textHints": (r"protection from", r"hexproof", r"indestructible")},
    "BLINK": {"domain": "permanents", "operation": "blink", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"exile .{0,20} return",)},
    "EXTRA_COMBAT": {"domain": "combat", "operation": "enable_resource", "scope": "self", "persistence": "one_shot", "timing": "proactive", "textHints": (r"additional combat",)},
    "MANA_DENIAL": {"domain": "mana", "operation": "deny", "scope": "point_or_mass", "persistence": "one_shot", "timing": "proactive", "textHints": (r"destroy target land", r"doesn't untap")},
    "COST_INCREASE": {"domain": "casting", "operation": "tax", "scope": "broad", "persistence": "static", "timing": "continuous", "textHints": (r"cost[s]? \{.{0,6}\} more",)},
    "COST_REDUCTION": {"domain": "casting", "operation": "enable_resource", "scope": "broad", "persistence": "static", "timing": "continuous", "textHints": (r"cost[s]? \{.{0,6}\} less",)},
    "TAX_SPELL": {"domain": "casting", "operation": "tax", "scope": "broad", "persistence": "static", "timing": "continuous", "textHints": (r"spells cost",)},
    "COST_MODIFICATION": {"domain": "casting", "operation": "tax", "scope": "broad", "persistence": "static", "timing": "continuous", "textHints": (r"cost[s]? \{",)},
    "FLASH_ENABLER": {"domain": "timing", "operation": "enable_resource", "scope": "varies", "persistence": "static", "timing": "continuous", "textHints": (r"\bflash\b",)},
    "PROLIFERATE": {"domain": "counters", "operation": "enable_resource", "scope": "broad", "persistence": "repeatable", "timing": "proactive", "textHints": (r"proliferate",)},
    "PUT_COUNTER": {"domain": "counters", "operation": "enable_resource", "scope": "point", "persistence": "repeatable", "timing": "proactive", "textHints": (r"\+1/\+1 counter",)},
    "SACRIFICE": {"domain": "sacrifice", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"sacrifice",)},
    "CREATE_TREASURE": {"domain": "artifacts", "operation": "create", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"treasure token",)},
    "ARTIFACT_PRODUCTION": {"domain": "artifacts", "operation": "create", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"create .{0,24}artifact",)},
    "HASTE_ENABLER": {"domain": "combat", "operation": "enable_resource", "scope": "varies", "persistence": "static", "timing": "continuous", "textHints": (r"\bhaste\b",)},
    "COPY_PERMANENT": {"domain": "permanents", "operation": "copy", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"copy target",)},
    "TAP": {"domain": "permanents", "operation": "restrict", "scope": "point", "persistence": "temporary", "timing": "proactive", "textHints": (r"tap target",)},
    "UNTAP": {"domain": "permanents", "operation": "enable_resource", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"untap",)},
    "ANIMATOR": {"domain": "artifacts", "operation": "enable_resource", "scope": "varies", "persistence": "static", "timing": "continuous", "textHints": (r"becomes? a creature",)},
    "TOKEN_ON_ETB": {"domain": "tokens", "operation": "create", "scope": "varies", "persistence": "repeatable", "timing": "reactive", "textHints": (r"when .{0,20} enters .{0,20}create",)},
    "ENCHANTMENT_REMOVAL": {"domain": "enchantments", "operation": "destroy", "scope": "point", "persistence": "one_shot", "timing": "proactive", "textHints": (r"destroy target enchantment",)},
    "ALTERNATIVE_COST": {"domain": "casting", "operation": "enable_resource", "scope": "varies", "persistence": "varies", "timing": "proactive", "textHints": (r"rather than pay", r"without paying")},
    "PLAY_FROM_TOP": {"domain": "library", "operation": "enable_resource", "scope": "self", "persistence": "static", "timing": "continuous", "textHints": (r"play .{0,20} from the top",)},
    "CAST_FROM_GRAVEYARD": {"domain": "graveyard", "operation": "enable_resource", "scope": "varies", "persistence": "repeatable", "timing": "proactive", "textHints": (r"cast .{0,20} from .{0,8}graveyard",)},
}

# Extra aliases needed for the exposure batch.
DOMAIN_ALIASES_V11 = {
    **DOMAIN_ALIASES,
    ("damage", "one_creature"): "conditional",
    ("damage", "creatures"): "conditional",
    ("damage", "combat_damage"): "related_not_identical",
    ("damage", "combat"): "related_not_identical",
    ("life", "one_creature"): "unrelated_unless_commander_damage",
    ("life", "commander"): "conditional",
    ("permanents", "one_creature"): "subset",
    ("permanents", "creatures"): "subset",
    ("permanents", "artifacts"): "subset",
    ("permanents", "commander"): "subset",
    ("mana", "casting"): "related_not_identical",
    ("mana", "lands"): "related_not_identical",
    ("library", "casting"): "unrelated",
    ("drawing", "hand"): "related_not_identical",
    ("counters", "one_creature"): "conditional",
    ("enchantments", "one_creature"): "conditional",
    ("casting", "resolution"): "related_not_identical",
}


def _domain_rel(a: str, b: str) -> str:
    if a == b:
        return "same"
    return DOMAIN_ALIASES_V11.get((a, b), DOMAIN_ALIASES_V11.get((b, a), "unrelated"))


# Mechanical reviews that the generic engine would get wrong.
# These are teachers, not cosine guesses.
OVERRIDES = {
    ("LIFE_LOSS", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Player life loss does not attack a must-keep-creature plan. Only commander-damage / fight effects do. Dependency is too coarse.",
        "ontologyNote": "Split CARES_ABOUT_ONE_CREATURE into MUST_KEEP_ON_BATTLEFIELD, MUST_ATTACK, COMMANDER_DAMAGE_PLAN, AURA_EQUIP_INVESTMENT.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_COMMANDER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Life loss is commander-damage only when it is combat damage from the commander, not generic drain.",
        "ontologyNote": "COMMANDER_DAMAGE_PLAN is not generic LIFE_LOSS.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_LIFE_GAIN"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Causing life loss does not suppress a life-gain trigger dependency.",
    },
    ("DEAL_DAMAGE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Creature-targeted damage attacks a voltron body. Player-targeted damage does not.",
        "ontologyNote": "Need CREATURE_DAMAGE vs PLAYER_DAMAGE poles.",
    },
    ("DEAL_DAMAGE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Noncombat damage does not stop combat-damage triggers; it is a different damage channel.",
    },
    ("DESTROY", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point destroy can remove the key creature. Scope is point, not a wipe.",
    },
    ("EXILE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point exile removes the key creature and often beats recursion.",
    },
    ("BOUNCE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bounce removes the body temporarily and strands auras/equipment. Not permanent denial.",
    },
    ("REMOVAL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Generic removal includes the creature-removal slice that attacks a single-threat plan.",
    },
    ("REMOVAL", "CARES_ABOUT_CREATURES"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Removal reduces creature-board density; weaker than a wipe.",
    },
    ("DESTROY", "CARES_ABOUT_CREATURES"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying creatures attacks a creature-board dependency.",
    },
    ("EXILE", "CARES_ABOUT_CREATURES"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exiling creatures attacks a creature-board dependency.",
    },
    ("BOUNCE", "CARES_ABOUT_CREATURES"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bounce is tempo, not board wipe.",
    },
    ("DESTROY", "CARES_ABOUT_COMMANDER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Commanders return to the command zone. Destroy taxes, it does not exile the plan.",
    },
    ("EXILE", "CARES_ABOUT_COMMANDER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exile still usually puts a commander in the command zone. Stronger tempo than destroy, not a lock.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tutoring is not a mechanical attack on a creature plan.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Library search does not operate on the graveyard resource.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Finding a card is not casting it and does not suppress cast-care.",
    },
    ("ADD_MANA", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Mana is a prerequisite for casting, not an attack and not identical to a cast trigger.",
    },
    ("ADD_MANA", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Producing mana does not operate on a single-creature body.",
    },
    ("MANA_DENIAL", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Denying mana reduces spell throughput. Cast triggers that already happened are unaffected.",
    },
    ("MANA_DENIAL", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Land destruction can stop future landfall; tap-down and mana-rock hate do not.",
    },
    ("COST_INCREASE", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Taxing reduces cast count; it does not counter the spell.",
    },
    ("TAX_SPELL", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A tax reduces how often the dependency can fire.",
    },
    ("COPY_SPELL", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Copies are not casts. They feed resolution/copy payoffs more than cast triggers.",
        "ontologyNote": "CARES_ABOUT_CASTING_SPELLS vs CARES_ABOUT_COPIES should be split later.",
    },
    ("BLINK", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Blinking your own key creature protects it; blinking theirs removes it. Direction matters.",
    },
    ("PROTECTION", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Protection keeps the key creature online.",
    },
    ("ENCHANTMENT_REMOVAL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Attacks aura-investment voltron, not every one-creature plan.",
        "ontologyNote": "AURA_EQUIPMENT_INVESTMENT should be its own dependency.",
    },
    # Batch 2 — high-exposure neutrals and structural probes
    ("ADD_MANA", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Producing mana does not disable or feed artifact activations.",
    },
    ("ADD_MANA", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Mana production is not an artifact-board mechanic.",
    },
    ("ADD_MANA", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Mana does not create or scale tokens.",
    },
    ("ADD_MANA", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Mana does not operate on the command-zone engine.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tutoring is not a mechanical interaction with activations.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Finding a card does not produce tokens.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Library search does not attack or enable the commander as a body.",
    },
    ("CREATE_TOKEN", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Only artifact tokens with activations feed this dependency. Creature tokens do not.",
        "ontologyNote": "Token type (creature vs artifact) is still collapsed inside CREATE_TOKEN.",
    },
    ("CREATE_TOKEN", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Making tokens does not inherently attack or enable a commander plan.",
    },
    ("CREATE_TOKEN", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Treasure/Clue/Food tokens are artifacts; most creature tokens are not.",
    },
    ("CAST_TRIGGER", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Cast triggers do not operate on artifact activations.",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Filling a graveyard does not touch artifact activations.",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "An outlet on an artifact can consume activations; a creature outlet does not.",
    },
    ("LIFE_GAIN", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life gain does not operate on artifact activations.",
    },
    ("DRAW_CARD", "CARES_ABOUT_DRAWING_CARDS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Drawing is exactly the resource this dependency uses.",
    },
    ("DRAW_CARD", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Drawing increases hand size.",
    },
    ("MILL", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Milling stocks the graveyard resource.",
    },
    ("REANIMATION", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Reanimation spends the graveyard resource.",
    },
    ("LANDFALL", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Landfall is the same domain as lands-entering care.",
    },
    ("EXTRA_COMBAT", "CARES_ABOUT_COMBAT"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Extra combat phases feed a combat dependency.",
    },
    ("EXTRA_COMBAT", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Another combat step creates more combat-damage events.",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Death payoffs are the same family as cares-about-death.",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "These axes currently name the same mechanical event.",
        "ontologyNote": "CARES_ABOUT_CREATURE_DEATH and CARES_ABOUT_DEATH_TRIGGERS are near-duplicates.",
    },
    ("PUT_COUNTER", "CARES_ABOUT_COUNTERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Putting counters supplies the counter dependency.",
    },
    ("PROLIFERATE", "CARES_ABOUT_COUNTERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Proliferate scales existing counters.",
    },
    ("HASTE_ENABLER", "CARES_ABOUT_COMBAT"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Haste lets new creatures attack; it does not create combat.",
    },
    ("BOARD_WIPE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A wipe removes the key creature along with the rest of the board.",
    },
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Mass creature removal hits a singleton threat.",
    },
    ("DISCARD_CARD", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Discard reduces hand size. Weaker and narrower than HAND_ATTACK as a family.",
    },
    ("DRAW_CARD", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Drawing cards does not operate on artifact activations.",
    },
    ("DRAW_CARD", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Draw is not a commander-body mechanic.",
    },
    ("COST_REDUCTION", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Cheaper spells increase cast count; not an attack.",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Alt costs make more casts possible. They are not cast triggers themselves.",
    },
    ("CAST_FROM_GRAVEYARD", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Casting from the yard spends the graveyard resource.",
    },
    ("ANIMATOR", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Animation makes artifacts into attackers; it does not create artifacts.",
    },
    ("FOG", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Preventing combat damage does not remove the key creature.",
    },
    ("COUNTER_SPELL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "A counter stops the creature entering. It does nothing once the body is in play.",
        "ontologyNote": "MUST_KEEP_ON_BATTLEFIELD vs must-resolve-the-creature-spell.",
    },
    ("TAP", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Tapping the key creature stops attacks and some activations for a turn. Not removal.",
    },
    ("COUNTER_SPELL", "CARES_ABOUT_COMMANDER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Counters the commander as a spell, not the commander as a battlefield engine.",
        "ontologyNote": "Command-zone cast vs battlefield commander body are different dependencies.",
    },
    # Batch 4 teachers. Generic domain match misses permanents⊃artifacts/commander
    # and treats tax/bounce/damage as non-ops. Do not silently expand ATTACK_OPS.
    ("ADD_MANA", "CARES_ABOUT_DRAWING_CARDS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Producing mana does not operate on draw triggers.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Player life loss does not remove or suppress tokens.",
    },
    ("LIFE_GAIN", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Gaining life does not create or attack tokens.",
    },
    ("SEARCH_LIBRARY", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Only searches that put a land onto the battlefield (fetches) feed landfall. Tutor-to-hand does not.",
        "ontologyNote": "SEARCH_LIBRARY mixes to-hand tutors with put-onto-battlefield fetches.",
    },
    ("PLAY_FROM_TOP", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Playing from the top of the library does not operate on the commander body.",
    },
    ("ADD_MANA", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Mana does not change hand size.",
    },
    ("SACRIFICE", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A sacrifice outlet is not an edict. Commanders also leave to the command zone.",
    },
    ("PLAY_FROM_TOP", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Top-deck play does not create or deny tokens.",
    },
    ("SACRIFICE", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Your outlet does not attack an opponent token plan. Edicts are a different capability.",
    },
    ("CAST_TRIGGER", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Cast triggers do not operate on an artifact board.",
    },
    ("BOUNCE", "CARES_ABOUT_COMMANDER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Bounce sends a commander to hand; it is recast with tax. Tempo, not a lock.",
    },
    ("TAP", "CARES_ABOUT_COMMANDER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Tapping a commander stops attack and tap-activations for a turn. Static commander engines survive.",
    },
    ("EXILE", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exiling artifacts removes the artifact resource. Point exile is not mass hate.",
    },
    ("COST_MODIFICATION", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "This axis is coded as tax. Taxing reduces cast count; it does not counter the spell.",
        "ontologyNote": "COST_MODIFICATION overlaps COST_INCREASE / COST_REDUCTION and should not stay mixed.",
    },
    ("COST_INCREASE", "CARES_ABOUT_RESOLUTION"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "A tax can stop a spell being cast. It does not counter a spell already on the stack.",
        "ontologyNote": "Cast-attempt vs stack-resolution are different dependencies.",
    },
    ("COST_MODIFICATION", "CARES_ABOUT_RESOLUTION"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Same as cost-increase vs resolution: pre-cast tax, not a counter.",
        "ontologyNote": "COST_MODIFICATION is too coarse; resolution is not casting.",
    },
    ("TAP", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Tapping an artifact stops tap-activations for a turn. Weaker and narrower than ARTIFACT_SHUTDOWN.",
    },
    ("BOUNCE", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bounce removes an artifact until recast. Not exile and not a stax lock.",
    },
    ("TAP", "CARES_ABOUT_CREATURES"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Tap-down is soft tempo on a creature board, not a wipe.",
    },
    ("REMOVAL", "CARES_ABOUT_COMMANDER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Generic removal of a commander is destroy/exile tempo. The commander returns to the command zone.",
        "ontologyNote": "REMOVAL overlaps DESTROY and EXILE.",
    },
    ("REMOVAL", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point removal of artifacts attacks the artifact resource. Not mass hate.",
        "ontologyNote": "REMOVAL overlaps DESTROY, EXILE, and ARTIFACT_REMOVAL.",
    },
    ("DESTROY", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying artifacts removes them. They can be recurred from the graveyard.",
    },
    ("ARTIFACT_REMOVAL", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying the artifact removes its activations. Point, not Null Rod.",
    },
    ("DISCARD_CARD", "CARES_ABOUT_DRAWING_CARDS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Discard does not prevent draw triggers from firing.",
    },
    ("DEAL_DAMAGE", "CARES_ABOUT_CREATURES"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Creature-targeted damage attacks a board. Player-targeted damage does not.",
        "ontologyNote": "Need CREATURE_DAMAGE vs PLAYER_DAMAGE poles.",
    },
    ("CREATE_TREASURE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Treasure does not operate on a must-keep creature body.",
    },
    ("TOKEN_ON_ETB", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Making tokens is not an attack on a single-creature plan.",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A sacrifice payoff does not remove or protect a key creature.",
    },
    ("REDIRECT_SPELL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Redirecting removal onto their key creature attacks it; redirecting theirs away is protection. Direction matters.",
        "ontologyNote": "Split CARES_ABOUT_ONE_CREATURE; redirect is not generic stack interaction.",
    },
    ("COPY_SPELL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a spell does not operate on a battlefield creature body.",
    },
    ("TAX_SPELL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Taxing spells does not attack a creature already in play.",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a creature does not remove the original. Not an attack on a must-keep body.",
        "ontologyNote": "Copies vs the original creature should be distinct later.",
    },
    ("COST_MODIFICATION", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Changing spell cost does not operate on a battlefield body.",
    },
    ("COST_INCREASE", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A cast tax does not attack a creature already in play.",
    },
    ("GRAVEYARD_TO_HAND", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Returning a card to hand does not attack a creature on the battlefield.",
    },
    # Batch 5 / v1.5 precision teachers
    ("HAND_ATTACK", "CARES_ABOUT_DRAWING_CARDS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Targeted discard does not stop draw triggers. Wheels empty the hand and also cause draws. The dependency is too coarse.",
        "ontologyNote": "Split CARES_ABOUT_DRAWING_CARDS into DRAW_TRIGGER_DEPENDENCY, HAND_SIZE_DEPENDENCY, CARD_ACCESS_DEPENDENCY, DRAW_VOLUME_DEPENDENCY.",
    },
    ("TAX_SPELL", "CARES_ABOUT_RESOLUTION"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Tax-spell as coded is counter-unless-pays: a soft counter. Weaker than COUNTER_SPELL. They can pay and resolve.",
        "ontologyNote": "TAX_SPELL (counter unless pays) is not COST_INCREASE (spells cost more). Resolution vs cast-attempt.",
    },
    ("CREATE_TOKEN", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Creating tokens is not casting a spell and does not suppress cast-care.",
    },
    ("CAST_TRIGGER", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Cast triggers do not operate on the graveyard resource.",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding to the yard does not create or deny artifacts.",
    },
    ("COST_MODIFICATION", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Changing spell cost does not operate on artifact activations.",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_CASTING_SPELLS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A sacrifice outlet is not a cast or counter mechanic.",
    },
    ("ADD_MANA", "CARES_ABOUT_LIFE_GAIN"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Mana does not cause or suppress life-gain triggers.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Player life loss does not stop lands from entering.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss is not lethal damage to creatures and does not cause dies triggers.",
    },
    ("TAP", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "Tapping an artifact spends or denies its tap-activation for a turn. Weaker than ARTIFACT_SHUTDOWN.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Null Rod does not prevent creatures from dying.",
    },
    ("COST_INCREASE", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A spell tax does not turn off artifact activations already in play.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Shutting off artifact activations does not stop lands from entering.",
    },
    ("BOUNCE", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bounce removes the artifact until recast, so its activations go with it.",
    },
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Graveyard hate does not operate on artifact activations.",
    },
    ("TAP", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tapping a land does not prevent the enter-the-battlefield landfall event.",
    },
    ("EXILE", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Exiling a land from play can stop that land from entering again. It is not a landfall lock.",
        "ontologyNote": "Land destruction / strip vs generic EXILE.",
    },
    ("EXILE", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exile-as-removal often replaces dying, so death triggers do not fire. Destroy-path still dies.",
        "ontologyNote": "Destroy vs exile is a different relation to dies triggers.",
    },
    ("COST_INCREASE", "CARES_ABOUT_TOKENS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Taxing spells does not create or deny tokens.",
    },
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Graveyard denial does not remove a creature already on the battlefield.",
    },
    ("DEAL_DAMAGE", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Damage does not tap or shut off artifact activations unless it kills an artifact creature.",
    },
    ("COUNTER_SPELL", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "A counter stops the artifact entering. It does nothing to activations of artifacts already in play.",
        "ontologyNote": "Cast-the-artifact vs battlefield activations.",
    },
    ("DESTROY", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying the artifact removes its activations. Point removal, not Null Rod.",
    },
    ("DEAL_DAMAGE", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Lethal creature damage both removes a body and can feed the opponent's dies payoffs. Player damage does neither.",
        "ontologyNote": "CREATURE_DAMAGE vs PLAYER_DAMAGE; death-as-cost vs death-as-attack.",
    },
    ("BOUNCE", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Bouncing a land can cause another landfall when it is replayed. It does not deny landfall.",
        "ontologyNote": "Bounce-land engines ENABLE landfall; opponent bounce is tempo.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss does not operate on artifacts.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss does not exile or fill a graveyard.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss is not a dies event.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss does not counter or tax resolution.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Shutting off artifact activations does not prevent dies triggers.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_COMMANDER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Null Rod attacks an artifact commander. It does nothing to a non-artifact commander body.",
        "ontologyNote": "Artifact commanders vs creature commanders.",
    },
    ("LIFE_LOSS", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss does not change hand size.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_TOKENS"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Artifact-token activations (Treasure, Clue) are shut off. Creature tokens are not.",
        "ontologyNote": "Token type (creature vs artifact) is still debt.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ONE_CREATURE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Only if the key permanent is an artifact creature or lives through equipment/activations.",
        "ontologyNote": "ONE_CREATURE still mixes voltron body, equipment, and artifact creatures.",
    },
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Artifact shutdown does not counter spells.",
    },
}


def relate_v11(cap_id: str, other_id: str) -> dict:
    if (cap_id, other_id) in OVERRIDES:
        o = dict(OVERRIDES[(cap_id, other_id)])
        o["mechanism"] = {
            "capability": CAP_MECH.get(cap_id),
            "dependency": DEP_MECH.get(other_id),
            "domainMatch": _domain_rel((CAP_MECH.get(cap_id) or {}).get("domain", ""), (DEP_MECH.get(other_id) or {}).get("domain", "")),
        }
        return o
    # Temporarily use expanded cap cards with v1 engine by monkeypatching lookup
    if cap_id in CAP_MECH and cap_id not in CAP_V1:
        from mechanical_k_v1 import CAP_MECH as live

        live[cap_id] = CAP_MECH[cap_id]
    return relate_v1(cap_id, other_id)


def derive_pressure(decision: dict) -> float | None:
    if decision["relation"] == "CONDITIONAL":
        mech = decision.get("mechanism") or {}
        cap = mech.get("capability") or {}
        from mechanical_k_v1 import persistence_pressure, scope_pressure

        base = 0.5 * scope_pressure(cap.get("scope", "varies")) + 0.5 * persistence_pressure(cap.get("persistence", "varies"))
        return round(float(base * 0.25), 4)  # exists, weak, not a stereotype max
    return derive_pressure_v1(decision)
