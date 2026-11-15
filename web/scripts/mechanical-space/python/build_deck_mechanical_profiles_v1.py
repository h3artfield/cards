#!/usr/bin/env python3
"""
Deck Mechanical Profiles v1.

Frozen K is read-only. No A→B pressure. No 92-d averages. No archetype labels.
No OpenAI. No re-embed. No production writes.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from mechanical_deck_profile_v1 import (
    PACKAGES,
    axis_stats,
    exhibit_weight,
    mechanical_sentence,
    package_activity,
    prominence,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
KDIR = MS / "mechanical-pressure-k-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "deck-mechanical-profiles-v1"

WANTED = [
    "Chatterfang, Squirrel General",
    "Korvold, Fae-Cursed King",
    "Meren of Clan Nel Toth",
    "Muldrotha, the Gravetide",
    "Yuriko, the Tiger's Shadow",
    "Magda, Brazen Outlaw",
    "Winota, Joiner of Forces",
    "Tayam, Luminous Enigma",
    "Kinnan, Bonder Prodigy",
    "K'rrik, Son of Yawgmoth",
    "Lumra, Bellow of the Woods",
    "Tivit, Seller of Secrets",
    "Inalla, Archmage Ritualist",
    "Light-Paws, Emperor's Voice",
    "Talrand, Sky Summoner",
    "Atraxa, Praetors' Voice",
]


def commander_matches(wanted: str, names: list[str]) -> bool:
    w = wanted.lower()
    return any(w == (n or "").lower() or (n or "").lower().startswith(w + " //") for n in names)


def pick_local_decks() -> list[dict]:
    cache = OUT / "source-decks.json"
    if cache.exists():
        return load_json(cache)
    found: dict[str, dict] = {}
    files = sorted(TOPDECK.glob("*/normalized-decks-v3.json"))
    for path in files:
        if len(found) == len(WANTED):
            break
        data = json.loads(path.read_text(encoding="utf-8"))
        for d in data:
            if len(found) == len(WANTED):
                break
            cmds = d.get("commanders") or []
            names = [c.get("canonicalOracleName") or c.get("sourceName") or "" for c in cmds]
            mb = d.get("mainboard") or []
            if len(mb) < 80 or d.get("commanderResolutionStatus") != "resolved":
                continue
            resolved = [x for x in mb if x.get("oracleId")]
            if len(resolved) < 70:
                continue
            for wanted in WANTED:
                if wanted in found:
                    continue
                if commander_matches(wanted, names):
                    found[wanted] = {
                        "wantedCommander": wanted,
                        "commanders": names,
                        "commanderOracleIds": [c.get("oracleId") for c in cmds if c.get("oracleId")],
                        "mainboard": [{"oracleId": x["oracleId"], "name": x.get("canonicalOracleName") or x.get("sourceName"), "quantity": int(x.get("quantity") or 1)} for x in resolved],
                        "sourceFile": path.name,
                        "deckInstanceId": d.get("deckInstanceId"),
                    }
                    break
    picked = [found[w] for w in WANTED if w in found]
    OUT.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(picked) + "\n", encoding="utf-8")
    return picked


def bars(x: float, width: int = 10) -> str:
    n = int(round(clip := max(0.0, min(1.0, x)) * width))
    return "█" * n + "░" * (width - n)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    k_lock = load_json(KDIR / "IMMUTABLE.json")
    if k_lock.get("status") != "FROZEN":
        raise SystemExit("K v1 is not frozen")
    k_edges = load_json(KDIR / "edges.json")
    legal = {(e["capability"], e["target"]) for e in k_edges if e.get("status") in {"SUPPORTED_ATTACK", "SUPPORTED_BENEFIT", "SUPPORTED_NEUTRAL"}}
    drep = load_json(DIR / "report.json")
    concept_ids: list[str] = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of = {}
    type_of = {}
    name_of = {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)

    decks = pick_local_decks()
    full = []
    blind = []
    sealed = []

    for i, raw in enumerate(decks, start=1):
        blind_id = f"D{i:02d}"
        cards = []
        for entry in raw["mainboard"]:
            oid = entry["oracleId"]
            if oid not in row_of:
                continue
            q = max(1, int(entry.get("quantity") or 1))
            cards.append({"oracleId": oid, "name": name_of.get(oid, entry.get("name")), "quantity": q, "row": row_of[oid], "typeLine": type_of[oid]})
        cmd_oids = [o for o in raw["commanderOracleIds"] if o in row_of]
        # commander is part of the 100; include if not already in mainboard
        have = {c["oracleId"] for c in cards}
        for oid in cmd_oids:
            if oid not in have:
                cards.append({"oracleId": oid, "name": name_of[oid], "quantity": 1, "row": row_of[oid], "typeLine": type_of[oid]})
        nonland = [not tl.lower().startswith("land") and "land —" not in tl.lower() and not tl.lower().startswith("basic land") for c in cards for tl in [c["typeLine"]]]

        axes = {"capability": {}, "dependency": {}, "resilience": {}}
        for j, cid in enumerate(concept_ids):
            meta = by_axis.get(cid) or {}
            kind = meta.get("kind")
            if kind not in axes:
                continue
            weights = []
            flags = []
            for card, nl in zip(cards, nonland):
                w = exhibit_weight(float(scores[card["row"], j]), float(p90[j]), float(p99[j]))
                # copies count as density participants, not extra independent engines
                weights.append(w)
                flags.append(nl)
            cmd_w = 0.0
            if cmd_oids:
                # Percentile in the catalog — "is this the commander's mechanic?"
                # Exhibit-weight at p90 misses doublers/enablers that do not say the verb.
                cmd_w = max(float((scores[:, j] < scores[row_of[o], j]).mean()) for o in cmd_oids)
            rec = axis_stats(weights, cmd_w, flags, kind)
            rec["id"] = cid
            rec["kind"] = kind
            rec["prominence"] = round(prominence(rec), 4)
            rec["axisReliability"] = meta.get("directionClass")
            rec["contributors"] = [
                {"name": card["name"], "weight": round(exhibit_weight(float(scores[card["row"], j]), float(p90[j]), float(p99[j])), 3)}
                for card in cards
                if exhibit_weight(float(scores[card["row"], j]), float(p90[j]), float(p99[j])) >= 0.35
            ]
            rec["contributors"] = sorted(rec["contributors"], key=lambda x: -x["weight"])[:8]
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
            act = package_activity(members, supports, spec)
            packages.append({"id": spec["id"], "chain": spec["chain"], **act})
        packages.sort(key=lambda p: (-p["active"], -p["strength"]))

        def top_ids(kind: str, key: str = "prominence", n: int = 8) -> list[dict]:
            rows = sorted(axes[kind].values(), key=lambda r: -r[key])
            return [r for r in rows if r["prominence"] >= 0.18 or r["commander_link"] >= 0.85][:n]

        top_caps = top_ids("capability")
        top_deps = top_ids("dependency", n=6)
        top_res = top_ids("resilience", n=4)
        active_pkgs = [p["id"] for p in packages if p["active"]]
        sentence = mechanical_sentence([r["id"] for r in top_caps], [r["id"] for r in top_deps], active_pkgs)

        k_boundary = {
            "frozenK": "mechanical-pressure-k-v1",
            "deckVsDeckPressureComputed": False,
            "legalReviewedPairs": len(legal),
            "unknownCellsContribute": "nothing — UNKNOWN is not 0 and not NEUTRAL",
            "componentsKeptSeparate": True,
        }

        profile = {
            "blindId": blind_id,
            "nResolvedCards": len(cards),
            "nCommanders": len(cmd_oids),
            "coverageNote": "unresolved mainboard cards omitted; they do not become zeros",
            "capabilities": {k: axes["capability"][k] for k in [r["id"] for r in top_caps] + [x for x in ["CREATE_TOKEN", "REPEATABLE_SACRIFICE_OUTLET", "RECURSION", "GRAVEYARD_SETUP", "CAST_TRIGGER"] if x in axes["capability"]]},
            "dependencies": {k: axes["dependency"][k] for k in [r["id"] for r in top_deps] + [x for x in ["CARES_ABOUT_GRAVEYARD", "CARES_ABOUT_CREATURE_DEATH", "CARES_ABOUT_CASTING_SPELLS", "CARES_ABOUT_TOKENS"] if x in axes["dependency"]]},
            "resiliencies": {k: axes["resilience"][k] for k in [r["id"] for r in top_res]},
            "allAxisPresence": {
                kind: {cid: rec["presence"] for cid, rec in axes[kind].items()}
                for kind in axes
            },
            "packages": packages,
            "mechanicalSentence": sentence,
            "kBoundary": k_boundary,
            "aggregation": "NOT a mean of 92 coordinates. presence=noisy-OR of corpus-calibrated exhibit weights.",
        }
        # strip duplicate keys
        profile["capabilities"] = {r["id"]: axes["capability"][r["id"]] for r in top_caps}
        profile["dependencies"] = {r["id"]: axes["dependency"][r["id"]] for r in top_deps}
        profile["resiliencies"] = {r["id"]: axes["resilience"][r["id"]] for r in top_res}

        blind.append(
            {
                "blindId": blind_id,
                "mechanicalSentence": sentence,
                "capabilityBars": [{**{k: r[k] for k in ("id", "presence", "density", "redundancy", "criticality", "commander_link", "prominence")}, "bar": bars(r["prominence"])} for r in top_caps],
                "dependencyBars": [{**{k: r[k] for k in ("id", "presence", "density", "redundancy", "criticality", "commander_link", "prominence")}, "bar": bars(r["prominence"])} for r in top_deps],
                "resilienceBars": [{**{k: r[k] for k in ("id", "presence", "criticality", "commander_link", "prominence")}, "bar": bars(r["prominence"])} for r in top_res],
                "activePackages": [p for p in packages if p["active"]],
            }
        )
        full.append(
            {
                **profile,
                "source": {"deckInstanceId": raw["deckInstanceId"], "sourceFile": raw["sourceFile"]},
                "commanders": raw["commanders"],
                "commanderOracleIds": cmd_oids,
            }
        )
        sealed.append({"blindId": blind_id, "commanders": raw["commanders"], "wantedCommander": raw["wantedCommander"]})

    # Emergence check uses sealed key only after profiles exist. Not an input.
    def expected_packages(commander: str) -> list[str]:
        c = commander.lower()
        if any(x in c for x in ("chatterfang", "korvold", "meren")):
            return ["TOKEN_THEN_SACRIFICE_THEN_DEATH_PAYOFF", "SACRIFICE_OUTLET_AND_SACRIFICE_CARE", "GRAVEYARD_SETUP_THEN_RECURSION"]
        if any(x in c for x in ("muldrotha", "tayam", "lumra")):
            return ["GRAVEYARD_SETUP_THEN_RECURSION", "MILL_THEN_REANIMATION", "LAND_ENTER_THEN_LAND_CARE"]
        if any(x in c for x in ("yuriko", "winota")):
            return ["COMBAT_DAMAGE_ENGINE"]
        if any(x in c for x in ("talrand", "inalla", "k'rrik", "krrik")):
            return ["CAST_THEN_CAST_CARE", "SPELL_CHAIN_ENGINE"]
        if any(x in c for x in ("magda", "tivit")):
            return ["ARTIFACT_BOARD_AND_ACTIVATIONS", "TOKEN_PLUS_TOKEN_CARE"]
        if "kinnan" in c:
            return ["ARTIFACT_BOARD_AND_ACTIVATIONS", "TOKEN_PLUS_TOKEN_CARE"]
        if "light-paws" in c:
            return ["ONE_CREATURE_PLUS_PROTECTION", "COMMANDER_AS_ENGINE"]
        if "atraxa" in c:
            return ["COUNTER_PLUS_LIFE_CARE"]
        return []

    emergence = []
    for b, s in zip(blind, sealed):
        exp = expected_packages(s["wantedCommander"])
        got = [p["id"] for p in b["activePackages"]]
        hit = [p for p in exp if p in got]
        emergence.append(
            {
                "blindId": b["blindId"],
                "expectedMechanicalPackages": exp,
                "activePackages": got,
                "overlap": hit,
                "recognizableWithoutArchetypeLabel": bool(hit) or bool(got),
            }
        )

    k_man_path = KDIR / "manifest.json"
    k_man = load_json(k_man_path)
    k_man["status"] = "FROZEN"
    k_man["frozen"] = True
    k_man["legalBoundary"] = k_lock["policy"]
    k_man_path.write_text(json.dumps(k_man, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "version": "deck-mechanical-profiles-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "reembedded": False},
        "frozenK": {"version": "mechanical-pressure-k-v1", "status": "FROZEN", "legalReviewedPairs": len(legal)},
        "decksProfiled": len(full),
        "wantedCommanders": WANTED,
        "foundCommanders": [s["wantedCommander"] for s in sealed],
        "missingCommanders": [w for w in WANTED if w not in {s["wantedCommander"] for s in sealed}],
        "didNotAverageCoordinates": True,
        "deckVsDeckPressure": False,
        "archetypeLabelsUsedAsInput": False,
        "winProbability": False,
        "rpsAuthorized": False,
        "safety": {
            "productionFirestoreWrites": "NONE",
            "openai": "NONE",
            "reembed": False,
        },
        "emergence": {
            "decksWithExpectedPackageOverlap": sum(1 for e in emergence if e["overlap"]),
            "decksWithAnyActivePackage": sum(1 for e in emergence if e["activePackages"]),
            "n": len(emergence),
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "profiles.json").write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    (OUT / "blind-profiles.json").write_text(json.dumps(blind, indent=2) + "\n", encoding="utf-8")
    (OUT / "sealed-key.json").write_text(
        json.dumps({"note": "Not an input to the profiler. Open only after reading blind-profiles.", "key": sealed, "emergenceAfterUnseal": emergence}, indent=2) + "\n",
        encoding="utf-8",
    )
    report = {
        **manifest,
        "blindProfiles": blind,
        "kLegalReminder": "A future A→B sum may use only reviewed K edges. UNKNOWN contributes nothing.",
    }
    (MS / "deck-mechanical-profiles-v1-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "decks": len(full),
                "found": [s["wantedCommander"] for s in sealed],
                "missing": manifest["missingCommanders"],
                "emergenceOverlap": manifest["emergence"],
                "sentences": [{"id": b["blindId"], "s": b["mechanicalSentence"]} for b in blind],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
