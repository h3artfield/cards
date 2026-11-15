#!/usr/bin/env python3
"""
D50 package-integrity audit: CAST_TRIGGER_ENGINE singleton fire.

Reads frozen Profiles-v2 rules only. Does not read K, Pressure, Hodge, or G1.
"""

from __future__ import annotations

import json
from pathlib import Path

from build_deck_mechanical_profiles_v2 import profile_deck
from build_expansion_v2_profiles_v2 import cards_of
from mechanical_deck_profile_v1 import package_activity
from mechanical_deck_profile_v2 import V2_PACKAGES
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
PROF = MS / "expansion-v2-profiles-v2"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
OUT = PROF / "d50-package-integrity-audit"

SPEC = next(p for p in V2_PACKAGES if p["id"] == "CAST_TRIGGER_ENGINE")


def axis_blob(deck: dict, cid: str) -> dict | None:
    for kind in ("capabilities", "dependencies", "resilience", "resiliencies"):
        rec = (deck.get(kind) or {}).get(cid)
        if rec:
            return rec
    return None


def singleton_qa(deck: dict, pkg: dict) -> int:
    n = 0
    for cid in pkg.get("chain") or []:
        rec = axis_blob(deck, cid)
        if rec:
            n = max(n, int(rec.get("nIndependent") or 0))
    return n


def engaged(s: dict) -> bool:
    return s["density"] >= 0.08 or s["commander_link"] >= 0.80


def strong(s: dict) -> bool:
    return s["density"] >= 0.12 or s["commander_link"] >= 0.90 or s.get("nIndependent", 0) >= 4


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")

    decks = load_json(PROF / "profiles.json")
    by_id = {d["blindId"]: d for d in decks}
    d50 = by_id["D50"]

    latent = []
    for d in decks:
        for p in d.get("packages") or []:
            if not p.get("active"):
                continue
            n_ind = singleton_qa(d, p)
            if n_ind <= 1:
                latent.append(
                    {
                        "blindId": d["blindId"],
                        "cohort": d.get("cohort"),
                        "package": p["id"],
                        "maxChainNIndependent": n_ind,
                        "chain": p.get("chain"),
                    }
                )

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = __import__("numpy").fromfile(DIR / "scores.f32", dtype="float32").reshape(-1, len(concept_ids))
    p90 = __import__("numpy").percentile(scores, 90, axis=0)
    p99 = __import__("numpy").percentile(scores, 99, axis=0)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]

    src = load_json(CEX1 / "source-decks.json") + load_json(CEX2 / "source-decks.json")
    raw = src[49]
    cards, cmd_oids = cards_of(raw, row_of, name_of, type_of)
    cmd_names = [name_of[o] for o in cmd_oids]
    cmd_set = set(cmd_oids)
    axes, pkgs, weights_by_id, _, _, _ = profile_deck(
        cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True
    )
    pkg = next(p for p in pkgs if p["id"] == "CAST_TRIGGER_ENGINE")

    chain_detail = []
    for cid in SPEC["chain"] + (SPEC.get("supports") or []):
        kind = (by_axis.get(cid) or {}).get("kind")
        rec = axes[kind].get(cid) if kind in axes else None
        if not rec:
            chain_detail.append({"id": cid, "present": False})
            continue
        w = weights_by_id[cid]
        exhibitors = []
        for card, wt in zip(cards, w):
            if wt < 0.15:
                continue
            exhibitors.append(
                {
                    "name": card["name"],
                    "oracleId": card["oracleId"],
                    "weight": round(float(wt), 4),
                    "independent": wt >= 0.35,
                    "strong": wt >= 0.50,
                    "isCommander": card["oracleId"] in cmd_set,
                    "in99": card["oracleId"] not in cmd_set,
                }
            )
        exhibitors.sort(key=lambda x: -x["weight"])
        chain_detail.append(
            {
                "id": cid,
                "kind": kind,
                "roleInPackage": "chain" if cid in SPEC["chain"] else "support",
                "present": True,
                "density": rec["density"],
                "commander_link": rec["commander_link"],
                "nIndependent": rec["nIndependent"],
                "nStrong": rec["nStrong"],
                "prominence": rec["prominence"],
                "engaged": engaged(rec),
                "strongGate": strong(rec),
                "strongBecause": [
                    x
                    for x, ok in (
                        ("density>=0.12", rec["density"] >= 0.12),
                        ("commander_link>=0.90", rec["commander_link"] >= 0.90),
                        ("nIndependent>=4", rec.get("nIndependent", 0) >= 4),
                    )
                    if ok
                ],
                "engagedBecause": [
                    x
                    for x, ok in (
                        ("density>=0.08", rec["density"] >= 0.08),
                        ("commander_link>=0.80", rec["commander_link"] >= 0.80),
                    )
                    if ok
                ],
                "contributorsWeightGe035": rec.get("contributors") or [],
                "exhibitorsWeightGe015": exhibitors,
                "nIndependentCommander": sum(1 for e in exhibitors if e["independent"] and e["isCommander"]),
                "nIndependent99": sum(1 for e in exhibitors if e["independent"] and e["in99"]),
            }
        )

    members = [axes[(by_axis[c] or {}).get("kind")][c] for c in SPEC["chain"]]
    supports = [axes[(by_axis[c] or {}).get("kind")][c] for c in SPEC.get("supports") or [] if c in axes[(by_axis[c] or {}).get("kind")]]
    naive = package_activity(members, supports, SPEC)

    n_ind_max = max(d["nIndependent"] for d in chain_detail if d.get("roleInPackage") == "chain" and d.get("present"))
    cmd_is_independent_on_any = any(d.get("nIndependentCommander", 0) > 0 for d in chain_detail if d.get("roleInPackage") == "chain")
    ninety_nine_independent = any(d.get("nIndependent99", 0) > 0 for d in chain_detail if d.get("roleInPackage") == "chain")
    only_commander_plus_one = cmd_is_independent_on_any and all(
        (d.get("nIndependent99") or 0) <= 1 for d in chain_detail if d.get("roleInPackage") == "chain"
    )

    classification = "UNRESOLVED"
    rationale = ""
    if pkg.get("active") and n_ind_max <= 1 and (cmd_is_independent_on_any or max(d["commander_link"] for d in chain_detail if d.get("present") and d.get("roleInPackage") == "chain") >= 0.80):
        if ninety_nine_independent or cmd_is_independent_on_any:
            classification = "A_LEGITIMATE_COMMANDER_PLUS_SUPPORT"
            rationale = (
                "Frozen package_activity treats commander_link >= 0.80/0.90 as system engagement/strength. "
                "CAST_TRIGGER_ENGINE has no min-distinct-card rule. Activation is commander-linked chain presence, not a lone 99 staple satisfying both sides by itself."
            )
        else:
            classification = "B_TRUE_SINGLETON_FALSE_FIRE"
            rationale = "One non-commander card satisfied the chain without commander-linked system semantics."
    elif pkg.get("active") and n_ind_max <= 1:
        classification = "B_TRUE_SINGLETON_FALSE_FIRE"
        rationale = "Package fired from a single ordinary exhibitor without commander-link strength."
    elif pkg.get("active"):
        classification = "A_NOT_A_SINGLETON_UNDER_FROZEN_NINDEPENDENT"
        rationale = "QA heuristic used max chain nIndependent; if this is >1 the Phase-2 flag was a misread."

    sealed30_latent = [r for r in latent if r["blindId"] <= "D30"]
    report = {
        "status": "D50_PACKAGE_INTEGRITY_AUDIT",
        "target": {"blindId": "D50", "package": "CAST_TRIGGER_ENGINE"},
        "safety": {"k": False, "pressure": False, "ontologyEdited": False, "packageRedesigned": False},
        "frozenSpec": {
            "id": SPEC["id"],
            "chain": SPEC["chain"],
            "supports": SPEC.get("supports") or [],
            "minCommanderLink": SPEC.get("minCommanderLink"),
            "minDensity": SPEC.get("minDensity"),
            "requiredDistinctCards": None,
            "activation": {
                "allChainEngaged": "density >= 0.08 OR commander_link >= 0.80",
                "anyChainStrong": "density >= 0.12 OR commander_link >= 0.90 OR nIndependent >= 4",
                "comment": "A package is active only if the chain is present as a system, not one staple.",
                "implementedAs": "engaged+strong gates; commander_link can satisfy both gates without nIndependent >= 4",
            },
        },
        "Q1_Q5_D50": {
            "commanderNames": cmd_names,
            "nResolvedCards": len(cards),
            "packageRecord": {k: pkg.get(k) for k in ("id", "chain", "active", "strength", "naiveActive", "source", "inactiveReason", "hierarchyArtifact")},
            "packageActivityReplay": naive,
            "chain": chain_detail,
            "qaHeuristic": {
                "definition": "suspicious singleton if max(chain nIndependent) <= 1",
                "maxChainNIndependent": n_ind_max,
                "flagged": n_ind_max <= 1,
            },
            "commanderCountedInNIndependent": cmd_is_independent_on_any,
            "nIndependentFrom99": {d["id"]: d.get("nIndependent99") for d in chain_detail if d.get("present")},
        },
        "Q6_latentSingletonReplay": {
            "heuristic": "max chain nIndependent <= 1 on any active package",
            "sealed30": sealed30_latent,
            "nSealed30": len(sealed30_latent),
            "expansionV2 besides D50": [r for r in latent if r["blindId"] > "D30" and r["blindId"] != "D50"],
            "all": latent,
        },
        "Q7_verdict": {
            "classification": classification,
            "rationale": rationale,
            "violatesFrozenSpec": classification.startswith("B"),
            "allowedByFrozenSpec": classification.startswith("A"),
            "phase2": "PASS_AND_FREEZE" if classification.startswith("A") else "REPAIR_IMPLEMENTATION_ONLY",
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "classification": classification,
        "rationale": rationale,
        "pkgActive": pkg.get("active"),
        "strength": pkg.get("strength"),
        "cmd": cmd_names,
        "maxChainNIndependent": n_ind_max,
        "latentSealed30": sealed30_latent,
        "latentAll": latent,
        "chain": [
            {
                "id": d["id"],
                "nIndependent": d.get("nIndependent"),
                "nInd99": d.get("nIndependent99"),
                "nIndCmd": d.get("nIndependentCommander"),
                "density": d.get("density"),
                "commander_link": d.get("commander_link"),
                "engaged": d.get("engaged"),
                "strongGate": d.get("strongGate"),
                "strongBecause": d.get("strongBecause"),
                "exhibitors": d.get("exhibitorsWeightGe015"),
            }
            for d in chain_detail
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
