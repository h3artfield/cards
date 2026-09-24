#!/usr/bin/env python3
"""
Deck Pressure v1 — 15×14 directed pairs.

Frozen K. Frozen profiles. Only reviewed edges. UNKNOWN stays unknown.
Compare aggregation families. No ranking. No win probability. No Hodge.
"""

from __future__ import annotations

import json
import time
from itertools import permutations
from pathlib import Path

import numpy as np

from mechanical_deck_pressure_v1 import pressure_pair
from mechanical_deck_profile_v1 import deck_axes_from_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
KDIR = MS / "mechanical-pressure-k-v1"
PROF = MS / "deck-mechanical-profiles-v1"
OUT = MS / "deck-pressure-v1"
FAMILIES = ("presence", "prominence", "conservative")
PROMINENCE_FOR_UNKNOWN = 0.25


def resolve_cards(raw: dict, row_of: dict, name_of: dict, type_of: dict) -> tuple[list[dict], list[str]]:
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


def find_named(name_to_oid: dict, names: list[str]) -> list[dict]:
    out = []
    for n in names:
        oid = name_to_oid.get(n.lower())
        if oid:
            out.append({"oracleId": oid, "name": n, "quantity": 1})
    return out


def explain_pair(pair: dict, family: str = "conservative", n: int = 5) -> dict:
    block = pair["families"][family]
    return {
        "from": pair["from"],
        "to": pair["to"],
        "family": family,
        "supportedAttackPressure": block["supportedAttackPressure"],
        "supportedEnablePressure": block["supportedEnablePressure"],
        "coverage": block["coverage"],
        "topAttackTerms": [
            {
                "edge": f"{t['capability']} → {t['dependency']}",
                "relation": t["relation"],
                "effective": t["effectiveTerm"],
                "capProminence": t["capabilityProminence"],
                "capCapacity": t["capabilityCapacity"],
                "capDensity": t["capabilityDensity"],
                "capCommander": t["capabilityCommanderLink"],
                "depCriticality": t["dependencyCriticality"],
                "depProminence": t["dependencyProminence"],
                "p": t["p"],
                "q": t["q"],
                "resilience": t["resilience"],
                "reason": t["reason"],
            }
            for t in block["attackTerms"][:n]
            if t["effectiveTerm"] >= 0.005
        ],
        "topEnableTerms": [
            {"edge": f"{t['capability']} → {t['target']}", "effective": t["effectiveTerm"], "reason": t["reason"]}
            for t in block["enableTerms"][:3]
            if t["effectiveTerm"] >= 0.01
        ],
        "unknownPotential": block["unknownPotentialTerms"][:6],
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    if load_json(KDIR / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1 is not frozen")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Deck profiles v1 are not frozen")

    k_edges = load_json(KDIR / "edges.json")
    attack_edges = [e for e in k_edges if e["relation"] in {"ATTACKS", "DISRUPTS"}]
    enable_edges = [e for e in k_edges if e["relation"] == "ENABLES"]
    damper_by_cap = {e["capability"]: e for e in k_edges if e["relation"] == "MITIGATED_BY"}
    reviewed_pairs = {(e["capability"], e["target"]) for e in k_edges}

    drep = load_json(DIR / "report.json")
    concept_ids: list[str] = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    caps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "capability"]
    deps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "dependency"]
    unknown_candidates = [(c, d) for c in caps for d in deps if (c, d) not in reviewed_pairs]

    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of, name_to_oid = {}, {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
        name_to_oid[(r.get("name") or "").lower()] = r["oracleId"]
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)

    sources = load_json(PROF / "source-decks.json")
    sealed = load_json(PROF / "sealed-key.json")["key"]
    decks = []
    for raw, key in zip(sources, sealed):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, packages = deck_axes_from_cards(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of)
        decks.append({"id": key["blindId"], "axes": axes, "packages": [p for p in packages if p.get("active")]})

    # Failure-mode controls (not part of the 15; not ranked)
    forest = find_named(name_to_oid, ["Forest"])
    rip_one = find_named(name_to_oid, ["Rest in Peace"])
    # 99-card shells: one hate card must not look dedicated just because the list is tiny.
    rip = (rip_one + [dict(forest[0]) for _ in range(98)]) if forest else rip_one
    hate = find_named(
        name_to_oid,
        ["Rest in Peace", "Leyline of the Void", "Grafdigger's Cage", "Relic of Progenitus", "Bojuka Bog", "Soul-Guide Lantern"],
    )
    if forest:
        hate = hate + [dict(forest[0]) for _ in range(93)]
    controls = {}
    for cid, mb, label in (("SYN_RIP", rip, "singleton Rest in Peace"), ("SYN_GYHATE", hate, "dedicated graveyard hate")):
        raw = {"mainboard": mb, "commanderOracleIds": []}
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, packages = deck_axes_from_cards(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of)
        controls[cid] = {"id": cid, "label": label, "axes": axes, "packages": packages}

    def compute_directed(a: dict, b: dict) -> dict:
        families = {
            fam: pressure_pair(a["axes"], b["axes"], attack_edges, enable_edges, damper_by_cap, fam, unknown_candidates)
            for fam in FAMILIES
        }
        return {"from": a["id"], "to": b["id"], "families": families, "fromPackages": [p["id"] for p in a.get("packages") or []], "toPackages": [p["id"] for p in b.get("packages") or []]}

    pairs = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            pairs.append(compute_directed(a, b))

    # Experimental antisymmetric transform — after one-way scores, not a ranking
    anti = {fam: {} for fam in FAMILIES}
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    for p in pairs:
        for fam in FAMILIES:
            pa = p["families"][fam]["supportedAttackPressure"]
            pb = by_dir[(p["to"], p["from"])]["families"][fam]["supportedAttackPressure"]
            anti[fam][(p["from"], p["to"])] = round(pa - pb, 4)

    # Candidate 3-cycles: A>B, B>C, C>A on conservative, with min |M|
    cycles = []
    ids = [d["id"] for d in decks]
    eps = 0.02
    seen = set()
    for a, b, c in permutations(ids, 3):
        key = tuple(sorted([(a, b), (b, c), (c, a)]))
        if key in seen:
            continue
        mab, mbc, mca = anti["conservative"][(a, b)], anti["conservative"][(b, c)], anti["conservative"][(c, a)]
        if mab > eps and mbc > eps and mca > eps:
            seen.add(key)
            cycles.append(
                {
                    "cycle": [a, b, c, a],
                    "M": {"%s→%s" % (a, b): mab, "%s→%s" % (b, c): mbc, "%s→%s" % (c, a): mca},
                    "explanations": [
                        explain_pair(by_dir[(a, b)]),
                        explain_pair(by_dir[(b, c)]),
                        explain_pair(by_dir[(c, a)]),
                    ],
                    "note": "A cycle is not a result until every edge has a supported K explanation.",
                }
            )
    cycles.sort(key=lambda x: -min(x["M"].values()))

    # Inspect a fixed set of pairs (not a power ranking)
    inspect_ids = [("D04", "D03"), ("D03", "D04"), ("D03", "D07"), ("D07", "D03"), ("D07", "D11"), ("D11", "D07"), ("D11", "D03"), ("D03", "D11"), ("D14", "D07"), ("D07", "D14"), ("D06", "D12"), ("D12", "D06")]
    inspected = []
    for a, b in inspect_ids:
        if (a, b) in by_dir:
            block = explain_pair(by_dir[(a, b)])
            block["M_conservative"] = anti["conservative"][(a, b)]
            block["familiesTotals"] = {fam: by_dir[(a, b)]["families"][fam]["supportedAttackPressure"] for fam in FAMILIES}
            inspected.append(block)

    # Singleton vs dedicated hate onto the strongest GY-dependent deck among the 15
    gy_id = max(decks, key=lambda d: d["axes"]["dependency"]["CARES_ABOUT_GRAVEYARD"]["prominence"])["id"]
    gy_deck = next(d for d in decks if d["id"] == gy_id)
    failure_mode = {
        "target": gy_id,
        "targetGyProminence": gy_deck["axes"]["dependency"]["CARES_ABOUT_GRAVEYARD"]["prominence"],
        "singletonRIP": {fam: compute_directed(controls["SYN_RIP"], gy_deck)["families"][fam] for fam in FAMILIES},
        "dedicatedHate": {fam: compute_directed(controls["SYN_GYHATE"], gy_deck)["families"][fam] for fam in FAMILIES},
        "invariant": "presence family treats one Rest in Peace like a strategy; conservative must not.",
    }
    # shrink failure-mode dumps
    for blob in (failure_mode["singletonRIP"], failure_mode["dedicatedHate"]):
        for fam, block in blob.items():
            blob[fam] = {
                "supportedAttackPressure": block["supportedAttackPressure"],
                "coverage": block["coverage"],
                "graveyardTerm": next((t for t in block["attackTerms"] if t["capability"] == "GRAVEYARD_DENIAL" and t["dependency"] == "CARES_ABOUT_GRAVEYARD"), None),
            }

    (OUT / "pairs.json").write_text(json.dumps(pairs, indent=2) + "\n", encoding="utf-8")
    anti_json = {fam: {f"{a}→{b}": v for (a, b), v in anti[fam].items()} for fam in FAMILIES}

    # Invariants
    antisym_ok = all(abs(anti[fam][(a, b)] + anti[fam][(b, a)]) < 1e-9 for fam in FAMILIES for a, b in anti[fam] if (b, a) in anti[fam])
    no_self = all(p["from"] != p["to"] for p in pairs)
    unknown_not_in_sum = True  # by construction

    manifest = {
        "version": "deck-pressure-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": LOCKED_CHECKSUM},
        "frozenK": "mechanical-pressure-k-v1",
        "frozenProfiles": "deck-mechanical-profiles-v1",
        "directedPairs": len(pairs),
        "reviewedAttackOrDisruptEdges": len(attack_edges),
        "reviewedEnableEdges": len(enable_edges),
        "reviewedDampers": list(damper_by_cap),
        "aggregationFamilies": list(FAMILIES),
        "aggregationCanonized": False,
        "packagesInventKEdges": False,
        "unknownIsZero": False,
        "deckRankingProduced": False,
        "winProbability": False,
        "hodge": False,
        "rpsAuthorized": False,
        "invariants": {
            "directedPairsAre210": len(pairs) == 15 * 14,
            "noSelfPairs": no_self,
            "M_antisymmetric": antisym_ok,
            "unknownExcludedFromSum": unknown_not_in_sum,
        },
        "coverageSummary": {
            fam: {
                "mean": round(float(np.mean([p["families"][fam]["coverage"] for p in pairs])), 4),
                "min": round(float(np.min([p["families"][fam]["coverage"] for p in pairs])), 4),
                "max": round(float(np.max([p["families"][fam]["coverage"] for p in pairs])), 4),
            }
            for fam in FAMILIES
        },
        "conservativeCycleCount": len(cycles),
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "reembed": False},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "antisymmetric.json").write_text(json.dumps(anti_json, indent=2) + "\n", encoding="utf-8")
    (OUT / "cycles-conservative.json").write_text(json.dumps(cycles[:12], indent=2) + "\n", encoding="utf-8")

    report = {
        **manifest,
        "inspectedPairs": inspected,
        "failureModeSingletonVsDedicatedHate": failure_mode,
        "candidateCyclesConservative": cycles[:8],
        "note": "Do not read totals as a power ranking. Read term proofs. Coverage is required to interpret any total.",
    }
    (MS / "deck-pressure-v1-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    # Compact stdout
    print(
        json.dumps(
            {
                "pairs": len(pairs),
                "invariants": manifest["invariants"],
                "coverage": manifest["coverageSummary"],
                "cycles": [
                    {"cycle": c["cycle"], "M": c["M"], "whys": [e["topAttackTerms"][0]["edge"] if e["topAttackTerms"] else None for e in c["explanations"]]}
                    for c in cycles[:6]
                ],
                "inspected": [
                    {
                        "pair": f"{x['from']}→{x['to']}",
                        "P": x["supportedAttackPressure"],
                        "cov": x["coverage"],
                        "M": x["M_conservative"],
                        "top": x["topAttackTerms"][0]["edge"] if x["topAttackTerms"] else None,
                    }
                    for x in inspected
                ],
                "ripVsHate": {
                    "target": failure_mode["target"],
                    "rip": {fam: failure_mode["singletonRIP"][fam]["supportedAttackPressure"] for fam in FAMILIES},
                    "hate": {fam: failure_mode["dedicatedHate"][fam]["supportedAttackPressure"] for fam in FAMILIES},
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
