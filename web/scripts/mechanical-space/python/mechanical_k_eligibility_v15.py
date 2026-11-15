"""
K pressure-eligibility mask v1.5.

Does not retrain coordinates. Does not rewrite K history.
A BROAD_FAMILY can say mechanics are related. It cannot carry a
directional pressure term when its children imply conflicting directions.
UNDERDEFINED capabilities cannot exert directional pressure.
Dependencies and resilience stay eligible in their target/damper roles.
"""

from __future__ import annotations

# Parents whose children do not share a causal sign.
CONFLICTING_DIRECTION_CHILDREN = {
    "COST_MODIFICATION": {
        "children": ("COST_REDUCTION", "COST_INCREASE", "ALTERNATIVE_COST"),
        "conflict": "COST_REDUCTION / ALTERNATIVE_COST ENABLE; COST_INCREASE DISRUPTS",
    },
    "SACRIFICE": {
        "children": ("EDICT", "REPEATABLE_SACRIFICE_OUTLET", "SACRIFICE_PAYOFF", "SACRIFICE_AS_COST", "SACRIFICE_SELF"),
        "conflict": "EDICT attacks; outlets and payoffs enable same-player plans",
    },
    "STACK_INTERACTION": {
        "children": ("COUNTER_SPELL", "REDIRECT_SPELL", "COPY_SPELL", "TAX_SPELL"),
        "conflict": "COUNTER / TAX disrupt; COPY enables; REDIRECT is conditional",
    },
}

DIRECTIONAL = {"ATTACKS", "DISRUPTS", "ENABLES", "BENEFITS", "CONDITIONAL"}


def class_of(by_axis: dict, axis_id: str) -> str:
    row = by_axis.get(axis_id) or {}
    return row.get("directionClass") or "UNDERDEFINED"


def capability_pressure_gate(cap_id: str, by_axis: dict) -> dict:
    cls = class_of(by_axis, cap_id)
    if cap_id in CONFLICTING_DIRECTION_CHILDREN:
        return {
            "eligible": False,
            "reason": "BROAD_FAMILY_CONFLICTING_CHILDREN",
            "directionClass": cls,
            "conflict": CONFLICTING_DIRECTION_CHILDREN[cap_id]["conflict"],
            "children": list(CONFLICTING_DIRECTION_CHILDREN[cap_id]["children"]),
        }
    if cls == "UNDERDEFINED":
        return {"eligible": False, "reason": "UNDERDEFINED", "directionClass": cls}
    if cls in {"BROAD_FAMILY", "POLARITY_CONFLATED", "LEXICALLY_CONTAMINATED"}:
        return {"eligible": False, "reason": f"{cls}_DEFAULT", "directionClass": cls}
    return {"eligible": True, "reason": "PURE", "directionClass": cls or "PURE"}


def edge_pressure_eligible(edge: dict, by_axis: dict) -> bool:
    rel = edge.get("relation")
    if rel == "MITIGATED_BY":
        return True
    if rel not in DIRECTIONAL:
        return False
    return capability_pressure_gate(edge.get("capability") or "", by_axis)["eligible"]


def unknown_eligible_for_pressure(cap_id: str, by_axis: dict) -> bool:
    """Could this UNKNOWN capability become a legal pressure term if reviewed?"""
    return capability_pressure_gate(cap_id, by_axis)["eligible"]


def filter_edges(edges: list[dict], by_axis: dict) -> list[dict]:
    return [e for e in edges if edge_pressure_eligible(e, by_axis)]


def eligible_top_edge(block: dict, by_axis: dict) -> str | None:
    for t in block.get("attackTerms") or []:
        if t.get("effectiveTerm", 0) < 0.005:
            continue
        fake = {"capability": t["capability"], "relation": t.get("relation", "ATTACKS")}
        if edge_pressure_eligible(fake, by_axis):
            return f"{t['capability']} → {t['dependency']}"
    return None


def eligible_attack_pressure(block: dict, by_axis: dict) -> float:
    total = 0.0
    for t in block.get("attackTerms") or []:
        fake = {"capability": t["capability"], "relation": t.get("relation", "ATTACKS")}
        if edge_pressure_eligible(fake, by_axis):
            total += float(t.get("effectiveTerm") or 0)
    return round(total, 4)
