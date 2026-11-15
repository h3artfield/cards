#!/usr/bin/env python3
"""
Interaction Diversity Audit v1.

No new K reviews. No screen edits. No Pressure v2.
Compares realized channel pressure to credible opportunity
so a 60% permanents share can be read as landscape or coverage bias.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v14_active_coverage import status_of
from build_k_v2 import load_decks
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, SPLIT_PARENTS, k_pressure_eligible
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K26 = MS / "mechanical-pressure-k-v2.6"
SCREEN = MS / "compatibility-screen-v1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "interaction-diversity-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LIVE = {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}
CRED = {"HIGH", "MEDIUM"}

# Audit taxonomy only. Not an ontology change.
CAP_FAMILY_BY_ID = {
    "DESTROY": "removal",
    "EXILE": "removal",
    "BOUNCE": "removal",
    "REMOVAL": "removal",
    "MASS_CREATURE_REMOVAL": "removal",
    "BOARD_WIPE": "removal",
    "ENCHANTMENT_REMOVAL": "removal",
    "ARTIFACT_REMOVAL": "artifact_hate",
    "ARTIFACT_SHUTDOWN": "artifact_hate",
    "GRAVEYARD_DENIAL": "graveyard_hate",
    "COUNTER_SPELL": "counter",
    "REDIRECT_SPELL": "counter",
    "HAND_ATTACK": "discard",
    "DISCARD_CARD": "discard",
    "COST_INCREASE": "tax",
    "TAX_SPELL": "tax",
    "COST_MODIFICATION": "tax",
    "EDICT": "edict",
    "FOG": "combat_interference",
    "COMBAT_DAMAGE_DEALT": "combat_interference",
    "DAMAGE_CREATURE": "combat_interference",
    "NONCOMBAT_DAMAGE": "combat_interference",
    "TAP": "restriction",
    "MANA_DENIAL": "denial",
}

OP_FAMILY = {
    "destroy": "DESTROY",
    "exile": "EXILE",
    "bounce": "BOUNCE",
    "restrict": "TAP",
    "wipe": "MASS_REMOVAL",
    "disable": "SHUTDOWN",
    "deny": "DENIAL",
    "prevent": "PREVENT",
    "prevent_resolution": "COUNTER",
    "discard": "DISCARD",
    "tax": "TAX",
    "damage": "DAMAGE",
    "force_sacrifice": "EDICT",
}

DEP_FAMILY_BY_ID = {
    "CARES_ABOUT_CREATURES": "creature_body",
    "CREATURE_COMBAT_DEPENDENCY": "combat",
    "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD": "one_creature_investment",
    "MUST_ATTACK_WITH_ONE_CREATURE": "one_creature_investment",
    "AURA_EQUIPMENT_INVESTMENT": "aura_equipment",
    "ARTIFACT_TOKEN_DEPENDENCY": "artifact_token",
    "CARES_ABOUT_ARTIFACT_ACTIVATIONS": "artifact_activation",
    "CARES_ABOUT_ARTIFACTS": "artifact_activation",
    "CARES_ABOUT_COMBAT": "combat",
    "CARES_ABOUT_COMBAT_DAMAGE": "combat",
    "ATTACK_TRIGGER": "combat",
    "MUST_ATTACK": "combat",
    "CARES_ABOUT_COMMANDER": "commander",
    "CARES_ABOUT_GRAVEYARD": "graveyard",
    "CARES_ABOUT_CREATURE_DEATH": "death",
    "CARES_ABOUT_DEATH_TRIGGERS": "death",
    "CARES_ABOUT_RESOLUTION": "stack_resolution",
    "CARES_ABOUT_SPELL_CHAIN": "stack_resolution",
    "CAST_TRIGGER_DEPENDENCY": "stack_resolution",
    "SPELL_VELOCITY_DEPENDENCY": "stack_resolution",
    "CARD_ACCESS_DEPENDENCY": "card_access",
    "DRAW_TRIGGER_DEPENDENCY": "card_access",
    "DRAW_VOLUME_DEPENDENCY": "card_access",
    "CARES_ABOUT_LARGE_HAND": "card_access",
    "CARES_ABOUT_LANDS_ENTERING": "lands",
    "CARES_ABOUT_SACRIFICE": "sacrifice",
    "CARES_ABOUT_COUNTERS": "counters",
}

BUCKETS = ("hostile", "enable", "conditional", "neutral", "unknown_credible")


def cap_domain(cap_id: str) -> str:
    return (CAP_MECH.get(cap_id) or {}).get("domain") or "unknown"


def dep_domain(dep_id: str) -> str:
    return (DEP_MECH.get(dep_id) or RES_MECH.get(dep_id) or {}).get("domain") or "unknown"


def cap_op(cap_id: str) -> str:
    return (CAP_MECH.get(cap_id) or {}).get("operation") or "unknown"


def cap_family(cap_id: str) -> str:
    if cap_id in CAP_FAMILY_BY_ID:
        return CAP_FAMILY_BY_ID[cap_id]
    op = cap_op(cap_id)
    if op in {"destroy", "exile", "bounce", "wipe"}:
        return "removal"
    if op in {"deny", "disable", "prevent"}:
        return "denial"
    if op == "restrict":
        return "restriction"
    if op == "tax":
        return "tax"
    if op == "discard":
        return "discard"
    if op in {"prevent_resolution", "redirect_target"}:
        return "counter"
    if op == "force_sacrifice":
        return "edict"
    if op == "damage":
        return "combat_interference"
    if op in {"enable_resource", "create", "gain", "trigger_from", "copy", "blink", "tutor"}:
        return "support_tool"
    return "other"


def dep_family(dep_id: str) -> str:
    if dep_id in DEP_FAMILY_BY_ID:
        return DEP_FAMILY_BY_ID[dep_id]
    dom = dep_domain(dep_id)
    return {
        "creatures": "creature_body",
        "one_creature": "one_creature_investment",
        "enchantments": "aura_equipment",
        "artifact_tokens": "artifact_token",
        "artifacts": "artifact_activation",
        "artifact_activations": "artifact_activation",
        "combat": "combat",
        "combat_damage": "combat",
        "commander": "commander",
        "graveyard": "graveyard",
        "death": "death",
        "casting": "stack_resolution",
        "resolution": "stack_resolution",
        "spell_chain": "stack_resolution",
        "stack": "stack_resolution",
        "hand": "card_access",
        "drawing": "card_access",
        "lands": "lands",
        "sacrifice": "sacrifice",
        "counters": "counters",
    }.get(dom, "other")


def op_family(cap_id: str) -> str:
    if cap_id == "ARTIFACT_SHUTDOWN":
        return "ARTIFACT_SHUTDOWN"
    if cap_id in {"MASS_CREATURE_REMOVAL", "BOARD_WIPE"}:
        return "MASS_REMOVAL"
    return OP_FAMILY.get(cap_op(cap_id), "OTHER")


def shannon(shares: dict[str, float]) -> dict:
    vals = [v for v in shares.values() if v > 0]
    total = sum(vals)
    if not total:
        return {"S": 0.0, "N_eff": 0.0, "nPositive": 0}
    ps = [v / total for v in vals]
    s = -sum(p * math.log(p) for p in ps)
    return {"S": round(s, 4), "N_eff": round(math.exp(s), 4), "nPositive": len(ps)}


def cr_block(mass: dict[str, float], ks=(1, 5, 10, 20)) -> dict:
    ranked = sorted(mass.items(), key=lambda kv: -kv[1])
    total = sum(v for _, v in ranked)
    out = {"total": round(total, 4), "n": len(ranked), **shannon({k: v for k, v in ranked})}
    for k in ks:
        top = ranked[:k]
        out[f"CR_{k}"] = round(sum(v for _, v in top) / total, 4) if total else 0.0
        out[f"top{k}"] = [{"id": i, "mass": round(v, 4), "share": round(v / total, 4) if total else 0.0} for i, v in top]
    return out


def share_table(mass: dict[str, float]) -> list[dict]:
    total = sum(mass.values())
    return [
        {"id": k, "mass": round(v, 4), "share": round(v / total, 4) if total else 0.0}
        for k, v in sorted(mass.items(), key=lambda kv: -kv[1])
        if v > 0
    ]


def live_edges(edges: list[dict], by_axis: dict) -> list[dict]:
    # Include NEUTRAL. Pressure-eligibility is a pressure-term gate, not a review gate.
    out = []
    for e in edges:
        if e.get("kClass") not in LIVE:
            continue
        if e["capability"] in SPLIT_PARENTS or e["target"] in SPLIT_PARENTS:
            continue
        if e["capability"] not in CAP_MECH or e["target"] not in DEP_MECH:
            continue
        out.append(e)
    return out


def bucket_of(rel: str | None) -> str | None:
    if rel in HOSTILE:
        return "hostile"
    if rel in SUPPORT:
        return "enable"
    if rel == "CONDITIONAL":
        return "conditional"
    if rel == "NEUTRAL":
        return "neutral"
    return None


def accumulate_rows(rows: list[dict]) -> dict:
    by = defaultdict(lambda: {b: 0.0 for b in BUCKETS} | {"unknown_low": 0.0})
    for r in rows:
        key = r["key"]
        by[key][r["bucket"]] += r["mass"]
    out = []
    for key, bkt in by.items():
        cred_opp = sum(bkt[b] for b in BUCKETS)
        reviewed = cred_opp - bkt["unknown_credible"]
        hostile = bkt["hostile"]
        row = {
            "id": key,
            "opportunity": round(cred_opp, 4),
            "reviewed": round(reviewed, 4),
            "unknown_credible": round(bkt["unknown_credible"], 4),
            "unknown_low": round(bkt["unknown_low"], 4),
            "hostile": round(hostile, 4),
            "enable": round(bkt["enable"], 4),
            "conditional": round(bkt["conditional"], 4),
            "neutral": round(bkt["neutral"], 4),
            "coverage": round(reviewed / cred_opp, 4) if cred_opp else None,
            "yield_hostile": round(hostile / reviewed, 4) if reviewed else None,
            "yield_enable": round(bkt["enable"] / reviewed, 4) if reviewed else None,
            "yield_conditional": round(bkt["conditional"] / reviewed, 4) if reviewed else None,
        }
        out.append(row)
    out.sort(key=lambda r: -r["opportunity"])
    tot_opp = sum(r["opportunity"] for r in out)
    tot_host = sum(r["hostile"] for r in out)
    for r in out:
        r["opportunityShare"] = round(r["opportunity"] / tot_opp, 4) if tot_opp else 0.0
        r["hostileShare"] = round(r["hostile"] / tot_host, 4) if tot_host else 0.0
        r["shareRatio"] = round(r["hostileShare"] / r["opportunityShare"], 4) if r["opportunityShare"] else None
    return {"rows": out, "totalOpportunity": round(tot_opp, 4), "totalHostileOpportunity": round(tot_host, 4)}


def pressure_concentration(pairs: list[dict], channel: str) -> dict:
    cap_dom, dep_dom = defaultdict(float), defaultdict(float)
    cap_fam, dep_fam = defaultdict(float), defaultdict(float)
    mech = defaultdict(float)
    for p in pairs:
        block = p["families"]["conservative"]
        if channel == "hostile":
            terms = [t for t in (block.get("attackTerms") or []) if t.get("relation") in HOSTILE]
        elif channel == "conditional":
            terms = [t for t in (block.get("attackTerms") or []) if t.get("relation") == "CONDITIONAL"]
        else:
            terms = [t for t in (block.get("enableTerms") or []) if t.get("relation") in SUPPORT]
        for t in terms:
            c = t["capability"]
            d = t.get("dependency") or t.get("target")
            w = abs(float(t.get("effectiveTerm") or 0))
            cap_dom[cap_domain(c)] += w
            dep_dom[dep_domain(d)] += w
            cap_fam[cap_family(c)] += w
            dep_fam[dep_family(d)] += w
            mech[f"{c} → {d}"] += w
    return {
        "capabilityDomain": {**cr_block(cap_dom), "shares": share_table(cap_dom)},
        "dependencyDomain": {**cr_block(dep_dom), "shares": share_table(dep_dom)},
        "capabilityFamily": {**cr_block(cap_fam), "shares": share_table(cap_fam)},
        "dependencyFamily": {**cr_block(dep_fam), "shares": share_table(dep_fam)},
        "mechanismPair": {**cr_block(mech), "shares": share_table(mech)[:20]},
    }


def permanents_decomp(pairs: list[dict], channel: str) -> dict:
    by_op, by_dep = defaultdict(float), defaultdict(float)
    by_pair = defaultdict(float)
    for p in pairs:
        block = p["families"]["conservative"]
        if channel == "hostile":
            terms = [t for t in (block.get("attackTerms") or []) if t.get("relation") in HOSTILE]
        elif channel == "conditional":
            terms = [t for t in (block.get("attackTerms") or []) if t.get("relation") == "CONDITIONAL"]
        else:
            terms = [t for t in (block.get("enableTerms") or []) if t.get("relation") in SUPPORT]
        for t in terms:
            c = t["capability"]
            if cap_domain(c) != "permanents":
                continue
            d = t.get("dependency") or t.get("target")
            w = abs(float(t.get("effectiveTerm") or 0))
            by_op[op_family(c)] += w
            by_dep[dep_family(d)] += w
            by_pair[f"{op_family(c)} → {dep_family(d)}"] += w
    return {
        "byOperation": share_table(by_op),
        "byDependencyFamily": share_table(by_dep),
        "byOpXDep": share_table(by_pair),
        **cr_block(by_pair),
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if load_json(K26 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v2.6 must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited; aborting audit")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    decks, _ = load_decks(
        concept_ids, by_axis, scores, np.percentile(scores, 90, axis=0), np.percentile(scores, 99, axis=0), row_of, name_of, type_of
    )

    edges = live_edges(load_json(K26 / "edges.json"), by_axis)
    reviewed = {(e["capability"], e["target"]): e for e in edges}
    leftover = _eligible_leftover(leftover_cells(concept_ids, by_axis, load_json(K26 / "edges.json")), by_axis)
    cells = sorted(set(reviewed) | set(leftover))
    compat = {cd: compatibility(cd[0], cd[1]) for cd in cells}

    cap_mass = {d["id"]: {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in d["axes"]["capability"].items()} for d in decks}
    dep_mass = {d["id"]: {t: rec["prominence"] for t, rec in d["axes"]["dependency"].items()} for d in decks}

    opp_rows = []
    for a in decks:
        cm = cap_mass[a["id"]]
        for b in decks:
            if a["id"] == b["id"]:
                continue
            dm = dep_mass[b["id"]]
            for c, d in cells:
                m = cm.get(c, 0.0) * dm.get(d, 0.0)
                if m <= 0:
                    continue
                lvl = compat[(c, d)]["level"]
                rel = (reviewed.get((c, d)) or {}).get("relation")
                bkt = bucket_of(rel)
                if bkt is None:
                    bkt = "unknown_credible" if lvl in CRED else None
                    if bkt is None:
                        opp_rows.append({"key": cap_domain(c), "bucket": "unknown_low", "mass": m, "kind": "capDomain"})
                        continue
                if lvl not in CRED and bkt != "unknown_credible":
                    # reviewed LOW/control cells: keep out of credible opportunity
                    opp_rows.append({"key": cap_domain(c), "bucket": "unknown_low", "mass": m, "kind": "capDomain"})
                    continue
                meta = {
                    "capDomain": cap_domain(c),
                    "depDomain": dep_domain(d),
                    "capFamily": cap_family(c),
                    "depFamily": dep_family(d),
                    "opFamily": op_family(c),
                }
                for kind, key in meta.items():
                    opp_rows.append({"key": key, "bucket": bkt, "mass": m, "kind": kind})

    by_kind = defaultdict(list)
    for r in opp_rows:
        by_kind[r["kind"]].append(r)
    opportunity = {kind: accumulate_rows(rows) for kind, rows in by_kind.items()}

    pairs = attach_channels(load_json(K26 / "pairs.json"))
    pressure = {ch: pressure_concentration(pairs, ch) for ch in ("hostile", "enable", "conditional")}
    perm = {ch: permanents_decomp(pairs, ch) for ch in ("hostile", "enable", "conditional")}

    cap_rows = opportunity["capDomain"]["rows"]
    reading = []
    for r in cap_rows:
        if r["opportunityShare"] < 0.03:
            continue
        cov = r["coverage"] or 0
        ratio = r["shareRatio"]
        if cov < 0.15 and r["opportunityShare"] >= 0.08:
            reading.append({"domain": r["id"], "flag": "UNDER_REVIEWED_RELATIVE_TO_OPPORTUNITY", "coverage": cov, "opportunityShare": r["opportunityShare"]})
        elif ratio and ratio > 1.8:
            reading.append({"domain": r["id"], "flag": "HOSTILE_OVER_INDEXED", "shareRatio": ratio, "hostileShare": r["hostileShare"]})
        elif ratio and ratio < 0.5 and r["coverage"] and r["coverage"] >= 0.15:
            reading.append({"domain": r["id"], "flag": "HOSTILE_UNDER_INDEXED_DESPITE_COVERAGE", "shareRatio": ratio})

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "INTERACTION_DIVERSITY_AUDIT_V1",
        "parent": "mechanical-pressure-k-v2.6",
        "compatibilityScreen": {"version": "compatibility-screen-v1", "sha256": frozen_hash, "editedDuringRun": False},
        "nCells": len(cells),
        "nReviewedLive": len(reviewed),
        "nUnknownEligible": len(leftover),
        "opportunity": opportunity,
        "pressureConcentration": pressure,
        "permanentsDecomposition": perm,
        "readingNotes": reading,
        "taxonomy": {
            "capabilityFamilies": sorted(set(CAP_FAMILY_BY_ID.values()) | {"support_tool", "other", "denial", "restriction"}),
            "dependencyFamilies": sorted(set(DEP_FAMILY_BY_ID.values()) | {"other"}),
            "note": "Audit labels only. Not an ontology retrain.",
        },
        "safety": {
            "newKReviews": False,
            "hodge": False,
            "rpsAuthorized": False,
            "pressureV2Canon": False,
            "compatibilityEdited": False,
            "extraDecks": False,
            "openai": False,
            "reembed": False,
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(extra, indent=2) + "\n", encoding="utf-8")
    (OUT / "opportunity-by-cap-domain.json").write_text(json.dumps(opportunity["capDomain"], indent=2) + "\n", encoding="utf-8")
    (OUT / "opportunity-by-dep-family.json").write_text(json.dumps(opportunity["depFamily"], indent=2) + "\n", encoding="utf-8")
    (OUT / "pressure-concentration.json").write_text(json.dumps(pressure, indent=2) + "\n", encoding="utf-8")
    (OUT / "permanents-decomposition.json").write_text(json.dumps(perm, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "InteractionDiversityAudit",
                "version": "interaction-diversity-audit-v1",
                "status": "REVIEWED_DIAGNOSTIC",
                "parent": "mechanical-pressure-k-v2.6",
                "lineage": "v2",
                "note": "Zero new K reviews. Diversity is unknown-until-normalized, not a failed freeze gate.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "nCells": extra["nCells"],
                "capDomain": opportunity["capDomain"]["rows"][:12],
                "capFamily": opportunity["capFamily"]["rows"][:10],
                "depFamily": opportunity["depFamily"]["rows"][:10],
                "hostilePressure": {
                    "capDomain": pressure["hostile"]["capabilityDomain"]["shares"][:8],
                    "capFamily": pressure["hostile"]["capabilityFamily"]["shares"][:8],
                    "depFamily": pressure["hostile"]["dependencyFamily"]["shares"][:8],
                    "mechCR": {k: pressure["hostile"]["mechanismPair"][k] for k in ("CR_1", "CR_5", "CR_10", "CR_20", "S", "N_eff")},
                    "capDomEntropy": {k: pressure["hostile"]["capabilityDomain"][k] for k in ("S", "N_eff", "CR_5")},
                    "capFamEntropy": {k: pressure["hostile"]["capabilityFamily"][k] for k in ("S", "N_eff", "CR_5")},
                    "depFamEntropy": {k: pressure["hostile"]["dependencyFamily"][k] for k in ("S", "N_eff", "CR_5")},
                },
                "supportivePressure": {
                    "capDomain": pressure["enable"]["capabilityDomain"]["shares"][:6],
                    "capFamily": pressure["enable"]["capabilityFamily"]["shares"][:6],
                    "depFamily": pressure["enable"]["dependencyFamily"]["shares"][:6],
                },
                "permanentsHostile": perm["hostile"],
                "readingNotes": reading,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
