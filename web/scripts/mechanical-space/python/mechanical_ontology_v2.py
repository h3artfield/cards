"""Hierarchical mechanical ontology v2: capability / dependency, polarity, hard negatives."""

from __future__ import annotations

import re

from mechanical_ontology_v1 import _der, _lit


def C(
    id: str,
    *,
    family: str,
    parent: str | None = None,
    kind: str = "capability",
    role: str = "precise",
    spellbook: tuple[str, ...] = (),
    rc8: list | None = None,
    oracle: tuple[str, ...] = (),
    hn_oracle: tuple[str, ...] = (),
    hn_siblings: tuple[str, ...] = (),
    lexical: dict | None = None,
    polarity_of: str | None = None,
    polarity_sign: int = 0,
) -> dict:
    return {
        "id": id,
        "parent": parent,
        "kind": kind,
        "role": role,
        "family": family,
        "spellbook": list(spellbook),
        "rc8": rc8 or [],
        "oracle": list(oracle),
        "hn_oracle": list(hn_oracle),
        "hn_siblings": list(hn_siblings),
        "lexical": lexical or {},
        "polarity_of": polarity_of,
        "polarity_sign": polarity_sign,
    }


CONCEPTS: list[dict] = [
    # ── tokens ──────────────────────────────────────────────
    C(
        "CREATE_TOKEN",
        family="tokens",
        role="broad",
        spellbook=(r"create.*token", r"etb: create", r"token\(s\)", r"doubler - tokens"),
        rc8=_lit("create_token") + _der("token_generation"),
        oracle=(r"create[s]?\s+(?:a |one |two |three |x |that many )?.{0,40}token",),
        hn_oracle=(r"^$",),  # sibling/type-line handled in code
        hn_siblings=("IS_A_TOKEN",),
        lexical={
            "A_creates_token": [r"create[s]?\s+.{0,40}token"],
            "B_is_a_token": [r"^$"],
            "C_mentions_token_only": [r"\btoken\b"],
        },
    ),
    C("CREATE_TREASURE", family="tokens", parent="CREATE_TOKEN", spellbook=(r"treasure",), oracle=(r"treasure token",)),
    C(
        "IS_A_TOKEN",
        family="tokens",
        kind="audit",
        role="precise",
        oracle=(),
        lexical={"B_is_a_token": [r"token"]},
    ),
    C("TOKEN_ON_CAST", family="tokens", parent="CREATE_TOKEN", spellbook=(r"when you cast a spell, create a token",), oracle=(r"whenever you cast (?:a |your first )?spell.*create",)),
    C("TOKEN_ON_ETB", family="tokens", parent="CREATE_TOKEN", spellbook=(r"etb: create 1\+ token",), oracle=(r"when .* enters.*create .{0,40}token",)),
    C("TOKEN_ON_ATTACK", family="tokens", parent="CREATE_TOKEN", spellbook=(r"attack trigger: create token",), oracle=(r"whenever .* attacks.*create .{0,40}token",)),
    C("TOKEN_ON_DEATH", family="tokens", parent="CREATE_TOKEN", spellbook=(r"ltb/death trigger: create token",), oracle=(r"when .* dies.*create .{0,40}token",)),
    # ── sacrifice hierarchy ─────────────────────────────────
    C(
        "SACRIFICE",
        family="sacrifice",
        role="broad",
        spellbook=(r"sacrifice",),
        rc8=_lit("sacrifice"),
        oracle=(r"sacrifice (?:a |another |this |target |x |any number|each)",),
        lexical={
            "A_outlet": [r"\{t\}.*sacrifice|sacrifice (?:a |another )?(?:creature|permanent|artifact).{0,20}:"],
            "B_edict": [r"each (?:player|opponent) sacrifices|target (?:player|opponent) sacrifices"],
            "C_payoff": [r"whenever (?:you |a player )?sacrifices?"],
            "D_mention_only": [r"sacrifice"],
        },
    ),
    C(
        "SACRIFICE_AS_COST",
        family="sacrifice",
        parent="SACRIFICE",
        spellbook=(r"sacrifice outlet", r"can sacrifice itself"),
        oracle=(r"sacrifice (?:a |another |this )(?:creature|permanent|artifact|human)",),
        hn_siblings=("EDICT", "SACRIFICE_PAYOFF"),
    ),
    C(
        "REPEATABLE_SACRIFICE_OUTLET",
        family="sacrifice",
        parent="SACRIFICE_AS_COST",
        spellbook=(r"free sacrifice outlet", r"can sacrifice itself"),
        rc8=_der("sacrifice_outlet"),
        oracle=(
            r"\{t\},? sacrifice",
            r"sacrifice (?:a |another )?(?:creature|permanent|artifact).{0,24}:",
            r"sacrifice this (?:creature|permanent|artifact):",
        ),
        hn_oracle=(
            r"each (?:player|opponent) sacrifices",
            r"target (?:player|opponent) sacrifices",
            r"whenever (?:you |a player )?sacrifices?",
        ),
        hn_siblings=("EDICT", "SACRIFICE_PAYOFF"),
        lexical={
            "A_repeatable_outlet": [r"\{t\}.*sacrifice|sacrifice .{0,30}:"],
            "B_edict": [r"each (?:player|opponent) sacrifices"],
            "C_payoff": [r"whenever you sacrifice"],
        },
    ),
    C(
        "EDICT",
        family="sacrifice",
        parent="SACRIFICE",
        spellbook=(r"each player sacrifices", r"each opponent sacrifices"),
        oracle=(r"each (?:player|opponent) sacrifices", r"target (?:player|opponent) sacrifices"),
        hn_siblings=("REPEATABLE_SACRIFICE_OUTLET",),
    ),
    C(
        "SACRIFICE_PAYOFF",
        family="sacrifice",
        parent="SACRIFICE",
        spellbook=(r"whenever you sacrifice", r"sacrifice payoff", r"blood artist"),
        rc8=_der("sacrifice_payoff"),
        oracle=(r"whenever (?:you |a player )?sacrifices?",),
        hn_siblings=("REPEATABLE_SACRIFICE_OUTLET", "EDICT"),
    ),
    C(
        "SACRIFICE_SELF",
        family="sacrifice",
        parent="SACRIFICE",
        spellbook=(r"can sacrifice itself",),
        oracle=(r"sacrifice this (?:creature|permanent|artifact)", r"sacrifice ~"),
    ),
    # ── stack ───────────────────────────────────────────────
    C(
        "STACK_INTERACTION",
        family="stack",
        role="broad",
        spellbook=(r"counter target spell", r"change the target", r"copy target spell", r"unless its controller pays"),
        oracle=(r"counter target spell", r"change the target of target spell", r"copy target spell", r"counter that spell unless"),
        lexical={
            "A_counter_spell": [r"counter target spell"],
            "B_plus1_counter": [r"\+1/\+1 counter"],
            "C_redirect": [r"change the target of target spell"],
            "D_copy_spell": [r"copy target spell"],
        },
    ),
    C(
        "COUNTER_SPELL",
        family="stack",
        parent="STACK_INTERACTION",
        spellbook=(r"counter target spell", r"countermagic"),
        rc8=_lit("counter") + _der("countermagic"),
        oracle=(r"counter target (?:spell|activated ability|triggered ability)",),
        hn_oracle=(r"\+1/\+1 counter", r"change the target of target spell", r"copy target spell"),
        hn_siblings=("REDIRECT_SPELL", "PUT_COUNTER", "TAX_SPELL", "COPY_SPELL"),
        lexical={
            "A_counters_spell": [r"counter target spell"],
            "B_plus1_counters": [r"\+1/\+1 counter"],
            "C_removes_counters": [r"remove .* counter"],
            "D_redirects_spell": [r"change the target of target spell"],
        },
    ),
    C(
        "REDIRECT_SPELL",
        family="stack",
        parent="STACK_INTERACTION",
        spellbook=(r"change the target", r"new targets"),
        oracle=(r"change the target of target spell", r"choose new targets for target spell"),
        hn_siblings=("COUNTER_SPELL",),
    ),
    C(
        "COPY_SPELL",
        family="stack",
        parent="STACK_INTERACTION",
        spellbook=(r"copy target spell", r"copy .* spell"),
        oracle=(r"copy target (?:instant|sorcery|spell)", r"copy that spell"),
        hn_siblings=("COUNTER_SPELL", "COPY_PERMANENT"),
    ),
    C(
        "TAX_SPELL",
        family="stack",
        parent="STACK_INTERACTION",
        spellbook=(r"unless .* pays", r"counter .* unless"),
        oracle=(r"counter (?:target |that )?spell unless", r"unless (?:its|that spell's) controller pays"),
        hn_siblings=("COUNTER_SPELL",),
    ),
    C(
        "COPY_PERMANENT",
        family="copy",
        spellbook=(r"clone", r"copy of a creature", r"token that's a copy"),
        rc8=_lit("copy") + _der("copy_effects"),
        oracle=(r"copy of (?:target |a )?(?:creature|permanent|artifact)", r"token that's a copy"),
        hn_siblings=("COPY_SPELL",),
    ),
    # ── cost polarity ───────────────────────────────────────
    C(
        "COST_MODIFICATION",
        family="cost",
        role="broad",
        polarity_of="COST_MODIFICATION",
        spellbook=(r"cost reducer", r"costs? .* less", r"costs? .* more"),
        oracle=(r"cost[s]? \{?\d*\}? (?:less|more)", r"spells? you cast cost"),
        lexical={
            "A_reduction": [r"cost[s]? \{?\d*\}? less"],
            "B_increase": [r"cost[s]? \{?\d*\}? more", r"additional cost"],
            "C_alternative": [r"rather than pay", r"you may pay \{0\}", r"without paying (?:its|their) mana cost"],
        },
    ),
    C(
        "COST_REDUCTION",
        family="cost",
        parent="COST_MODIFICATION",
        polarity_of="COST_MODIFICATION",
        polarity_sign=1,
        spellbook=(r"cost reducer", r"costs? .* less"),
        rc8=_der("cost_reduction"),
        oracle=(r"cost[s]? \{?\d*\}? less", r"spells you cast cost \{?\d*\}? less"),
        hn_oracle=(r"cost[s]? \{?\d*\}? more", r"additional cost to cast", r"can't be reduced"),
        hn_siblings=("COST_INCREASE",),
        lexical={"A_reduction": [r"cost[s]? \{?\d*\}? less"], "B_increase": [r"cost[s]? \{?\d*\}? more"]},
    ),
    C(
        "COST_INCREASE",
        family="cost",
        parent="COST_MODIFICATION",
        polarity_of="COST_MODIFICATION",
        polarity_sign=-1,
        spellbook=(r"costs? .* more", r"additional cost"),
        oracle=(r"cost[s]? \{?\d*\}? more", r"additional cost to (?:cast|activate)", r"each spell costs"),
        hn_siblings=("COST_REDUCTION",),
    ),
    C(
        "ALTERNATIVE_COST",
        family="cost",
        parent="COST_MODIFICATION",
        spellbook=(r"rather than pay", r"without paying", r"you may pay \{0\}"),
        oracle=(r"rather than pay (?:this spell's |its |their )?mana cost", r"without paying (?:its|their|this spell's) mana cost", r"you may pay \{0\}"),
        hn_siblings=("COST_REDUCTION", "COST_INCREASE"),
    ),
    # ── graveyard polarity ──────────────────────────────────
    C(
        "RECURSION",
        family="graveyard",
        role="broad",
        polarity_of="GRAVEYARD_RELATION",
        polarity_sign=1,
        spellbook=(r"recursion", r"from your graveyard", r"return card from gy"),
        rc8=_der("recursion"),
        oracle=(r"from (?:your |a )?graveyard",),
        hn_siblings=("GRAVEYARD_DENIAL",),
    ),
    C(
        "GRAVEYARD_TO_HAND",
        family="graveyard",
        parent="RECURSION",
        spellbook=(r"return card from gy to hand", r"graveyard to (?:your )?hand"),
        rc8=_lit("flow_graveyard_to_hand"),
        oracle=(r"return .* from (?:your |a )?graveyard to (?:your |its owner'?s )?hand",),
        hn_siblings=("REANIMATION", "GRAVEYARD_DENIAL"),
    ),
    C(
        "REANIMATION",
        family="graveyard",
        parent="RECURSION",
        spellbook=(r"graveyard to battlefield", r"return card from graveyard to battlefield"),
        rc8=_lit("flow_graveyard_to_battlefield") + _der("reanimation"),
        oracle=(r"return .* from .*graveyard.*(?:onto|to) the battlefield",),
        hn_siblings=("GRAVEYARD_TO_HAND", "GRAVEYARD_DENIAL"),
    ),
    C(
        "CAST_FROM_GRAVEYARD",
        family="graveyard",
        parent="RECURSION",
        spellbook=(r"cast .* from .*graveyard", r"flashback", r"unearth", r"escape"),
        oracle=(r"you may (?:cast|play) .* from (?:your )?graveyard", r"flashback", r"\bunearth\b", r"\bescape\b"),
    ),
    C(
        "GRAVEYARD_DENIAL",
        family="graveyard",
        polarity_of="GRAVEYARD_RELATION",
        polarity_sign=-1,
        spellbook=(r"exile .*graveyard", r"cards in graveyards lose", r"if a card would be put into"),
        oracle=(
            r"exile (?:all cards from )?(?:all |target |each )?(?:graveyards?|a graveyard)",
            r"cards in graveyards lose",
            r"if a card would be put into (?:a |an opponent's )?graveyard",
        ),
        hn_siblings=("RECURSION", "REANIMATION", "GRAVEYARD_TO_HAND"),
        lexical={
            "A_denies_graveyard": [r"exile .*graveyard", r"cards in graveyards"],
            "B_uses_graveyard": [r"from (?:your )?graveyard"],
        },
    ),
    C("CAST_FROM_EXILE", family="exile", rc8=_der("cast_from_exile"), spellbook=(r"cast .* from exile",), oracle=(r"(?:cast|play) .* from exile",)),
    C("PLAY_FROM_TOP", family="library", spellbook=(r"cast spells from the top",), oracle=(r"from the top of your library",)),
    C("PLAY_LANDS_FROM_GRAVEYARD", family="graveyard", parent="RECURSION", spellbook=(r"play lands from your graveyard",), oracle=(r"play lands? from (?:your )?graveyard",)),
    # ── card flow ───────────────────────────────────────────
    C("DRAW_CARD", family="card_advantage", role="broad", spellbook=(r"draw a card", r"draw cards"), rc8=_lit("draw") + _der("card_draw"), oracle=(r"draw (?:a card|cards|x cards|that many cards)",)),
    C("DISCARD_CARD", family="hand", spellbook=(r"discard",), rc8=_lit("discard"), oracle=(r"discard (?:a card|cards|x cards|your hand)",)),
    C("MILL", family="graveyard", spellbook=(r"\bmill\b",), rc8=_lit("mill") + _der("mill"), oracle=(r"\bmills?\b",)),
    C("SCRY", family="selection", spellbook=(r"\bscry\b",), rc8=_lit("scry"), oracle=(r"\bscry\b",)),
    C("SURVEIL", family="selection", spellbook=(r"\bsurveil\b",), rc8=_lit("surveil"), oracle=(r"\bsurveil\b",)),
    C("SEARCH_LIBRARY", family="tutor", spellbook=(r"search your library", r"\btutor\b"), rc8=_lit("search_library") + _der("tutor"), oracle=(r"search your library",)),
    C("ADD_MANA", family="mana", role="broad", spellbook=(r"add(?:ing)? mana", r"taps (?:to add|for 2)", r"mana rock"), rc8=_lit("add_mana") + _der("mana_generation", "ramp"), oracle=(r"add (?:\{|one mana|two mana|x mana|an amount)",)),
    C("UNTAP", family="resources", spellbook=(r"\buntap\b",), rc8=_lit("untap"), oracle=(r"untap (?:target |that |all |each |this )",)),
    C("TAP", family="resources", spellbook=(r"tap target",), rc8=_lit("tap"), oracle=(r"tap target",)),
    # ── interaction / board polarity ────────────────────────
    C("DESTROY", family="interaction", spellbook=(r"\bdestroy\b",), rc8=_lit("destroy"), oracle=(r"destroy (?:target |all |each |up to )",)),
    C("EXILE", family="interaction", spellbook=(r"\bexile\b",), rc8=_lit("exile"), oracle=(r"exile (?:target |that |all |each |this |it)",)),
    C("BOUNCE", family="interaction", spellbook=(r"\bbounce\b",), rc8=_lit("return_to_hand", "flow_battlefield_to_hand"), oracle=(r"return (?:target |that )?.* to (?:its owner'?s|their owner'?s|your) hand",)),
    C("DEAL_DAMAGE", family="interaction", spellbook=(r"deal[s]? \d* damage",), rc8=_lit("deal_damage"), oracle=(r"deal[s]? \d* damage",)),
    C("REMOVAL", family="interaction", role="broad", spellbook=(r"destroy target", r"exile target"), rc8=_der("removal"), oracle=(r"destroy target (?:creature|permanent|artifact|enchantment)", r"exile target (?:creature|permanent)",)),
    C(
        "BOARD_WIPE",
        family="board",
        polarity_of="BOARD_RELATION",
        polarity_sign=-1,
        spellbook=(r"board wipe", r"destroy all"),
        rc8=_der("board_wipe"),
        oracle=(r"destroy all (?:creatures|permanents|artifacts|enchantments)", r"exile all creatures"),
        hn_siblings=("CREATE_TOKEN",),
    ),
    C("LIFE_GAIN", family="life", spellbook=(r"gain life", r"soul sister"), rc8=_lit("gain_life") + _der("life_gain"), oracle=(r"gain \d* life", r"\blifelink\b")),
    C("LIFE_LOSS", family="life", spellbook=(r"lose[s]? life", r"pay life"), rc8=_lit("lose_life") + _der("life_loss"), oracle=(r"lose[s]? \d* life", r"pay \d* life")),
    C(
        "PUT_COUNTER",
        family="counters",
        spellbook=(r"\+1/\+1 counter", r"-1/-1 counter", r"increaser - counters"),
        rc8=_lit("put_counter"),
        oracle=(r"put[s]? .*(?:\+1/\+1|-1/-1|loyalty|charge) counter",),
        hn_siblings=("COUNTER_SPELL",),
    ),
    C("PROLIFERATE", family="counters", spellbook=(r"proliferate",), oracle=(r"\bproliferate\b",)),
    C("PROTECTION", family="defense", spellbook=(r"protection", r"hexproof", r"indestructible", r"\bward\b"), rc8=_der("protection"), oracle=(r"\bhexproof\b", r"\bindestructible\b", r"protection from", r"\bward\b")),
    C("BLINK", family="recursion", spellbook=(r"\bblink\b", r"flicker"), rc8=_der("blink_flicker"), oracle=(r"exile .* then return", r"blink")),
    C("ETB_TRIGGER", family="triggers", role="broad", spellbook=(r"\betb\b", r"when .* enters"), oracle=(r"when (?:this |~ ).*enters", r"when this (?:creature|permanent|artifact|enchantment) enters")),
    C("CAST_TRIGGER", family="triggers", spellbook=(r"when you cast", r"whenever you cast"), oracle=(r"whenever you cast (?:a |your first )",)),
    C("LANDFALL", family="triggers", spellbook=(r"landfall",), oracle=(r"\blandfall\b", r"whenever a land you control enters")),
    C("DEATH_PAYOFF", family="sacrifice", spellbook=(r"ltb/death", r"whenever .* dies"), oracle=(r"whenever (?:a |another )?creature (?:you control )?dies", r"when this creature dies")),
    C("HASTE_ENABLER", family="combat", spellbook=(r"haste enabler", r"gains? haste"), oracle=(r"gains? haste", r"have haste")),
    C("FLASH_ENABLER", family="timing", spellbook=(r"flash enabler", r"spells have flash"), oracle=(r"have flash", r"as though (?:they|it) had flash")),
    C("EXTRA_COMBAT", family="combat", spellbook=(r"additional combat", r"extra combat"), oracle=(r"additional combat", r"another combat phase")),
    C("ANIMATOR", family="animation", spellbook=(r"animator",), oracle=(r"becomes? (?:a|an) .*creature",)),
    C("GRAVEYARD_SETUP", family="graveyard", rc8=_der("graveyard_setup", lo=0.69), spellbook=(r"self-mill",), oracle=(r"put .* into .*graveyard",)),
    # ── dependencies ────────────────────────────────────────
    C("CARES_ABOUT_TOKENS", family="tokens", kind="dependency", spellbook=(r"whenever you create a token", r"tokens you control"), oracle=(r"whenever you create (?:a |one or more )?token", r"tokens you control", r"for each token")),
    C("CARES_ABOUT_GRAVEYARD", family="graveyard", kind="dependency", spellbook=(r"from your graveyard", r"cards in your graveyard"), oracle=(r"from your graveyard", r"cards? in your graveyard", r"as long as there.*graveyard")),
    C("CARES_ABOUT_ARTIFACTS", family="artifacts", kind="dependency", spellbook=(r"artifact you control", r"whenever .* artifact"), oracle=(r"whenever (?:you cast )?an artifact", r"artifacts? you control", r"for each artifact")),
    C("CARES_ABOUT_CREATURE_DEATH", family="sacrifice", kind="dependency", spellbook=(r"whenever a creature .* dies", r"blood artist"), oracle=(r"whenever (?:a |another )?creature (?:you control )?dies",)),
    C("CARES_ABOUT_CASTING_SPELLS", family="stack", kind="dependency", spellbook=(r"whenever you cast", r"when you cast a spell"), oracle=(r"whenever you cast (?:a |your first )?(?:spell|instant|sorcery|creature)",)),
    C("CARES_ABOUT_COMBAT_DAMAGE", family="combat", kind="dependency", spellbook=(r"combat damage",), oracle=(r"whenever .* deals combat damage", r"when .* deals combat damage")),
    C("CARES_ABOUT_LANDS_ENTERING", family="lands", kind="dependency", spellbook=(r"landfall",), oracle=(r"whenever a land you control enters", r"\blandfall\b")),
    C("CARES_ABOUT_DRAWING_CARDS", family="card_advantage", kind="dependency", spellbook=(r"whenever you draw",), oracle=(r"whenever you draw (?:a card|your first card|one or more cards)",)),
    C("CARES_ABOUT_COUNTERS", family="counters", kind="dependency", spellbook=(r"proliferate", r"\+1/\+1 counter"), oracle=(r"\+1/\+1 counters? on", r"\bproliferate\b", r"counters on (?:it|them|this)")),
    C("CARES_ABOUT_SACRIFICE", family="sacrifice", kind="dependency", spellbook=(r"whenever you sacrifice",), oracle=(r"whenever you sacrifice", r"whenever a (?:creature|permanent) you control is sacrificed")),
    C("CARES_ABOUT_LIFE_GAIN", family="life", kind="dependency", spellbook=(r"whenever you gain life",), oracle=(r"whenever you gain life", r"whenever you gain \d* life")),
    C("CARES_ABOUT_CREATURES", family="board", kind="dependency", spellbook=(r"creatures you control",), oracle=(r"creatures you control", r"for each creature you control")),
    C("CARES_ABOUT_COMMANDER", family="commander", kind="dependency", spellbook=(r"your commander",), oracle=(r"your commander", r"a commander you own", r"commander tax")),
]


def compile_concept(c: dict) -> dict:
    out = dict(c)
    out["spellbook_re"] = [re.compile(p, re.I) for p in c["spellbook"]]
    out["oracle_re"] = [re.compile(p, re.I) for p in c["oracle"] if p and p != r"^$"]
    out["hn_oracle_re"] = [re.compile(p, re.I) for p in c["hn_oracle"] if p and p != r"^$"]
    out["lexical_re"] = {
        bucket: [re.compile(p, re.I) for p in pats if p and p != r"^$"]
        for bucket, pats in (c.get("lexical") or {}).items()
    }
    return out


COMPILED = [compile_concept(c) for c in CONCEPTS]
BY_ID = {c["id"]: c for c in COMPILED}


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


def is_token_card(type_line: str, name: str) -> bool:
    blob = f"{type_line} {name}".lower()
    return "token" in blob and "create" not in blob


def lexical_buckets(concept_id: str, text: str, type_line: str, name: str) -> list[str]:
    c = BY_ID[concept_id]
    hits = []
    if concept_id == "CREATE_TOKEN" and is_token_card(type_line, name):
        hits.append("B_is_a_token")
    for bucket, regs in c["lexical_re"].items():
        if any(r.search(text or "") for r in regs):
            hits.append(bucket)
    return hits
