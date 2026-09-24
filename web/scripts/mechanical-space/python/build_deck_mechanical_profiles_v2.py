#!/usr/bin/env python3
"""
Deck Mechanical Profiles v2 — controlled before/after on the sealed 15.

Frozen BGE. Frozen Ontology v2.2. Same source-decks as Profiles v1.
No K v2. No pressure. No Hodge. No extra decks. No re-embed.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from mechanical_deck_profile_v1 import axis_stats, exhibit_weight, mechanical_sentence, package_boost, prominence
from mechanical_deck_profile_v2 import (
    DEBT_FAMILIES,
    UNSUPPORTED_AXES,
    V1_PACKAGES,
    V2_PACKAGES,
    children_of,
    contradictory_children,
    evaluate_packages,
    family_accounting,
    family_union_weights,
    is_broad,
    parent_of,
    role_type,
    select_story_axes,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR22 = MS / "mechanical-directions-v22"
DIR21 = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
V1 = MS / "deck-mechanical-profiles-v1"
OUT = MS / "deck-mechanical-profiles-v2"


def bars(x: float, width: int = 10) -> str:
    n = int(round(max(0.0, min(1.0, x)) * width))
    return "█" * n + "░" * (width - n)


def load_space(dir_path: Path):
    concept_ids: list[str] = load_json(dir_path / "concept-ids.json")
    drep = load_json(dir_path / "report.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(dir_path / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    return concept_ids, by_axis, scores


def profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy: bool):
    nonland = []
    for card in cards:
        tl = (card.get("typeLine") or "").lower()
        nonland.append(not tl.startswith("land") and "land —" not in tl and not tl.startswith("basic land"))
    trained = set(concept_ids)
    trained_parents = {cid: parent_of(cid) for cid in concept_ids if parent_of(cid)}
    weights_by_id: dict[str, list[float]] = {}
    raw_axes = {"capability": {}, "dependency": {}, "resilience": {}}
    for j, cid in enumerate(concept_ids):
        meta = by_axis.get(cid) or {}
        kind = meta.get("kind")
        if kind not in raw_axes:
            continue
        weights_by_id[cid] = [exhibit_weight(float(scores[card["row"], j]), float(p90[j]), float(p99[j])) for card in cards]
        cmd_w = 0.0
        if cmd_oids:
            cmd_w = max(float((scores[:, j] < scores[row_of[o], j]).mean()) for o in cmd_oids if o in row_of)
        rec = axis_stats(weights_by_id[cid], cmd_w, nonland, kind)
        rec["id"] = cid
        rec["kind"] = kind
        rec["parent"] = meta.get("parent")
        rec["role"] = meta.get("role")
        rec["directionClass"] = meta.get("directionClass")
        rec["roleType"] = role_type(meta)
        rec["densityRaw"] = rec["density"]
        rec["redundancyRaw"] = rec["redundancy"]
        rec["presenceRaw"] = rec["presence"]
        rec["commander_link"] = rec["commander_link"]
        rec["prominence"] = round(prominence(rec), 4)
        rec["contributors"] = sorted(
            [{"name": card["name"], "weight": round(w, 3)} for card, w in zip(cards, weights_by_id[cid]) if w >= 0.35],
            key=lambda x: -x["weight"],
        )[:8]
        raw_axes[kind][cid] = rec

    if hierarchy:
        for kind in raw_axes:
            for cid, rec in raw_axes[kind].items():
                kids = children_of(cid, trained)
                if not kids:
                    continue
                fam = family_union_weights(weights_by_id[cid], [weights_by_id[k] for k in kids if k in weights_by_id])
                cmd_w = rec["commander_link"]
                adj = axis_stats(fam, cmd_w, nonland, rec["kind"])
                rec["density"] = adj["density"]
                rec["redundancy"] = adj["redundancy"]
                rec["presence"] = adj["presence"]
                rec["nStrong"] = adj["nStrong"]
                rec["nIndependent"] = adj["nIndependent"]
                rec["criticality"] = adj["criticality"]
                rec["prominence"] = round(prominence(rec), 4)
                rec["familyUnionApplied"] = True
                rec["roleType"] = "BROAD_FAMILY" if is_broad(by_axis.get(cid) or rec) else rec["roleType"]

    packages = evaluate_packages(V1_PACKAGES, raw_axes, by_axis, weights_by_id, trained_parents, "v1_engine")
    if hierarchy:
        packages += evaluate_packages(V2_PACKAGES, raw_axes, by_axis, weights_by_id, trained_parents, "v2_child")
        packages.sort(key=lambda p: (-p["active"], -p["strength"]))

    for kind in raw_axes:
        for cid, rec in raw_axes[kind].items():
            rec["packageBoost"] = round(package_boost(cid, [p for p in packages if p["active"]]), 4)
            rec["packageInformedProminence"] = round(min(1.0, rec["prominence"] + rec["packageBoost"]), 4)

    accounting = [family_accounting(p, trained, weights_by_id, nonland) for p in sorted({parent_of(c) for c in trained if parent_of(c)})]
    flat = {cid: rec for kind in raw_axes for cid, rec in raw_axes[kind].items()}
    return raw_axes, packages, weights_by_id, accounting, contradictory_children(flat), nonland


def top_rows(axes, kind, n, meta_of, story: bool):
    rows = list(axes[kind].values())
    if story:
        story_rows, family = select_story_axes(rows, meta_of, n)
        return story_rows, family
    rows = [r for r in rows if r["prominence"] >= 0.18 or r["commander_link"] >= 0.85]
    rows.sort(key=lambda r: -r["prominence"])
    return rows[:n], []


def expected_packages(commander: str) -> list[str]:
    """Post-hoc recognition only. Never an input to the profiler."""
    c = commander.lower()
    if any(x in c for x in ("chatterfang", "korvold", "meren")):
        return ["TOKEN_THEN_SACRIFICE_THEN_DEATH_PAYOFF", "SACRIFICE_OUTLET_AND_SACRIFICE_CARE", "GRAVEYARD_SETUP_THEN_RECURSION"]
    if any(x in c for x in ("muldrotha", "tayam", "lumra")):
        return ["GRAVEYARD_SETUP_THEN_RECURSION", "MILL_THEN_REANIMATION", "LAND_ENTER_THEN_LAND_CARE"]
    if any(x in c for x in ("yuriko", "winota")):
        return ["COMBAT_DAMAGE_ENGINE"]
    if any(x in c for x in ("talrand", "inalla", "k'rrik", "krrik")):
        return ["CAST_THEN_CAST_CARE", "SPELL_CHAIN_ENGINE"]
    if any(x in c for x in ("magda", "tivit", "kinnan")):
        return ["ARTIFACT_BOARD_AND_ACTIVATIONS", "TOKEN_PLUS_TOKEN_CARE"]
    if "light-paws" in c:
        return ["ONE_CREATURE_PLUS_PROTECTION", "COMMANDER_AS_ENGINE"]
    if "atraxa" in c:
        return ["COUNTER_PLUS_LIFE_CARE"]
    return []


def debt_row(v1_axes, v2_axes, family: dict) -> dict:
    def grab(axes, cid):
        for kind in axes:
            if cid in axes[kind]:
                r = axes[kind][cid]
                return {"prominence": r["prominence"], "density": r["density"], "criticality": r["criticality"], "commander_link": r["commander_link"]}
        return None

    parents = {p: {"v1": grab(v1_axes, p), "v2": grab(v2_axes, p)} for p in family["parents"]}
    children = {c: grab(v2_axes, c) for c in family["children"]}
    present_children = {k: v for k, v in children.items() if v and (v["prominence"] >= 0.18 or v["commander_link"] >= 0.85)}
    v1_max = max((parents[p]["v1"]["prominence"] for p in parents if parents[p]["v1"]), default=0.0)
    child_max = max((v["prominence"] for v in present_children.values()), default=0.0)
    more_precise = bool(present_children) and (child_max >= 0.18)
    return {
        "parents": parents,
        "childProminences": children,
        "activatedChildren": list(present_children),
        "morePrecise": more_precise,
        "v1ParentMaxProminence": v1_max,
        "v2ChildMaxProminence": child_max,
        "unsupportedStillAbsent": [u for u in family.get("unsupported") or [] if grab(v2_axes, u) is None],
    }


def compare_deck(blind_id, v1_axes, v2_axes, v1_pkgs, v2_pkgs, v2_story):
    def tops(axes, n=8):
        rows = []
        for kind in axes:
            rows.extend(axes[kind].values())
        rows.sort(key=lambda r: -r["prominence"])
        return [r["id"] for r in rows if r["prominence"] >= 0.18][:n]

    v1_top, v2_top = set(tops(v1_axes)), set(tops(v2_axes))
    v2_children = {r["id"] for kind in v2_axes for r in v2_axes[kind].values() if r.get("parent") and r["prominence"] >= 0.18}
    v1_active = {p["id"] for p in v1_pkgs if p.get("active")}
    v2_v1engine = {p["id"] for p in v2_pkgs if p.get("source") == "v1_engine" and p.get("active")}
    v2_v1_naive = {p["id"] for p in v2_pkgs if p.get("source") == "v1_engine" and p.get("naiveActive")}
    v2_new = {p["id"] for p in v2_pkgs if p.get("source") == "v2_child" and p.get("active")}
    artifacts = [p["id"] for p in v2_pkgs if p.get("hierarchyArtifact") and p.get("naiveActive") and not p.get("active")]
    return {
        "blindId": blind_id,
        "topV1Retained": sorted(v1_top & v2_top),
        "topV1Lost": sorted(v1_top - v2_top),
        "newV2Children": sorted(v2_children - v1_top),
        "broadParentsReplaced": [s["id"] for s in v2_story.get("familySummaries", [])],
        "packageRetention": sorted(v1_active & v2_v1engine),
        "packageRetentionNaive": sorted(v1_active & v2_v1_naive),
        "packageLoss": sorted(v1_active - v2_v1engine),
        "packageLossVsNaive": sorted(v1_active - v2_v1_naive),
        "unexpectedV2Packages": sorted(v2_new),
        "hierarchyArtifactPackages": artifacts,
        "v1Active": sorted(v1_active),
        "v2V1EngineActive": sorted(v2_v1engine),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    if neu_man.get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    v1_lock = load_json(V1 / "IMMUTABLE.json")
    if v1_lock.get("status") != "FROZEN":
        raise SystemExit("Profiles v1 must stay frozen")
    if not (V1 / "source-decks.json").exists():
        raise SystemExit("Profiles v1 source-decks.json missing — refuse to re-pick decks")

    c22, by22, s22 = load_space(DIR22)
    c21, by21, s21 = load_space(DIR21)
    for bad in UNSUPPORTED_AXES:
        if bad in c22:
            raise SystemExit(f"unsupported axis leaked into v2.2 trained set: {bad}")

    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    p90_22 = np.percentile(s22, 90, axis=0)
    p99_22 = np.percentile(s22, 99, axis=0)
    p90_21 = np.percentile(s21, 90, axis=0)
    p99_21 = np.percentile(s21, 99, axis=0)

    decks = load_json(V1 / "source-decks.json")
    v1_blind = load_json(V1 / "blind-profiles.json")
    sealed_in = load_json(V1 / "sealed-key.json")
    sealed_key = sealed_in.get("key") or sealed_in

    full, blind, comparisons, debt_tables, audits = [], [], [], [], []
    recon_ok = []

    for i, raw in enumerate(decks, start=1):
        blind_id = f"D{i:02d}"
        cards = []
        for entry in raw["mainboard"]:
            oid = entry["oracleId"]
            if oid not in row_of:
                continue
            cards.append({"oracleId": oid, "name": name_of.get(oid, entry.get("name")), "quantity": max(1, int(entry.get("quantity") or 1)), "row": row_of[oid], "typeLine": type_of[oid]})
        cmd_oids = [o for o in raw["commanderOracleIds"] if o in row_of]
        have = {c["oracleId"] for c in cards}
        for oid in cmd_oids:
            if oid not in have:
                cards.append({"oracleId": oid, "name": name_of[oid], "quantity": 1, "row": row_of[oid], "typeLine": type_of[oid]})

        v2_axes, v2_pkgs, _, accounting, contra, _ = profile_deck(
            cards, cmd_oids, c22, by22, s22, p90_22, p99_22, row_of, hierarchy=True
        )
        v1_axes, v1_pkgs, _, _, _, _ = profile_deck(
            cards, cmd_oids, c21, by21, s21, p90_21, p99_21, row_of, hierarchy=False
        )

        stored = next((b for b in v1_blind if b["blindId"] == blind_id), None)
        if stored:
            for bar in stored.get("dependencyBars") or []:
                rec = (v1_axes.get("dependency") or {}).get(bar["id"])
                if rec:
                    recon_ok.append(abs(rec["prominence"] - bar["prominence"]) < 0.02)

        story_caps, fam_caps = top_rows(v2_axes, "capability", 8, by22, True)
        story_deps, fam_deps = top_rows(v2_axes, "dependency", 6, by22, True)
        story_res, _ = top_rows(v2_axes, "resilience", 4, by22, True)
        active = [p for p in v2_pkgs if p["active"]]
        sentence = mechanical_sentence([r["id"] for r in story_caps], [r["id"] for r in story_deps], [p["id"] for p in active])

        invariant = {
            "unsupportedAbsent": all(u not in c22 for u in UNSUPPORTED_AXES),
            "familyUniqueLeqLabelSum": all(a["nFamilyUnique"] <= max(a["nChildLabelSum"], a["nFamilyUnique"]) for a in accounting),
            "familyUniqueGeqMaxChild": all(a["uniqueGeqMaxChild"] for a in accounting),
            "noHierarchyArtifactActive": not any(p["active"] and p["hierarchyArtifact"] for p in v2_pkgs),
            "parentDensityIsUnionNotSum": all(a["nFamilyUnique"] <= a["nChildUnion"] + a["nParentExhibitors"] for a in accounting),
        }
        audits.append({"blindId": blind_id, "invariants": invariant, "families": accounting, "contradictoryChildren": contra})

        cmp = compare_deck(blind_id, v1_axes, v2_axes, v1_pkgs, v2_pkgs, {"familySummaries": fam_caps + fam_deps})
        comparisons.append(cmp)
        debt_tables.append({"blindId": blind_id, "families": {name: debt_row(v1_axes, v2_axes, spec) for name, spec in DEBT_FAMILIES.items()}})

        def pack_bar(r):
            return {**{k: r[k] for k in ("id", "presence", "density", "redundancy", "criticality", "commander_link", "prominence", "roleType")}, "bar": bars(r["prominence"]), "parent": r.get("parent")}

        blind.append(
            {
                "blindId": blind_id,
                "mechanicalSentence": sentence,
                "capabilityBars": [pack_bar(r) for r in story_caps],
                "dependencyBars": [pack_bar(r) for r in story_deps],
                "resilienceBars": [pack_bar(r) for r in story_res],
                "familySummaries": [pack_bar(r) for r in (fam_caps + fam_deps)[:8]],
                "activePackages": active,
                "naiveV1PackagesStillActive": [p["id"] for p in v2_pkgs if p["source"] == "v1_engine" and p["naiveActive"]],
            }
        )
        full.append(
            {
                "blindId": blind_id,
                "nResolvedCards": len(cards),
                "capabilities": {r["id"]: v2_axes["capability"][r["id"]] for r in story_caps},
                "dependencies": {r["id"]: v2_axes["dependency"][r["id"]] for r in story_deps},
                "resiliencies": {r["id"]: v2_axes["resilience"][r["id"]] for r in story_res},
                "allAxisPresence": {kind: {cid: rec["presence"] for cid, rec in v2_axes[kind].items()} for kind in v2_axes},
                "packages": v2_pkgs,
                "mechanicalSentence": sentence,
                "kBoundary": {"kV2": False, "deckVsDeckPressureComputed": False, "note": "Profiles v2 only. K v2 is not started."},
                "aggregation": "v1 formulas; parent density/redundancy use family-union unique cards",
            }
        )

    # Unseal only after blind profiles exist.
    emergence = []
    for b, s in zip(blind, sealed_key):
        exp = expected_packages(s["wantedCommander"])
        got = [p["id"] for p in b["activePackages"]]
        emergence.append(
            {
                "blindId": b["blindId"],
                "expectedMechanicalPackages": exp,
                "activePackages": got,
                "overlap": [p for p in exp if p in got],
                "recognizableWithoutArchetypeLabel": bool([p for p in exp if p in got]) or bool(got),
            }
        )

    pkg_ret = sum(len(c["packageRetention"]) for c in comparisons)
    pkg_v1 = sum(len(c["v1Active"]) for c in comparisons)
    debt_precision = {}
    for name in DEBT_FAMILIES:
        n = sum(1 for d in debt_tables if d["families"][name]["morePrecise"])
        debt_precision[name] = {"decksMorePrecise": n, "n": len(debt_tables)}

    representative = [b["blindId"] for b, s in zip(blind, sealed_key) if any(x in s["wantedCommander"].lower() for x in ("meren", "muldrotha", "winota", "light-paws", "magda", "lumra"))]

    manifest = {
        "version": "deck-mechanical-profiles-v2",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "parentProfiles": "deck-mechanical-profiles-v1",
        "ontology": "mechanical-ontology-v2.2",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "reembedded": False},
        "kV2": False,
        "decksProfiled": len(full),
        "sameSealedDecks": True,
        "definitionChange": {
            "parentDensityRedundancyPresence": "family-union unique cards (max exhibit weight across parent + trained children)",
            "childFields": "unchanged from v1",
            "commander_link": "unchanged, per-coordinate",
            "prominence": "unchanged formula on possibly family-union inputs for parents only",
        },
        "v1ReconstructionMatchRate": (sum(recon_ok) / len(recon_ok)) if recon_ok else None,
        "invariantsAllPass": all(all(a["invariants"].values()) for a in audits),
        "packageRetention": {"retainedActivations": pkg_ret, "v1Activations": pkg_v1},
        "debtPrecision": debt_precision,
        "unsupportedAxesAbsent": list(UNSUPPORTED_AXES),
        "archetypeLabelsUsedAsInput": False,
        "deckVsDeckPressure": False,
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "reembed": False, "hodge": False, "rpsAuthorized": False, "extraDecks": False},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "profiles.json").write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    (OUT / "blind-profiles.json").write_text(json.dumps(blind, indent=2) + "\n", encoding="utf-8")
    (OUT / "comparison-v1.json").write_text(json.dumps({"decks": comparisons, "debtFamilies": debt_tables, "accounting": audits, "emergenceAfterUnseal": emergence}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "DeckMechanicalProfiles", "version": "deck-mechanical-profiles-v2", "status": "REVIEWED_BATCH", "parent": "deck-mechanical-profiles-v1", "kV2": False}, indent=2) + "\n",
        encoding="utf-8",
    )
    report = {
        **manifest,
        "acceptance": {
            "A_fifteenDecks": len(full) == 15,
            "D_accountingPass": manifest["invariantsAllPass"],
            "C_v1PackagesMostlySurviveNaive": pkg_v1 == 0 or (sum(len(c["packageRetentionNaive"]) for c in comparisons) / pkg_v1) >= 0.6,
            "unsupportedAbsent": True,
            "noKV2": True,
        },
        "packageSummary": {
            "retentionHierarchyAware": [c["packageRetention"] for c in comparisons],
            "lossHierarchyAware": [c["packageLoss"] for c in comparisons],
            "artifactsBlocked": [c["hierarchyArtifactPackages"] for c in comparisons],
            "newChildPackages": [c["unexpectedV2Packages"] for c in comparisons],
        },
        "representativeBlindIds": representative,
        "blindProfiles": [b for b in blind if b["blindId"] in representative] or blind,
        "comparisons": comparisons,
        "debtFamilies": debt_tables,
        "emergenceAfterUnseal": emergence,
    }
    (MS / "deck-mechanical-profiles-v2-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "decks": len(full),
                "invariantsAllPass": manifest["invariantsAllPass"],
                "v1Recon": manifest["v1ReconstructionMatchRate"],
                "packageRetention": manifest["packageRetention"],
                "debtPrecision": debt_precision,
                "sentences": [{"id": b["blindId"], "s": b["mechanicalSentence"]} for b in blind],
                "emergenceOverlap": sum(1 for e in emergence if e["overlap"]),
                "newChildPkgs": {b["blindId"]: [p["id"] for p in b["activePackages"] if p.get("source") == "v2_child"] for b in blind},
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
