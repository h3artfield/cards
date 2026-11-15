#!/usr/bin/env python3
"""
Expansion Profiles v2 — Phase 2 of Corpus Expansion v1.

Frozen instrument on sealed Expansion-15. Anchor-15 is a reconstruction control.
Does not read K, Pressure, M, or Hodge.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import bars, profile_deck, top_rows
from mechanical_deck_profile_v1 import mechanical_sentence
from mechanical_deck_profile_v2 import (
    DEBT_FAMILIES,
    UNSUPPORTED_AXES,
    is_broad,
    parent_of,
)
from mechanical_k_v2 import PROFILE_QA_BLOCKED, SPLIT_PARENTS
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
CEX = MS / "corpus-expansion-v1"
OUT = MS / "expansion-profiles-v2"

HOT = 0.18
RARE = 0.35
STRONG = 0.50


def eligible_ids(concept_ids, by_axis):
    blocked = set(PROFILE_QA_BLOCKED) | set(UNSUPPORTED_AXES) | set(SPLIT_PARENTS)
    return [
        cid
        for cid in concept_ids
        if cid not in blocked
        and (by_axis.get(cid) or {}).get("kind") in {"capability", "dependency", "resilience"}
        and not is_broad(by_axis.get(cid) or {})
    ]


def vec(axes, ids):
    flat = {cid: rec for kind in axes for cid, rec in axes[kind].items()}
    return np.array([float((flat[c] or {}).get("packageInformedProminence", (flat[c] or {}).get("prominence", 0))) if c in flat else 0.0 for c in ids], dtype=np.float32)


def l2(v):
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else v


def pack_bar(r):
    return {
        **{k: r[k] for k in ("id", "presence", "density", "redundancy", "criticality", "commander_link", "prominence", "roleType")},
        "bar": bars(r["prominence"]),
        "parent": r.get("parent"),
    }


def max_map(decks, kind, field="prominence"):
    out = defaultdict(float)
    for d in decks:
        for cid, rec in d["axes"][kind].items():
            out[cid] = max(out[cid], float(rec.get("packageInformedProminence", rec[field])))
    return out


def coverage_kind(anchor, expansion, kind, by_axis):
    a, e = max_map(anchor, kind), max_map(expansion, kind)
    ids = sorted(set(a) | set(e))
    new, rare, gain = [], [], 0.0
    for cid in ids:
        if is_broad(by_axis.get(cid) or {}) or cid in SPLIT_PARENTS or cid in UNSUPPORTED_AXES or cid in PROFILE_QA_BLOCKED:
            continue
        av, ev = a.get(cid, 0.0), e.get(cid, 0.0)
        gain += max(0.0, ev - av)
        if ev >= HOT and av < HOT:
            new.append({"id": cid, "anchorMax": round(av, 4), "expansionMax": round(ev, 4)})
        elif av < RARE and ev >= STRONG:
            rare.append({"id": cid, "anchorMax": round(av, 4), "expansionMax": round(ev, 4)})
    return {
        "coverageGain": round(gain, 4),
        "newExpressed": sorted(new, key=lambda x: -x["expansionMax"]),
        "previouslyRareStrengthened": sorted(rare, key=lambda x: -x["expansionMax"]),
        "nNewExpressed": len(new),
        "nRareStrengthened": len(rare),
    }


def ood_class(d, loo_max, loo_p90):
    if d <= loo_max + 1e-9:
        return "WITHIN_ANCHOR_SUPPORT"
    if d <= loo_p90 + 0.08:
        return "EDGE_OF_ANCHOR_SUPPORT"
    return "OUTSIDE_ANCHOR_SUPPORT"


def is_underdefined(cid, by_axis) -> bool:
    return (by_axis.get(cid) or {}).get("directionClass") == "UNDERDEFINED"


def debt_grade(axes, pkgs, by_axis):
    """Per-deck grade. Promiscuous UNDERDEFINED heat is logged, not auto-major."""
    flags = []
    for cid in UNSUPPORTED_AXES:
        for kind in axes:
            rec = axes[kind].get(cid)
            if rec and rec["prominence"] >= HOT:
                flags.append({"level": "major", "axis": cid, "reason": "unsupported_axis_hot"})
    for cid in PROFILE_QA_BLOCKED:
        rec = axes["capability"].get(cid)
        if rec and rec["prominence"] >= HOT:
            flags.append({"level": "mild", "axis": cid, "reason": "profile_qa_blocked_hot", "knownInstrumentDebt": True})
    story_c, _ = top_rows(axes, "capability", 3, by_axis, True)
    story_d, _ = top_rows(axes, "dependency", 3, by_axis, True)
    for r in story_c[:2] + story_d[:2]:
        if is_underdefined(r["id"], by_axis) and r["prominence"] >= 0.80:
            flags.append({"level": "mild", "axis": r["id"], "reason": "underdefined_leads_story"})
    if any(p.get("active") and p.get("hierarchyArtifact") for p in pkgs):
        flags.append({"level": "major", "axis": None, "reason": "parent_child_package_double_count"})
    majors = [f for f in flags if f["level"] == "major"]
    milds = [f for f in flags if f["level"] == "mild"]
    if majors:
        grade = "MAJOR_REPRESENTATION_DEBT"
    elif milds:
        grade = "MILD_ONTOLOGY_DEBT"
    else:
        grade = "CLEAN_REPRESENTATION"
    return grade, flags


def underdefined_ledger(anchor, expansion, by_axis):
    def hot_counts(decks):
        c = defaultdict(int)
        for d in decks:
            for kind in d["axes"]:
                for cid, rec in d["axes"][kind].items():
                    if is_underdefined(cid, by_axis) and rec["prominence"] >= HOT:
                        c[cid] += 1
        return c

    a, e = hot_counts(anchor), hot_counts(expansion)
    ids = sorted(set(a) | set(e))
    promiscuous, amplified, expansion_only = [], [], []
    for cid in ids:
        ac, ec = a.get(cid, 0), e.get(cid, 0)
        row = {"axis": cid, "anchorHot": ac, "expansionHot": ec}
        if ac >= 10 and ec >= 10:
            promiscuous.append(row)
        elif ec - ac >= 4:
            amplified.append(row)
        elif ac == 0 and ec >= 3:
            expansion_only.append(row)
    return {"promiscuousAlsoOnAnchor": promiscuous, "amplifiedOnExpansion": amplified, "mostlyExpansion": expansion_only}


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(CEX / "sampling-frame.json").get("status") != "FROZEN":
        raise SystemExit("sampling frame must be frozen")
    if load_json(CEX / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Corpus Expansion v1 Phase 1 must be frozen")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")

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

    sources = load_json(CEX / "source-decks.json")
    if len(sources) != 30:
        raise SystemExit(f"expected 30 sealed lists, got {len(sources)}")
    frozen = {p["blindId"]: p for p in load_json(PROF2 / "profiles.json")}
    axis_ids = eligible_ids(concept_ids, by_axis)

    decks = []
    recon = []
    for i, raw in enumerate(sources):
        bid = f"D{i+1:02d}"
        cards = []
        for entry in raw["mainboard"]:
            oid = entry["oracleId"]
            if oid not in row_of:
                continue
            cards.append({"oracleId": oid, "name": name_of.get(oid, entry.get("name")), "quantity": max(1, int(entry.get("quantity") or 1)), "row": row_of[oid], "typeLine": type_of[oid]})
        cmd_oids = [o for o in raw.get("commanderOracleIds") or [] if o in row_of]
        have = {c["oracleId"] for c in cards}
        for oid in cmd_oids:
            if oid not in have:
                cards.append({"oracleId": oid, "name": name_of[oid], "quantity": 1, "row": row_of[oid], "typeLine": type_of[oid]})
        axes, pkgs, _, accounting, contra, _ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        cohort = "anchor" if i < 15 else "expansion"
        if cohort == "anchor":
            fp = frozen[bid]
            d_pres, d_promo = [], []
            for kind, stored_kind in (("capability", "capabilities"), ("dependency", "dependencies"), ("resilience", "resiliencies")):
                stored = fp.get(stored_kind) or {}
                for cid, rec in stored.items():
                    got = axes[kind].get(cid)
                    if not got:
                        d_promo.append(1.0)
                        continue
                    d_promo.append(abs(got.get("packageInformedProminence", got["prominence"]) - rec.get("packageInformedProminence", rec.get("prominence", 0))))
            allp = fp.get("allAxisPresence") or {}
            for kind in axes:
                for cid, rec in axes[kind].items():
                    if cid in (allp.get(kind) or {}):
                        d_pres.append(abs(rec["presence"] - allp[kind][cid]))
            recon.append(
                {
                    "blindId": bid,
                    "nResolvedCards": len(cards),
                    "frozenResolved": fp.get("nResolvedCards"),
                    "maxProminenceDelta": round(max(d_promo) if d_promo else 0.0, 6),
                    "maxPresenceDelta": round(max(d_pres) if d_pres else 0.0, 6),
                    "nPresenceCompared": len(d_pres),
                    "pass": (max(d_promo) if d_promo else 0.0) <= 1e-4 and (max(d_pres) if d_pres else 0.0) <= 1e-4 and len(cards) == fp.get("nResolvedCards"),
                }
            )
        decks.append({"id": bid, "cohort": cohort, "axes": axes, "packages": pkgs, "accounting": accounting, "contradictory": contra, "nCards": len(cards), "vec": vec(axes, axis_ids)})

    if not all(r["pass"] for r in recon):
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "Anchor-15 did not reconstruct", "reconstruction": recon}, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"stop": True, "reconstruction": recon}, indent=2))
        raise SystemExit("Anchor-15 reconstruction failed — not interpreting expansion")

    anchor = [d for d in decks if d["cohort"] == "anchor"]
    expansion = [d for d in decks if d["cohort"] == "expansion"]
    A = np.stack([l2(d["vec"]) for d in anchor])
    loo = []
    for i in range(15):
        others = np.delete(A, i, axis=0)
        loo.append(1.0 - float((others @ A[i]).max()))
    loo_max, loo_p90 = float(max(loo)), float(np.quantile(loo, 0.90))

    ood_rows = []
    for d in expansion:
        vn = l2(d["vec"])
        sims = A @ vn
        dist = 1.0 - float(sims.max())
        klass = ood_class(dist, loo_max, loo_p90)
        ood_rows.append({"blindId": d["id"], "nearestAnchor": anchor[int(sims.argmax())]["id"], "nearestCosine": round(float(sims.max()), 4), "distanceToNearestAnchor": round(dist, 4), "meanAnchorCosine": round(float(sims.mean()), 4), "class": klass})

    coverage = {
        "capability": coverage_kind(anchor, expansion, "capability", by_axis),
        "dependency": coverage_kind(anchor, expansion, "dependency", by_axis),
        "resilience": coverage_kind(anchor, expansion, "resilience", by_axis),
        "note": "Gain is sum of max(0, expansionMax - anchorMax) on eligible non-broad coordinates. Not archetype labels.",
    }
    pkg_anchor = {p["id"] for d in anchor for p in d["packages"] if p.get("active")}
    pkg_exp = {p["id"] for d in expansion for p in d["packages"] if p.get("active")}
    coverage["package"] = {
        "nAnchorActiveTypes": len(pkg_anchor),
        "nExpansionActiveTypes": len(pkg_exp),
        "newInExpansion": sorted(pkg_exp - pkg_anchor),
        "shared": sorted(pkg_exp & pkg_anchor),
        "coverageGainTypes": len(pkg_exp - pkg_anchor),
    }

    inv_fail = []
    pkg_rows = []
    debt_rows = []
    blind = []
    full = []
    for d in decks:
        inv = {
            "noHierarchyArtifactActive": not any(p.get("active") and p.get("hierarchyArtifact") for p in d["packages"]),
            "familyUniqueGeqMaxChild": all(a.get("uniqueGeqMaxChild", True) for a in d["accounting"]),
            "unsupportedAbsentFromTrained": all(u not in concept_ids for u in UNSUPPORTED_AXES),
        }
        if d["cohort"] == "expansion" and not all(inv.values()):
            inv_fail.append(d["id"])
        active = [p for p in d["packages"] if p.get("active")]
        singleton = []
        convincing = []
        for p in active:
            members = []
            for cid in p.get("chain") or []:
                for kind in d["axes"]:
                    if cid in d["axes"][kind]:
                        members.append(d["axes"][kind][cid])
            n_ind = max((m.get("nIndependent", 0) for m in members), default=0)
            if n_ind <= 1:
                singleton.append(p["id"])
            else:
                convincing.append(p["id"])
        if d["cohort"] == "expansion":
            grade, flags = debt_grade(d["axes"], d["packages"], by_axis)
            debt_rows.append({"blindId": d["id"], "grade": grade, "flags": flags})
            pkg_rows.append(
                {
                    "blindId": d["id"],
                    "nActive": len(active),
                    "active": [p["id"] for p in active],
                    "convincingMultiCard": convincing,
                    "suspiciousSingleton": singleton,
                    "hierarchyArtifactsBlocked": [p["id"] for p in d["packages"] if p.get("hierarchyArtifact") and p.get("naiveActive") and not p.get("active")],
                    "newVsAnchor": sorted({p["id"] for p in active} - pkg_anchor),
                    "comboVsAnchor": sorted({p["id"] for p in active} - pkg_anchor) == [] and len(active) >= 3,
                }
            )
        story_c, fam_c = top_rows(d["axes"], "capability", 8, by_axis, True)
        story_d, fam_d = top_rows(d["axes"], "dependency", 6, by_axis, True)
        story_r, _ = top_rows(d["axes"], "resilience", 4, by_axis, True)
        sentence = mechanical_sentence([r["id"] for r in story_c], [r["id"] for r in story_d], [p["id"] for p in active])
        blocked = [c for c in PROFILE_QA_BLOCKED if c in d["axes"]["capability"] and d["axes"]["capability"][c]["prominence"] >= HOT]
        rec = {
            "blindId": d["id"],
            "cohort": d["cohort"],
            "nResolvedCards": d["nCards"],
            "mechanicalSentence": sentence,
            "capabilityBars": [pack_bar(r) for r in story_c],
            "dependencyBars": [pack_bar(r) for r in story_d],
            "resilienceBars": [pack_bar(r) for r in story_r],
            "familySummaries": [pack_bar(r) for r in (fam_c + fam_d)[:8]],
            "activePackages": [{"id": p["id"], "strength": p.get("strength"), "source": p.get("source")} for p in active],
            "profileQABlocked": blocked,
            "invariants": inv,
        }
        if d["cohort"] == "expansion":
            rec["ood"] = next(x for x in ood_rows if x["blindId"] == d["id"])
            rec["debtGrade"] = next(x["grade"] for x in debt_rows if x["blindId"] == d["id"])
        blind.append(rec)
        full.append({"blindId": d["id"], "cohort": d["cohort"], "nResolvedCards": d["nCards"], "capabilities": {r["id"]: d["axes"]["capability"][r["id"]] for r in story_c}, "dependencies": {r["id"]: d["axes"]["dependency"][r["id"]] for r in story_d}, "resiliencies": {r["id"]: d["axes"]["resilience"].get(r["id"]) for r in story_r if r["id"] in d["axes"]["resilience"]}, "packages": d["packages"]})

    debt_axes = defaultdict(int)
    for r in debt_rows:
        for f in r["flags"]:
            if f.get("axis"):
                debt_axes[f["axis"]] += 1
    grades = defaultdict(int)
    for r in debt_rows:
        grades[r["grade"]] += 1
    ud_ledger = underdefined_ledger(anchor, expansion, by_axis)

    combos_anchor = {frozenset(p["id"] for p in d["packages"] if p.get("active")) for d in anchor}
    new_combos = sum(1 for d in expansion if frozenset(p["id"] for p in d["packages"] if p.get("active")) not in combos_anchor)

    generalized = all(r["pass"] for r in recon) and not inv_fail and grades.get("MAJOR_REPRESENTATION_DEBT", 0) == 0

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "EXPANSION_PROFILES_V2",
        "parent": "corpus-expansion-v1",
        "A_anchorReconstruction": {"pass": True, "n": 15, "rows": recon},
        "C_coverage": coverage,
        "D_ood": {
            "calibration": {"anchorLeaveOneOutMaxDistance": round(loo_max, 4), "anchorLeaveOneOutP90": round(loo_p90, 4), "note": "WITHIN = no farther than the most isolated Anchor-15 deck is from its nearest neighbor"},
            "counts": {k: sum(1 for r in ood_rows if r["class"] == k) for k in ("WITHIN_ANCHOR_SUPPORT", "EDGE_OF_ANCHOR_SUPPORT", "OUTSIDE_ANCHOR_SUPPORT")},
            "rows": ood_rows,
        },
        "E_packages": {
            "nExpansionActivations": sum(r["nActive"] for r in pkg_rows),
            "typesNewVsAnchor": coverage["package"]["newInExpansion"],
            "nDecksWithNewCombo": new_combos,
            "nSuspiciousSingletonActivations": sum(len(r["suspiciousSingleton"]) for r in pkg_rows),
            "parentChildDuplicationActive": 0,
            "perDeck": pkg_rows,
        },
        "F_parentChildQA": {"nExpansionInvariantFailures": len(inv_fail), "failures": inv_fail, "pass": not inv_fail},
        "G_blockedUnsupported": {
            "nExpansionWithDamagePlayerHot": sum(1 for b in blind if b["cohort"] == "expansion" and "DAMAGE_PLAYER" in (b.get("profileQABlocked") or [])),
            "unsupportedHot": [r["blindId"] for r in debt_rows if any(f.get("axis") in UNSUPPORTED_AXES for f in r["flags"])],
        },
        "H_ontologyDebt": {
            "grades": dict(grades),
            "axesRepeatedlyImplicated": sorted(({"axis": k, "nDecks": v} for k, v in debt_axes.items()), key=lambda x: -x["nDecks"]),
            "underdefinedLedger": ud_ledger,
            "perDeck": debt_rows,
            "repaired": False,
            "note": "UNDERDEFINED axes that are already hot on Anchor-15 are instrument promiscuity, not expansion-specific failure.",
        },
        "I_generalizedEnoughForFrozenKAudit": generalized,
        "safety": {"k": False, "pressure": False, "hodge": False, "ontologyRetrain": False, "rps": False, "ranking": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
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
                "version": "expansion-profiles-v2",
                "status": "PHASE_2_COMPLETE",
                "parent": "corpus-expansion-v1",
                "anchorReconstruction": "PASS",
                "k": False,
                "note": "Frozen Profiles v2 on sealed Expansion-15. Report and wait. Frozen-K audit is Phase 3.",
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
                "coverage": {k: {kk: coverage[k][kk] for kk in coverage[k] if kk not in {"newExpressed", "previouslyRareStrengthened"}} for k in ("capability", "dependency", "resilience")},
                "packagesNew": coverage["package"]["newInExpansion"],
                "oodCounts": report["D_ood"]["counts"],
                "debtGrades": dict(grades),
                "debtAxes": report["H_ontologyDebt"]["axesRepeatedlyImplicated"][:8],
                "underdefinedLedger": {k: report["H_ontologyDebt"]["underdefinedLedger"][k] for k in report["H_ontologyDebt"]["underdefinedLedger"]},
                "invariantsPass": not inv_fail,
                "permitPhase3": generalized,
                "ood": ood_rows,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
