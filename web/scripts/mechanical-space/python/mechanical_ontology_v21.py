"""Mechanical Ontology v2.1 — fill missing capability/dependency/resilience sides."""

from __future__ import annotations

from mechanical_ontology_v2 import C, CONCEPTS as V2_CONCEPTS, compile_concept, is_token_card
from mechanical_ontology_v1 import _der, _lit

REPLACEMENTS = {
    "GRAVEYARD_DENIAL": C(
        "GRAVEYARD_DENIAL",
        family="graveyard",
        kind="capability",
        polarity_of="GRAVEYARD_RELATION",
        polarity_sign=-1,
        spellbook=(
            r"rest in peace",
            r"rip effect",
            r"exile all cards in .*graveyard",
            r"whenever a card is put into your graveyard, exile",
            r"cards in graveyards lose",
        ),
        oracle=(
            r"if a card(?: or token)? would be put into (?:a |an opponent's |your )?graveyard(?: from anywhere)?, exile",
            r"exile (?:all cards from )?(?:all |target |each |every )?(?:graveyards?|a graveyard|that graveyard)",
            r"exile (?:target |up to .* )?cards? from (?:a |target |all |each )?graveyards?",
            r"cards in graveyards (?:lose|can't|can't be the targets)",
            r"players can't cast spells from graveyards",
            r"can't (?:cast|play) .* from (?:graveyards|a graveyard)",
        ),
        hn_oracle=(r"return .* from (?:your )?graveyard", r"you may (?:cast|play) .* from (?:your )?graveyard"),
        hn_siblings=("RECURSION", "REANIMATION", "GRAVEYARD_TO_HAND"),
        lexical={
            "A_denies_graveyard": [r"exile .*graveyard", r"if a card would be put into .*graveyard"],
            "B_uses_graveyard": [r"from (?:your )?graveyard"],
        },
    ),
    "REDIRECT_SPELL": C(
        "REDIRECT_SPELL",
        family="stack",
        parent="STACK_INTERACTION",
        kind="capability",
        spellbook=(r"change the target", r"new targets", r"redirect"),
        oracle=(
            r"change the target(?:s)? of target (?:spell|ability)",
            r"choose new targets? for target (?:spell|ability)",
            r"you may choose new targets? for",
            r"that spell(?:'s)? target",
        ),
        hn_siblings=("COUNTER_SPELL", "COPY_SPELL"),
        lexical={
            "A_redirect": [r"change the target", r"choose new targets"],
            "B_counter": [r"counter target spell"],
        },
    ),
    "CARES_ABOUT_TOKENS": C(
        "CARES_ABOUT_TOKENS",
        family="tokens",
        kind="dependency",
        spellbook=(r"whenever you create a token", r"tokens you control", r"populate", r"doubler - tokens"),
        oracle=(
            r"whenever you create (?:a |one or more )?tokens?",
            r"whenever (?:a |one or more )?tokens? (?:you control )?(?:enter|dies|attack)",
            r"tokens? you control",
            r"for each token",
            r"\bpopulate\b",
            r"nontoken",
            r"twice (?:that|as) many tokens",
        ),
        hn_siblings=("IS_A_TOKEN",),
    ),
    "CARES_ABOUT_SACRIFICE": C(
        "CARES_ABOUT_SACRIFICE",
        family="sacrifice",
        kind="dependency",
        spellbook=(r"whenever you sacrifice", r"sacrifice payoff"),
        oracle=(
            r"whenever you sacrifice",
            r"whenever a (?:creature|permanent|artifact) you (?:control )?sacrifices?",
            r"whenever a (?:creature|permanent) you control is sacrificed",
            r"sacrificed (?:this turn|since)",
        ),
        hn_siblings=("REPEATABLE_SACRIFICE_OUTLET", "EDICT"),
    ),
    "CARES_ABOUT_CREATURE_DEATH": C(
        "CARES_ABOUT_CREATURE_DEATH",
        family="sacrifice",
        kind="dependency",
        spellbook=(r"whenever a creature .* dies", r"blood artist", r"ltb/death"),
        oracle=(
            r"whenever (?:a |another |one or more )?creatures? (?:you control )?dies",
            r"whenever a creature (?:you control )?is put into (?:a |your )?graveyard from the battlefield",
            r"\bmorbid\b",
        ),
    ),
    "CARES_ABOUT_CASTING_SPELLS": C(
        "CARES_ABOUT_CASTING_SPELLS",
        family="stack",
        kind="dependency",
        spellbook=(r"whenever you cast", r"when you cast a spell", r"prowess", r"magecraft"),
        oracle=(
            r"whenever you cast (?:a |your first |your second |a noncreature |an instant |a sorcery )?",
            r"whenever you cast (?:a spell|an instant|a sorcery|a creature spell|a noncreature spell)",
            r"\bprowess\b",
            r"\bmagecraft\b",
        ),
    ),
    "CARES_ABOUT_DRAWING_CARDS": C(
        "CARES_ABOUT_DRAWING_CARDS",
        family="card_advantage",
        kind="dependency",
        spellbook=(r"whenever you draw", r"if you (?:have )?drawn"),
        oracle=(
            r"whenever you draw (?:a card|your first card|one or more cards|two or more cards)",
            r"if you (?:have )?drawn",
            r"for each card you'?ve drawn",
        ),
    ),
    "CARES_ABOUT_LIFE_GAIN": C(
        "CARES_ABOUT_LIFE_GAIN",
        family="life",
        kind="dependency",
        spellbook=(r"whenever you gain life", r"soul sister"),
        oracle=(
            r"whenever you gain (?:life|\d* life)",
            r"if you gained life",
            r"for each 1 life you'?ve gained",
        ),
    ),
    "CARES_ABOUT_ARTIFACTS": C(
        "CARES_ABOUT_ARTIFACTS",
        family="artifacts",
        kind="dependency",
        spellbook=(r"artifact you control", r"whenever .* artifact", r"affinity for artifacts", r"metalcraft"),
        oracle=(
            r"whenever (?:you cast )?(?:an |a nontoken )?artifact",
            r"artifacts? you control",
            r"for each artifact",
            r"\bmetalcraft\b",
            r"affinity for artifacts",
            r"historic",
        ),
    ),
    "CARES_ABOUT_COMMANDER": C(
        "CARES_ABOUT_COMMANDER",
        family="commander",
        kind="dependency",
        spellbook=(r"your commander", r"commander"),
        oracle=(
            r"your commander",
            r"a commander you (?:own|control)",
            r"commander (?:tax|spell|creature)",
            r"as long as .* is your commander",
            r"partner",
        ),
    ),
    "BLINK": C(
        "BLINK",
        family="recursion",
        kind="capability",
        spellbook=(r"\bblink\b", r"flicker"),
        rc8=_der("blink_flicker"),
        oracle=(
            r"exile (?:it|target|that|another).{0,40}return",
            r"exile .{0,30}then return",
            r"\bflicker\b",
            r"\bblink\b",
        ),
    ),
    "PLAY_FROM_TOP": C(
        "PLAY_FROM_TOP",
        family="library",
        kind="capability",
        spellbook=(r"cast spells from the top", r"play .* top of your library"),
        oracle=(
            r"from the top of your library",
            r"play with the top (?:card )?of your library",
            r"you may (?:look at and )?play .* top card",
            r"you may cast .* top card of your library",
        ),
    ),
    "CAST_TRIGGER": C(
        "CAST_TRIGGER",
        family="triggers",
        kind="capability",
        spellbook=(r"when you cast", r"whenever you cast"),
        oracle=(
            r"when you cast this spell",
            r"whenever you cast (?:a |your first |this )",
        ),
    ),
}

ADDITIONS = [
    C(
        "CARES_ABOUT_SPELL_CHAIN",
        family="stack",
        kind="dependency",
        parent="CARES_ABOUT_CASTING_SPELLS",
        spellbook=(r"\bstorm\b", r"cast your second", r"the first spell"),
        oracle=(
            r"\bstorm\b",
            r"whenever you cast your second",
            r"if this is the second spell",
            r"the first spell you cast",
            r"cast two (?:or more )?spells",
        ),
    ),
    C(
        "CARES_ABOUT_RESOLUTION",
        family="stack",
        kind="dependency",
        spellbook=(r"as .* resolves", r"if it resolves"),
        oracle=(r"as (?:it|that spell) resolves", r"if (?:it|that spell) resolves", r"when (?:it|that spell) resolves"),
    ),
    C(
        "CARES_ABOUT_DEATH_TRIGGERS",
        family="sacrifice",
        kind="dependency",
        parent="CARES_ABOUT_CREATURE_DEATH",
        spellbook=(r"whenever .* dies", r"death trigger"),
        oracle=(r"whenever .{0,24} dies", r"when .{0,20} dies,"),
    ),
    C(
        "CARES_ABOUT_LARGE_HAND",
        family="hand",
        kind="dependency",
        spellbook=(r"seven or more cards", r"cards in your hand", r"hand size"),
        oracle=(
            r"seven or more cards in (?:your )?hand",
            r"cards in your hand",
            r"maximum hand size",
            r"for each card in your hand",
        ),
    ),
    C(
        "CARES_ABOUT_ONE_CREATURE",
        family="board",
        kind="dependency",
        spellbook=(r"equipped creature", r"target creature you control", r"your commander"),
        oracle=(
            r"equipped creature",
            r"enchanted creature",
            r"target creature you control",
            r"a creature you control gets",
        ),
    ),
    C(
        "CARES_ABOUT_ARTIFACT_ACTIVATIONS",
        family="artifacts",
        kind="dependency",
        parent="CARES_ABOUT_ARTIFACTS",
        spellbook=(r"activate", r"artifact .* activated"),
        oracle=(r"activate (?:only|the) .* artifact", r"\{t\}: .{0,40}artifact", r"activated abilities of artifacts you control"),
    ),
    C(
        "CARES_ABOUT_COMBAT",
        family="combat",
        kind="dependency",
        spellbook=(r"whenever .* attacks", r"combat damage"),
        oracle=(r"whenever (?:this creature|~|a creature you control) attacks", r"during combat", r"attacking creatures? you control"),
    ),
    C(
        "WHEEL",
        family="hand",
        kind="capability",
        parent="DISCARD_CARD",
        spellbook=(r"each player discards their hand", r"wheel"),
        oracle=(r"each player discards (?:their|his or her) hand, then draws", r"discards their hand(?:\,| and) then draws"),
        hn_siblings=("HAND_ATTACK",),
    ),
    C(
        "HAND_ATTACK",
        family="hand",
        kind="capability",
        spellbook=(r"target player discards", r"each opponent discards", r"look at target player's hand"),
        oracle=(
            r"target (?:player|opponent) discards",
            r"each opponent discards",
            r"look at target (?:player|opponent)'s hand",
        ),
        hn_siblings=("WHEEL", "DISCARD_CARD"),
        lexical={"A_opponent_discard": [r"target (?:player|opponent) discards"], "B_self_discard": [r"discard (?:a card|your hand)"]},
    ),
    C(
        "ARTIFACT_REMOVAL",
        family="artifacts",
        kind="capability",
        spellbook=(r"destroy target artifact", r"exile target artifact", r"naturalize"),
        oracle=(r"destroy target artifact", r"exile target artifact", r"destroy all artifacts"),
        hn_siblings=("ARTIFACT_SHUTDOWN",),
    ),
    C(
        "ARTIFACT_SHUTDOWN",
        family="artifacts",
        kind="capability",
        spellbook=(r"activated abilities of artifacts can't", r"artifacts don't untap", r"artifacts enter tapped"),
        oracle=(
            r"activated abilities of artifacts (?:your opponents control )?can't",
            r"artifacts (?:don't|can't) untap",
            r"artifact.*enter.*tapped",
            r"players can't (?:cast|play) artifact",
        ),
        hn_siblings=("ARTIFACT_REMOVAL", "CARES_ABOUT_ARTIFACTS"),
    ),
    C(
        "ARTIFACT_PRODUCTION",
        family="artifacts",
        kind="capability",
        parent="CREATE_TOKEN",
        spellbook=(r"treasure", r"clue token", r"food token", r"powerstone"),
        oracle=(r"create .{0,30}(?:treasure|clue|food|powerstone|thopter|servo) token", r"create .{0,20}artifact token"),
    ),
    C(
        "MASS_CREATURE_REMOVAL",
        family="board",
        kind="capability",
        parent="BOARD_WIPE",
        polarity_of="BOARD_RELATION",
        polarity_sign=-1,
        spellbook=(r"destroy all creatures", r"board wipe"),
        oracle=(r"destroy all creatures", r"exile all creatures", r"all creatures get -\d+/-\d+"),
        hn_siblings=("CREATE_TOKEN", "EDICT"),
    ),
    C(
        "ENCHANTMENT_REMOVAL",
        family="interaction",
        kind="capability",
        spellbook=(r"destroy target enchantment", r"exile target enchantment"),
        oracle=(r"destroy target enchantment", r"exile target enchantment", r"destroy all enchantments"),
    ),
    C(
        "RULE_OF_LAW",
        family="stack",
        kind="capability",
        spellbook=(r"can't cast more than one spell", r"rule of law"),
        oracle=(r"each player can't cast more than one spell", r"can't cast more than one spell each turn"),
        hn_siblings=("CARES_ABOUT_SPELL_CHAIN", "CARES_ABOUT_CASTING_SPELLS"),
    ),
    C(
        "FOG",
        family="combat",
        kind="capability",
        spellbook=(r"prevent all combat damage", r"\bfog\b"),
        oracle=(r"prevent all combat damage", r"prevent all damage that would be dealt by creatures"),
    ),
    C(
        "TORPOR_EFFECT",
        family="triggers",
        kind="capability",
        spellbook=(r"entering the battlefield don't cause", r"torpor"),
        oracle=(
            r"creatures entering (?:the battlefield )?don't cause abilities to trigger",
            r"permanents entering .* don't cause",
        ),
        hn_siblings=("ETB_TRIGGER", "CARES_ABOUT_TOKENS"),
    ),
    C(
        "MANA_DENIAL",
        family="mana",
        kind="capability",
        spellbook=(r"lands don't untap", r"destroy target land", r"winter orb"),
        oracle=(r"lands (?:don't|can't) untap", r"destroy target land", r"players can't (?:play|untap) lands"),
    ),
    C(
        "GRAVEYARD_HATE_RESILIENCE",
        family="graveyard",
        kind="resilience",
        spellbook=(r"from exile", r"escape", r"adventure"),
        oracle=(
            r"(?:cast|play) .{0,40}from exile",
            r"\bescape\b",
            r"if this (?:card|spell) would be put into (?:a graveyard|exile)",
            r"from among cards (?:you own )?in exile",
        ),
        hn_siblings=("GRAVEYARD_DENIAL",),
    ),
    C(
        "BOARD_WIPE_RESILIENCE",
        family="board",
        kind="resilience",
        spellbook=(r"indestructible", r"persist", r"undying", r"regenerate"),
        oracle=(
            r"\bindestructible\b",
            r"\bpersist\b",
            r"\bundying\b",
            r"regenerate",
            r"when (?:this|it) dies, return (?:it|this)",
            r"if (?:it|this) would die",
        ),
        hn_siblings=("BOARD_WIPE", "MASS_CREATURE_REMOVAL"),
    ),
    C(
        "COUNTERSPELL_RESILIENCE",
        family="stack",
        kind="resilience",
        spellbook=(r"can't be countered", r"uncounterable", r"cascade"),
        oracle=(r"can't be countered", r"this spell can't be countered", r"\bcascade\b"),
        hn_siblings=("COUNTER_SPELL",),
    ),
    C(
        "HAND_ATTACK_RESILIENCE",
        family="hand",
        kind="resilience",
        spellbook=(r"madness", r"if you would discard"),
        oracle=(r"\bmadness\b", r"if (?:you|a player) would discard", r"discard .* instead"),
        hn_siblings=("HAND_ATTACK",),
    ),
    C(
        "SACRIFICE_RESILIENCE",
        family="sacrifice",
        kind="resilience",
        spellbook=(r"can't be sacrificed", r"persist", r"undying"),
        oracle=(r"can't be sacrificed", r"if a creature you control would (?:die|be sacrificed)", r"\bpersist\b", r"\bundying\b"),
        hn_siblings=("EDICT",),
    ),
]

CONCEPTS = [REPLACEMENTS.get(c["id"], c) for c in V2_CONCEPTS]
seen = {c["id"] for c in CONCEPTS}
for extra in ADDITIONS:
    if extra["id"] not in seen:
        CONCEPTS.append(extra)
        seen.add(extra["id"])

COMPILED = [compile_concept(c) for c in CONCEPTS]
BY_ID = {c["id"]: c for c in COMPILED}

STRATEGIC_MIN_SUPPORT = {
    "GRAVEYARD_DENIAL",
    "REDIRECT_SPELL",
    "RULE_OF_LAW",
    "TORPOR_EFFECT",
    "WHEEL",
    "ARTIFACT_SHUTDOWN",
    "CARES_ABOUT_RESOLUTION",
    "CARES_ABOUT_SPELL_CHAIN",
    "GRAVEYARD_HATE_RESILIENCE",
}

K_CANDIDATE_PAIRS = [
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_GRAVEYARD"),
    ("GRAVEYARD_DENIAL", "GRAVEYARD_HATE_RESILIENCE"),
    ("COUNTER_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
    ("COUNTER_SPELL", "CARES_ABOUT_SPELL_CHAIN"),
    ("COUNTER_SPELL", "COUNTERSPELL_RESILIENCE"),
    ("REDIRECT_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
    ("RULE_OF_LAW", "CARES_ABOUT_SPELL_CHAIN"),
    ("RULE_OF_LAW", "CARES_ABOUT_CASTING_SPELLS"),
    ("EDICT", "CARES_ABOUT_ONE_CREATURE"),
    ("EDICT", "CARES_ABOUT_CREATURES"),
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_CREATURES"),
    ("MASS_CREATURE_REMOVAL", "BOARD_WIPE_RESILIENCE"),
    ("BOARD_WIPE", "CARES_ABOUT_CREATURES"),
    ("CREATE_TOKEN", "CARES_ABOUT_TOKENS"),
    ("TORPOR_EFFECT", "CARES_ABOUT_TOKENS"),
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_SACRIFICE"),
    ("EDICT", "CARES_ABOUT_SACRIFICE"),
    ("CARES_ABOUT_CREATURE_DEATH", "SACRIFICE_PAYOFF"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ARTIFACTS"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"),
    ("ARTIFACT_REMOVAL", "CARES_ABOUT_ARTIFACTS"),
    ("HAND_ATTACK", "CARES_ABOUT_LARGE_HAND"),
    ("HAND_ATTACK", "HAND_ATTACK_RESILIENCE"),
    ("WHEEL", "CARES_ABOUT_DRAWING_CARDS"),
    ("LIFE_GAIN", "CARES_ABOUT_LIFE_GAIN"),
    ("FOG", "CARES_ABOUT_COMBAT"),
    ("FOG", "CARES_ABOUT_COMBAT_DAMAGE"),
]


def map_spellbook_feature(name: str) -> list[str]:
    return [c["id"] for c in COMPILED if any(r.search(name) for r in c["spellbook_re"])]


def map_oracle_text(text: str) -> list[str]:
    if not text:
        return []
    return [c["id"] for c in COMPILED if any(r.search(text) for r in c["oracle_re"])]


def map_oracle_hard_negatives(text: str) -> list[str]:
    if not text:
        return []
    return [c["id"] for c in COMPILED if any(r.search(text) for r in c["hn_oracle_re"])]


def map_rc8_row(vec) -> list[str]:
    hits = []
    for c in COMPILED:
        if c["rc8"] and any(float(vec[idx]) >= lo for idx, lo in c["rc8"]):
            hits.append(c["id"])
    return hits


def lexical_buckets(concept_id: str, text: str, type_line: str, name: str) -> list[str]:
    from mechanical_ontology_v2 import lexical_buckets as v2_lex

    if concept_id in BY_ID:
        c = BY_ID[concept_id]
        hits = []
        if concept_id == "CREATE_TOKEN" and is_token_card(type_line, name):
            hits.append("B_is_a_token")
        for bucket, regs in c["lexical_re"].items():
            if any(r.search(text or "") for r in regs):
                hits.append(bucket)
        return hits
    return v2_lex(concept_id, text, type_line, name)
