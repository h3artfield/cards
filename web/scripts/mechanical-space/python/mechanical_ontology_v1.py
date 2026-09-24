"""Canonical mechanical concepts and teacher mappings. Not a product ontology."""

from __future__ import annotations

import re

PRIMITIVE_ACTION_FEATURES = [
    "add_mana",
    "draw",
    "put_into_hand",
    "discard",
    "search_library",
    "deal_damage",
    "destroy",
    "exile",
    "counter",
    "return_to_hand",
    "return_to_battlefield",
    "create_token",
    "cast",
    "play",
    "put_onto_battlefield",
    "copy",
    "sacrifice",
    "mill",
    "gain_life",
    "lose_life",
    "scry",
    "surveil",
    "tap",
    "untap",
    "put_counter",
    "shuffle_library",
    "shuffle_into_library",
]

ABILITY_STRUCTURE_FEATURES = [
    "ability_static",
    "ability_activated",
    "ability_triggered",
    "ability_spell_effect",
    "ability_replacement",
    "ability_loyalty",
    "ability_saga",
    "ability_modal",
]

SEMANTIC_STRUCTURE_FEATURES = [
    "semantic_source_card",
    "semantic_granted_object",
    "semantic_created_object",
    "semantic_granted_ability",
    "semantic_token_definition",
    "semantic_optional",
    "semantic_conditional",
    "semantic_replacement_consequence",
    "semantic_immediate_execution",
    "semantic_persistent_permission",
]

ZONE_FEATURES = [
    "zone_hand",
    "zone_library",
    "zone_battlefield",
    "zone_graveyard",
    "zone_exile",
    "zone_stack",
]

ZONE_FLOW_FEATURES = [
    "flow_graveyard_to_battlefield",
    "flow_graveyard_to_hand",
    "flow_exile_to_battlefield",
    "flow_exile_to_hand",
    "flow_hand_to_battlefield",
    "flow_library_to_hand",
    "flow_battlefield_to_graveyard",
    "flow_battlefield_to_exile",
    "flow_battlefield_to_hand",
    "flow_stack_to_battlefield",
]

OBJECT_TYPE_FEATURES = [
    "obj_creature",
    "obj_artifact",
    "obj_enchantment",
    "obj_instant",
    "obj_sorcery",
    "obj_planeswalker",
    "obj_land",
    "obj_token",
    "obj_spell",
    "obj_permanent",
    "obj_battle",
    "obj_kindred",
]

METADATA_FEATURES = [
    "meta_color_W",
    "meta_color_U",
    "meta_color_B",
    "meta_color_R",
    "meta_color_G",
    "meta_colorless",
    "meta_multicolor",
    "meta_mana_value_norm",
    "meta_commander_eligible",
    "meta_power_norm",
    "meta_toughness_norm",
    "meta_layout_normal",
    "meta_layout_transform",
    "meta_layout_modal_dfc",
    "meta_layout_split",
    "meta_layout_adventure",
    "meta_layout_other",
]

FEATURE_NAMES = (
    PRIMITIVE_ACTION_FEATURES
    + ABILITY_STRUCTURE_FEATURES
    + SEMANTIC_STRUCTURE_FEATURES
    + ZONE_FEATURES
    + ZONE_FLOW_FEATURES
    + OBJECT_TYPE_FEATURES
    + METADATA_FEATURES
)

DERIVED_ROLE_NAMES = [
    "removal",
    "board_interaction",
    "card_draw",
    "card_advantage",
    "ramp",
    "mana_generation",
    "recursion",
    "reanimation",
    "token_generation",
    "sacrifice_outlet",
    "sacrifice_payoff",
    "blink_flicker",
    "graveyard_setup",
    "cast_from_exile",
    "spell_copying",
    "countermagic",
    "counter_synergy",
    "combat_manipulation",
    "life_gain",
    "life_loss",
    "mill",
    "tutor",
    "protection",
    "board_wipe",
    "cost_reduction",
    "copy_effects",
    "combat_payoff",
]

# Snapshot is 117-d = 90 literal + 27 derived. If taxonomy later grew, fail closed.
if len(FEATURE_NAMES) != 90 or len(DERIVED_ROLE_NAMES) != 27:
    raise RuntimeError(
        f"RC8 layout drift: literal {len(FEATURE_NAMES)} derived {len(DERIVED_ROLE_NAMES)} (expected 90+27)"
    )


def rc8_index(name: str) -> int:
    if name in FEATURE_NAMES:
        return FEATURE_NAMES.index(name)
    if name in DERIVED_ROLE_NAMES:
        return 90 + DERIVED_ROLE_NAMES.index(name)
    raise KeyError(name)


def _lit(*names: str, lo: float = 0.01) -> list[tuple[int, float]]:
    return [(rc8_index(n), lo) for n in names]


def _der(*names: str, lo: float = 0.99) -> list[tuple[int, float]]:
    return [(rc8_index(n), lo) for n in names]


# Canonical mechanical vocabulary. Spellbook names are mapped by regex; RC8 by parser dims;
# oracle text by high-precision phrases only.
CONCEPTS: list[dict] = [
    {
        "id": "CREATE_TOKEN",
        "family": "tokens",
        "spellbook": [r"create.*token", r"etb: create", r"token\(s\)", r"doubler - tokens"],
        "rc8": _lit("create_token") + _der("token_generation"),
        "oracle": [r"create[s]?\s+(?:a |one |two |three |x |that many )?.{0,40}token"],
    },
    {
        "id": "CREATE_TREASURE",
        "family": "tokens",
        "spellbook": [r"treasure"],
        "rc8": [],
        "oracle": [r"treasure token"],
    },
    {
        "id": "DRAW_CARD",
        "family": "card_advantage",
        "spellbook": [r"draw a card", r"draw cards", r"whenever you draw", r"etb, draw"],
        "rc8": _lit("draw") + _der("card_draw"),
        "oracle": [r"draw (?:a card|cards|x cards|that many cards)"],
    },
    {
        "id": "DISCARD_CARD",
        "family": "hand",
        "spellbook": [r"discard"],
        "rc8": _lit("discard"),
        "oracle": [r"discard (?:a card|cards|x cards|your hand)"],
    },
    {
        "id": "MILL",
        "family": "graveyard",
        "spellbook": [r"\bmill\b", r"mills "],
        "rc8": _lit("mill") + _der("mill"),
        "oracle": [r"\bmills?\b"],
    },
    {
        "id": "SACRIFICE",
        "family": "sacrifice",
        "spellbook": [r"sacrifice"],
        "rc8": _lit("sacrifice"),
        "oracle": [r"sacrifice (?:a |another |this |target |x |any number)"],
    },
    {
        "id": "SACRIFICE_OUTLET",
        "family": "sacrifice",
        "spellbook": [r"sacrifice outlet", r"can sacrifice itself", r"free sacrifice"],
        "rc8": _der("sacrifice_outlet"),
        "oracle": [r"sacrifice (?:a |another )?creature:?", r"sacrifice this (?:creature|permanent)"],
    },
    {
        "id": "SACRIFICE_PAYOFF",
        "family": "sacrifice",
        "spellbook": [r"whenever you sacrifice", r"sacrifice payoff", r"blood artist"],
        "rc8": _der("sacrifice_payoff"),
        "oracle": [r"whenever (?:you |a player )?sacrifices?"],
    },
    {
        "id": "DEATH_PAYOFF",
        "family": "sacrifice",
        "spellbook": [r"dies", r"ltb/death", r"creature ltb", r"whenever .* dies"],
        "rc8": [],
        "oracle": [r"whenever (?:a |another )?creature (?:you control )?dies", r"when this creature dies"],
    },
    {
        "id": "ETB_TRIGGER",
        "family": "triggers",
        "spellbook": [r"\betb\b", r"when .* enters", r"enters the battlefield"],
        "rc8": [],
        "oracle": [r"when (?:this |~ |.* )?enters(?! the battlefield tapped)"],
    },
    {
        "id": "CAST_TRIGGER",
        "family": "triggers",
        "spellbook": [r"when you cast", r"whenever you cast", r"cast a spell, create"],
        "rc8": [],
        "oracle": [r"whenever you cast (?:a |your first )"],
    },
    {
        "id": "COPY",
        "family": "copy",
        "spellbook": [r"\bcopy\b", r"copies of", r"clone"],
        "rc8": _lit("copy") + _der("spell_copying", "copy_effects"),
        "oracle": [r"copy (?:target |that |it |a )", r"create a token that's a copy"],
    },
    {
        "id": "COUNTER_SPELL",
        "family": "stack",
        "spellbook": [r"counter target spell", r"countermagic", r"counter a spell"],
        "rc8": _lit("counter") + _der("countermagic"),
        "oracle": [r"counter target (?:spell|activated ability|triggered ability)"],
    },
    {
        "id": "UNTAP",
        "family": "resources",
        "spellbook": [r"\buntap\b"],
        "rc8": _lit("untap"),
        "oracle": [r"untap (?:target |that |all |each |this )"],
    },
    {
        "id": "TAP",
        "family": "resources",
        "spellbook": [r"\btap\b", r"taps for", r"taps to"],
        "rc8": _lit("tap"),
        "oracle": [r"tap target", r"\{t\}:"],
    },
    {
        "id": "ADD_MANA",
        "family": "mana",
        "spellbook": [r"add(?:ing)? mana", r"taps (?:to add|for 2)", r"mana rock", r"loyalty ability adding mana"],
        "rc8": _lit("add_mana") + _der("mana_generation", "ramp"),
        "oracle": [r"add (?:\{|one mana|two mana|x mana|an amount)"],
    },
    {
        "id": "COST_REDUCTION",
        "family": "mana",
        "spellbook": [r"cost reducer", r"costs? .* less", r"reduce"],
        "rc8": _der("cost_reduction"),
        "oracle": [r"cost[s]? \{?\d*\}? less", r"spells? you cast cost"],
    },
    {
        "id": "GRAVEYARD_TO_HAND",
        "family": "recursion",
        "spellbook": [r"return card from gy to hand", r"graveyard to (?:your )?hand"],
        "rc8": _lit("flow_graveyard_to_hand"),
        "oracle": [r"return .* from (?:your |a )?graveyard to (?:your |its owner'?s )?hand"],
    },
    {
        "id": "REANIMATION",
        "family": "recursion",
        "spellbook": [r"graveyard to battlefield", r"return card from graveyard to battlefield", r"reanimat"],
        "rc8": _lit("flow_graveyard_to_battlefield") + _der("reanimation"),
        "oracle": [r"return .* from .*graveyard.*(?:onto|to) the battlefield"],
    },
    {
        "id": "RECURSION",
        "family": "recursion",
        "spellbook": [r"recursion", r"from your graveyard"],
        "rc8": _der("recursion"),
        "oracle": [r"from (?:your |a )?graveyard"],
    },
    {
        "id": "CAST_FROM_GRAVEYARD",
        "family": "recursion",
        "spellbook": [r"cast .* from .*graveyard", r"flashback", r"unearth", r"escape"],
        "rc8": [],
        "oracle": [r"you may (?:cast|play) .* from (?:your )?graveyard", r"flashback", r"\bunearth\b", r"\bescape\b"],
    },
    {
        "id": "CAST_FROM_EXILE",
        "family": "exile",
        "spellbook": [r"cast .* from exile", r"impulse", r"play .* exile"],
        "rc8": _der("cast_from_exile"),
        "oracle": [r"(?:cast|play) .* from exile"],
    },
    {
        "id": "EXILE",
        "family": "exile",
        "spellbook": [r"\bexile\b"],
        "rc8": _lit("exile"),
        "oracle": [r"exile (?:target |that |all |each |this |it)"],
    },
    {
        "id": "SEARCH_LIBRARY",
        "family": "tutor",
        "spellbook": [r"search your library", r"\btutor\b", r"tutor"],
        "rc8": _lit("search_library") + _der("tutor"),
        "oracle": [r"search your library"],
    },
    {
        "id": "BOUNCE",
        "family": "interaction",
        "spellbook": [r"\bbounce\b", r"return .* to (?:its owner'?s |your )?hand"],
        "rc8": _lit("return_to_hand", "flow_battlefield_to_hand"),
        "oracle": [r"return (?:target |that |all )?.* to (?:its owner'?s|their owner'?s|your) hand"],
    },
    {
        "id": "DESTROY",
        "family": "interaction",
        "spellbook": [r"\bdestroy\b"],
        "rc8": _lit("destroy"),
        "oracle": [r"destroy (?:target |all |each |up to )"],
    },
    {
        "id": "BOARD_WIPE",
        "family": "interaction",
        "spellbook": [r"board wipe", r"destroy all", r"all creatures"],
        "rc8": _der("board_wipe"),
        "oracle": [r"destroy all (?:creatures|permanents|artifacts|enchantments)"],
    },
    {
        "id": "DEAL_DAMAGE",
        "family": "interaction",
        "spellbook": [r"deal[s]? \d* damage", r"damage to"],
        "rc8": _lit("deal_damage"),
        "oracle": [r"deal[s]? \d* damage"],
    },
    {
        "id": "PROTECTION",
        "family": "defense",
        "spellbook": [r"protection", r"hexproof", r"indestructible", r"ward", r"can't be countered"],
        "rc8": _der("protection"),
        "oracle": [r"\bhexproof\b", r"\bindestructible\b", r"protection from", r"\bward\b"],
    },
    {
        "id": "LIFE_GAIN",
        "family": "life",
        "spellbook": [r"gain life", r"you gain", r"lifelink", r"soul sister"],
        "rc8": _lit("gain_life") + _der("life_gain"),
        "oracle": [r"gain \d* life", r"you gain life", r"\blifelink\b"],
    },
    {
        "id": "LIFE_LOSS",
        "family": "life",
        "spellbook": [r"lose[s]? life", r"lose half", r"pay life", r"life payments"],
        "rc8": _lit("lose_life") + _der("life_loss"),
        "oracle": [r"lose[s]? \d* life", r"pay \d* life"],
    },
    {
        "id": "SCRY",
        "family": "selection",
        "spellbook": [r"\bscry\b"],
        "rc8": _lit("scry"),
        "oracle": [r"\bscry\b"],
    },
    {
        "id": "SURVEIL",
        "family": "selection",
        "spellbook": [r"\bsurveil\b"],
        "rc8": _lit("surveil"),
        "oracle": [r"\bsurveil\b"],
    },
    {
        "id": "PUT_COUNTER",
        "family": "counters",
        "spellbook": [r"\+1/\+1 counter", r"-1/-1 counter", r"increaser - counters", r"enters with a"],
        "rc8": _lit("put_counter") + _der("counter_synergy"),
        "oracle": [r"put[s]? .*(?:\+1/\+1|-1/-1|loyalty|charge) counter"],
    },
    {
        "id": "LANDFALL",
        "family": "triggers",
        "spellbook": [r"landfall"],
        "rc8": [],
        "oracle": [r"\blandfall\b", r"whenever a land you control enters"],
    },
    {
        "id": "HASTE_ENABLER",
        "family": "combat",
        "spellbook": [r"haste enabler", r"gains? haste", r"have haste"],
        "rc8": [],
        "oracle": [r"gains? haste", r"have haste", r"creatures? you control.*haste"],
    },
    {
        "id": "FLASH_ENABLER",
        "family": "timing",
        "spellbook": [r"flash enabler", r"spells have flash", r"may be cast as though they had flash"],
        "rc8": [],
        "oracle": [r"have flash", r"as though (?:they|it) had flash"],
    },
    {
        "id": "BLINK",
        "family": "recursion",
        "spellbook": [r"\bblink\b", r"flicker", r"exile .* return"],
        "rc8": _der("blink_flicker"),
        "oracle": [r"exile .* then return", r"blink"],
    },
    {
        "id": "PLAY_FROM_TOP",
        "family": "library",
        "spellbook": [r"cast spells from the top", r"play .* top of your library"],
        "rc8": [],
        "oracle": [r"from the top of your library"],
    },
    {
        "id": "PLAY_LANDS_FROM_GRAVEYARD",
        "family": "recursion",
        "spellbook": [r"play lands from your graveyard", r"crucible"],
        "rc8": [],
        "oracle": [r"play lands? from (?:your )?graveyard"],
    },
    {
        "id": "TOKEN_ON_CAST",
        "family": "tokens",
        "spellbook": [r"when you cast a spell, create a token", r"cast a spell, create"],
        "rc8": [],
        "oracle": [r"whenever you cast (?:a |your first )?spell.*create"],
    },
    {
        "id": "TOKEN_ON_ETB",
        "family": "tokens",
        "spellbook": [r"etb: create 1\+ token", r"enters.*create"],
        "rc8": [],
        "oracle": [r"when .* enters.*create .{0,40}token"],
    },
    {
        "id": "TOKEN_ON_ATTACK",
        "family": "tokens",
        "spellbook": [r"attack trigger: create token"],
        "rc8": [],
        "oracle": [r"whenever .* attacks.*create .{0,40}token"],
    },
    {
        "id": "TOKEN_ON_DEATH",
        "family": "tokens",
        "spellbook": [r"ltb/death trigger: create token", r"dies.*create"],
        "rc8": [],
        "oracle": [r"when .* dies.*create .{0,40}token"],
    },
    {
        "id": "EXTRA_COMBAT",
        "family": "combat",
        "spellbook": [r"combat phase", r"additional combat", r"extra combat"],
        "rc8": [],
        "oracle": [r"additional combat", r"another combat phase"],
    },
    {
        "id": "PROLIFERATE",
        "family": "counters",
        "spellbook": [r"proliferate"],
        "rc8": [],
        "oracle": [r"\bproliferate\b"],
    },
    {
        "id": "ANIMATOR",
        "family": "animation",
        "spellbook": [r"animator"],
        "rc8": [],
        "oracle": [r"becomes? (?:a|an) .*creature"],
    },
    {
        "id": "GRAVEYARD_SETUP",
        "family": "graveyard",
        "spellbook": [r"put .* into .*graveyard", r"self-mill"],
        "rc8": _der("graveyard_setup", lo=0.69),
        "oracle": [r"put .* into .*graveyard"],
    },
    {
        "id": "REMOVAL",
        "family": "interaction",
        "spellbook": [r"destroy target", r"exile target", r"removal"],
        "rc8": _der("removal"),
        "oracle": [r"destroy target (?:creature|permanent|artifact|enchantment)", r"exile target (?:creature|permanent)"],
    },
    {
        "id": "CARD_ADVANTAGE",
        "family": "card_advantage",
        "spellbook": [r"card advantage"],
        "rc8": _der("card_advantage"),
        "oracle": [],
    },
]


def compile_concept(concept: dict) -> dict:
    return {
        **concept,
        "spellbook_re": [re.compile(p, re.I) for p in concept["spellbook"]],
        "oracle_re": [re.compile(p, re.I) for p in concept["oracle"]],
    }


COMPILED = [compile_concept(c) for c in CONCEPTS]


def map_spellbook_feature(name: str) -> list[str]:
    hits = []
    for c in COMPILED:
        if any(r.search(name) for r in c["spellbook_re"]):
            hits.append(c["id"])
    return hits


def map_oracle_text(text: str) -> list[str]:
    if not text:
        return []
    hits = []
    for c in COMPILED:
        if any(r.search(text) for r in c["oracle_re"]):
            hits.append(c["id"])
    return hits


def map_rc8_row(vec) -> list[str]:
    hits = []
    for c in COMPILED:
        if any(float(vec[idx]) >= lo for idx, lo in c["rc8"]):
            hits.append(c["id"])
    return hits
