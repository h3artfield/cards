"""
Experimental relation-compatibility screen.

Deterministic. Uses only structured mechanism cards.
Does not predict K. Does not use BGE. Does not declare NEUTRAL.

HIGH / MEDIUM / LOW answers:
  is this UNKNOWN a *credible challenger* given current mechanical ontology?

LOW means: no presently identified mechanism.
It does not mean the relation is NEUTRAL.
"""

from __future__ import annotations

from mechanical_k_v11 import DOMAIN_ALIASES_V11
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, parent_of

# Extra child-axis aliases. Explicit, not learned.
EXTRA_ALIASES = {
    ("permanents", "enchantments"): "subset",
    ("permanents", "artifact_tokens"): "subset",
    ("artifacts", "artifact_tokens"): "subset",
    ("artifact_tokens", "artifacts"): "subset",
    ("artifact_tokens", "artifact_activations"): "related_not_identical",
    ("tokens", "artifact_tokens"): "subset",
    ("tokens", "creatures"): "related_not_identical",
    ("creatures", "combat"): "related_not_identical",
    ("creatures", "combat_damage"): "related_not_identical",
    ("creatures", "death"): "related_not_identical",
    ("one_creature", "combat"): "related_not_identical",
    ("one_creature", "combat_damage"): "conditional",
    ("one_creature", "enchantments"): "related_not_identical",
    ("enchantments", "one_creature"): "related_not_identical",
    ("combat_damage", "enchantments"): "conditional",
    ("combat_damage", "one_creature"): "conditional",
    ("permanents", "combat"): "related_not_identical",
    ("permanents", "combat_damage"): "related_not_identical",
    ("artifact_activations", "enchantments"): "conditional",
    ("graveyard", "death"): "related_not_identical",
    ("death", "graveyard"): "related_not_identical",
    ("casting", "spell_chain"): "related_not_identical",
    ("stack", "casting"): "related_not_identical",
}

# Tight families. Lands are not dumped into a permanents mega-family —
# that would mark LANDFALL vs artifacts as a credible challenge.
FAMILIES = (
    frozenset({"stack", "stack_target", "casting", "resolution", "spell_chain"}),
    frozenset({"creatures", "one_creature"}),
    frozenset({"combat", "combat_damage"}),
    frozenset({"artifacts", "artifact_activations", "artifact_tokens"}),
    frozenset({"graveyard", "death"}),
    frozenset({"hand", "drawing"}),
    frozenset({"enchantments", "one_creature"}),
    frozenset({"sacrifice", "death"}),
)

ATTACK_OPS = {
    "deny",
    "prevent_resolution",
    "destroy",
    "exile",
    "restrict",
    "disable",
    "wipe",
    "discard",
    "prevent",
    "force_sacrifice",
    "bounce",
    "tax",
    "damage",
}
ENABLE_OPS = {"create", "enable_resource", "gain", "trigger_from"}
PRESSURED_MODES = {"uses_as_resource", "requires_board", "needs_access", "triggers_from", "scales_with", "requires_resolution"}

HIGH_REL = {"same", "subset"}
MED_REL = {"related_not_identical", "conditional", "different_mechanism"}

WEIGHT = {"HIGH": 1.0, "MEDIUM": 0.5, "LOW": 0.0}


def domain_rel(a: str, b: str) -> str:
    if a == b:
        return "same"
    if (a, b) in EXTRA_ALIASES:
        return EXTRA_ALIASES[(a, b)]
    if (b, a) in EXTRA_ALIASES:
        return EXTRA_ALIASES[(b, a)]
    return DOMAIN_ALIASES_V11.get((a, b), DOMAIN_ALIASES_V11.get((b, a), "unrelated"))


def share_family(a: str, b: str) -> bool:
    for fam in FAMILIES:
        if a in fam and b in fam:
            return True
    return False


def cap_card(cap_id: str) -> dict | None:
    return CAP_MECH.get(cap_id)


def dep_card(dep_id: str) -> dict | None:
    return DEP_MECH.get(dep_id) or RES_MECH.get(dep_id)


def compatibility(cap_id: str, dep_id: str) -> dict:
    cap = cap_card(cap_id)
    dep = dep_card(dep_id)
    if not cap or not dep:
        return {
            "level": "LOW",
            "reason": "MISSING_MECHANISM_CARD",
            "capDomain": None,
            "depDomain": None,
            "domainRel": None,
            "weight": 0.0,
        }
    cd, dd = cap["domain"], dep["domain"]
    rel = domain_rel(cd, dd)
    op = cap.get("operation")
    mode = dep.get("mode")
    fam = share_family(cd, dd)
    aligned = (op in ATTACK_OPS or op in ENABLE_OPS) and mode in PRESSURED_MODES

    if rel in HIGH_REL:
        level, why = "HIGH", f"domain_{rel}"
    elif rel in MED_REL and aligned:
        level, why = "HIGH", f"related_and_op_aligned:{rel}"
    elif rel in MED_REL:
        level, why = "MEDIUM", f"domain_{rel}"
    elif fam and aligned:
        level, why = "MEDIUM", "shared_family_and_op_aligned"
    elif fam:
        level, why = "MEDIUM", "shared_family"
    else:
        level, why = "LOW", "no_identified_mechanism"

    return {
        "level": level,
        "reason": why,
        "capDomain": cd,
        "depDomain": dd,
        "capOperation": op,
        "depMode": mode,
        "domainRel": rel,
        "sharedFamily": fam,
        "parentCap": parent_of(cap_id),
        "parentDep": parent_of(dep_id),
        "weight": WEIGHT[level],
    }
