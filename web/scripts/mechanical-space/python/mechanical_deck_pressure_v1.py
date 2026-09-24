"""
Deck Pressure v1 — one-way mechanical pressure.

Only reviewed K edges. UNKNOWN is not 0.
Packages inform prominence. They do not invent relations.
No formula is canonized. No win probability. No deck ranking.
"""

from __future__ import annotations

from mechanical_deck_profile_v1 import clip01


def capability_capacity(s: dict) -> float:
    """One random hate card ≠ a commander-centered engine."""
    promo = s.get("packageInformedProminence", s["prominence"])
    if s["commander_link"] >= 0.85:
        return promo
    n = int(s.get("nIndependent", 0))
    if n <= 1:
        return promo * 0.12
    breadth = clip01((n - 1) / 6.0)
    system = clip01(0.45 * (s["density"] / 0.12) + 0.25 * s["redundancy"] + 0.30 * breadth)
    return promo * system


def damper_factor(res_stats: dict | None, damper_edge: dict | None, family: str) -> tuple[float, dict | None]:
    if not res_stats or not damper_edge:
        return 1.0, None
    strength = abs(float(damper_edge.get("p_mechanicalPressure") or 0)) * float(damper_edge.get("q_relationConfidence") or 0)
    if family == "presence":
        r = res_stats["presence"]
    elif family == "conservative":
        r = capability_capacity({**res_stats, "packageInformedProminence": res_stats.get("packageInformedProminence", res_stats["prominence"])})
    else:
        r = res_stats.get("packageInformedProminence", res_stats["prominence"])
    factor = clip01(1.0 - strength * r)
    return factor, {
        "resilience": res_stats["id"],
        "resiliencePresence": res_stats["presence"],
        "resilienceProminence": res_stats["prominence"],
        "resilienceCommanderLink": res_stats["commander_link"],
        "damperP": damper_edge.get("p_mechanicalPressure"),
        "damperQ": damper_edge.get("q_relationConfidence"),
        "factor": round(factor, 4),
    }


def term_strength(c_stats: dict, d_stats: dict, edge: dict, family: str) -> float:
    p = float(edge.get("p_mechanicalPressure") or 0)
    q = float(edge.get("q_relationConfidence") or 0)
    k = abs(p) * q
    if family == "presence":
        return c_stats["presence"] * d_stats["criticality"] * k
    if family == "prominence":
        return c_stats.get("packageInformedProminence", c_stats["prominence"]) * d_stats["prominence"] * k
    # conservative: system-or-commander capacity × dependency criticality
    return capability_capacity(c_stats) * d_stats["criticality"] * k


def pressure_pair(
    a_axes: dict,
    b_axes: dict,
    attack_edges: list[dict],
    enable_edges: list[dict],
    damper_by_cap: dict[str, dict],
    family: str,
    unknown_candidates: list[tuple[str, str]],
    coverage_edges: list[dict] | None = None,
) -> dict:
    attacks = []
    for e in attack_edges:
        c, d = e["capability"], e["target"]
        c_stats = a_axes["capability"].get(c)
        d_stats = b_axes["dependency"].get(d)
        if not c_stats or not d_stats:
            continue
        raw = term_strength(c_stats, d_stats, e, family)
        damp_edge = damper_by_cap.get(c)
        r_stats = None
        if damp_edge:
            rid = damp_edge["target"]
            r_stats = b_axes["resilience"].get(rid)
        factor, damp_note = damper_factor(r_stats, damp_edge, family)
        effective = raw * factor
        attacks.append(
            {
                "capability": c,
                "dependency": d,
                "relation": e["relation"],
                "q": e["q_relationConfidence"],
                "p": e["p_mechanicalPressure"],
                "capabilityPresence": c_stats["presence"],
                "capabilityDensity": c_stats["density"],
                "capabilityRedundancy": c_stats["redundancy"],
                "capabilityCommanderLink": c_stats["commander_link"],
                "capabilityProminence": c_stats.get("packageInformedProminence", c_stats["prominence"]),
                "capabilityCapacity": round(capability_capacity(c_stats), 4),
                "dependencyProminence": d_stats["prominence"],
                "dependencyCriticality": d_stats["criticality"],
                "dependencyCommanderLink": d_stats["commander_link"],
                "rawTerm": round(raw, 4),
                "resilience": damp_note,
                "effectiveTerm": round(effective, 4),
                "reason": e.get("reason"),
            }
        )
    enables = []
    for e in enable_edges:
        c, t = e["capability"], e["target"]
        # enable may target a dependency or another capability
        c_stats = a_axes["capability"].get(c) or a_axes["dependency"].get(c)
        t_stats = b_axes["dependency"].get(t) or b_axes["capability"].get(t)
        if not c_stats or not t_stats:
            continue
        raw = term_strength(c_stats, {**t_stats, "criticality": t_stats.get("criticality", t_stats["prominence"])}, e, family)
        enables.append(
            {
                "capability": c,
                "target": t,
                "relation": e["relation"],
                "effectiveTerm": round(raw, 4),
                "reason": e.get("reason"),
            }
        )
    attacks.sort(key=lambda t: -abs(t["effectiveTerm"]))
    enables.sort(key=lambda t: -abs(t["effectiveTerm"]))

    # coverage: all reviewed pairs (including NEUTRAL). UNKNOWN is the rest.
    reviewed_mass = 0.0
    for e in coverage_edges or (attack_edges + enable_edges):
        cs = a_axes["capability"].get(e["capability"]) or a_axes["dependency"].get(e["capability"])
        ts = b_axes["dependency"].get(e["target"]) or b_axes["capability"].get(e["target"]) or b_axes["resilience"].get(e["target"])
        if cs and ts:
            reviewed_mass += cs.get("packageInformedProminence", cs["prominence"]) * ts["prominence"]
    unknown_terms = []
    unknown_mass = 0.0
    for c, d in unknown_candidates:
        cs = a_axes["capability"].get(c)
        ds = b_axes["dependency"].get(d)
        if not cs or not ds:
            continue
        if cs["prominence"] < 0.25 or ds["prominence"] < 0.25:
            continue
        m = cs["prominence"] * ds["prominence"]
        unknown_mass += m
        unknown_terms.append({"capability": c, "dependency": d, "mass": round(m, 4)})
    unknown_terms.sort(key=lambda x: -x["mass"])
    denom = reviewed_mass + unknown_mass
    coverage = reviewed_mass / denom if denom else 0.0

    return {
        "family": family,
        "supportedAttackPressure": round(sum(t["effectiveTerm"] for t in attacks), 4),
        "supportedEnablePressure": round(sum(t["effectiveTerm"] for t in enables), 4),
        "attackTerms": attacks,
        "enableTerms": enables,
        "unknownPotentialTerms": unknown_terms[:12],
        "coverage": round(coverage, 4),
        "reviewedMass": round(reviewed_mass, 4),
        "unknownMass": round(unknown_mass, 4),
        "nAttackTerms": len(attacks),
        "nEnableTerms": len(enables),
        "nUnknownPotential": len(unknown_terms),
    }
