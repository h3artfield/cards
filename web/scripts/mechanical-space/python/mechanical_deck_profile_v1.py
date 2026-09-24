"""
Deck Mechanical Profile v1.

Do not average the 92 card coordinates.
Do not compute A→B pressure.
Do not name archetypes.
"""

from __future__ import annotations

import math

# Mechanical compositions only. No archetype labels.
PACKAGES = [
    {
        "id": "TOKEN_THEN_SACRIFICE_THEN_DEATH_PAYOFF",
        "chain": ["CREATE_TOKEN", "REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_CREATURE_DEATH"],
        "supports": ["CARES_ABOUT_TOKENS", "CARES_ABOUT_SACRIFICE", "SACRIFICE_PAYOFF"],
    },
    {
        "id": "SACRIFICE_OUTLET_AND_SACRIFICE_CARE",
        "chain": ["REPEATABLE_SACRIFICE_OUTLET", "CARES_ABOUT_SACRIFICE"],
        "supports": ["SACRIFICE_PAYOFF", "EDICT"],
    },
    {
        "id": "GRAVEYARD_SETUP_THEN_RECURSION",
        "chain": ["GRAVEYARD_SETUP", "RECURSION", "CARES_ABOUT_GRAVEYARD"],
        "supports": ["REANIMATION", "GRAVEYARD_TO_HAND", "MILL"],
    },
    {
        "id": "MILL_THEN_REANIMATION",
        "chain": ["MILL", "REANIMATION", "CARES_ABOUT_GRAVEYARD"],
        "supports": ["GRAVEYARD_SETUP"],
    },
    {
        "id": "CAST_THEN_CAST_CARE",
        "chain": ["CAST_TRIGGER", "CARES_ABOUT_CASTING_SPELLS"],
        "supports": ["COPY_SPELL", "CARES_ABOUT_SPELL_CHAIN", "CARES_ABOUT_RESOLUTION"],
    },
    {
        "id": "SPELL_CHAIN_ENGINE",
        "chain": ["CARES_ABOUT_SPELL_CHAIN", "CARES_ABOUT_CASTING_SPELLS"],
        "supports": ["COPY_SPELL", "CAST_TRIGGER"],
    },
    {
        "id": "ONE_CREATURE_PLUS_PROTECTION",
        "chain": ["CARES_ABOUT_ONE_CREATURE", "PROTECTION"],
        "supports": ["CARES_ABOUT_COMMANDER"],
    },
    {
        "id": "COMMANDER_AS_ENGINE",
        "chain": ["CARES_ABOUT_COMMANDER"],
        "supports": ["CARES_ABOUT_ONE_CREATURE", "PROTECTION"],
        "minCommanderLink": 0.92,
        "minDensity": 0.10,
    },
    {
        "id": "ARTIFACT_BOARD_AND_ACTIVATIONS",
        "chain": ["CARES_ABOUT_ARTIFACTS", "CARES_ABOUT_ARTIFACT_ACTIVATIONS"],
        "supports": ["ARTIFACT_PRODUCTION", "CREATE_TREASURE"],
    },
    {
        "id": "LAND_ENTER_THEN_LAND_CARE",
        "chain": ["LANDFALL", "CARES_ABOUT_LANDS_ENTERING"],
        "supports": [],
    },
    {
        "id": "COMBAT_DAMAGE_ENGINE",
        "chain": ["CARES_ABOUT_COMBAT_DAMAGE", "CARES_ABOUT_COMBAT"],
        "supports": ["EXTRA_COMBAT", "DEAL_DAMAGE"],
    },
    {
        "id": "TOKEN_PLUS_TOKEN_CARE",
        "chain": ["CREATE_TOKEN", "CARES_ABOUT_TOKENS"],
        "supports": ["TOKEN_ON_ETB", "TOKEN_ON_DEATH"],
    },
    {
        "id": "DRAW_ENGINE",
        "chain": ["DRAW_CARD", "CARES_ABOUT_DRAWING_CARDS"],
        "supports": [],
    },
    {
        "id": "COUNTER_PLUS_LIFE_CARE",
        "chain": ["PUT_COUNTER", "CARES_ABOUT_COUNTERS"],
        "supports": ["PROLIFERATE"],
        "minDensity": 0.12,
    },
]


def clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def exhibit_weight(score: float, p90: float, p99: float) -> float:
    """Soft 0 at corpus p90, 1 at corpus p99. Not a raw score average."""
    return clip01((score - p90) / (p99 - p90 + 1e-6))


def noisy_or(weights: list[float]) -> float:
    acc = 1.0
    for w in weights:
        acc *= 1.0 - clip01(w)
    return clip01(1.0 - acc)


def axis_stats(
    weights: list[float],
    commander_weight: float,
    nonland_flags: list[bool],
    kind: str,
) -> dict:
    presence = noisy_or(weights)
    nl = [w for w, nl in zip(weights, nonland_flags) if nl]
    density = (sum(1 for w in nl if w >= 0.15) / len(nl)) if nl else 0.0
    n_strong = sum(1 for w in weights if w >= 0.5)
    n_indep = sum(1 for w in weights if w >= 0.35)
    redundancy = clip01(1.0 - math.exp(-n_strong / 5.0))
    commander_link = clip01(commander_weight)
    if kind == "dependency":
        criticality = presence * (0.55 * commander_link + 0.45 * density) * (0.35 + 0.65 * (1.0 - 0.55 * redundancy))
    elif kind == "resilience":
        criticality = presence * (0.4 * commander_link + 0.6 * density)
    else:
        criticality = presence * (0.35 * commander_link + 0.25 * density + 0.40 * (1.0 - redundancy))
    return {
        "presence": round(presence, 4),
        "density": round(density, 4),
        "redundancy": round(redundancy, 4),
        "criticality": round(clip01(criticality), 4),
        "commander_link": round(commander_link, 4),
        "nStrong": int(n_strong),
        "nIndependent": int(n_indep),
    }


def prominence(stats: dict) -> float:
    """Sort/display key. Presence saturates; density and commander_link do not."""
    dens = stats["density"] / 0.25
    indep = stats.get("nIndependent", 0) / 8.0
    return clip01(0.34 * clip01(dens) + 0.34 * stats["commander_link"] + 0.18 * clip01(indep) + 0.14 * stats["criticality"])


def package_activity(members: list[dict], supports: list[dict], spec: dict | None = None) -> dict:
    """A package is active only if the chain is present as a system, not one staple."""
    if not members:
        return {"active": False, "strength": 0.0}
    spec = spec or {}

    def engaged(s: dict) -> bool:
        return s["density"] >= 0.08 or s["commander_link"] >= 0.80

    def strong(s: dict) -> bool:
        return s["density"] >= 0.12 or s["commander_link"] >= 0.90 or s.get("nIndependent", 0) >= 4

    if spec.get("minCommanderLink") is not None and max(s["commander_link"] for s in members) < spec["minCommanderLink"]:
        return {"active": False, "strength": round(sum(prominence(s) for s in members) / len(members), 4)}
    if spec.get("minDensity") is not None and min(s["density"] for s in members) < spec["minDensity"]:
        return {"active": False, "strength": round(sum(prominence(s) for s in members) / len(members), 4)}
    if not all(engaged(s) for s in members):
        return {"active": False, "strength": round(sum(prominence(s) for s in members) / len(members), 4)}
    if not any(strong(s) for s in members):
        return {"active": False, "strength": round(sum(prominence(s) for s in members) / len(members), 4)}
    core = sum(0.55 * s["density"] / 0.25 + 0.45 * s["commander_link"] for s in members) / len(members)
    extra = max((prominence(s) for s in supports), default=0.0)
    return {"active": True, "strength": round(clip01(0.85 * clip01(core) + 0.15 * extra), 4)}


def package_boost(axis_id: str, packages: list[dict]) -> float:
    """Packages raise how real a mechanic is. They do not create K edges."""
    hits = [p["strength"] for p in packages if p.get("active") and axis_id in (p.get("chain") or [])]
    return min(0.25, 0.25 * max(hits, default=0.0))


def deck_axes_from_cards(
    cards: list[dict],
    cmd_oids: list[str],
    concept_ids: list[str],
    by_axis: dict,
    scores,
    p90,
    p99,
    row_of: dict,
) -> tuple[dict, list[dict]]:
    """Full C/D/R coordinates using frozen profile v1 metrics."""
    nonland = []
    for card in cards:
        tl = (card.get("typeLine") or "").lower()
        nonland.append(not tl.startswith("land") and "land —" not in tl and not tl.startswith("basic land"))
    axes = {"capability": {}, "dependency": {}, "resilience": {}}
    for j, cid in enumerate(concept_ids):
        meta = by_axis.get(cid) or {}
        kind = meta.get("kind")
        if kind not in axes:
            continue
        weights = [exhibit_weight(float(scores[card["row"], j]), float(p90[j]), float(p99[j])) for card in cards]
        cmd_w = 0.0
        if cmd_oids:
            cmd_w = max(float((scores[:, j] < scores[row_of[o], j]).mean()) for o in cmd_oids if o in row_of)
        rec = axis_stats(weights, cmd_w, nonland, kind)
        rec["id"] = cid
        rec["kind"] = kind
        rec["prominence"] = round(prominence(rec), 4)
        rec["axisReliability"] = meta.get("directionClass")
        axes[kind][cid] = rec

    packages = []
    for spec in PACKAGES:
        members, supports = [], []
        ok = True
        for a in spec["chain"]:
            kind = (by_axis.get(a) or {}).get("kind")
            if kind not in axes or a not in axes[kind]:
                ok = False
                break
            members.append(axes[kind][a])
        if not ok:
            continue
        for a in spec.get("supports") or []:
            kind = (by_axis.get(a) or {}).get("kind")
            if kind in axes and a in axes[kind]:
                supports.append(axes[kind][a])
        packages.append({"id": spec["id"], "chain": spec["chain"], **package_activity(members, supports, spec)})

    for kind in axes:
        for cid, rec in axes[kind].items():
            rec["packageBoost"] = round(package_boost(cid, packages), 4)
            rec["packageInformedProminence"] = round(clip01(rec["prominence"] + rec["packageBoost"]), 4)
    return axes, packages


def mechanical_sentence(top_caps: list[str], top_deps: list[str], active_packages: list[str]) -> str:
    caps = ", ".join(top_caps[:5]) if top_caps else "(none)"
    deps = ", ".join(top_deps[:4]) if top_deps else "(none)"
    pkgs = ", ".join(active_packages[:3]) if active_packages else "none above threshold"
    return f"capabilities: {caps}. dependencies: {deps}. packages: {pkgs}."
