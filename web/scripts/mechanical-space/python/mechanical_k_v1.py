"""
K v1 descriptors and relation engine.

K is a sparse, evidence-backed pressure graph.
Unreviewed cells are UNKNOWN, not 0.
BGE cosine is a control, never the relation.
"""

from __future__ import annotations

# Capability / dependency / resilience mechanism cards.
# These are typed descriptions, not K weights.

CAP_MECH = {
    "GRAVEYARD_DENIAL": {
        "domain": "graveyard",
        "operation": "deny",
        "scope": "broad",
        "persistence": "static",
        "timing": "continuous",
        "textHints": (r"exile .{0,40}graveyard", r"if a card would be put into .{0,20}graveyard"),
    },
    "COUNTER_SPELL": {
        "domain": "stack",
        "operation": "prevent_resolution",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "reactive",
        "textHints": (r"counter target spell",),
    },
    "REDIRECT_SPELL": {
        "domain": "stack_target",
        "operation": "redirect_target",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "reactive",
        "textHints": (r"change the target", r"choose new targets"),
    },
    "EDICT": {
        "domain": "creatures",
        "operation": "force_sacrifice",
        "scope": "one_per_player",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"each (?:player|opponent) sacrifices",),
    },
    "MASS_CREATURE_REMOVAL": {
        "domain": "creatures",
        "operation": "wipe",
        "scope": "broad",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"destroy all creatures", r"exile all creatures"),
    },
    "BOARD_WIPE": {
        "domain": "creatures",
        "operation": "wipe",
        "scope": "broad",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"destroy all",),
    },
    "CREATE_TOKEN": {
        "domain": "tokens",
        "operation": "create",
        "scope": "varies",
        "persistence": "repeatable",
        "timing": "proactive",
        "textHints": (r"create .{0,40}token",),
    },
    "REPEATABLE_SACRIFICE_OUTLET": {
        "domain": "sacrifice",
        "operation": "enable_resource",
        "scope": "repeatable",
        "persistence": "repeatable",
        "timing": "activated",
        "textHints": (r"\{t\}.*sacrifice", r"sacrifice .{0,24}:"),
    },
    "SACRIFICE_PAYOFF": {
        "domain": "sacrifice",
        "operation": "trigger_from",
        "scope": "repeatable",
        "persistence": "static",
        "timing": "reactive",
        "textHints": (r"whenever you sacrifice", r"whenever .{0,20} dies"),
    },
    "ARTIFACT_SHUTDOWN": {
        "domain": "artifact_activations",
        "operation": "disable",
        "scope": "broad",
        "persistence": "static",
        "timing": "continuous",
        "textHints": (r"activated abilities of artifacts", r"artifacts (?:don't|can't) untap"),
    },
    "ARTIFACT_REMOVAL": {
        "domain": "artifacts",
        "operation": "destroy",
        "scope": "point",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"destroy target artifact", r"exile target artifact"),
    },
    "HAND_ATTACK": {
        "domain": "hand",
        "operation": "discard",
        "scope": "point_or_mass",
        "persistence": "one_shot",
        "timing": "proactive",
        "textHints": (r"target (?:player|opponent) discards", r"each opponent discards"),
    },
    "LIFE_GAIN": {
        "domain": "life",
        "operation": "gain",
        "scope": "self",
        "persistence": "varies",
        "timing": "proactive",
        "textHints": (r"gain .{0,8}life",),
    },
    "FOG": {
        "domain": "combat_damage",
        "operation": "prevent",
        "scope": "broad",
        "persistence": "temporary",
        "timing": "reactive",
        "textHints": (r"prevent all combat damage",),
    },
    "CARES_ABOUT_CREATURE_DEATH": {
        "domain": "death",
        "operation": "trigger_from",
        "scope": "repeatable",
        "persistence": "static",
        "timing": "reactive",
        "textHints": (r"whenever .{0,24} dies",),
    },
}

DEP_MECH = {
    "CARES_ABOUT_GRAVEYARD": {"domain": "graveyard", "mode": "uses_as_resource", "textHints": (r"from (?:your )?graveyard", r"cards? in your graveyard")},
    "CARES_ABOUT_CASTING_SPELLS": {"domain": "casting", "mode": "triggers_from", "textHints": (r"whenever you cast", r"when you cast")},
    "CARES_ABOUT_SPELL_CHAIN": {"domain": "spell_chain", "mode": "scales_with", "textHints": (r"\bstorm\b", r"second spell", r"cast two")},
    "CARES_ABOUT_RESOLUTION": {"domain": "resolution", "mode": "requires_resolution", "textHints": (r"as .{0,12} resolves", r"if .{0,12} resolves")},
    "CARES_ABOUT_TOKENS": {"domain": "tokens", "mode": "scales_with", "textHints": (r"tokens? you control", r"whenever you create .{0,12}token")},
    "CARES_ABOUT_SACRIFICE": {"domain": "sacrifice", "mode": "triggers_from", "textHints": (r"whenever you sacrifice",)},
    "CARES_ABOUT_CREATURES": {"domain": "creatures", "mode": "requires_board", "textHints": (r"creatures you control", r"for each creature")},
    "CARES_ABOUT_ONE_CREATURE": {"domain": "one_creature", "mode": "requires_board", "textHints": (r"equipped creature", r"target creature you control")},
    "CARES_ABOUT_ARTIFACTS": {"domain": "artifacts", "mode": "scales_with", "textHints": (r"artifacts? you control", r"for each artifact")},
    "CARES_ABOUT_ARTIFACT_ACTIVATIONS": {"domain": "artifact_activations", "mode": "needs_access", "textHints": (r"activate", r"\{t\}:")},
    "CARES_ABOUT_LARGE_HAND": {"domain": "hand", "mode": "scales_with", "textHints": (r"cards in your hand", r"seven or more cards")},
    "CARES_ABOUT_DRAWING_CARDS": {"domain": "drawing", "mode": "triggers_from", "textHints": (r"whenever you draw",)},
    "CARES_ABOUT_LIFE_GAIN": {"domain": "life", "mode": "triggers_from", "textHints": (r"whenever you gain life",)},
    "CARES_ABOUT_COMBAT": {"domain": "combat", "mode": "needs_access", "textHints": (r"whenever .{0,20} attacks", r"during combat")},
    "CARES_ABOUT_COMBAT_DAMAGE": {"domain": "combat_damage", "mode": "triggers_from", "textHints": (r"combat damage",)},
    "CARES_ABOUT_LANDS_ENTERING": {"domain": "lands", "mode": "triggers_from", "textHints": (r"landfall", r"land you control enters")},
    "CARES_ABOUT_CREATURE_DEATH": {"domain": "death", "mode": "triggers_from", "textHints": (r"whenever .{0,24} dies",)},
    "CARES_ABOUT_DEATH_TRIGGERS": {"domain": "death", "mode": "triggers_from", "textHints": (r"whenever .{0,24} dies",)},
    "CARES_ABOUT_COMMANDER": {"domain": "commander", "mode": "uses_as_resource", "textHints": (r"your commander",)},
    "CARES_ABOUT_COUNTERS": {"domain": "counters", "mode": "scales_with", "textHints": (r"\+1/\+1", r"proliferate")},
}

RES_MECH = {
    "GRAVEYARD_HATE_RESILIENCE": {"domain": "graveyard", "mode": "alternative_zone", "textHints": (r"from exile", r"\bescape\b")},
    "COUNTERSPELL_RESILIENCE": {"domain": "stack", "mode": "uncounterable", "textHints": (r"can't be countered", r"\bcascade\b")},
    "BOARD_WIPE_RESILIENCE": {"domain": "creatures", "mode": "survives_wipe", "textHints": (r"indestructible", r"persist", r"undying")},
    "HAND_ATTACK_RESILIENCE": {"domain": "hand", "mode": "discards_anyway", "textHints": (r"\bmadness\b", r"if you would discard")},
    "SACRIFICE_RESILIENCE": {"domain": "sacrifice", "mode": "survives_edict", "textHints": (r"can't be sacrificed", r"persist")},
}

DOMAIN_ALIASES = {
    ("stack", "casting"): "related_not_identical",
    ("stack", "spell_chain"): "related_not_identical",
    ("stack", "resolution"): "related_not_identical",
    ("stack_target", "casting"): "different_mechanism",
    ("stack_target", "resolution"): "related_not_identical",
    ("creatures", "one_creature"): "subset",
    ("one_creature", "creatures"): "subset",
    ("artifacts", "artifact_activations"): "subset",
    ("artifact_activations", "artifacts"): "subset",
    ("combat", "combat_damage"): "subset",
    ("combat_damage", "combat"): "subset",
    ("sacrifice", "death"): "related_not_identical",
    ("death", "sacrifice"): "related_not_identical",
}

ATTACK_OPS = {"deny", "prevent_resolution", "destroy", "exile", "restrict", "disable", "wipe", "discard", "prevent", "force_sacrifice"}
ENABLE_OPS = {"create", "enable_resource", "gain", "trigger_from"}

# Pairs we actually review. Everything else stays UNKNOWN.
REVIEW_ATTACK_OR_SPECIAL = [
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_GRAVEYARD"),
    ("COUNTER_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
    ("COUNTER_SPELL", "CARES_ABOUT_RESOLUTION"),
    ("COUNTER_SPELL", "CARES_ABOUT_SPELL_CHAIN"),
    ("REDIRECT_SPELL", "CARES_ABOUT_CASTING_SPELLS"),
    ("EDICT", "CARES_ABOUT_ONE_CREATURE"),
    ("EDICT", "CARES_ABOUT_CREATURES"),
    ("EDICT", "CARES_ABOUT_SACRIFICE"),
    ("MASS_CREATURE_REMOVAL", "CARES_ABOUT_CREATURES"),
    ("BOARD_WIPE", "CARES_ABOUT_CREATURES"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ARTIFACTS"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"),
    ("ARTIFACT_REMOVAL", "CARES_ABOUT_ARTIFACTS"),
    ("HAND_ATTACK", "CARES_ABOUT_LARGE_HAND"),
    ("FOG", "CARES_ABOUT_COMBAT"),
    ("FOG", "CARES_ABOUT_COMBAT_DAMAGE"),
]
REVIEW_BENEFIT = [
    ("CREATE_TOKEN", "CARES_ABOUT_TOKENS"),
    ("REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_SACRIFICE"),
    ("LIFE_GAIN", "CARES_ABOUT_LIFE_GAIN"),
    ("CARES_ABOUT_CREATURE_DEATH", "SACRIFICE_PAYOFF"),
]
REVIEW_RESILIENCE = [
    ("GRAVEYARD_DENIAL", "GRAVEYARD_HATE_RESILIENCE"),
    ("COUNTER_SPELL", "COUNTERSPELL_RESILIENCE"),
    ("MASS_CREATURE_REMOVAL", "BOARD_WIPE_RESILIENCE"),
    ("HAND_ATTACK", "HAND_ATTACK_RESILIENCE"),
]
# Expected no-relation. Nearby-wrong preferred over random.
REVIEW_HARD_NEG = [
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_COMBAT_DAMAGE"),
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_LANDS_ENTERING"),
    ("COUNTER_SPELL", "CARES_ABOUT_LANDS_ENTERING"),
    ("COUNTER_SPELL", "CARES_ABOUT_TOKENS"),
    ("REDIRECT_SPELL", "CARES_ABOUT_LANDS_ENTERING"),
    ("EDICT", "CARES_ABOUT_GRAVEYARD"),
    ("ARTIFACT_SHUTDOWN", "CARES_ABOUT_GRAVEYARD"),
    ("HAND_ATTACK", "CARES_ABOUT_COMBAT_DAMAGE"),
    ("FOG", "CARES_ABOUT_GRAVEYARD"),
    ("CREATE_TOKEN", "CARES_ABOUT_LARGE_HAND"),
    ("LIFE_GAIN", "CARES_ABOUT_ARTIFACTS"),
    ("GRAVEYARD_DENIAL", "CARES_ABOUT_CASTING_SPELLS"),
]


def domain_relation(a: str, b: str) -> str:
    if a == b:
        return "same"
    return DOMAIN_ALIASES.get((a, b), DOMAIN_ALIASES.get((b, a), "unrelated"))


def scope_pressure(scope: str) -> float:
    return {
        "broad": 0.85,
        "all": 0.9,
        "one_per_player": 0.55,
        "point": 0.4,
        "point_or_mass": 0.55,
        "repeatable": 0.7,
        "varies": 0.5,
        "self": 0.45,
        "subset": 0.5,
    }.get(scope, 0.5)


def persistence_pressure(persistence: str) -> float:
    return {
        "static": 0.9,
        "continuous": 0.85,
        "repeatable": 0.7,
        "temporary": 0.45,
        "one_shot": 0.4,
        "varies": 0.5,
    }.get(persistence, 0.5)


def relate(cap_id: str, other_id: str) -> dict:
    """Deterministic mechanical question: does c operate on what d requires?"""
    cap = CAP_MECH.get(cap_id)
    dep = DEP_MECH.get(other_id)
    res = RES_MECH.get(other_id)
    if not cap:
        return {"relation": "UNKNOWN", "reason": "capability has no mechanism card"}

    if res:
        rel = domain_relation(cap["domain"], res["domain"])
        if rel in {"same", "subset", "related_not_identical"}:
            return {
                "relation": "MITIGATED_BY",
                "status": "SUPPORTED_BENEFIT",
                "conditionality": "medium" if rel != "same" else "low",
                "reason": f"resilience domain {res['domain']} can blunt {cap['operation']} on {cap['domain']}",
                "mechanism": {"capability": cap, "resilience": res, "domainMatch": rel},
            }
        return {
            "relation": "NEUTRAL",
            "status": "SUPPORTED_NEUTRAL",
            "conditionality": "none",
            "reason": "resilience domain does not meet this capability",
            "mechanism": {"capability": cap, "resilience": res, "domainMatch": rel},
        }

    if not dep:
        # inverted pair: other is a capability (e.g. SACRIFICE_PAYOFF)
        other_cap = CAP_MECH.get(other_id)
        if other_cap and cap["domain"] == other_cap["domain"] or (
            other_cap and domain_relation(cap["domain"], other_cap["domain"]) != "unrelated"
        ):
            return {
                "relation": "ENABLES",
                "status": "SUPPORTED_BENEFIT",
                "conditionality": "medium",
                "reason": "pair is capability→capability; treated as enabling the second mechanic, not an attack",
                "mechanism": {"capability": cap, "otherCapability": other_cap},
            }
        return {"relation": "UNKNOWN", "reason": "target has no mechanism card"}

    rel = domain_relation(cap["domain"], dep["domain"])
    op = cap["operation"]

    # Special cases the generic rule would get wrong.
    if cap_id == "REDIRECT_SPELL" and other_id == "CARES_ABOUT_CASTING_SPELLS":
        return {
            "relation": "DISRUPTS",
            "status": "SUPPORTED_ATTACK",
            "conditionality": "high",
            "reason": "Redirect changes targets; cast triggers still occur. Not a generic attack on casting.",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }
    if cap_id == "COUNTER_SPELL" and other_id == "CARES_ABOUT_CASTING_SPELLS":
        return {
            "relation": "ATTACKS",
            "status": "SUPPORTED_ATTACK",
            "conditionality": "medium",
            "reason": "Prevents resolution. Cast-triggered abilities still happen.",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }
    if cap_id == "COUNTER_SPELL" and other_id == "CARES_ABOUT_RESOLUTION":
        return {
            "relation": "ATTACKS",
            "status": "SUPPORTED_ATTACK",
            "conditionality": "low",
            "reason": "Resolution is exactly what a counter prevents.",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": "related_not_identical"},
        }
    if cap_id == "EDICT" and other_id == "CARES_ABOUT_SACRIFICE":
        return {
            "relation": "DISRUPTS",
            "status": "SUPPORTED_ATTACK",
            "conditionality": "high",
            "reason": "An edict forces an opponent's sacrifice; it does not feed your own sacrifice payoffs unless the payoff is global.",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }

    if rel == "unrelated":
        return {
            "relation": "NEUTRAL",
            "status": "SUPPORTED_NEUTRAL",
            "conditionality": "none",
            "reason": f"capability domain {cap['domain']} does not operate on dependency domain {dep['domain']}",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }

    if op in ENABLE_OPS and dep["mode"] in {"uses_as_resource", "scales_with", "triggers_from", "needs_access"}:
        return {
            "relation": "ENABLES",
            "status": "SUPPORTED_BENEFIT",
            "conditionality": "low" if rel == "same" else "medium",
            "reason": f"{op} supplies or feeds {dep['mode']} on {dep['domain']}",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }

    if op in ATTACK_OPS:
        cond = "low"
        if rel == "related_not_identical":
            cond = "medium"
        if cap_id == "EDICT" and other_id == "CARES_ABOUT_CREATURES":
            cond = "medium"
        return {
            "relation": "ATTACKS",
            "status": "SUPPORTED_ATTACK",
            "conditionality": cond,
            "reason": f"{op} on {cap['domain']} acts on required {dep['mode']} {dep['domain']}",
            "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
        }

    return {
        "relation": "NEUTRAL",
        "status": "SUPPORTED_NEUTRAL",
        "conditionality": "none",
        "reason": "domains meet but operations are not opposing or enabling",
        "mechanism": {"capability": cap, "dependency": dep, "domainMatch": rel},
    }


def derive_pressure(decision: dict) -> float | None:
    if decision["relation"] in {"UNKNOWN", "NEUTRAL"}:
        return 0.0 if decision["relation"] == "NEUTRAL" else None
    mech = decision.get("mechanism") or {}
    cap = mech.get("capability") or {}
    base = 0.5 * scope_pressure(cap.get("scope", "varies")) + 0.5 * persistence_pressure(cap.get("persistence", "varies"))
    cond = {"low": 1.0, "medium": 0.6, "high": 0.35, "none": 0.0}[decision.get("conditionality", "low")]
    sign = 1.0
    if decision["relation"] in {"ENABLES", "MITIGATED_BY"}:
        # benefit / damper — store as negative pressure on the attack convention
        sign = -1.0 if decision["relation"] == "MITIGATED_BY" else -0.85
    if decision["relation"] == "DISRUPTS":
        cond *= 0.7
    return round(float(sign * base * cond), 4)
