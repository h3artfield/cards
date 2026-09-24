#!/usr/bin/env python3
"""
Aggregation Sensitivity Audit v1.

Frozen Pressure v4 + Topology v2 only. No formula or threshold changes.
Not estimator selection. s is not a ranking. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_hodge_diagnostic_v0 import ESTIMATORS, MATERIAL, NEAR_ZERO, ablation_family
from build_k_v2 import compute_pairs
from mechanical_deck_pressure_v1 import capability_capacity
from mechanical_k_v2 import polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, attach_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
T2 = MS / "topology-diagnostic-v2"
K3 = MS / "mechanical-pressure-k-v3.0"
PROF = MS / "expansion-v2-profiles-v2"
DIR = MS / "mechanical-directions-v22"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "aggregation-sensitivity-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

SCC = ["D10", "D21", "D37", "D46", "D49", "D59"]
LOOP = ["D21", "D49", "D37"]
OLD30 = {f"D{i:02d}" for i in range(1, 31)}
E2 = {f"D{i:02d}" for i in range(31, 61)}


def sign_of(x: float) -> int:
    if x > 1e-9:
        return 1
    if x < -1e-9:
        return -1
    return 0


def cohort_of(d: str) -> str:
    if d in {f"D{i:02d}" for i in range(1, 16)}:
        return "A"
    if d in OLD30:
        return "E1"
    return "E2"


def pair_cohort(a: str, b: str) -> str:
    return "×".join(sorted({cohort_of(a), cohort_of(b)}))


def disagree_kind(vals: dict[str, float]) -> str:
    signs = {e: sign_of(vals[e]) for e in ESTIMATORS}
    mats = {e: abs(vals[e]) >= MATERIAL for e in ESTIMATORS}
    nz = {e for e, s in signs.items() if s != 0}
    if not nz:
        return "ALL_NEAR_ZERO"
    orient = {signs[e] for e in nz}
    if len(orient) > 1:
        return "ORIENTATION_DISAGREE"
    if len(set(mats.values())) > 1:
        return "MAGNITUDE_DISAGREE"
    return "AGREE"


def axes_of(rec: dict) -> dict:
    return {"capability": rec["capabilities"], "dependency": rec["dependencies"], "resilience": rec["resilience"]}


def deck_features(rec: dict) -> dict:
    caps = rec["capabilities"]
    pkgs = rec.get("packages") or []
    hot = [c for c in caps.values() if float(c.get("prominence") or 0) >= 0.40]
    sing = [c for c in caps.values() if int(c.get("nIndependent") or 0) <= 1 and float(c.get("presence") or 0) > 0]
    cmd = [c for c in hot if float(c.get("commander_link") or 0) >= 0.85]
    pkg_boost = [c for c in hot if float(c.get("packageBoost") or 0) > 0.05]
    return {
        "nPackages": len(pkgs),
        "nHotCaps": len(hot),
        "nSingletonCaps": len(sing),
        "singletonShareHot": round(sum(1 for c in hot if int(c.get("nIndependent") or 0) <= 1) / len(hot), 4) if hot else 0.0,
        "nCommanderLinkedHot": len(cmd),
        "commanderLinkShareHot": round(len(cmd) / len(hot), 4) if hot else 0.0,
        "nPackageBoostedHot": len(pkg_boost),
        "meanDensityHot": round(float(np.mean([c["density"] for c in hot])), 4) if hot else 0.0,
        "meanRedundancyHot": round(float(np.mean([c["redundancy"] for c in hot])), 4) if hot else 0.0,
        "maxCommanderLink": round(max((float(c.get("commander_link") or 0) for c in caps.values()), default=0), 4),
    }


def attr_for_cap(cap: dict | None) -> dict | None:
    if not cap:
        return None
    n = int(cap.get("nIndependent") or 0)
    promo = float(cap.get("packageInformedProminence", cap.get("prominence") or 0))
    return {
        "presence": round(float(cap.get("presence") or 0), 4),
        "density": round(float(cap.get("density") or 0), 4),
        "redundancy": round(float(cap.get("redundancy") or 0), 4),
        "nIndependent": n,
        "commander_link": round(float(cap.get("commander_link") or 0), 4),
        "prominence": round(float(cap.get("prominence") or 0), 4),
        "packageInformedProminence": round(promo, 4),
        "packageBoost": round(float(cap.get("packageBoost") or 0), 4),
        "capabilityCapacity": round(capability_capacity(cap), 4),
        "singleton": n <= 1,
        "commanderLinked": float(cap.get("commander_link") or 0) >= 0.85,
    }


def rate(xs: list[bool]) -> float | None:
    return round(sum(xs) / len(xs), 4) if xs else None


def mean(xs: list[float]) -> float | None:
    return round(float(np.mean(xs)), 4) if xs else None


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(T2 / "IMMUTABLE.json").get("outcome") != "T2-C":
        raise SystemExit("Topology v2 must be frozen T2-C")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("audit protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    print("loading frozen artifacts…", flush=True)
    slim = load_json(P4 / "pairs-summary.json")
    by = {(r["from"], r["to"]): r for r in slim}
    stab = {(r["a"], r["b"]): r for r in load_json(P4 / "edge-stability.json")["edges"]}
    profiles = {r["blindId"]: r for r in load_json(PROF / "profiles.json")}
    feats = {d: deck_features(profiles[d]) for d in profiles}

    global_rows = []
    kind_counts = defaultdict(int)
    stab_counts = defaultdict(int)
    for (a, b), rec in stab.items():
        vals = {e: float(rec["hostile_M"][e]) for e in ESTIMATORS}
        kind = disagree_kind(vals)
        kind_counts[kind] += 1
        st = rec["hostile"]
        stab_counts[st] += 1
        directed = (a, b) if vals["conservative"] >= 0 else (b, a)
        src = by[directed]
        top = ((src.get("top_hostile_mechanisms") or [{}])[0])
        edge = top.get("edge") or ""
        cap = edge.split(" → ")[0] if edge else None
        fam = ablation_family(cap) if cap else None
        cap_stats = (profiles[directed[0]]["capabilities"].get(cap) if cap else None)
        xs = list(vals.values())
        global_rows.append(
            {
                "a": a,
                "b": b,
                "M": {e: round(vals[e], 4) for e in ESTIMATORS},
                "range": round(max(xs) - min(xs), 4),
                "absRange": round(max(abs(v) for v in xs) - min(abs(v) for v in xs), 4),
                "variance": round(float(np.var(xs)), 4),
                "dispersion": round(float(np.std(xs)), 4),
                "meanAbs": round(float(np.mean([abs(v) for v in xs])), 4),
                "minAbs": round(min(abs(v) for v in xs), 4),
                "maxAbs": round(max(abs(v) for v in xs), 4),
                "marginConservative": round(abs(vals["conservative"]) - MATERIAL, 4),
                "stability": st,
                "disagreeKind": kind,
                "pairClass": src.get("pairClass"),
                "cohort": pair_cohort(a, b),
                "topEdge": edge,
                "topFamily": fam,
                "topCap": attr_for_cap(cap_stats),
            }
        )

    sens = [r for r in global_rows if r["stability"] == "SENSITIVE"]
    stable = [r for r in global_rows if r["stability"] == "STABLE_DIRECTION"]

    def characterize(rows: list[dict]) -> dict:
        fams = defaultdict(int)
        coh = defaultdict(int)
        kinds = defaultdict(int)
        for r in rows:
            fams[r["topFamily"] or "unknown"] += 1
            coh[r["cohort"]] += 1
            kinds[r["disagreeKind"]] += 1
        caps = [r["topCap"] for r in rows if r.get("topCap")]
        return {
            "n": len(rows),
            "disagreeKinds": dict(kinds),
            "meanRange": mean([r["range"] for r in rows]),
            "meanAbsRange": mean([r["absRange"] for r in rows]),
            "meanDispersion": mean([r["dispersion"] for r in rows]),
            "meanMinAbs": mean([r["minAbs"] for r in rows]),
            "meanMaxAbs": mean([r["maxAbs"] for r in rows]),
            "meanMarginConservative": mean([r["marginConservative"] for r in rows]),
            "fracBelowMaterialAny": rate([r["minAbs"] < MATERIAL for r in rows]),
            "fracSingletonTopCap": rate([c["singleton"] for c in caps]),
            "fracCommanderLinkedTopCap": rate([c["commanderLinked"] for c in caps]),
            "meanTopDensity": mean([c["density"] for c in caps]),
            "meanTopRedundancy": mean([c["redundancy"] for c in caps]),
            "meanTopCommanderLink": mean([c["commander_link"] for c in caps]),
            "meanTopPackageBoost": mean([c["packageBoost"] for c in caps]),
            "meanTopCapacity": mean([c["capabilityCapacity"] for c in caps]),
            "familyCounts": dict(sorted(fams.items(), key=lambda kv: -kv[1])),
            "cohortCounts": dict(coh),
        }

    # ----- reconstruct SCC terms with frozen formulas -----
    print("reconstructing 6-deck estimator terms…", flush=True)
    drep = load_json(DIR / "report.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    concept_ids = load_json(DIR / "concept-ids.json")
    edges = [dict(e) for e in load_json(K3 / "edges.json")]
    leftover = []
    scc_decks = []
    polarity = {}
    for bid in SCC:
        axes = axes_of(profiles[bid])
        polarity[bid] = polarity_blocked_caps(axes)
        scc_decks.append({"id": bid, "axes": axes})
    pairs, _ = compute_pairs(scc_decks, edges, leftover, by_axis, polarity)
    attach_channels(pairs)
    recon = {(p["from"], p["to"]): p for p in pairs}

    recon_gate = {"n": 0, "fail": []}
    for a, b in ((x, y) for x in SCC for y in SCC if x != y):
        stored = by[(a, b)]["estimators"]
        got = {fam: recon[(a, b)]["families"][fam]["hostile_pressure"] for fam in ESTIMATORS}
        recon_gate["n"] += 1
        for fam in ESTIMATORS:
            if abs(float(stored[fam]["hostile_pressure"]) - float(got[fam])) > 1e-4:
                recon_gate["fail"].append({"pair": f"{a}→{b}", "est": fam, "stored": stored[fam]["hostile_pressure"], "recon": got[fam]})
    if recon_gate["fail"]:
        raise SystemExit(f"SCC reconstruction failed: {recon_gate['fail'][:3]}")

    def M_of(a: str, b: str, est: str) -> float:
        return float(by[(a, b)]["estimators"][est]["hostile_pressure"]) - float(by[(b, a)]["estimators"][est]["hostile_pressure"])

    ledger = []
    for a, b in ((x, y) for x in SCC for y in SCC if x != y):
        rec = {"from": a, "to": b, "estimators": {}, "topTerms": {}, "attribution": {}}
        for est in ESTIMATORS:
            m = M_of(a, b, est)
            rec["estimators"][est] = {
                "P_ab": round(float(by[(a, b)]["estimators"][est]["hostile_pressure"]), 4),
                "P_ba": round(float(by[(b, a)]["estimators"][est]["hostile_pressure"]), 4),
                "M": round(m, 4),
                "absM": round(abs(m), 4),
                "orientation": f"{a}→{b}" if m > 1e-9 else (f"{b}→{a}" if m < -1e-9 else "TIE"),
                "material": abs(m) >= MATERIAL,
                "margin": round(abs(m) - MATERIAL, 4),
            }
        rec["disagreeKind"] = disagree_kind({e: rec["estimators"][e]["M"] for e in ESTIMATORS})
        block = recon[(a, b)]["families"]
        for est in ESTIMATORS:
            terms = [t for t in (block[est].get("attackTerms") or []) if t.get("relation") in HOSTILE]
            rec["topTerms"][est] = [
                {
                    "edge": f"{t['capability']} → {t['dependency']}",
                    "relation": t["relation"],
                    "effective": t["effectiveTerm"],
                    "raw": t.get("rawTerm"),
                    "family": ablation_family(t["capability"]),
                    "capPresence": t.get("capabilityPresence"),
                    "capDensity": t.get("capabilityDensity"),
                    "capRedundancy": t.get("capabilityRedundancy"),
                    "capCommanderLink": t.get("capabilityCommanderLink"),
                    "capProminence": t.get("capabilityProminence"),
                    "capCapacity": t.get("capabilityCapacity"),
                    "depProminence": t.get("dependencyProminence"),
                    "depCriticality": t.get("dependencyCriticality"),
                    "p": t.get("p"),
                    "q": t.get("q"),
                }
                for t in terms[:6]
            ]
        # attribute first shared top edge across estimators if possible
        keys = [{t["edge"] for t in rec["topTerms"][e]} for e in ESTIMATORS]
        shared = set.intersection(*keys) if keys else set()
        rec["sharedTopEdges"] = sorted(shared)
        ledger.append(rec)

    def loop_status(nodes: list[str]) -> dict:
        out = {}
        for est in ESTIMATORS:
            legs = []
            ok = True
            for i, src in enumerate(nodes):
                dst = nodes[(i + 1) % len(nodes)]
                m = M_of(src, dst, est)
                rec = {
                    "leg": f"{src}→{dst}",
                    "M": round(m, 4),
                    "orientationOk": m > 1e-9,
                    "material": m >= MATERIAL,
                    "margin": round(m - MATERIAL, 4),
                    "blocksCycle": m < MATERIAL,
                }
                if rec["blocksCycle"]:
                    ok = False
                legs.append(rec)
            out[est] = {"isMaterialCycle": ok, "legs": legs, "blockingLegs": [x["leg"] for x in legs if x["blocksCycle"]]}
        return out

    loop = loop_status(LOOP)
    # also report any 3-cycle among the 6 that conservative treats as material
    cons_cycles = []
    for tri in combinations(SCC, 3):
        for orient in (list(tri), [tri[0], tri[2], tri[1]]):
            st = loop_status(orient)
            if st["conservative"]["isMaterialCycle"]:
                cons_cycles.append({"nodes": orient, "estimators": {e: st[e]["isMaterialCycle"] for e in ESTIMATORS}, "blocking": {e: st[e]["blockingLegs"] for e in ESTIMATORS}})

    # semantics vs pathology: if conservative discounts singleton/low-system and presence/prominence do not
    semantics = {
        "presence-v2": {
            "formula": "presence(cap) × criticality(dep) × |p| × q",
            "privileges": "Whether the attacker possesses the capability at all, times how critical the target dependency is.",
            "doesNotAsk": "How redundant, dense, or commander-centered the capability is.",
        },
        "prominence-v2": {
            "formula": "packageInformedProminence(cap) × prominence(dep) × |p| × q",
            "privileges": "How prominent the capability is throughout the deck (packages may boost) times how prominent the target dependency is.",
            "doesNotAsk": "Whether the capability is a singleton, nor target criticality specifically.",
        },
        "conservative-v2": {
            "formula": "capability_capacity(cap) × criticality(dep) × |p| × q",
            "capability_capacity": "commander_link≥0.85 → full prominence; nIndependent≤1 → 0.12×prominence; else prominence×system(density, redundancy, breadth)",
            "privileges": "Whether the capability is systemic or commander-linked enough to attribute deck-level pressure, times target criticality.",
            "doesNotAsk": "Mere possession (presence) or raw package prominence without a system/commander test.",
        },
        "expectedDisagreement": "Presence can fire on a singleton hate card. Prominence can fire on a package-boosted but non-system axis. Conservative discounts both unless commander-linked. Disagreement on those terms is semantic, not a formula bug.",
    }

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "AGGREGATION_SENSITIVITY_AUDIT_V1",
        "parent": ["deck-pressure-v4", "topology-diagnostic-v2"],
        "reconstruction": {"sccDirectedPairs": recon_gate["n"], "pass": True},
        "global": {
            "nUndirectedHostile": len(global_rows),
            "stabilityCounts": dict(stab_counts),
            "disagreeKinds": dict(kind_counts),
            "sensitive": characterize(sens),
            "stableDirection": characterize(stable),
            "orientationDisagree": characterize([r for r in global_rows if r["disagreeKind"] == "ORIENTATION_DISAGREE"]),
            "magnitudeDisagree": characterize([r for r in global_rows if r["disagreeKind"] == "MAGNITUDE_DISAGREE"]),
            "agree": characterize([r for r in global_rows if r["disagreeKind"] == "AGREE"]),
        },
        "scc": {
            "nodes": SCC,
            "focusLoop": LOOP,
            "loop": loop,
            "conservativeMaterialTriangles": cons_cycles,
            "nInternalDirected": 30,
        },
        "semantics": semantics,
        "not": ["estimator change", "threshold change", "Commander RPS", "deck ranking", "win probability"],
        "safety": {"formulasEdited": False, "thresholdsEdited": False, "newK": False, "newDecks": False, "rpsAuthorized": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "global-edges.json").write_text(json.dumps({"n": len(global_rows), "edges": global_rows}, indent=2) + "\n", encoding="utf-8")
    (OUT / "scc-ledger.json").write_text(json.dumps({"nodes": SCC, "ledger": ledger, "loop": loop}, indent=2) + "\n", encoding="utf-8")
    (OUT / "deck-features.json").write_text(json.dumps({d: feats[d] for d in SCC}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "AggregationSensitivityAudit",
                "version": "aggregation-sensitivity-audit-v1",
                "status": "REPORT_AND_WAIT",
                "parent": ["deck-pressure-v4", "topology-diagnostic-v2"],
                "formulasEdited": False,
                "thresholdsEdited": False,
                "note": "Diagnostic attribution only. Not estimator selection. Not a Commander RPS claim.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reconstruction": report["reconstruction"],
                "globalKinds": dict(kind_counts),
                "stability": dict(stab_counts),
                "sensitive": report["global"]["sensitive"],
                "stable": report["global"]["stableDirection"],
                "loop": loop,
                "nConsMaterialTriangles": len(cons_cycles),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
