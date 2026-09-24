"""
Mechanical Ontology v2.2 — precision repair.

Debt-driven splits only. BGE stays frozen. Parents kept as family axes.
New IDs must have provenance A/B/C/D from K v1–v1.5.
Does not replace Ontology v2.1. New lineage.
"""

from __future__ import annotations

from mechanical_ontology_v2 import C, compile_concept, is_token_card
from mechanical_ontology_v21 import CONCEPTS as V21_CONCEPTS
from mechanical_ontology_v21 import K_CANDIDATE_PAIRS as V21_K_PAIRS
from mechanical_ontology_v21 import STRATEGIC_MIN_SUPPORT as V21_MIN


def debt(c: dict, *, code: str, why: str, k_evidence: str) -> dict:
    c = dict(c)
    c["provenance"] = {"code": code, "why": why, "kEvidence": k_evidence}
    return c


# Parents that stay in the vocabulary as BROAD_FAMILY descriptors.
BROADEN = {
    "DEAL_DAMAGE": "broad",
    "CARES_ABOUT_COMBAT": "broad",
    "CARES_ABOUT_DRAWING_CARDS": "broad",
    "CARES_ABOUT_ONE_CREATURE": "broad",
    "CARES_ABOUT_CASTING_SPELLS": "broad",
    "COST_MODIFICATION": "broad",
    "CARES_ABOUT_COMMANDER": "broad",
    "CARES_ABOUT_TOKENS": "broad",
}

# A = repeated CONDITIONAL  B = high-H UNKNOWN  C = conflicting children  D = distorted headline
SPLITS = [
    # ── 1. damage / combat (owns every H_eligible ≥ 1) ────────
    debt(
        C(
            "DAMAGE_CREATURE",
            family="interaction",
            parent="DEAL_DAMAGE",
            spellbook=(r"damage to .* creature", r"fight"),
            oracle=(
                r"deals? .{0,24}damage to (?:target |that |each |another |any number of )?(?:creature|attacking creature)",
                r"\bfight\b",
                r"damage to (?:target |that )?creature",
            ),
            hn_oracle=(r"deals? combat damage", r"deals? .{0,24}damage to (?:target |that |each )?(?:player|opponent)"),
            hn_siblings=("DAMAGE_PLAYER", "COMBAT_DAMAGE_DEALT"),
            lexical={
                "A_creature": [r"damage to .{0,20}creature", r"\bfight\b"],
                "B_player": [r"damage to .{0,20}(?:player|opponent)"],
                "C_combat": [r"combat damage"],
            },
        ),
        code="B",
        why="DEAL_DAMAGE → CARES_ABOUT_COMBAT is the last H_eligible≥1 cluster; creature vs player damage are opposite K stories.",
        k_evidence="K v1.5 leftover DEAL_DAMAGE → CARES_ABOUT_COMBAT; DEAL_DAMAGE → CARES_ABOUT_CREATURES was CONDITIONAL.",
    ),
    debt(
        C(
            "DAMAGE_PLAYER",
            family="interaction",
            parent="DEAL_DAMAGE",
            spellbook=(r"damage to .* player", r"damage to .* opponent"),
            oracle=(
                r"deals? .{0,24}damage to (?:target |that |each )?(?:player|opponent)",
                r"deals? .{0,16}damage to (?:you|them)",
            ),
            hn_oracle=(r"deals? .{0,24}damage to (?:target |that )?creature", r"\bfight\b"),
            hn_siblings=("DAMAGE_CREATURE",),
            lexical={
                "A_player": [r"damage to .{0,20}(?:player|opponent)"],
                "B_creature": [r"damage to .{0,20}creature", r"\bfight\b"],
            },
        ),
        code="A",
        why="Player life loss / player damage does not attack a must-keep creature plan.",
        k_evidence="LIFE_LOSS → CARES_ABOUT_ONE_CREATURE CONDITIONAL; DEAL_DAMAGE → CARES_ABOUT_ONE_CREATURE CONDITIONAL.",
    ),
    debt(
        C(
            "COMBAT_DAMAGE_DEALT",
            family="combat",
            parent="DEAL_DAMAGE",
            spellbook=(r"deals combat damage", r"combat damage"),
            oracle=(r"deals? combat damage", r"whenever .{0,24} deals combat damage"),
            hn_oracle=(r"deals? .{0,16}damage to" ,),
            hn_siblings=("NONCOMBAT_DAMAGE", "DAMAGE_CREATURE"),
            lexical={"A_combat": [r"combat damage"], "B_generic": [r"deals? .{0,16}damage to"]},
        ),
        code="B",
        why="Combat-damage triggers are not generic damage.",
        k_evidence="FOG → CARES_ABOUT_COMBAT_DAMAGE already exists; DEAL_DAMAGE → CARES_ABOUT_COMBAT_DAMAGE was DISRUPTS/coarse.",
    ),
    debt(
        C(
            "NONCOMBAT_DAMAGE",
            family="interaction",
            parent="DEAL_DAMAGE",
            spellbook=(r"noncombat damage", r"deals damage to"),
            oracle=(r"deals? (?!combat ).{0,20}damage to", r"that much damage", r"damage equal to"),
            hn_oracle=(r"deals? combat damage",),
            hn_siblings=("COMBAT_DAMAGE_DEALT",),
            lexical={"A_generic": [r"deals? .{0,20}damage to"], "B_combat": [r"combat damage"]},
        ),
        code="B",
        why="Noncombat damage is a different channel than combat-damage care.",
        k_evidence="DEAL_DAMAGE → CARES_ABOUT_COMBAT leftover high-H; FOG only stops combat damage.",
    ),
    debt(
        C(
            "MUST_ATTACK",
            family="combat",
            kind="dependency",
            parent="CARES_ABOUT_COMBAT",
            spellbook=(r"attacks each combat if able", r"must attack"),
            oracle=(
                r"attacks? each combat if able",
                r"must attack",
                r"attacks? each (?:combat|turn) if able",
            ),
            hn_siblings=("ATTACK_TRIGGER", "CARES_ABOUT_COMBAT_DAMAGE"),
        ),
        code="B",
        why="Must-attack is a tap/fog vulnerability, not a combat-damage trigger.",
        k_evidence="CARES_ABOUT_COMBAT mixed attack-if-able with combat payoffs; TAP/FOG relations were coarse.",
    ),
    debt(
        C(
            "ATTACK_TRIGGER",
            family="combat",
            kind="dependency",
            parent="CARES_ABOUT_COMBAT",
            spellbook=(r"whenever .* attacks",),
            oracle=(
                r"whenever (?:this creature|~|a creature you control|one or more creatures you control) attacks",
                r"whenever .{0,20} attacks(?!,? (?:you|and))",
            ),
            hn_oracle=(r"deals? combat damage", r"attacks each combat if able"),
            hn_siblings=("MUST_ATTACK", "CARES_ABOUT_COMBAT_DAMAGE"),
        ),
        code="B",
        why="Attack triggers fire on declare, not on combat damage.",
        k_evidence="CARES_ABOUT_COMBAT oracle mixed 'whenever attacks' with 'during combat'.",
    ),
    debt(
        C(
            "CREATURE_COMBAT_DEPENDENCY",
            family="combat",
            kind="dependency",
            parent="CARES_ABOUT_COMBAT",
            spellbook=(r"attacking creatures you control", r"creatures you control attack"),
            oracle=(
                r"attacking creatures? you control",
                r"creatures you control (?:get|have|gain).{0,24}(?:until end of combat|attacking)",
                r"as long as .{0,20} is attacking",
            ),
            hn_siblings=("ATTACK_TRIGGER", "CARES_ABOUT_COMBAT_DAMAGE"),
        ),
        code="B",
        why="A combat-board engine is not a single attack trigger.",
        k_evidence="Winota-class combat dependency sat inside CARES_ABOUT_COMBAT.",
    ),
    # ── 2. drawing / hand / access ──────────────────────────
    debt(
        C(
            "DRAW_TRIGGER_DEPENDENCY",
            family="card_advantage",
            kind="dependency",
            parent="CARES_ABOUT_DRAWING_CARDS",
            spellbook=(r"whenever you draw",),
            oracle=(
                r"whenever you draw (?:a card|your first card|one or more cards|two or more cards)",
                r"whenever a player draws",
            ),
            hn_oracle=(r"seven or more cards in (?:your )?hand", r"cards in your hand", r"for each card you'?ve drawn"),
            hn_siblings=("CARES_ABOUT_LARGE_HAND", "DRAW_VOLUME_DEPENDENCY", "CARD_ACCESS_DEPENDENCY"),
            lexical={
                "A_draw_trigger": [r"whenever you draw"],
                "B_hand_size": [r"cards in your hand", r"seven or more cards"],
                "C_volume": [r"for each card you'?ve drawn", r"if you (?:have )?drawn"],
            },
        ),
        code="A",
        why="Draw-trigger engines are not attacked by discard.",
        k_evidence="HAND_ATTACK → CARES_ABOUT_DRAWING_CARDS = CONDITIONAL in K v1.5.",
    ),
    debt(
        C(
            "CARD_ACCESS_DEPENDENCY",
            family="card_advantage",
            kind="dependency",
            parent="CARES_ABOUT_DRAWING_CARDS",
            spellbook=(r"you may (?:cast|play) cards? (?:from|in) your hand", r"play cards from"),
            oracle=(
                r"you may (?:cast|play) .{0,40}(?:from|in) your hand",
                r"play (?:lands? and )?cards? from your hand",
                r"cast spells? from your hand",
            ),
            hn_siblings=("DRAW_TRIGGER_DEPENDENCY", "CARES_ABOUT_LARGE_HAND"),
        ),
        code="A",
        why="Hand attack denies access to cards in hand, not draw triggers.",
        k_evidence="HAND_ATTACK → CARES_ABOUT_DRAWING_CARDS CONDITIONAL; HAND_ATTACK → LARGE_HAND already ATTACKS.",
    ),
    debt(
        C(
            "DRAW_VOLUME_DEPENDENCY",
            family="card_advantage",
            kind="dependency",
            parent="CARES_ABOUT_DRAWING_CARDS",
            spellbook=(r"if you have drawn", r"for each card you've drawn"),
            oracle=(
                r"if you (?:have )?drawn",
                r"for each card you'?ve drawn",
                r"drawn (?:two|three|four|\d+) or more cards",
                r"the first (?:card|time) you draw",
            ),
            hn_oracle=(r"whenever you draw a card", r"seven or more cards in (?:your )?hand"),
            hn_siblings=("DRAW_TRIGGER_DEPENDENCY", "CARES_ABOUT_LARGE_HAND"),
        ),
        code="A",
        why="Volume-of-draws this turn is not 'whenever you draw' and not hand size.",
        k_evidence="CARES_ABOUT_DRAWING_CARDS mixed whenever-you-draw with if-you-have-drawn.",
    ),
    # ── 3. one-creature ─────────────────────────────────────
    debt(
        C(
            "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD",
            family="board",
            kind="dependency",
            parent="CARES_ABOUT_ONE_CREATURE",
            spellbook=(r"equipped creature", r"enchanted creature", r"that creature"),
            oracle=(
                r"equipped creature",
                r"enchanted creature",
                r"as long as you control (?:that |the enchanted |the equipped )",
                r"if you control (?:no )?other creatures",
            ),
            hn_siblings=("COMMANDER_DAMAGE_PLAN", "AURA_EQUIPMENT_INVESTMENT", "MUST_ATTACK_WITH_ONE_CREATURE"),
            lexical={
                "A_keep_body": [r"equipped creature", r"enchanted creature"],
                "B_commander_damage": [r"commander combat damage"],
                "C_must_attack": [r"attacks each combat if able"],
            },
        ),
        code="A",
        why="Edict/destroy attack a must-keep body; player damage does not.",
        k_evidence="Repeated CONDITIONAL on CARES_ABOUT_ONE_CREATURE from LIFE_LOSS, DEAL_DAMAGE, COUNTER_SPELL, BLINK.",
    ),
    debt(
        C(
            "MUST_ATTACK_WITH_ONE_CREATURE",
            family="board",
            kind="dependency",
            parent="CARES_ABOUT_ONE_CREATURE",
            spellbook=(r"equipped creature attacks", r"attacks each combat"),
            oracle=(
                r"(?:equipped |enchanted )?creature attacks each combat if able",
                r"(?:equipped |enchanted |that )creature .{0,20}attacks",
            ),
            hn_siblings=("MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD", "COMMANDER_DAMAGE_PLAN"),
        ),
        code="A",
        why="Tap/fog attacks a must-attack voltron more than a static aura engine.",
        k_evidence="TAP → CARES_ABOUT_ONE_CREATURE was DISRUPTS; FOG → ONE_CREATURE was NEUTRAL.",
    ),
    debt(
        C(
            "COMMANDER_DAMAGE_PLAN",
            family="commander",
            kind="dependency",
            parent="CARES_ABOUT_ONE_CREATURE",
            spellbook=(r"commander damage", r"commander combat damage"),
            oracle=(
                r"commander combat damage",
                r"combat damage .{0,24}commander",
                r"if .{0,20}commander .{0,30}combat damage",
                r"your commander .{0,40}combat damage",
            ),
            hn_oracle=(r"equipped creature", r"enchanted creature"),
            hn_siblings=("MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD", "AURA_EQUIPMENT_INVESTMENT"),
        ),
        code="A",
        why="Commander-damage plans are attacked by fog and player-life effects, not generic drain.",
        k_evidence="LIFE_LOSS → CARES_ABOUT_COMMANDER CONDITIONAL; LIFE_LOSS → ONE_CREATURE CONDITIONAL.",
    ),
    debt(
        C(
            "AURA_EQUIPMENT_INVESTMENT",
            family="board",
            kind="dependency",
            parent="CARES_ABOUT_ONE_CREATURE",
            spellbook=(r"equip", r"attach", r"enchant creature"),
            oracle=(
                r"\bequip\b",
                r"attach .{0,20} to (?:target |a )?creature",
                r"enchant creature",
                r"aura you control",
                r"equipment you control",
            ),
            hn_oracle=(r"commander combat damage", r"attacks each combat if able"),
            hn_siblings=("COMMANDER_DAMAGE_PLAN", "MUST_ATTACK_WITH_ONE_CREATURE"),
            lexical={"A_aura_equip": [r"\bequip\b", r"enchant creature"], "B_body_only": [r"target creature you control gets"]},
        ),
        code="A",
        why="Enchantment removal attacks auras/equipment, not a naked commander-damage body.",
        k_evidence="ENCHANTMENT_REMOVAL → ONE_CREATURE CONDITIONAL; Light-Paws story.",
    ),
    # ── 4. casting vs resolution vs chain vs velocity ───────
    debt(
        C(
            "CAST_TRIGGER_DEPENDENCY",
            family="stack",
            kind="dependency",
            parent="CARES_ABOUT_CASTING_SPELLS",
            spellbook=(r"whenever you cast", r"prowess", r"magecraft"),
            oracle=(
                r"whenever you cast (?:a |your first |your second |a noncreature |an instant |a sorcery )?",
                r"\bprowess\b",
                r"\bmagecraft\b",
            ),
            hn_oracle=(r"as (?:it|that spell) resolves", r"\bstorm\b"),
            hn_siblings=("CARES_ABOUT_RESOLUTION", "CARES_ABOUT_SPELL_CHAIN", "SPELL_VELOCITY_DEPENDENCY"),
            lexical={"A_cast": [r"whenever you cast", r"prowess"], "B_resolve": [r"as (?:it|that spell) resolves"], "C_storm": [r"\bstorm\b"]},
        ),
        code="A",
        why="Cast triggers fire even if the spell is countered.",
        k_evidence="COUNTER_SPELL → CARES_ABOUT_CASTING_SPELLS ATTACKS with medium conditionality; COPY_SPELL ENABLES copies not casts.",
    ),
    debt(
        C(
            "SPELL_VELOCITY_DEPENDENCY",
            family="stack",
            kind="dependency",
            parent="CARES_ABOUT_CASTING_SPELLS",
            spellbook=(r"spells you cast this turn", r"the first spell you cast"),
            oracle=(
                r"the first spell you cast (?:each turn|this turn)",
                r"spells? you cast this turn",
                r"cast (?:three|two) or more spells",
                r"each spell you cast",
            ),
            hn_oracle=(r"as (?:it|that spell) resolves", r"whenever you cast a spell,"),
            hn_siblings=("CAST_TRIGGER_DEPENDENCY", "CARES_ABOUT_SPELL_CHAIN", "CARES_ABOUT_RESOLUTION"),
        ),
        code="D",
        why="Tax and Rule of Law pressure how often you cast, not whether one spell resolves.",
        k_evidence="COST_INCREASE → CASTING DISRUPTS; TAX_SPELL → RESOLUTION DISRUPTS (weaker than COUNTER); RULE_OF_LAW already exists.",
    ),
    # ── 5. artifact-qualified ───────────────────────────────
    debt(
        C(
            "ARTIFACT_COMMANDER_DEPENDENCY",
            family="artifacts",
            kind="dependency",
            parent="CARES_ABOUT_COMMANDER",
            spellbook=(r"artifact commander", r"commander is an artifact"),
            oracle=(
                r"your commander is an artifact",
                r"artifact .{0,16}commander",
                r"commander .{0,16}artifact",
            ),
            hn_siblings=("CARES_ABOUT_COMMANDER", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"),
        ),
        code="A",
        why="Null Rod only attacks an artifact commander.",
        k_evidence="ARTIFACT_SHUTDOWN → CARES_ABOUT_COMMANDER = CONDITIONAL in K v1.5.",
    ),
    debt(
        C(
            "ARTIFACT_TOKEN_DEPENDENCY",
            family="artifacts",
            kind="dependency",
            parent="CARES_ABOUT_TOKENS",
            spellbook=(r"treasure you control", r"artifact tokens you control", r"clue token"),
            oracle=(
                r"(?:treasure|clue|food|powerstone|blood) tokens? you control",
                r"artifact tokens? you control",
                r"whenever you create (?:a |one or more )?(?:treasure|clue|food|artifact token)",
            ),
            hn_oracle=(r"creature tokens? you control", r"create .{0,20}creature token"),
            hn_siblings=("CARES_ABOUT_TOKENS",),
            lexical={"A_artifact_token": [r"treasure token", r"artifact token"], "B_creature_token": [r"creature token"]},
        ),
        code="A",
        why="Artifact shutdown hits Treasures/Clues, not squirrels.",
        k_evidence="ARTIFACT_SHUTDOWN → CARES_ABOUT_TOKENS = CONDITIONAL in K v1.5.",
    ),
    debt(
        C(
            "CREATE_CREATURE_TOKEN",
            family="tokens",
            parent="CREATE_TOKEN",
            spellbook=(r"create .* creature token",),
            oracle=(r"create[s]? .{0,40}creature token", r"create[s]? .{0,20}(?:1/1|2/2|3/3|x/x) .{0,20}creature token"),
            hn_oracle=(r"treasure token", r"clue token", r"food token", r"artifact token"),
            hn_siblings=("CREATE_TREASURE", "ARTIFACT_PRODUCTION"),
            lexical={"A_creature_token": [r"creature token"], "B_treasure": [r"treasure token"]},
        ),
        code="A",
        why="Creature-token engines are not Treasure engines.",
        k_evidence="CREATE_TREASURE → ONE_CREATURE NEUTRAL; token-type debt recorded in K v1.5.",
    ),
]

# Keep LARGE_HAND as the hand-size child of drawing (already trained in v2.1).
REPARENT = {
    "CARES_ABOUT_LARGE_HAND": "CARES_ABOUT_DRAWING_CARDS",
    "CARES_ABOUT_SPELL_CHAIN": "CARES_ABOUT_CASTING_SPELLS",
    "CARES_ABOUT_RESOLUTION": "CARES_ABOUT_CASTING_SPELLS",
    "CARES_ABOUT_COMBAT_DAMAGE": "CARES_ABOUT_COMBAT",
}


def _apply() -> list[dict]:
    concepts = []
    seen = set()
    for c in V21_CONCEPTS:
        row = dict(c)
        if row["id"] in BROADEN:
            row["role"] = BROADEN[row["id"]]
        if row["id"] in REPARENT:
            row["parent"] = REPARENT[row["id"]]
        concepts.append(row)
        seen.add(row["id"])
    for extra in SPLITS:
        if extra["id"] not in seen:
            concepts.append(extra)
            seen.add(extra["id"])
    return concepts


CONCEPTS = _apply()
COMPILED = [compile_concept(c) for c in CONCEPTS]
BY_ID = {c["id"]: c for c in COMPILED}

STRATEGIC_MIN_SUPPORT = set(V21_MIN) | {
    "DAMAGE_CREATURE",
    "DAMAGE_PLAYER",
    "COMBAT_DAMAGE_DEALT",
    "NONCOMBAT_DAMAGE",
    "MUST_ATTACK",
    "ATTACK_TRIGGER",
    "CREATURE_COMBAT_DEPENDENCY",
    "DRAW_TRIGGER_DEPENDENCY",
    "CARD_ACCESS_DEPENDENCY",
    "DRAW_VOLUME_DEPENDENCY",
    "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD",
    "MUST_ATTACK_WITH_ONE_CREATURE",
    "COMMANDER_DAMAGE_PLAN",
    "AURA_EQUIPMENT_INVESTMENT",
    "CAST_TRIGGER_DEPENDENCY",
    "SPELL_VELOCITY_DEPENDENCY",
    "ARTIFACT_COMMANDER_DEPENDENCY",
    "ARTIFACT_TOKEN_DEPENDENCY",
    "CREATE_CREATURE_TOKEN",
}

K_CANDIDATE_PAIRS = list(V21_K_PAIRS) + [
    ("HAND_ATTACK", "DRAW_TRIGGER_DEPENDENCY"),
    ("HAND_ATTACK", "CARD_ACCESS_DEPENDENCY"),
    ("HAND_ATTACK", "CARES_ABOUT_LARGE_HAND"),
    ("COUNTER_SPELL", "CAST_TRIGGER_DEPENDENCY"),
    ("COUNTER_SPELL", "CARES_ABOUT_RESOLUTION"),
    ("TAX_SPELL", "SPELL_VELOCITY_DEPENDENCY"),
    ("TAX_SPELL", "CARES_ABOUT_RESOLUTION"),
    ("COST_INCREASE", "SPELL_VELOCITY_DEPENDENCY"),
    ("COST_REDUCTION", "SPELL_VELOCITY_DEPENDENCY"),
    ("FOG", "MUST_ATTACK"),
    ("FOG", "CARES_ABOUT_COMBAT_DAMAGE"),
    ("DAMAGE_CREATURE", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
    ("DAMAGE_PLAYER", "COMMANDER_DAMAGE_PLAN"),
    ("EDICT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD"),
    ("ENCHANTMENT_REMOVAL", "AURA_EQUIPMENT_INVESTMENT"),
    ("ARTIFACT_SHUTDOWN", "ARTIFACT_COMMANDER_DEPENDENCY"),
    ("ARTIFACT_SHUTDOWN", "ARTIFACT_TOKEN_DEPENDENCY"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"),
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
    if concept_id not in BY_ID:
        return []
    c = BY_ID[concept_id]
    hits = []
    if concept_id == "CREATE_TOKEN" and is_token_card(type_line, name):
        hits.append("B_is_a_token")
    for bucket, regs in c["lexical_re"].items():
        if any(r.search(text or "") for r in regs):
            hits.append(bucket)
    return hits


PROVENANCE_COUNTS = {}
for _c in SPLITS:
    code = (_c.get("provenance") or {}).get("code", "?")
    PROVENANCE_COUNTS[code] = PROVENANCE_COUNTS.get(code, 0) + 1
