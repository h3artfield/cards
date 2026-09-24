"""
K v2 — new causal graph on Ontology v2.2.

Not a migration of 216 cells. Carry-forward is evidence, not a matrix copy.
Most-specific-supported-edge wins. DAMAGE_PLAYER is profile-QA blocked.
"""

from __future__ import annotations

from mechanical_k_eligibility_v15 import CONFLICTING_DIRECTION_CHILDREN, DIRECTIONAL, capability_pressure_gate
from mechanical_k_v11 import CAP_MECH as CAP11
from mechanical_k_v11 import DEP_MECH as DEP11
from mechanical_k_v1 import RES_MECH
from mechanical_ontology_v22 import BY_ID, CONCEPTS

UNSUPPORTED_AXES = frozenset({"COMMANDER_DAMAGE_PLAN", "ARTIFACT_COMMANDER_DEPENDENCY"})

# Parents whose v2.2 children are the precision repair. Edges using these
# endpoints are SPLIT (historical only) unless the other end is also only this parent.
SPLIT_PARENTS = frozenset(
    {
        "DEAL_DAMAGE",
        "CARES_ABOUT_DRAWING_CARDS",
        "CARES_ABOUT_ONE_CREATURE",
        "CARES_ABOUT_COMBAT",
        "CARES_ABOUT_CASTING_SPELLS",
        "CREATE_TOKEN",
        "CARES_ABOUT_TOKENS",
    }
)

PROFILE_QA_BLOCKED = {
    "DAMAGE_PLAYER": "High scores on Light-Paws / Muldrotha / Lumra — teacher too permissive for causal use.",
}

POLARITY_SIBLINGS = (("COST_INCREASE", "COST_REDUCTION"),)

CAP_MECH = {
    **CAP11,
    "DAMAGE_CREATURE": {
        "domain": "creatures",
        "operation": "damage",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"damage to .{0,16}creature", r"\bfight\b"),
    },
    "DAMAGE_PLAYER": {
        "domain": "life",
        "operation": "damage",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"damage to .{0,16}(?:player|opponent)",),
    },
    "COMBAT_DAMAGE_DEALT": {
        "domain": "combat_damage",
        "operation": "damage",
        "scope": "point",
        "persistence": "repeatable",
        "timing": "proactive",
        "textHints": (r"combat damage",),
    },
    "NONCOMBAT_DAMAGE": {
        "domain": "damage",
        "operation": "damage",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"deals? .{0,16}damage to",),
    },
    "CREATE_CREATURE_TOKEN": {
        "domain": "tokens",
        "operation": "create",
        "scope": "varies",
        "persistence": "repeatable",
        "timing": "proactive",
        "textHints": (r"creature token",),
    },
}

DEP_MECH = {
    **DEP11,
    "DRAW_TRIGGER_DEPENDENCY": {"domain": "drawing", "mode": "triggers_from", "textHints": (r"whenever you draw",)},
    "CARD_ACCESS_DEPENDENCY": {"domain": "hand", "mode": "needs_access", "textHints": (r"from your hand", r"cast .{0,20}from your hand")},
    "DRAW_VOLUME_DEPENDENCY": {"domain": "drawing", "mode": "scales_with", "textHints": (r"if you (?:have )?drawn", r"for each card you'?ve drawn")},
    "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD": {"domain": "one_creature", "mode": "requires_board", "textHints": (r"equipped creature", r"enchanted creature")},
    "MUST_ATTACK_WITH_ONE_CREATURE": {"domain": "combat", "mode": "needs_access", "textHints": (r"attacks each combat if able",)},
    "AURA_EQUIPMENT_INVESTMENT": {"domain": "enchantments", "mode": "uses_as_resource", "textHints": (r"\bequip\b", r"enchant creature")},
    "MUST_ATTACK": {"domain": "combat", "mode": "needs_access", "textHints": (r"attacks each combat if able",)},
    "ATTACK_TRIGGER": {"domain": "combat", "mode": "triggers_from", "textHints": (r"whenever .{0,20} attacks",)},
    "CREATURE_COMBAT_DEPENDENCY": {"domain": "combat", "mode": "requires_board", "textHints": (r"attacking creatures? you control",)},
    "CAST_TRIGGER_DEPENDENCY": {"domain": "casting", "mode": "triggers_from", "textHints": (r"whenever you cast", r"prowess")},
    "SPELL_VELOCITY_DEPENDENCY": {"domain": "casting", "mode": "scales_with", "textHints": (r"the first spell you cast", r"spells? you cast this turn")},
    "ARTIFACT_TOKEN_DEPENDENCY": {"domain": "artifact_tokens", "mode": "uses_as_resource", "textHints": (r"treasure token", r"artifact token")},
}

# Mechanical reviews for K v2.1. Not predetermined by v1.5 cells.
V21_REVIEWS = {
    ("HAND_ATTACK", "DRAW_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Discard operates on cards in hand. 'Whenever you draw' still fires on the next draw. Hand attack does not shut off a draw-trigger engine.",
    },
    ("HAND_ATTACK", "CARD_ACCESS_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "If the plan is to play cards from hand, emptying that hand denies access.",
    },
    ("HAND_ATTACK", "DRAW_VOLUME_DEPENDENCY"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Volume-this-turn counts draws already taken. Discard does not unwind those draws; it can only reduce later volume.",
    },
    ("DAMAGE_CREATURE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Lethal damage to the required body removes the permanent the plan must keep.",
    },
    ("EDICT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "An edict forces the singleton body off the battlefield.",
    },
    ("ENCHANTMENT_REMOVAL", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Destroying auras (and many equipment-adjacent enchantments) unwinds the investment. Equipment itself is an artifact — still an attack on the aura half.",
    },
    ("FOG", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A must-attack voltron swing is blanked by prevent-all-combat-damage.",
    },
    ("FOG", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Forced attackers still deal no combat damage through a fog.",
    },
    ("FOG", "ATTACK_TRIGGER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Attack triggers fire on declare, before combat damage. Fog does not rewind the declare step.",
    },
    ("FOG", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A combat-board engine that needs attacking creatures to connect is disrupted. Pure declare-attack payoffs are not.",
    },
    ("COUNTER_SPELL", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Cast triggers (prowess, magecraft) have already fired when the spell is countered.",
    },
    ("TAX_SPELL", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Counter-unless-pays slows how many spells resolve per turn. Soft, not a hard counter.",
    },
    ("COST_INCREASE", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Making each spell cost more reduces cast count / first-spell-this-turn density.",
    },
    ("COST_REDUCTION", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Cheaper spells raise how many you can cast.",
    },
    ("COST_REDUCTION", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "More casts, more cast triggers. Does not help a spell that already needs to resolve.",
    },
    ("ARTIFACT_SHUTDOWN", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Treasures, Clues, Food and other artifact tokens lose activations under Null Rod / Stony Silence.",
    },
    ("DAMAGE_CREATURE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Creature damage is combat-damage only when it is combat damage. Fight / pings are a different channel.",
    },
}

# K v2.2 — child-level active-pressure batch. Not fan-out of parents.
V22_REVIEWS = {
    # 1. Headline leftovers
    ("PROTECTION", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Hexproof, indestructible, and ward do not remove auras or equipment. Protection-from-enchantments is a rare subset and is not this axis.",
        "lane": "headline",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding into a graveyard is not a dies event. Death triggers require a creature to leave the battlefield.",
        "lane": "headline",
    },
    # 2. Combat / one-creature
    ("DESTROY", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Destroying the required body removes the permanent the plan must keep.",
        "lane": "combat",
    },
    ("EXILE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Exiling the required body is a stronger removal of the same dependency.",
        "lane": "combat",
    },
    ("BOUNCE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Returning the body to hand takes it off the battlefield. Temporary, but the plan is interrupted.",
        "lane": "combat",
    },
    ("MASS_CREATURE_REMOVAL", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A creature wipe removes the singleton body unless it has wipe resilience.",
        "lane": "combat",
    },
    ("TAP", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A tapped voltron creature cannot attack.",
        "lane": "combat",
    },
    ("TAP", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Forced attackers that are tapped do not attack.",
        "lane": "combat",
    },
    ("BOUNCE", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Bouncing the attacker removes it from combat.",
        "lane": "combat",
    },
    ("DESTROY", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Removing the creature before declare prevents the attack trigger. After declare the trigger has already fired.",
        "lane": "combat",
    },
    ("EXILE", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Same timing as destroy: exile before declare prevents the trigger.",
        "lane": "combat",
    },
    ("BOUNCE", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bounce before declare prevents the attack. Bounce after declare does not rewind the trigger.",
        "lane": "combat",
    },
    ("TAP", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Tapping before combat can stop the declare. Tapping after declare does not undo the trigger.",
        "lane": "combat",
    },
    ("DESTROY", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A combat-board engine needs attacking creatures. Spot destroy thins that board.",
        "lane": "combat",
    },
    ("EXILE", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Exiling attackers or blockers removes combat bodies.",
        "lane": "combat",
    },
    ("TAP", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tap does not remove the body. It attacks a must-attack plan, not a must-keep plan.",
        "lane": "control",
    },
    ("FOG", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Fog does not remove the creature. It blanks combat damage, not the permanent.",
        "lane": "control",
    },
    ("HASTE_ENABLER", "ATTACK_TRIGGER"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste lets a creature attack the turn it enters, firing attack triggers sooner.",
        "lane": "combat",
    },
    ("EXTRA_COMBAT", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "An extra combat phase repeats attacking-creature payoffs.",
        "lane": "combat",
    },
    # 3. Resolution / velocity — distinguish from CAST_TRIGGER
    ("REDIRECT_SPELL", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Changing targets does not stop a spell from resolving.",
        "lane": "stack",
    },
    ("REDIRECT_SPELL", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Cast triggers have already fired. Redirect is not a counter.",
        "lane": "stack",
    },
    ("REDIRECT_SPELL", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Redirect does not change how many spells a player can cast.",
        "lane": "stack",
    },
    ("TAX_SPELL", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "If they pay, the spell is still cast and the trigger fires. Tax hits velocity/resolution, not the cast event.",
        "lane": "stack",
    },
    ("COST_INCREASE", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A spell that is still cast still triggers prowess/magecraft. Cost increase reduces how many you cast (velocity), not whether a given cast triggers.",
        "lane": "stack",
    },
    ("COPY_SPELL", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A copy is not cast. Velocity counts casts, not copies on the stack.",
        "lane": "stack",
    },
    ("COPY_SPELL", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copies are not cast, so they do not fire cast triggers.",
        "lane": "stack",
    },
    # 4. Artifact-token / activation
    ("ARTIFACT_REMOVAL", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Destroy/exile target artifact removes Treasures, Clues, Food and other artifact tokens.",
        "lane": "artifact",
    },
    ("EXILE", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exile that can hit artifacts removes artifact tokens. Creature-only exile does not.",
        "lane": "artifact",
    },
    ("BOUNCE", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A token that leaves the battlefield ceases to exist. Bounce of an artifact token is removal.",
        "lane": "artifact",
    },
    ("DESTROY", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Destroy-target-creature misses Treasures. Destroy-target-artifact or destroy-permanent hits them. The DESTROY axis mixes both.",
        "lane": "artifact",
    },
    ("CREATE_TREASURE", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Creating Treasures is the resource the dependency uses.",
        "lane": "artifact",
    },
    ("CREATE_CREATURE_TOKEN", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A 1/1 squirrel is not a Treasure. Creature tokens do not feed artifact-token activations.",
        "lane": "control",
    },
    ("ARTIFACT_SHUTDOWN", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Null Rod shuts equipment activations. It does not strip auras.",
        "lane": "artifact",
    },
}

# K v2.3 — challenge-resolution batch. Queue is the leftover tail of the
# most mature pair explanations, not global high-H cells.
V23_REVIEWS = {
    # Mature-pair blockers (set-cover of pairs closest to H<1)
    ("LANDFALL", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A's landfall payoffs do not make B's lands enter and do not stop them from entering.",
        "lane": "headline",
    },
    ("MILL", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling the library is not a land-drop or landfall event.",
        "lane": "headline",
    },
    ("ALTERNATIVE_COST", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Casting without paying mana does not attach or strip auras or equipment.",
        "lane": "headline",
    },
    ("EXILE", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Exiling the enchanted or equipped body, or the aura itself, removes the investment.",
        "lane": "structural",
    },
    ("GRAVEYARD_SETUP", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Filling a graveyard does not attach or remove auras or equipment.",
        "lane": "headline",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "An alternative cost does not create, destroy, or shut off artifacts.",
        "lane": "headline",
    },
    ("ALTERNATIVE_COST", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Paying a different cost does not remove the required body.",
        "lane": "headline",
    },
    ("ALTERNATIVE_COST", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Delve, escape, and convoke are not Treasure or Clue production or hate.",
        "lane": "headline",
    },
    ("LANDFALL", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A land entering does not attack an artifact plan.",
        "lane": "headline",
    },
    ("LANDFALL", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Landfall does not remove or protect a commander.",
        "lane": "headline",
    },
    ("LANDFALL", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Lands entering do not create or destroy artifact tokens.",
        "lane": "headline",
    },
    ("LANDFALL", "DRAW_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Landfall is not a draw event and does not stop 'whenever you draw'.",
        "lane": "headline",
    },
    ("LANDFALL", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "The landfall axis is lands entering, not creature production or removal.",
        "lane": "control",
    },
    ("LANDFALL", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A land entering does not deal or prevent combat damage.",
        "lane": "control",
    },
    ("ANIMATOR", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Animation turns artifacts into attackers. It does not create artifacts.",
        "lane": "structural",
    },
    ("ANIMATOR", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Becoming a creature does not grant or shut off artifact activations.",
        "lane": "structural",
    },
    ("ARTIFACT_PRODUCTION", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Creating artifacts is the resource the dependency uses.",
        "lane": "structural",
    },
    ("ARTIFACT_PRODUCTION", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Making artifacts does not fill, empty, or hate a graveyard.",
        "lane": "headline",
    },
    ("ARTIFACT_PRODUCTION", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Artifact tokens are not landfall events.",
        "lane": "headline",
    },
    ("ARTIFACT_PRODUCTION", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Producing artifacts is how Treasures, Clues, and Food enter.",
        "lane": "structural",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent does not attack an opposing artifact plan.",
        "lane": "headline",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A clone is not graveyard setup or graveyard hate.",
        "lane": "control",
    },
    ("COMBAT_DAMAGE_DEALT", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Combat damage does not destroy or shut off artifacts.",
        "lane": "headline",
    },
    ("COMBAT_DAMAGE_DEALT", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Combat damage is not artifact-token removal.",
        "lane": "headline",
    },
    ("COMBAT_DAMAGE_DEALT", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Dealing combat damage does not tap or silence artifact activations.",
        "lane": "control",
    },
    ("GRAVEYARD_TO_HAND", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Returning a card to hand is not artifact hate or production.",
        "lane": "headline",
    },
    ("GRAVEYARD_TO_HAND", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A card leaving the graveyard to hand does not create or remove a Treasure.",
        "lane": "control",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A self-sac outlet does not prevent the opponent from dealing combat damage.",
        "lane": "headline",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Sacrificing your own creatures is not an attack on theirs.",
        "lane": "headline",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A self-sac outlet does not tap or remove the opponent's required attacker.",
        "lane": "headline",
    },
    ("TAP", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A creature tapped before combat cannot attack and therefore cannot deal combat damage that way.",
        "lane": "structural",
    },
    # Named high-H examples — not on the mature-pair critical path
    ("PUT_COUNTER", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "+1/+1 counters are not auras or equipment and do not strip them.",
        "lane": "headline",
    },
    ("PROTECTION", "CARES_ABOUT_COUNTERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Hexproof and indestructible do not remove counters. Proliferate does not target.",
        "lane": "headline",
    },
    ("GRAVEYARD_SETUP", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding is not casting a spell and does not stop a cast trigger.",
        "lane": "headline",
    },
}

# K v2.4 — mature-tail set-cover. Scheduler picks the question; review is mechanical.
V24_REVIEWS = {
    # TAIL-3-5 complete (5 pairs)
    ("COMBAT_DAMAGE_DEALT", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Lethal combat damage can kill the enchanted or equipped body. Nonlethal combat damage does not strip auras or equipment.",
        "lane": "tail-3-5",
    },
    ("GRAVEYARD_TO_HAND", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Returning a card from graveyard to hand does not attach or remove auras or equipment.",
        "lane": "tail-3-5",
    },
    ("LIFE_LOSS", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Life loss does not interact with auras or equipment.",
        "lane": "tail-3-5",
    },
    ("ANIMATOR", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Turning an artifact into a creature is not graveyard setup or graveyard hate.",
        "lane": "tail-3-5",
    },
    ("LANDFALL", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A land entering does not empty or refill a hand.",
        "lane": "tail-3-5",
    },
    ("LANDFALL", "CARD_ACCESS_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Landfall is not card-draw or discard and does not gate cards in hand.",
        "lane": "tail-3-5",
    },
    ("ARTIFACT_PRODUCTION", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Creating artifacts does not remove, tax, or protect a commander.",
        "lane": "tail-3-5",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent is not a land-drop or landfall event.",
        "lane": "tail-3-5",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "An alternative mana cost does not make lands enter or stop them.",
        "lane": "tail-3-5",
    },
    ("CREATE_TREASURE", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A Treasure is not a land.",
        "lane": "tail-3-5",
    },
    ("GRAVEYARD_SETUP", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding does not create or destroy Treasures, Clues, or Food.",
        "lane": "tail-3-5",
    },
    ("COUNTER_SPELL", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A counterspell stops resolution of a spell. It does not remove artifacts already on the battlefield. That channel is CARES_ABOUT_RESOLUTION.",
        "lane": "tail-3-5",
    },
    ("COUNTER_SPELL", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Existing artifact tokens are not on the stack. Countering a producer is resolution, not token hate.",
        "lane": "tail-3-5",
    },
    ("COPY_PERMANENT", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent does not attack an opposing Treasure or Clue engine.",
        "lane": "tail-3-5",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A clone of your own artifact is same-player enable. It does not shut off the opponent's activations.",
        "lane": "tail-3-5",
    },
    ("SEARCH_LIBRARY", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tutoring does not create or remove artifact tokens.",
        "lane": "tail-3-5",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A self-sac outlet can spend your own Treasures. It does not remove the opponent's artifact tokens.",
        "lane": "tail-3-5",
    },
    ("ANIMATOR", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Animation can turn an artifact token into an attacker. It does not produce or destroy the token.",
        "lane": "tail-3-5",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Filling a graveyard does not put creatures on the battlefield or remove them.",
        "lane": "tail-3-5",
    },
    # TAIL-6: Muldrotha → Lumra
    ("CAST_FROM_GRAVEYARD", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Casting a spell from the graveyard is not a land entering.",
        "lane": "tail-6-10",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_LARGE_HAND"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Self-mill is not drawing into a large hand and is not hand attack.",
        "lane": "tail-6-10",
    },
    ("ANIMATOR", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Animating an artifact is not a landfall event.",
        "lane": "tail-6-10",
    },
    ("GRAVEYARD_SETUP", "ATTACK_TRIGGER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding is not declaring an attacker.",
        "lane": "tail-6-10",
    },
    ("COST_INCREASE", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Taxing spells does not stop lands from entering.",
        "lane": "tail-6-10",
    },
    # TAIL-6-10 Light-Paws → Tivit / Magda shared cluster
    ("PROTECTION", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Hexproof, ward, and indestructible do not remove or shut off artifacts.",
        "lane": "tail-6-10",
    },
    ("PROTECTION", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not prevent tapping an artifact for an activation.",
        "lane": "tail-6-10",
    },
    ("PROTECTION", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not create or destroy artifact tokens.",
        "lane": "tail-6-10",
    },
    ("PROTECTION", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A's protection spells do not protect or remove B's commander.",
        "lane": "tail-6-10",
    },
    ("PROTECTION", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not remove opposing creatures.",
        "lane": "tail-6-10",
    },
    ("FLASH_ENABLER", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Giving a spell flash does not attack an artifact plan.",
        "lane": "tail-6-10",
    },
    ("FLASH_ENABLER", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Flash does not grant or deny artifact activations.",
        "lane": "tail-6-10",
    },
    ("FLASH_ENABLER", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Flash is timing, not Treasure production or hate.",
        "lane": "tail-6-10",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "'When you sacrifice' is a self-payoff. It does not force the opponent to sacrifice artifacts.",
        "lane": "tail-6-10",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A sacrifice payoff does not tap or silence opposing artifacts.",
        "lane": "tail-6-10",
    },
    ("SACRIFICE_PAYOFF", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Valuing your own sacrifices does not remove the opponent's artifact tokens.",
        "lane": "tail-6-10",
    },
}

# K v2.5 — credible-tail + prospective compatibility validation.
# compatibility-screen-v1 is frozen. Do not add aliases from these reviews.
V25_REVIEWS = {
    # Short HIGH/MED credible-tail blockers
    ("CREATE_TREASURE", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Creating Treasures is producing artifacts.",
        "lane": "credible-tail",
    },
    ("CAST_FROM_GRAVEYARD", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Casting from the graveyard spends that zone as a resource.",
        "lane": "credible-tail",
    },
    ("MILL", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Milling fills the graveyard the dependency uses.",
        "lane": "credible-tail",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding is not a dies event.",
        "lane": "credible-tail",
    },
    ("PROTECTION", "ATTACK_TRIGGER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Hexproof, ward, and indestructible do not prevent a creature from being declared as an attacker.",
        "lane": "credible-tail",
    },
    ("UNTAP", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping an artifact lets it be used again. It does not create artifacts.",
        "lane": "credible-tail",
    },
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Exiling a graveyard does not stop a creature from dying on the battlefield.",
        "lane": "credible-tail",
    },
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Death triggers fire from the battlefield. Graveyard hate is a different channel.",
        "lane": "credible-tail",
    },
    ("ALTERNATIVE_COST", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "An alternative cost can increase how many spells you actually cast, so more cast triggers fire.",
        "lane": "credible-tail",
    },
    ("PROTECTION", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Protection from a color or from creatures can prevent that combat damage. Hexproof and indestructible do not.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent does not remove, tax, or protect the opponent's commander.",
        "lane": "credible-tail",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Paying a different cost does not stop a spell from resolving.",
        "lane": "credible-tail",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A dying creature going to the graveyard feeds that resource.",
        "lane": "credible-tail",
    },
    ("BOUNCE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bouncing an attacker before combat prevents its combat damage. Bounce after damage does not rewind it.",
        "lane": "credible-tail",
    },
    ("UNTAP", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Untap helps a token that taps. Treasures are usually sacrificed, not untapped.",
        "lane": "credible-tail",
    },
    ("EXILE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exiling the attacker before combat prevents its combat damage.",
        "lane": "credible-tail",
    },
    ("TAP", "ARTIFACT_TOKEN_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tapping a Treasure does not stop it from being sacrificed. Tap is not token removal.",
        "lane": "credible-tail",
    },
    ("PROTECTION", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not remove attacking or blocking creatures.",
        "lane": "credible-tail",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_SACRIFICE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "The payoff is the sacrifice trigger the dependency wants.",
        "lane": "credible-tail",
    },
    ("REANIMATION", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Reanimation spends a card in the graveyard.",
        "lane": "credible-tail",
    },
    # HIGH-compatible discovery
    ("UNTAP", "CARES_ABOUT_COMMANDER"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping a commander lets it attack or activate again.",
        "lane": "high-discovery",
    },
    ("CAST_FROM_GRAVEYARD", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Casting from the graveyard is not a dies event.",
        "lane": "high-discovery",
    },
    ("CAST_FROM_GRAVEYARD", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A cast from the yard is not a creature dying.",
        "lane": "high-discovery",
    },
    ("MILL", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling a creature card is not that creature dying.",
        "lane": "high-discovery",
    },
    ("MILL", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Library-to-graveyard is not a dies trigger.",
        "lane": "high-discovery",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Valuing deaths does not remove the opponent's creatures.",
        "lane": "high-discovery",
    },
    ("REANIMATION", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Returning a creature to the battlefield puts a body that can die again.",
        "lane": "high-discovery",
    },
    ("BOUNCE", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Bouncing the enchanted or equipped body drops the aura and unequips.",
        "lane": "high-discovery",
    },
    # LOW-compatible controls
    ("ALTERNATIVE_COST", "CARES_ABOUT_COMMANDER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "An alternative mana cost does not interact with the commander.",
        "lane": "low-control",
    },
    ("PROTECTION", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not stop or cause a spell to be cast.",
        "lane": "low-control",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A dies payoff does not create, destroy, or shut off artifacts.",
        "lane": "low-control",
    },
    ("LANDFALL", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A land entering is not casting a spell.",
        "lane": "low-control",
    },
    ("PUT_COUNTER", "CARES_ABOUT_ARTIFACTS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Putting counters does not produce or remove artifacts.",
        "lane": "low-control",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Delve and escape spend the graveyard. Convoke, affinity, and most alternative costs do not.",
        "lane": "low-control",
    },
}

# K v2.6 — credible mid-band tails + hostile-domain diversity.
# compatibility-screen-v1 remains frozen. Do not add aliases from these reviews.
V26_REVIEWS = {
    # Lane 1 — short HIGH/MED tails around Hcred < .75
    ("GRAVEYARD_TO_HAND", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Returning a card from the graveyard spends that zone.",
        "lane": "credible-tail",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "The payoff is the death event the dependency wants.",
        "lane": "credible-tail",
    },
    ("PROTECTION", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Hexproof, ward, and indestructible help the singleton stay.",
        "lane": "credible-tail",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A dies payoff is a death trigger.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "ATTACK_TRIGGER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent is not declaring an attacker.",
        "lane": "credible-tail",
    },
    ("PUT_COUNTER", "CARES_ABOUT_COUNTERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Putting counters is the resource the dependency uses.",
        "lane": "credible-tail",
    },
    ("BOUNCE", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Bouncing a combatant removes it from combat. Bounce after combat does not rewind the attack.",
        "lane": "credible-tail",
    },
    ("REANIMATION", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Returning a creature puts a body that can die again.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A copy is not protection and is not removal of the singleton.",
        "lane": "credible-tail",
    },
    ("PUT_COUNTER", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "+1/+1 and shield counters can keep the singleton alive.",
        "lane": "credible-tail",
    },
    ("DISCARD_CARD", "CARD_ACCESS_DEPENDENCY"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Discarding the card removes the access they needed.",
        "lane": "credible-tail",
    },
    ("EXILE", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exiling the mandatory attacker stops that attack.",
        "lane": "credible-tail",
    },
    ("DISCARD_CARD", "DRAW_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Discarding is not drawing. Same precision split as HAND_ATTACK → DRAW_TRIGGER.",
        "lane": "credible-tail",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A sacrificed creature dies.",
        "lane": "credible-tail",
    },
    ("NONCOMBAT_DAMAGE", "CARES_ABOUT_CREATURES"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Burn can kill creatures. It does not always, and it does not hit every body.",
        "lane": "credible-tail",
    },
    ("EDICT", "ATTACK_TRIGGER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "An edict only stops an attack trigger if they sacrifice that attacker.",
        "lane": "credible-tail",
    },
    # Lane 2 — HIGH-compatible hostile discovery outside GY / artifacts / one-creature
    ("COMBAT_DAMAGE_DEALT", "CARES_ABOUT_CREATURES"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Combat damage can kill creatures. Unblocked damage to the player does not.",
        "lane": "hostile-discovery",
    },
    ("COMBAT_DAMAGE_DEALT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Lethal combat damage removes the singleton.",
        "lane": "hostile-discovery",
    },
    ("COMBAT_DAMAGE_DEALT", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Dealing combat damage is the event that dependency wants.",
        "lane": "hostile-discovery",
    },
    ("COST_INCREASE", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A static cost increase makes each extra spell in the chain more expensive.",
        "lane": "hostile-discovery",
    },
    ("TAX_SPELL", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Paying into a tax for every spell in a chain slows or breaks it.",
        "lane": "hostile-discovery",
    },
    ("DESTROY", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Destroying the enchanted or equipped body drops the aura and unequips.",
        "lane": "hostile-discovery",
    },
    ("TAP", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tapping the creature does not drop auras or unequip.",
        "lane": "hostile-discovery",
    },
    ("TAP", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A tapped creature cannot attack. Tap after attackers are declared does not rewind combat.",
        "lane": "hostile-discovery",
    },
    ("EDICT", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "An edict forces a creature to die.",
        "lane": "hostile-discovery",
    },
    ("EDICT", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "They can sacrifice an attacker. They can also sacrifice a different creature and still deal combat damage.",
        "lane": "hostile-discovery",
    },
    ("DESTROY", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying the attacker before combat prevents its combat damage.",
        "lane": "hostile-discovery",
    },
    ("EXILE", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Exiling a creature that must attack stops that attack.",
        "lane": "hostile-discovery",
    },
    # Lane 3 — LOW-compatible controls
    ("PROTECTION", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not start or stop a land entering.",
        "lane": "low-control",
    },
    ("SEARCH_LIBRARY", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Tutoring is not casting the found card.",
        "lane": "low-control",
    },
    ("GRAVEYARD_SETUP", "CARES_ABOUT_COUNTERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Milling or discarding does not put counters.",
        "lane": "low-control",
    },
    ("ARTIFACT_PRODUCTION", "CAST_TRIGGER_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Creating an artifact is not casting a spell.",
        "lane": "low-control",
    },
    ("PROTECTION", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Hexproof and indestructible do not create or force dies events.",
        "lane": "low-control",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_LANDS_ENTERING"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A dies payoff does not put lands onto the battlefield.",
        "lane": "low-control",
    },
}

# K v2.7 — causal maturity. Screen frozen. Not a diversity batch.
V27_REVIEWS = {
    # Lane 1 — short HIGH/MED credible tails around Hcred < 1
    ("GRAVEYARD_TO_HAND", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Returning a card from the graveyard to hand is not a dies event.",
        "lane": "credible-tail",
    },
    ("GRAVEYARD_TO_HAND", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Graveyard-to-hand is not a creature dying.",
        "lane": "credible-tail",
    },
    ("SACRIFICE_PAYOFF", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A sacrificed creature dies, so death triggers fire.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent does not remove or feed the opponent's creatures.",
        "lane": "credible-tail",
    },
    ("COST_REDUCTION", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Paying less does not stop a spell from resolving.",
        "lane": "credible-tail",
    },
    ("EDICT", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "An edict forces a creature to die.",
        "lane": "credible-tail",
    },
    ("ALTERNATIVE_COST", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Cheaper alternative costs can let more spells be cast in the same chain.",
        "lane": "credible-tail",
    },
    ("COMBAT_DAMAGE_DEALT", "ATTACK_TRIGGER"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Dealing combat damage is not declaring an attacker.",
        "lane": "credible-tail",
    },
    ("UNTAP", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Untapping does not prevent the singleton from being removed.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A copy does not attach, detach, or destroy auras and equipment.",
        "lane": "credible-tail",
    },
    ("COPY_PERMANENT", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent is not combat damage.",
        "lane": "credible-tail",
    },
    ("HASTE_ENABLER", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Haste does not keep the singleton on the battlefield.",
        "lane": "credible-tail",
    },
    ("DEATH_PAYOFF", "CARES_ABOUT_SACRIFICE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "A sacrificed creature dies. A death payoff is not itself a sacrifice outlet.",
        "lane": "credible-tail",
    },
    ("BOARD_WIPE", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A wipe puts many creatures into the graveyard as they die.",
        "lane": "credible-tail",
    },
    ("BOARD_WIPE", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Creatures dying to a wipe fire death triggers.",
        "lane": "credible-tail",
    },
    ("ALTERNATIVE_COST", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "An alternative cost can increase how many spells you cast.",
        "lane": "credible-tail",
    },
    ("COPY_SPELL", "CARES_ABOUT_RESOLUTION"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a spell does not prevent the original from resolving.",
        "lane": "credible-tail",
    },
    ("UNTAP", "ATTACK_TRIGGER"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping a creature can let it attack again and fire another attack trigger.",
        "lane": "credible-tail",
    },
    ("EDICT", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "They can sacrifice a combatant. They can also sacrifice a different creature and keep attacking.",
        "lane": "credible-tail",
    },
    ("UNTAP", "CARES_ABOUT_CREATURES"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping a creature lets it attack or tap again.",
        "lane": "credible-tail",
    },
    ("UNTAP", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Untapping the body does not attach or remove auras and equipment.",
        "lane": "credible-tail",
    },
    ("PROTECTION", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not create or lift a must-attack restriction.",
        "lane": "credible-tail",
    },
    ("UNTAP", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping can let a creature deal combat damage again.",
        "lane": "credible-tail",
    },
    ("BOARD_WIPE", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A wipe before combat removes the attackers that would trigger. After attackers are declared it may be too late.",
        "lane": "credible-tail",
    },
    # Lane 2 — coverage assurance: creatures + combat capability
    ("HASTE_ENABLER", "CARES_ABOUT_CREATURES"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste lets creatures attack the turn they enter.",
        "lane": "coverage-assurance",
    },
    ("HASTE_ENABLER", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste lets a creature deal combat damage immediately.",
        "lane": "coverage-assurance",
    },
    ("HASTE_ENABLER", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste is how a newly entered creature joins combat.",
        "lane": "coverage-assurance",
    },
    ("EXTRA_COMBAT", "CARES_ABOUT_CREATURES"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "An extra combat lets creatures attack again. It does not create creatures.",
        "lane": "coverage-assurance",
    },
    ("EXTRA_COMBAT", "ATTACK_TRIGGER"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A second combat can fire attack triggers again.",
        "lane": "coverage-assurance",
    },
    ("EXTRA_COMBAT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "An extra combat phase does not keep the singleton alive.",
        "lane": "coverage-assurance",
    },
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Mass creature removal causes those creatures to die.",
        "lane": "coverage-assurance",
    },
    ("BOARD_WIPE", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A wipe removes the creatures a combat plan needs.",
        "lane": "coverage-assurance",
    },
    # Lane 3 — tiny LOW control
    ("CREATE_TREASURE", "CARES_ABOUT_GRAVEYARD"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Creating a Treasure does not fill or empty a graveyard.",
        "lane": "low-control",
    },
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_LIFE_GAIN"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A sacrifice outlet does not gain life.",
        "lane": "low-control",
    },
    ("CREATE_TREASURE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A Treasure is not combat damage.",
        "lane": "low-control",
    },
}

# Old v1 coarse cell → v2 child cells. Used for causal-resolution gain.
CAUSAL_RESOLUTION_FAMILIES = [
    {
        "id": "hand_attack_drawing",
        "coarse": ("HAND_ATTACK", "CARES_ABOUT_DRAWING_CARDS"),
        "children": [
            ("HAND_ATTACK", "DRAW_TRIGGER_DEPENDENCY"),
            ("HAND_ATTACK", "CARD_ACCESS_DEPENDENCY"),
            ("HAND_ATTACK", "DRAW_VOLUME_DEPENDENCY"),
        ],
    },
    {
        "id": "edict_one_creature",
        "coarse": ("EDICT", "CARES_ABOUT_ONE_CREATURE"),
        "children": [
            ("EDICT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
        ],
    },
    {
        "id": "fog_combat",
        "coarse": ("FOG", "CARES_ABOUT_COMBAT"),
        "children": [
            ("FOG", "MUST_ATTACK"),
            ("FOG", "MUST_ATTACK_WITH_ONE_CREATURE"),
            ("FOG", "ATTACK_TRIGGER"),
            ("FOG", "CREATURE_COMBAT_DEPENDENCY"),
            ("FOG", "CARES_ABOUT_COMBAT_DAMAGE"),
            ("FOG", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
        ],
    },
    {
        "id": "counter_casting",
        "coarse": ("COUNTER_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
        "children": [
            ("COUNTER_SPELL", "CAST_TRIGGER_DEPENDENCY"),
            ("COUNTER_SPELL", "CARES_ABOUT_RESOLUTION"),
            ("COUNTER_SPELL", "CARES_ABOUT_SPELL_CHAIN"),
        ],
    },
    {
        "id": "cost_increase_casting",
        "coarse": ("COST_INCREASE", "CARES_ABOUT_CASTING_SPELLS"),
        "children": [
            ("COST_INCREASE", "SPELL_VELOCITY_DEPENDENCY"),
            ("COST_INCREASE", "CAST_TRIGGER_DEPENDENCY"),
            ("COST_INCREASE", "CARES_ABOUT_RESOLUTION"),
        ],
    },
    {
        "id": "tax_casting",
        "coarse": ("TAX_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
        "children": [
            ("TAX_SPELL", "SPELL_VELOCITY_DEPENDENCY"),
            ("TAX_SPELL", "CAST_TRIGGER_DEPENDENCY"),
            ("TAX_SPELL", "CARES_ABOUT_RESOLUTION"),
        ],
    },
    {
        "id": "artifact_shutdown_tokens",
        "coarse": ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_TOKENS"),
        "children": [
            ("ARTIFACT_SHUTDOWN", "ARTIFACT_TOKEN_DEPENDENCY"),
        ],
    },
    {
        "id": "destroy_one_creature",
        "coarse": ("DESTROY", "CARES_ABOUT_ONE_CREATURE"),
        "children": [
            ("DESTROY", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
            ("DESTROY", "ATTACK_TRIGGER"),
            ("DESTROY", "CREATURE_COMBAT_DEPENDENCY"),
        ],
    },
    {
        "id": "bounce_one_creature",
        "coarse": ("BOUNCE", "CARES_ABOUT_ONE_CREATURE"),
        "children": [
            ("BOUNCE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
            ("BOUNCE", "MUST_ATTACK_WITH_ONE_CREATURE"),
            ("BOUNCE", "ATTACK_TRIGGER"),
        ],
    },
    {
        "id": "tap_one_creature",
        "coarse": ("TAP", "CARES_ABOUT_ONE_CREATURE"),
        "children": [
            ("TAP", "MUST_ATTACK_WITH_ONE_CREATURE"),
            ("TAP", "MUST_ATTACK"),
            ("TAP", "ATTACK_TRIGGER"),
            ("TAP", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
        ],
    },
]


def parent_of(axis_id: str) -> str | None:
    return (BY_ID.get(axis_id) or {}).get("parent")


def is_ancestor(anc: str, node: str) -> bool:
    cur, seen = node, set()
    while cur and cur not in seen:
        if cur == anc:
            return True
        seen.add(cur)
        cur = parent_of(cur)
    return False


def trained_children(parent: str, trained: set[str]) -> list[str]:
    return [c["id"] for c in CONCEPTS if c.get("parent") == parent and c["id"] in trained]


def classify_v15_edge(cap: str, target: str, trained: set[str]) -> str:
    if cap in UNSUPPORTED_AXES or target in UNSUPPORTED_AXES:
        return "UNSUPPORTED_ENDPOINT"
    if cap not in trained or target not in trained:
        return "UNSUPPORTED_ENDPOINT"
    if cap in SPLIT_PARENTS or target in SPLIT_PARENTS:
        return "SPLIT_ENDPOINT"
    return "UNCHANGED_ENDPOINTS"


def axis_reliability(row: dict) -> float:
    hn = (row.get("hardNegative") or {}).get("auroc")
    cls = row.get("directionClass")
    mmap = (row.get("holdout") or {}).get("mAP") or 0
    if cls == "PURE" and hn is not None:
        return float(0.45 + 0.55 * hn)
    if cls == "PURE":
        return float(0.55 + 0.3 * min(mmap, 1))
    if cls == "BROAD_FAMILY":
        return 0.55
    if cls == "UNDERDEFINED":
        return 0.28
    return 0.4


def ontology_gate(cap_id: str, by_axis: dict) -> dict:
    row = by_axis.get(cap_id) or {}
    if cap_id in SPLIT_PARENTS or row.get("role") == "broad":
        return {
            "eligible": False,
            "reason": "BROAD_OR_SPLIT_PARENT",
            "directionClass": row.get("directionClass"),
            "role": row.get("role"),
        }
    return capability_pressure_gate(cap_id, by_axis)


def profile_qa_gate(cap_id: str) -> dict:
    if cap_id in PROFILE_QA_BLOCKED:
        return {"eligible": False, "reason": "PROFILE_QA_BLOCKED", "note": PROFILE_QA_BLOCKED[cap_id]}
    return {"eligible": True, "reason": "PROFILE_QA_OK"}


def polarity_blocked_caps(axes: dict) -> set[str]:
    blocked = set()
    for a, b in POLARITY_SIBLINGS:
        ra = (axes.get("capability") or {}).get(a)
        rb = (axes.get("capability") or {}).get(b)
        if not ra or not rb:
            continue
        if ra["prominence"] >= 0.40 and rb["prominence"] >= 0.40 and ra["density"] >= 0.08 and rb["density"] >= 0.08:
            blocked.add(a)
            blocked.add(b)
    return blocked


def k_pressure_eligible(edge: dict, by_axis: dict) -> dict:
    rel = edge.get("relation")
    if rel == "MITIGATED_BY":
        return {"eligible": True, "reason": "damper"}
    if rel not in DIRECTIONAL:
        return {"eligible": False, "reason": "not_directional"}
    if edge.get("kClass") in {"SPLIT_ENDPOINT", "RETIRED_BROAD", "UNSUPPORTED_ENDPOINT", "HISTORICAL_ONLY"}:
        return {"eligible": False, "reason": edge.get("kClass")}
    if edge.get("hierarchyDominated"):
        return {"eligible": False, "reason": "PARENT_DOMINATED_BY_CHILD"}
    og = ontology_gate(edge.get("capability") or "", by_axis)
    if not og["eligible"]:
        return {"eligible": False, "reason": og["reason"], "ontology": og}
    pq = profile_qa_gate(edge.get("capability") or "")
    if not pq["eligible"]:
        return {"eligible": False, "reason": pq["reason"], "profileQA": pq}
    return {"eligible": True, "reason": "ONTOLOGY_AND_PROFILE_QA"}


# K v3.0 — Expansion Prospective Closure.
# Exactly the 53 HIGH/MED cells frozen in Phase 3 before adjudication.
# Labels are mechanical. Exposure, coverage, H, Pressure, and cycles did not choose them.
V3_REVIEWS = {
    ("COPY_PERMANENT", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent does not add or remove the opponent's combat bodies.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("REDIRECT_SPELL", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Changing targets does not add a spell to the chain or stop it from being cast.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COST_REDUCTION", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Cheaper spells make it easier to cast more spells in the same chain.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("EXTRA_COMBAT", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A second combat phase is another window to deal combat damage.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("UNTAP", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping a creature can let it attack. Untap after it has already attacked does not create a new combat by itself.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COMBAT_DAMAGE_DEALT", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Combat damage can kill opposing combatants. Unblocked damage to a player does not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("PROTECTION", "MUST_ATTACK"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Protection does not create or lift a must-attack restriction.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COPY_PERMANENT", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "A copy does not force the singleton to attack and does not remove it.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("CREATE_CREATURE_TOKEN", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Your tokens are not the opponent's creatures. Creating them does not feed or strip their creature plan.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COPY_PERMANENT", "MUST_ATTACK"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a permanent is not declaring an attacker and is not removal of a forced attacker.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("FOG", "CARES_ABOUT_CREATURES"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Preventing combat damage does not remove creatures.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COPY_SPELL", "CARES_ABOUT_SPELL_CHAIN"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Copying a spell does not add a spell to the opponent's chain or stop them from chaining.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("NONCOMBAT_DAMAGE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Noncombat damage is not combat damage. Fight and pings do not satisfy a combat-damage dependency.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("BOARD_WIPE", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A wipe before combat removes the attackers that would deal combat damage.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("PROLIFERATE", "CARES_ABOUT_COUNTERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Proliferate adds counters to permanents that already have them.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("UNTAP", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping the singleton can let it attack when it otherwise could not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("HASTE_ENABLER", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste lets the required attacker swing the turn it enters.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COMBAT_DAMAGE_DEALT", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Lethal combat damage can kill the singleton attacker. Unblocked damage to a player does not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("HASTE_ENABLER", "MUST_ATTACK"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Haste lets a creature that must attack do so the turn it enters.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("UNTAP", "MUST_ATTACK"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Untapping a forced attacker can let it attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("EDICT", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "They may have to sacrifice the singleton attacker. They can also sacrifice a different creature.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COMBAT_DAMAGE_DEALT", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Combat damage can kill a creature that must attack. Damage to the player does not stop the attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("PROLIFERATE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Proliferating +1/+1 or shield counters can keep the singleton alive. It does nothing if that body has no counters.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("BOUNCE", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Returning a forced attacker to hand removes it from combat.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_COMBAT_DAMAGE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Wiping creatures before combat removes the attackers that would deal combat damage.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("NONCOMBAT_DAMAGE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Lethal burn removes the singleton. Nonlethal pings do not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DISCARD_CARD", "DRAW_VOLUME_DEPENDENCY"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Discarding is not drawing and does not stop future draws.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("NONCOMBAT_DAMAGE", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Burn can kill combatants. It does not always, and it does not hit every body.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("EDICT", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "high",
        "reason": "They can sacrifice a forced attacker. They can also sacrifice a different creature and still attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("BOARD_WIPE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A wipe removes the singleton body unless it has wipe resilience.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("FOG", "AURA_EQUIPMENT_INVESTMENT"): {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "Preventing combat damage does not attach, detach, or destroy auras and equipment.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("EXTRA_COMBAT", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "A second combat lets the required attacker swing again.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DAMAGE_CREATURE", "CARES_ABOUT_CREATURES"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point creature damage can kill a body. It does not hit the whole creature plan.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "Mass creature removal causes those creatures to die, so death triggers fire.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("NONCOMBAT_DAMAGE", "ATTACK_TRIGGER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "A ping only stops an attack trigger if it kills that creature before attackers are declared.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DESTROY", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Destroying the required attacker stops that attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DESTROY", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Destroying a creature that must attack stops that attack. Other forced attackers may remain.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("EXTRA_COMBAT", "MUST_ATTACK"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "low",
        "reason": "An extra combat is another attack for creatures that must attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("MASS_CREATURE_REMOVAL", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A creature wipe removes the bodies a combat plan needs.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("COUNTER_SPELL", "SPELL_VELOCITY_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Countering a spell removes it from the resolved sequence and cuts cast/resolve count.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DAMAGE_CREATURE", "CARES_ABOUT_CREATURE_DEATH"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Lethal creature damage is a dies event. Nonlethal damage is not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("NONCOMBAT_DAMAGE", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Lethal burn can kill the singleton attacker. A small ping does not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("MASS_CREATURE_REMOVAL", "ATTACK_TRIGGER"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "A wipe before combat removes the attackers that would trigger. After declare it may be too late.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DAMAGE_CREATURE", "CARES_ABOUT_DEATH_TRIGGERS"): {
        "relation": "ENABLES",
        "status": "SUPPORTED_BENEFIT",
        "conditionality": "medium",
        "reason": "Lethal creature damage causes a dies event. Nonlethal damage does not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("BOARD_WIPE", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A wipe removes the singleton attacker unless it has wipe resilience.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("NONCOMBAT_DAMAGE", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Burn can kill a forced attacker. It need not hit that creature.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("BOARD_WIPE", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A wipe removes the creatures that would be forced to attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("DAMAGE_CREATURE", "CREATURE_COMBAT_DEPENDENCY"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point damage can kill a combatant. It does not clear the combat board.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("MASS_CREATURE_REMOVAL", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "A creature wipe removes the singleton attacker unless it has wipe resilience.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("DAMAGE_CREATURE", "ATTACK_TRIGGER"): {
        "relation": "CONDITIONAL",
        "status": "CONDITIONAL_RELATION",
        "conditionality": "high",
        "reason": "Creature damage only stops an attack trigger if it kills that creature before attackers are declared.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("MASS_CREATURE_REMOVAL", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "low",
        "reason": "Wiping creatures removes the bodies that would be forced to attack.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
    ("DAMAGE_CREATURE", "MUST_ATTACK_WITH_ONE_CREATURE"): {
        "relation": "ATTACKS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Lethal point damage can kill the required attacker. Nonlethal damage does not.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "ANCHOR_ACTIVE_UNKNOWN",
    },
    ("DAMAGE_CREATURE", "MUST_ATTACK"): {
        "relation": "DISRUPTS",
        "status": "SUPPORTED_ATTACK",
        "conditionality": "medium",
        "reason": "Point damage can kill a forced attacker. It need not hit that creature.",
        "lane": "expansion-prospective-closure",
        "preReviewStratum": "AMPLIFIED_RELATION",
    },
}


def mark_hierarchy_dominance(edges: list[dict]) -> list[dict]:
    """Most-specific-supported-edge wins. Parents stay for provenance, not duplicate pressure."""
    directional = {(e["capability"], e["target"]) for e in edges if e.get("relation") in DIRECTIONAL}
    out = []
    for e in edges:
        c, d = e["capability"], e["target"]
        dominated = False
        reasons = []
        if e.get("relation") in DIRECTIONAL:
            for c2, d2 in directional:
                if (c2, d2) == (c, d):
                    continue
                if c2 == c and is_ancestor(d, d2):
                    dominated = True
                    reasons.append(f"child target {c}→{d2}")
                if d2 == d and is_ancestor(c, c2):
                    dominated = True
                    reasons.append(f"child capability {c2}→{d}")
        rec = dict(e)
        rec["hierarchyDominated"] = dominated
        if reasons:
            rec["hierarchyDominatedBy"] = reasons
        out.append(rec)
    return out


def carry_forward_fields(old: dict) -> dict:
    keep = (
        "relation",
        "status",
        "conditionality",
        "reason",
        "mechanism",
        "q_relationConfidence",
        "p_mechanicalPressure",
        "populationEvidence",
        "topCapabilityExemplars",
        "topTargetExemplars",
        "ontologyNote",
        "targetKind",
        "reviewBucket",
    )
    return {k: old.get(k) for k in keep}
