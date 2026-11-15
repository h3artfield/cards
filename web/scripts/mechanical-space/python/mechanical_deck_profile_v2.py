"""
Deck Mechanical Profile v2 — hierarchy-aware, same field definitions.

Parents are family summaries. Children are the story.
One physical card counts once inside a family.
Does not compute K. Does not name archetypes.
"""

from __future__ import annotations

from mechanical_deck_profile_v1 import (
    PACKAGES as V1_PACKAGES,
    axis_stats,
    exhibit_weight,
    mechanical_sentence,
    package_activity,
    package_boost,
    prominence,
)
from mechanical_ontology_v22 import BY_ID, CONCEPTS

# Off the board: failed teacher support in Ontology v2.2.
UNSUPPORTED_AXES = ("COMMANDER_DAMAGE_PLAN", "ARTIFACT_COMMANDER_DEPENDENCY")

# Documented change vs v1: parent density/redundancy/presence use family-union
# exhibit weights (max across parent + trained children per card).
# Children use the v1 per-axis formulas unchanged.
PARENT_FAMILY_UNION = True

# Additional packages that prefer trained children. Not archetype names.
V2_PACKAGES = [
    {
        "id": "AURA_EQUIPMENT_ONE_CREATURE",
        "chain": ["AURA_EQUIPMENT_INVESTMENT", "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD", "PROTECTION"],
        "supports": ["CARES_ABOUT_ONE_CREATURE"],
    },
    {
        "id": "MUST_ATTACK_PLUS_COMBAT_DAMAGE",
        "chain": ["MUST_ATTACK", "CARES_ABOUT_COMBAT_DAMAGE"],
        "supports": ["EXTRA_COMBAT", "ATTACK_TRIGGER"],
    },
    {
        "id": "ATTACK_TRIGGER_PLUS_COMBAT_DAMAGE",
        "chain": ["ATTACK_TRIGGER", "CARES_ABOUT_COMBAT_DAMAGE"],
        "supports": ["MUST_ATTACK", "EXTRA_COMBAT"],
    },
    {
        "id": "DRAW_TRIGGER_ENGINE",
        "chain": ["DRAW_CARD", "DRAW_TRIGGER_DEPENDENCY"],
        "supports": [],
    },
    {
        "id": "HAND_SIZE_ENGINE",
        "chain": ["DRAW_CARD", "CARES_ABOUT_LARGE_HAND"],
        "supports": [],
    },
    {
        "id": "CARD_ACCESS_ENGINE",
        "chain": ["DRAW_CARD", "CARD_ACCESS_DEPENDENCY"],
        "supports": [],
    },
    {
        "id": "CAST_TRIGGER_ENGINE",
        "chain": ["CAST_TRIGGER", "CAST_TRIGGER_DEPENDENCY"],
        "supports": ["CARES_ABOUT_RESOLUTION"],
    },
    {
        "id": "SPELL_RESOLUTION_ENGINE",
        "chain": ["CARES_ABOUT_RESOLUTION", "CAST_TRIGGER"],
        "supports": ["COUNTERSPELL_RESILIENCE"],
    },
    {
        "id": "SPELL_VELOCITY_ENGINE",
        "chain": ["SPELL_VELOCITY_DEPENDENCY", "CAST_TRIGGER"],
        "supports": ["CARES_ABOUT_SPELL_CHAIN"],
    },
    {
        "id": "CREATURE_TOKEN_ENGINE",
        "chain": ["CREATE_CREATURE_TOKEN", "CARES_ABOUT_TOKENS"],
        "supports": ["TOKEN_ON_ETB"],
    },
    {
        "id": "ARTIFACT_TOKEN_ENGINE",
        "chain": ["ARTIFACT_PRODUCTION", "ARTIFACT_TOKEN_DEPENDENCY"],
        "supports": ["CREATE_TREASURE"],
    },
]

DEBT_FAMILIES = {
    "damage_combat": {
        "parents": ["DEAL_DAMAGE", "CARES_ABOUT_COMBAT"],
        "children": [
            "DAMAGE_CREATURE",
            "DAMAGE_PLAYER",
            "COMBAT_DAMAGE_DEALT",
            "NONCOMBAT_DAMAGE",
            "MUST_ATTACK",
            "ATTACK_TRIGGER",
            "CREATURE_COMBAT_DEPENDENCY",
            "CARES_ABOUT_COMBAT_DAMAGE",
        ],
    },
    "drawing_hand_access": {
        "parents": ["CARES_ABOUT_DRAWING_CARDS"],
        "children": [
            "DRAW_TRIGGER_DEPENDENCY",
            "CARD_ACCESS_DEPENDENCY",
            "DRAW_VOLUME_DEPENDENCY",
            "CARES_ABOUT_LARGE_HAND",
        ],
    },
    "one_creature": {
        "parents": ["CARES_ABOUT_ONE_CREATURE"],
        "children": [
            "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD",
            "MUST_ATTACK_WITH_ONE_CREATURE",
            "AURA_EQUIPMENT_INVESTMENT",
        ],
    },
    "casting_resolution": {
        "parents": ["CARES_ABOUT_CASTING_SPELLS"],
        "children": [
            "CAST_TRIGGER_DEPENDENCY",
            "CARES_ABOUT_RESOLUTION",
            "CARES_ABOUT_SPELL_CHAIN",
            "SPELL_VELOCITY_DEPENDENCY",
        ],
    },
    "token_subtype": {
        "parents": ["CREATE_TOKEN", "CARES_ABOUT_TOKENS"],
        "children": ["CREATE_CREATURE_TOKEN", "CREATE_TREASURE", "ARTIFACT_PRODUCTION", "ARTIFACT_TOKEN_DEPENDENCY"],
    },
    "artifact_qualified": {
        "parents": ["CARES_ABOUT_ARTIFACTS", "CARES_ABOUT_COMMANDER"],
        "children": ["CARES_ABOUT_ARTIFACT_ACTIVATIONS", "ARTIFACT_TOKEN_DEPENDENCY"],
        "unsupported": ["ARTIFACT_COMMANDER_DEPENDENCY"],
    },
}

SUSPICIOUS_SIBLINGS = {
    frozenset(("COST_INCREASE", "COST_REDUCTION")),
}

COMPATIBLE_SIBLINGS = {
    frozenset(("DAMAGE_CREATURE", "DAMAGE_PLAYER")),
    frozenset(("MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD", "AURA_EQUIPMENT_INVESTMENT")),
    frozenset(("CREATE_CREATURE_TOKEN", "CREATE_TREASURE")),
    frozenset(("CREATE_CREATURE_TOKEN", "ARTIFACT_PRODUCTION")),
    frozenset(("CAST_TRIGGER_DEPENDENCY", "CARES_ABOUT_RESOLUTION")),
    frozenset(("DRAW_TRIGGER_DEPENDENCY", "CARES_ABOUT_LARGE_HAND")),
    frozenset(("DRAW_TRIGGER_DEPENDENCY", "CARD_ACCESS_DEPENDENCY")),
    frozenset(("MUST_ATTACK", "ATTACK_TRIGGER")),
    frozenset(("MUST_ATTACK", "CARES_ABOUT_COMBAT_DAMAGE")),
    frozenset(("ATTACK_TRIGGER", "CARES_ABOUT_COMBAT_DAMAGE")),
}


def parent_of(cid: str) -> str | None:
    return (BY_ID.get(cid) or {}).get("parent")


def children_of(parent: str, trained: set[str]) -> list[str]:
    return [c["id"] for c in CONCEPTS if c.get("parent") == parent and c["id"] in trained]


def is_broad(meta: dict) -> bool:
    return meta.get("role") == "broad" or meta.get("directionClass") in {"BROAD_FAMILY", "UNDERDEFINED"}


def exhibitor_idx(weights: list[float], thresh: float = 0.15) -> set[int]:
    return {i for i, w in enumerate(weights) if w >= thresh}


def family_union_weights(parent_w: list[float], child_ws: list[list[float]]) -> list[float]:
    out = list(parent_w)
    for cw in child_ws:
        for i, w in enumerate(cw):
            if w > out[i]:
                out[i] = w
    return out


def inheritance_artifact(chain: list[str], weights_by_id: dict[str, list[float]], trained_parents: dict[str, str]) -> dict:
    """Parent+child in the same chain, same physical cards → not a second system."""
    hits = []
    for a in chain:
        for b in chain:
            if a == b or a not in weights_by_id or b not in weights_by_id:
                continue
            if trained_parents.get(b) != a:
                continue
            sa, sb = exhibitor_idx(weights_by_id[a]), exhibitor_idx(weights_by_id[b])
            union = sa | sb
            if not union:
                continue
            jacc = len(sa & sb) / len(union)
            exclusive_parent = sa - sb
            if jacc >= 0.85 and len(exclusive_parent) < 2:
                hits.append({"parent": a, "child": b, "jaccard": round(jacc, 3), "exclusiveParentCards": len(exclusive_parent)})
    return {"isArtifact": bool(hits), "pairs": hits}


def role_type(meta: dict) -> str:
    if meta.get("directionClass") == "BROAD_FAMILY" or meta.get("role") == "broad":
        return "BROAD_FAMILY"
    kind = meta.get("kind") or "capability"
    return {"capability": "CAPABILITY", "dependency": "DEPENDENCY", "resilience": "RESILIENCE"}.get(kind, kind.upper())


def select_story_axes(rows: list[dict], meta_of: dict, n: int) -> tuple[list[dict], list[dict]]:
    """Prefer trained children over broad parents when both qualify."""
    cands = [r for r in rows if r["prominence"] >= 0.18 or r["commander_link"] >= 0.85]
    cands.sort(key=lambda r: -r["prominence"])
    cand_ids = {r["id"] for r in cands}
    story, family = [], []
    for r in cands:
        meta = meta_of.get(r["id"]) or {}
        kids_in = [c for c in cands if (meta_of.get(c["id"]) or {}).get("parent") == r["id"]]
        if is_broad(meta) and kids_in:
            family.append({**r, "replacedBy": [c["id"] for c in kids_in]})
            continue
        story.append(r)
    return story[:n], family


def evaluate_packages(
    specs: list[dict],
    axes: dict,
    meta_of: dict,
    weights_by_id: dict[str, list[float]],
    trained_parents: dict[str, str],
    source: str,
) -> list[dict]:
    out = []
    for spec in specs:
        members, supports = [], []
        ok = True
        for a in spec["chain"]:
            kind = (meta_of.get(a) or {}).get("kind")
            if kind not in axes or a not in axes[kind]:
                ok = False
                break
            members.append(axes[kind][a])
        if not ok:
            continue
        for a in spec.get("supports") or []:
            kind = (meta_of.get(a) or {}).get("kind")
            if kind in axes and a in axes[kind]:
                supports.append(axes[kind][a])
        naive = package_activity(members, supports, spec)
        art = inheritance_artifact(spec["chain"], weights_by_id, trained_parents)
        aware = dict(naive)
        if art["isArtifact"] and naive.get("active"):
            aware["active"] = False
            aware["inactiveReason"] = "parent_child_same_cards"
        out.append(
            {
                "id": spec["id"],
                "chain": spec["chain"],
                "source": source,
                **aware,
                "naiveActive": naive.get("active"),
                "naiveStrength": naive.get("strength"),
                "hierarchyArtifact": art["isArtifact"],
                "hierarchyPairs": art["pairs"],
            }
        )
    out.sort(key=lambda p: (-p["active"], -p["strength"]))
    return out


def family_accounting(
    parent: str,
    trained: set[str],
    weights_by_id: dict[str, list[float]],
    nonland: list[bool],
) -> dict:
    kids = children_of(parent, trained)
    pw = weights_by_id.get(parent) or []
    cws = [weights_by_id[k] for k in kids if k in weights_by_id]
    fam = family_union_weights(pw, cws) if pw else []
    parent_idx = exhibitor_idx(pw)
    family_idx = exhibitor_idx(fam)
    child_idx = set()
    child_counts = {}
    for k in kids:
        if k not in weights_by_id:
            continue
        ix = exhibitor_idx(weights_by_id[k])
        child_idx |= ix
        child_counts[k] = len(ix)
    nl_n = sum(1 for x in nonland if x) or 1
    fam_nl = sum(1 for i in family_idx if i < len(nonland) and nonland[i])
    return {
        "parent": parent,
        "children": kids,
        "nParentExhibitors": len(parent_idx),
        "nFamilyUnique": len(family_idx),
        "nChildLabelSum": sum(child_counts.values()),
        "nChildUnion": len(child_idx),
        "familyDensityNonland": round(fam_nl / nl_n, 4),
        "childCounts": child_counts,
        "uniqueLeqLabelSum": len(family_idx) <= max(sum(child_counts.values()), len(family_idx)),
        "uniqueGeqMaxChild": len(family_idx) >= max(child_counts.values(), default=0),
        "parentNotInflatedByChildren": len(family_idx) <= len(parent_idx | child_idx) + 0,
    }


def contradictory_children(axes_flat: dict) -> list[dict]:
    flags = []
    seen = set()
    ids = list(axes_flat)
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            key = frozenset((a, b))
            if key in seen:
                continue
            ra, rb = axes_flat[a], axes_flat[b]
            both = ra["prominence"] >= 0.40 and rb["prominence"] >= 0.40 and ra["density"] >= 0.08 and rb["density"] >= 0.08
            if not both:
                continue
            pa, pb = parent_of(a), parent_of(b)
            if pa != pb or not pa:
                continue
            seen.add(key)
            flags.append(
                {
                    "parent": pa,
                    "a": a,
                    "b": b,
                    "prominence": [ra["prominence"], rb["prominence"]],
                    "density": [ra["density"], rb["density"]],
                    "compatible": key in COMPATIBLE_SIBLINGS,
                    "suspicious": key in SUSPICIOUS_SIBLINGS and key not in COMPATIBLE_SIBLINGS,
                }
            )
    return flags
