"""
Multi-channel pressure for the v2 lineage.

Does not rewrite pressure_pair. Does not canonize Pressure v2.
Does not replace K. Derived from already-reviewed terms.

    hostile_pressure        ATTACKS + DISRUPTS  (resilience already applied per term)
    supportive_pressure     ENABLES + BENEFITS
    conditional_pressure    CONDITIONAL (kept visible; not folded into hostile)
    resilience_mitigation   raw hostile minus effective hostile
    net_interaction         hostile - supportive

The antisymmetric matrix may be derived from net_interaction.
The historical eligibleAttackPressure scalar remains the continuity diagnostic.
"""

from __future__ import annotations

from collections import defaultdict

from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH

HOSTILE = {"ATTACKS", "DISRUPTS"}
SUPPORT = {"ENABLES", "BENEFITS"}


def _cap_domain(cap_id: str) -> str:
    card = CAP_MECH.get(cap_id) or {}
    return card.get("domain") or "unknown"


def _dep_domain(dep_id: str) -> str:
    card = DEP_MECH.get(dep_id) or RES_MECH.get(dep_id) or {}
    return card.get("domain") or "unknown"


def pair_channels(block: dict) -> dict:
    attacks = block.get("attackTerms") or []
    enables = block.get("enableTerms") or []
    hostile = [t for t in attacks if t.get("relation") in HOSTILE]
    cond = [t for t in attacks if t.get("relation") == "CONDITIONAL"]
    support = [t for t in enables if t.get("relation") in SUPPORT]
    h = sum(float(t.get("effectiveTerm") or 0) for t in hostile)
    s = sum(abs(float(t.get("effectiveTerm") or 0)) for t in support)
    c = sum(float(t.get("effectiveTerm") or 0) for t in cond)
    raw_h = sum(float(t.get("rawTerm") or t.get("effectiveTerm") or 0) for t in hostile)
    r_mit = raw_h - h
    return {
        "hostile_pressure": round(h, 4),
        "supportive_pressure": round(s, 4),
        "conditional_pressure": round(c, 4),
        "resilience_mitigation": round(r_mit, 4),
        "net_interaction": round(h - s, 4),
    }


def attach_channels(pairs: list[dict]) -> list[dict]:
    for p in pairs:
        for block in p.get("families", {}).values():
            block.update(pair_channels(block))
    return pairs


def concentration_report(pairs: list[dict], family: str = "conservative") -> dict:
    edge_h = defaultdict(float)
    edge_s = defaultdict(float)
    domain_h = defaultdict(float)
    domain_s = defaultdict(float)
    n_pairs = 0
    for p in pairs:
        block = p["families"][family]
        n_pairs += 1
        for t in block.get("attackTerms") or []:
            if t.get("relation") not in HOSTILE:
                continue
            key = f"{t['capability']} → {t['dependency']}"
            w = float(t.get("effectiveTerm") or 0)
            edge_h[key] += w
            domain_h[_cap_domain(t["capability"])] += w
        for t in block.get("enableTerms") or []:
            if t.get("relation") not in SUPPORT:
                continue
            key = f"{t['capability']} → {t.get('target') or t.get('dependency')}"
            w = abs(float(t.get("effectiveTerm") or 0))
            edge_s[key] += w
            domain_s[_cap_domain(t["capability"])] += w

    def cr(mass: dict, ks: list[int]) -> dict:
        ranked = sorted(mass.items(), key=lambda kv: -kv[1])
        total = sum(v for _, v in ranked)
        out = {"total": round(total, 4), "nEdges": len(ranked)}
        for k in ks:
            top = ranked[:k]
            out[f"CR_{k}"] = round(sum(v for _, v in top) / total, 4) if total else 0.0
            out[f"top{k}"] = [{"edge": e, "mass": round(v, 4), "share": round(v / total, 4) if total else 0.0} for e, v in top]
        return out

    def domains(mass: dict) -> list[dict]:
        total = sum(mass.values())
        return [
            {"domain": d, "mass": round(v, 4), "share": round(v / total, 4) if total else 0.0}
            for d, v in sorted(mass.items(), key=lambda kv: -kv[1])
        ]

    hostile = cr(edge_h, [1, 5, 10, 20])
    support = cr(edge_s, [1, 5, 10, 20])
    return {
        "nPairs": n_pairs,
        "hostile": {**hostile, "domains": domains(domain_h)},
        "supportive": {**support, "domains": domains(domain_s)},
        "hostileActiveMassMean": round(sum(p["families"][family].get("hostile_pressure", 0) for p in pairs) / max(n_pairs, 1), 4),
        "supportiveActiveMassMean": round(sum(p["families"][family].get("supportive_pressure", 0) for p in pairs) / max(n_pairs, 1), 4),
    }
