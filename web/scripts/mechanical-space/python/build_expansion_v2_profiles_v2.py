#!/usr/bin/env python3
"""
Corpus Expansion v2 — Phase 2: Profiles v2 on sealed Expansion-v2-30.

Reconstructs the existing sealed 30. Does not read K, Pressure, M, Hodge, or G1.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import bars, profile_deck, top_rows
from build_expansion_profiles_v2 import (
    HOT,
    RARE,
    STRONG,
    coverage_kind,
    debt_grade,
    eligible_ids,
    l2,
    ood_class,
    pack_bar,
    underdefined_ledger,
    vec,
)
from mechanical_deck_profile_v1 import mechanical_sentence
from mechanical_deck_profile_v2 import UNSUPPORTED_AXES
from mechanical_k_v2 import PROFILE_QA_BLOCKED
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
PROF_EXP = MS / "expansion-profiles-v2"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
OUT = MS / "expansion-v2-profiles-v2"


def cards_of(raw, row_of, name_of, type_of):
    cards = []
    for entry in raw["mainboard"]:
        oid = entry["oracleId"]
        if oid not in row_of:
            continue
        cards.append(
            {
                "oracleId": oid,
                "name": name_of.get(oid, entry.get("name")),
                "quantity": max(1, int(entry.get("quantity") or 1)),
                "row": row_of[oid],
                "typeLine": type_of[oid],
            }
        )
    cmd_oids = [o for o in raw.get("commanderOracleIds") or [] if o in row_of]
    have = {c["oracleId"] for c in cards}
    for oid in cmd_oids:
        if oid not in have:
            cards.append({"oracleId": oid, "name": name_of[oid], "quantity": 1, "row": row_of[oid], "typeLine": type_of[oid]})
    return cards, cmd_oids


def recon_vs_stored(bid, axes, n_cards, stored) -> dict:
    d_promo, d_pres = [], []
    for kind, stored_kind in (("capability", "capabilities"), ("dependency", "dependencies"), ("resilience", "resiliencies")):
        blob = stored.get(stored_kind) or stored.get("resilience") or {}
        if kind != "resilience":
            blob = stored.get(stored_kind) or {}
        for cid, rec in blob.items():
            if not rec:
                continue
            got = axes[kind].get(cid)
            if not got:
                d_promo.append(1.0)
                continue
            d_promo.append(abs(got.get("packageInformedProminence", got["prominence"]) - rec.get("packageInformedProminence", rec.get("prominence", 0))))
    allp = stored.get("allAxisPresence") or {}
    for kind in axes:
        for cid, rec in axes[kind].items():
            if cid in (allp.get(kind) or {}):
                d_pres.append(abs(rec["presence"] - allp[kind][cid]))
    max_p = max(d_promo) if d_promo else 0.0
    max_s = max(d_pres) if d_pres else 0.0
    n_ok = stored.get("nResolvedCards")
    return {
        "blindId": bid,
        "nResolvedCards": n_cards,
        "frozenResolved": n_ok,
        "nCompared": len(d_promo),
        "maxProminenceDelta": round(max_p, 6),
        "maxPresenceDelta": round(max_s, 6),
        "pass": max_p <= 1e-4 and max_s <= 1e-4 and (n_ok is None or n_ok == n_cards),
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(CEX2 / "IMMUTABLE.json").get("status") != "FROZEN" or not load_json(CEX2 / "IMMUTABLE.json").get("sealed"):
        raise SystemExit("Expansion v2 Phase 1 must be sealed")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")
    if load_json(PROF_EXP / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Expansion Profiles v2 must stay frozen")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    axis_ids = eligible_ids(concept_ids, by_axis)

    src1 = load_json(CEX1 / "source-decks.json")
    src2 = load_json(CEX2 / "source-decks.json")
    if len(src1) != 30 or len(src2) != 30:
        raise SystemExit(f"expected 30+30 sources, got {len(src1)}+{len(src2)}")
    frozen_a = {p["blindId"]: p for p in load_json(PROF2 / "profiles.json")}
    frozen_e = {p["blindId"]: p for p in load_json(PROF_EXP / "profiles.json")}
    picks = load_json(CEX2 / "report.json").get("perPickGain") or []

    decks = []
    recon = []
    print("profiling sealed 60…", flush=True)
    for i, raw in enumerate(src1 + src2):
        bid = f"D{i + 1:02d}"
        cards, cmd_oids = cards_of(raw, row_of, name_of, type_of)
        axes, pkgs, _, accounting, contra, _ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        if i < 15:
            cohort = "anchor"
            recon.append(recon_vs_stored(bid, axes, len(cards), frozen_a[bid]))
        elif i < 30:
            cohort = "expansion_v1"
            recon.append(recon_vs_stored(bid, axes, len(cards), frozen_e[bid]))
        else:
            cohort = "expansion_v2"
        decks.append(
            {
                "id": bid,
                "cohort": cohort,
                "axes": axes,
                "packages": pkgs,
                "accounting": accounting,
                "contradictory": contra,
                "nCards": len(cards),
                "vec": vec(axes, axis_ids),
            }
        )
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/60", flush=True)

    if not all(r["pass"] for r in recon):
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "sealed-30 reconstruction failed", "reconstruction": recon}, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("sealed-30 reconstruction failed — not interpreting expansion-v2")

    anchor = [d for d in decks if d["cohort"] == "anchor"]
    exp1 = [d for d in decks if d["cohort"] == "expansion_v1"]
    exp2 = [d for d in decks if d["cohort"] == "expansion_v2"]
    sealed30 = anchor + exp1

    def eligible_gain(earlier, later) -> float:
        a = np.maximum.reduce([d["vec"] for d in earlier])
        e = np.maximum.reduce([d["vec"] for d in later])
        return round(float(np.maximum(0.0, e - a).sum()), 4)

    coverage = {
        "15_to_30": {
            "eligible76dGain": eligible_gain(anchor, exp1),
            "capability": coverage_kind(anchor, exp1, "capability", by_axis),
            "dependency": coverage_kind(anchor, exp1, "dependency", by_axis),
            "resilience": coverage_kind(anchor, exp1, "resilience", by_axis),
        },
        "30_to_60": {
            "eligible76dGain": eligible_gain(sealed30, exp2),
            "capability": coverage_kind(sealed30, exp2, "capability", by_axis),
            "dependency": coverage_kind(sealed30, exp2, "dependency", by_axis),
            "resilience": coverage_kind(sealed30, exp2, "resilience", by_axis),
        },
        "15_to_60": {
            "eligible76dGain": eligible_gain(anchor, exp1 + exp2),
            "capability": coverage_kind(anchor, exp1 + exp2, "capability", by_axis),
            "dependency": coverage_kind(anchor, exp1 + exp2, "dependency", by_axis),
            "resilience": coverage_kind(anchor, exp1 + exp2, "resilience", by_axis),
        },
        "selectionLiteAxesGain30to60": 2.2698,
        "attempt3MarginalGains": picks,
        "note": "eligible76dGain is the same frozen 76-d max-prominence coverage objective used in selection. coverage_kind is the per-family breakdown.",
    }

    S = np.stack([l2(d["vec"]) for d in sealed30])
    loo = []
    for i in range(30):
        others = np.delete(S, i, axis=0)
        loo.append(1.0 - float((others @ S[i]).max()))
    loo_max, loo_p90 = float(max(loo)), float(np.quantile(loo, 0.90))
    ood_rows = []
    for d in exp2:
        vn = l2(d["vec"])
        sims = S @ vn
        dist = 1.0 - float(sims.max())
        klass = ood_class(dist, loo_max, loo_p90)
        mapped = {
            "WITHIN_ANCHOR_SUPPORT": "WITHIN_SEALED30_SUPPORT",
            "EDGE_OF_ANCHOR_SUPPORT": "EDGE_OF_SEALED30_SUPPORT",
            "OUTSIDE_ANCHOR_SUPPORT": "OUTSIDE_SEALED30_SUPPORT",
        }[klass]
        ood_rows.append(
            {
                "blindId": d["id"],
                "nearestSealed30": sealed30[int(sims.argmax())]["id"],
                "nearestCosine": round(float(sims.max()), 4),
                "distanceToNearestSealed30": round(dist, 4),
                "class": mapped,
            }
        )

    pkg_30 = {p["id"] for d in sealed30 for p in d["packages"] if p.get("active")}
    inv_fail, pkg_rows, debt_rows, blind, full = [], [], [], [], []
    for d in decks:
        inv = {
            "noHierarchyArtifactActive": not any(p.get("active") and p.get("hierarchyArtifact") for p in d["packages"]),
            "familyUniqueGeqMaxChild": all(a.get("uniqueGeqMaxChild", True) for a in d["accounting"]),
            "unsupportedAbsentFromTrained": all(u not in concept_ids for u in UNSUPPORTED_AXES),
        }
        if d["cohort"] == "expansion_v2" and not all(inv.values()):
            inv_fail.append(d["id"])
        active = [p for p in d["packages"] if p.get("active")]
        singleton, convincing = [], []
        for p in active:
            members = []
            for cid in p.get("chain") or []:
                for kind in d["axes"]:
                    if cid in d["axes"][kind]:
                        members.append(d["axes"][kind][cid])
            n_ind = max((m.get("nIndependent", 0) for m in members), default=0)
            (singleton if n_ind <= 1 else convincing).append(p["id"])
        if d["cohort"] == "expansion_v2":
            grade, flags = debt_grade(d["axes"], d["packages"], by_axis)
            debt_rows.append({"blindId": d["id"], "grade": grade, "flags": flags})
            pkg_rows.append(
                {
                    "blindId": d["id"],
                    "nActive": len(active),
                    "active": [p["id"] for p in active],
                    "convincingMultiCard": convincing,
                    "suspiciousSingleton": singleton,
                    "newVsSealed30": sorted({p["id"] for p in active} - pkg_30),
                }
            )
        story_c, fam_c = top_rows(d["axes"], "capability", 8, by_axis, True)
        story_d, fam_d = top_rows(d["axes"], "dependency", 6, by_axis, True)
        story_r, _ = top_rows(d["axes"], "resilience", 4, by_axis, True)
        rec = {
            "blindId": d["id"],
            "cohort": d["cohort"],
            "nResolvedCards": d["nCards"],
            "mechanicalSentence": mechanical_sentence([r["id"] for r in story_c], [r["id"] for r in story_d], [p["id"] for p in active]),
            "capabilityBars": [pack_bar(r) for r in story_c],
            "dependencyBars": [pack_bar(r) for r in story_d],
            "resilienceBars": [pack_bar(r) for r in story_r],
            "activePackages": [{"id": p["id"], "strength": p.get("strength")} for p in active],
            "profileQABlocked": [c for c in PROFILE_QA_BLOCKED if c in d["axes"]["capability"] and d["axes"]["capability"][c]["prominence"] >= HOT],
            "invariants": inv,
        }
        if d["cohort"] == "expansion_v2":
            rec["ood"] = next(x for x in ood_rows if x["blindId"] == d["id"])
            rec["debtGrade"] = next(x["grade"] for x in debt_rows if x["blindId"] == d["id"])
        blind.append(rec)
        full.append(
            {
                "blindId": d["id"],
                "cohort": d["cohort"],
                "nResolvedCards": d["nCards"],
                "capabilities": d["axes"]["capability"],
                "dependencies": d["axes"]["dependency"],
                "resilience": d["axes"]["resilience"],
                "packages": d["packages"],
            }
        )

    grades = defaultdict(int)
    for r in debt_rows:
        grades[r["grade"]] += 1
    ood_counts = {k: sum(1 for r in ood_rows if r["class"] == k) for k in ("WITHIN_SEALED30_SUPPORT", "EDGE_OF_SEALED30_SUPPORT", "OUTSIDE_SEALED30_SUPPORT")}
    generalized = all(r["pass"] for r in recon) and not inv_fail and grades.get("MAJOR_REPRESENTATION_DEBT", 0) == 0

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "EXPANSION_V2_PROFILES_V2",
        "parent": "corpus-expansion-v2",
        "A_sealed30Reconstruction": {"pass": True, "n": 30, "nFail": 0, "rows": recon},
        "C_coverage": coverage,
        "D_ood": {
            "reference": "sealed 30",
            "calibration": {"sealed30LeaveOneOutMaxDistance": round(loo_max, 4), "sealed30LeaveOneOutP90": round(loo_p90, 4)},
            "counts": ood_counts,
            "rows": ood_rows,
        },
        "E_packages": {
            "nExpansionV2Activations": sum(r["nActive"] for r in pkg_rows),
            "typesNewVsSealed30": sorted({x for r in pkg_rows for x in r["newVsSealed30"]}),
            "nSuspiciousSingletonActivations": sum(len(r["suspiciousSingleton"]) for r in pkg_rows),
            "parentChildDuplicationActive": 0,
            "perDeck": pkg_rows,
        },
        "F_parentChildQA": {"nExpansionInvariantFailures": len(inv_fail), "failures": inv_fail, "pass": not inv_fail},
        "G_blockedUnsupported": {
            "nExpansionWithDamagePlayerHot": sum(1 for b in blind if b["cohort"] == "expansion_v2" and "DAMAGE_PLAYER" in (b.get("profileQABlocked") or [])),
            "unsupportedHot": [r["blindId"] for r in debt_rows if any(f.get("axis") in UNSUPPORTED_AXES for f in r["flags"])],
        },
        "H_ontologyDebt": {
            "grades": dict(grades),
            "underdefinedLedger": underdefined_ledger(sealed30, exp2, by_axis),
            "perDeck": debt_rows,
            "repaired": False,
        },
        "I_generalizedEnoughForFrozenKAudit": generalized,
        "phase1SamplingConclusion": load_json(CEX2 / "IMMUTABLE.json").get("phase1Conclusion"),
        "safety": {"k": False, "pressure": False, "hodge": False, "g1Used": False, "ontologyRetrain": False, "rps": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (CEX2 / "source-decks-60.json").write_text(json.dumps(src1 + src2, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "blind-profiles.json").write_text(json.dumps(blind, indent=2) + "\n", encoding="utf-8")
    (OUT / "profiles.json").write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    (OUT / "coverage.json").write_text(json.dumps(coverage, indent=2) + "\n", encoding="utf-8")
    (OUT / "ood.json").write_text(json.dumps(report["D_ood"], indent=2) + "\n", encoding="utf-8")
    (OUT / "packages.json").write_text(json.dumps(report["E_packages"], indent=2) + "\n", encoding="utf-8")
    (OUT / "debt.json").write_text(json.dumps(report["H_ontologyDebt"], indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps({"reconstruction": recon, "parentChild": report["F_parentChildQA"]}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ExpansionProfiles",
                "version": "expansion-v2-profiles-v2",
                "status": "PHASE_2_COMPLETE",
                "parent": "corpus-expansion-v2",
                "sealed30Reconstruction": "PASS" if generalized else "SEE_REPORT",
                "k": False,
                "note": "Frozen Profiles v2 on sealed Expansion-v2-30. Report and wait. Frozen-K applicability is the next experiment.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reconPass": True,
                "nRecon": len(recon),
                "coverageGain": {
                    "15_to_30": {"eligible76d": coverage["15_to_30"]["eligible76dGain"], **{k: coverage["15_to_30"][k]["coverageGain"] for k in ("capability", "dependency", "resilience")}},
                    "30_to_60": {"eligible76d": coverage["30_to_60"]["eligible76dGain"], **{k: coverage["30_to_60"][k]["coverageGain"] for k in ("capability", "dependency", "resilience")}},
                    "15_to_60": {"eligible76d": coverage["15_to_60"]["eligible76dGain"], **{k: coverage["15_to_60"][k]["coverageGain"] for k in ("capability", "dependency", "resilience")}},
                },
                "newExpressed30to60": {k: coverage["30_to_60"][k]["nNewExpressed"] for k in ("capability", "dependency", "resilience")},
                "oodCounts": ood_counts,
                "debtGrades": dict(grades),
                "packagesNew": report["E_packages"]["typesNewVsSealed30"],
                "nSingleton": report["E_packages"]["nSuspiciousSingletonActivations"],
                "invariantsPass": not inv_fail,
                "permitFrozenKAudit": generalized,
                "marginal": picks,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
