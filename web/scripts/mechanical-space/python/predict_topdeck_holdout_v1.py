#!/usr/bin/env python3
"""
Track A — held-out TopDeck same-pod predictions.

Winners stay masked. No tuning. Compact Pressure records only.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import time
from collections import Counter
from itertools import combinations
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
from build_deck_pressure_v2 import (
    DIAGNOSTICS,
    LIVE,
    PRIMARY,
    aggregation_stability,
    channels_of,
    interpret_u,
    net_sign_status,
    pack_hostile,
    pack_support,
)
from build_hodge_diagnostic_v0 import ESTIMATORS, MATERIAL, NEAR_ZERO
from build_hodge_diagnostic_v1 import m_edge_stability
from build_k_v13_active_coverage import resolve_cards
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from freeze_external_gameplay_predictions_v1 import compact_axes
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels
from outcome_firewall_v1 import assert_topdeck_holdout_winners_locked
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K3 = MS / "mechanical-pressure-k-v3.0"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "topdeck-holdout-outcome-validation-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
GIT_SHA = "50789e02c667f2150ae70adc3ca92ec8f743942b"
CKPT = OUT / "_predictions.jsonl"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def sha256_obj(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def list_checksum(deck: dict) -> str:
    blob = {
        "commanderOracleIds": deck.get("commanderOracleIds") or [],
        "mainboard": [
            {"oracleId": c.get("oracleId"), "quantity": c.get("quantity"), "name": c.get("name")}
            for c in (deck.get("mainboard") or [])
        ],
    }
    return sha256_obj(blob)


def slim_term(t: dict) -> dict:
    return {
        "capability": t.get("capability"),
        "dependency": t.get("dependency") or t.get("target"),
        "relation": t.get("relation"),
        "effectiveTerm": t.get("effectiveTerm"),
    }


def predict_pod(ids: list[str], axes_of: dict, ctx: dict) -> dict:
    decks = [{"id": i, "axes": axes_of[i]} for i in ids]
    polarity = {i: polarity_blocked_caps(axes_of[i]) for i in ids}
    pairs, _edges = compute_pairs(decks, [dict(e) for e in ctx["edges"]], ctx["leftover"], ctx["by_axis"], polarity)
    attach_channels(pairs)
    idx = pair_index_eligible(pairs, ctx["by_axis"])
    h_rows = {(r["from"], r["to"]): r for r in pair_h_both(decks, ctx["leftover"], idx, ctx["by_axis"])}
    directed = {}
    for p in pairs:
        a, b = p["from"], p["to"]
        h = h_rows[(a, b)]
        prim = p["families"][PRIMARY]
        chs = {fam: channels_of(p["families"][fam]) for fam in (PRIMARY, *DIAGNOSTICS)}
        attacks = prim.get("attackTerms") or []
        enables = prim.get("enableTerms") or []
        hostile_t = [pack_hostile(t, ctx["edge_of"].get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") in HOSTILE]
        cond_t = [pack_hostile(t, ctx["edge_of"].get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") == "CONDITIONAL"]
        supp_t = [pack_support(t, ctx["edge_of"].get((t["capability"], t.get("target") or t.get("dependency")))) for t in enables if t.get("relation") in SUPPORT]
        hostile_t.sort(key=lambda t: float(t.get("effectiveTerm") or 0), reverse=True)
        directed[(a, b)] = {
            "channels": chs[PRIMARY],
            "estimators": {est: chs[est] for est in ESTIMATORS if est in chs},
            "H_credible": h["H_credible"],
            "maturity": maturity_class(h["H_credible"]),
            "aggregation_stability": aggregation_stability(chs),
            "net_sign_status": net_sign_status(chs),
            "topHostile": [slim_term(t) for t in hostile_t[:3]],
            "topSupportive": [slim_term(t) for t in supp_t[:2]],
            "topConditional": [slim_term(t) for t in cond_t[:1]],
            "uncertainty": interpret_u(h["H_raw"], h["H_credible"]),
        }
    pair_out = []
    outgoing = Counter()
    for a, b in combinations(ids, 2):
        pa, pb = directed[(a, b)], directed[(b, a)]
        mvals = {}
        for est in ESTIMATORS:
            mvals[est] = {
                "M_hostile": round(pa["estimators"][est]["hostile_pressure"] - pb["estimators"][est]["hostile_pressure"], 4),
                "M_supportive": round(pa["estimators"][est]["supportive_pressure"] - pb["estimators"][est]["supportive_pressure"], 4),
                "M_net": round(pa["estimators"][est]["net_interaction"] - pb["estimators"][est]["net_interaction"], 4),
            }
        host_stab = m_edge_stability({est: mvals[est]["M_hostile"] for est in ESTIMATORS})
        mh = mvals["conservative"]["M_hostile"]
        if host_stab == "STABLE_DIRECTION":
            src, dst = (a, b) if mh > 0 else (b, a)
            direction = {"from": src, "to": dst, "channel": "M_hostile"}
            relation = "STABLE_DIRECTION"
            outgoing[src] += 1
        elif host_stab == "STABLE_NEAR_ZERO":
            direction = None
            relation = "NO_STABLE_DIRECTION"
        else:
            direction = None
            relation = "INCOMPARABLE_OR_SENSITIVE"
        pair_out.append(
            {
                "a": a,
                "b": b,
                "M": mvals,
                "hostileStability": host_stab,
                "materialHostile": abs(mh) >= MATERIAL,
                "relation": relation,
                "direction": direction,
                "directed": {"a_to_b": pa, "b_to_a": pb},
            }
        )
    if outgoing:
        top = outgoing.most_common()
        pref = top[0][0] if len(top) == 1 or top[0][1] > top[1][1] else None
    else:
        pref = None
    return {
        "pairs": pair_out,
        "outgoingStableCounts": dict(outgoing),
        "predictedWinnerPreference": pref,
        "preferenceStatus": "UNIQUE" if pref else "ABSTAIN",
    }


def main() -> None:
    assert_topdeck_holdout_winners_locked()
    if load_json(OUT / "scoring-spec.json").get("status") != "FROZEN_BEFORE_PREDICTION_AND_REVEAL":
        raise SystemExit("scoring spec must be frozen before prediction")
    if load_json(OUT / "holdout-pods.json").get("winnerIdentityRetained") is not False:
        raise SystemExit("holdout retained winner identity")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (K3, "K v3.0"), (MS / "deck-pressure-v4", "Pressure v4")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    if sha256_file(COMPAT_PY) != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")

    holdout = load_json(OUT / "holdout-pods.json")
    pods = holdout["pods"]
    if len(pods) != 5000:
        raise SystemExit(f"holdout n={len(pods)} != 5000")
    needed = {d for p in pods for d in p["deckInstanceIds"]}

    done = set()
    if CKPT.exists():
        for line in CKPT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["podId"])
        print(f"  resume {len(done)} pods", flush=True)

    decks = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        print(f"  load {path.parent.name}", flush=True)
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did in needed and did not in decks:
                decks[did] = deck
    missing = sorted(needed - set(decks))
    if missing:
        raise SystemExit(f"missing {len(missing)} holdout lists")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    row_of, type_of, name_of = {}, {}, {}
    for r in (json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l):
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    edges = load_json(K3 / "edges.json")
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = set(_eligible_leftover(leftover, by_axis))
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    cells = sorted(reviewed_live | leftover_el)
    ctx = {
        "edges": edges,
        "edge_of": {(e["capability"], e["target"]): e for e in edges},
        "leftover": leftover,
        "by_axis": by_axis,
        "compat": {cd: compatibility(cd[0], cd[1])["level"] for cd in cells},
    }

    profiles = {}
    still = [d for d in sorted(needed) if True]
    print(f"  profile {len(still)} unique lists", flush=True)
    for i, did in enumerate(still, 1):
        raw = decks[did]
        cards, cmd_oids = resolve_cards(
            {"mainboard": raw.get("mainboard") or [], "commanderOracleIds": raw.get("commanderOracleIds") or []},
            row_of,
            name_of,
            type_of,
        )
        axes, *_ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        profiles[did] = {
            "deckInstanceId": did,
            "commanderOracleIds": list(raw.get("commanderOracleIds") or []),
            "listSha256": list_checksum(raw),
            "nResolvedCards": len(cards),
            "axes": compact_axes(axes),
            "_axes": axes,
        }
        if i % 250 == 0:
            print(f"    {i}/{len(still)}", flush=True)

    axes_of = {did: profiles[did]["_axes"] for did in profiles}
    print(f"  predict {len(pods) - len(done)} remaining pods", flush=True)
    with CKPT.open("a", encoding="utf-8") as fh:
        for i, pod in enumerate(pods, 1):
            if pod["podId"] in done:
                continue
            rec = {
                "podId": pod["podId"],
                "tid": pod["tid"],
                "round": pod["round"],
                "table": pod["table"],
                "deckInstanceIds": pod["deckInstanceIds"],
                "listSha256": [profiles[d]["listSha256"] for d in pod["deckInstanceIds"]],
                **predict_pod(pod["deckInstanceIds"], axes_of, ctx),
                "winnerIdentityRetained": False,
            }
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            if i % 100 == 0:
                print(f"    pod {i}/5000", flush=True)

    rows = [json.loads(l) for l in CKPT.read_text(encoding="utf-8").splitlines() if l.strip()]
    rows.sort(key=lambda r: (str(r["tid"]), str(r["round"]), str(r["table"]), r["podId"]))
    if [r["podId"] for r in rows] != [p["podId"] for p in pods]:
        raise SystemExit("prediction pod IDs do not match frozen holdout order")

    n_stable = sum(1 for r in rows for p in r["pairs"] if p["relation"] == "STABLE_DIRECTION")
    n_unique = sum(1 for r in rows if r["preferenceStatus"] == "UNIQUE")
    compact_profiles = [{k: v for k, v in rec.items() if k != "_axes"} for rec in profiles.values()]
    compact_profiles.sort(key=lambda r: r["deckInstanceId"])
    pred = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN",
        "scientificLabel": "HELD_OUT_OUTCOME_BLIND_TOPDECK_VALIDATION",
        "holdoutVersion": "topdeck-holdout-outcome-validation-v1",
        "nPods": len(rows),
        "podOrderingKey": "(tid, round, table, podId)",
        "podIds": [r["podId"] for r in rows],
        "instrument": {
            "ontology": "v2.2",
            "profiles": "v2",
            "K": "v3.0",
            "pressure": "v4",
            "primaryEstimator": "conservative-v2",
        },
        "gitSha": GIT_SHA,
        "winnersRevealed": False,
        "nStableDirectionPairs": n_stable,
        "nUniqueWinnerPreference": n_unique,
        "pods": rows,
        "note": "Winners were not loaded. Compact Pressure records. Not a ranking.",
    }
    write_json(OUT / "holdout-predictions-v1.json", pred)
    write_json(OUT / "holdout-profiles-v2.json", {"n": len(compact_profiles), "winnersRevealed": False, "profiles": compact_profiles})
    bundle = {
        "bge": LOCKED_CHECKSUM,
        "compatibilityScreen": load_json(SCREEN / "IMMUTABLE.json")["sha256"],
        "scoringSpec": sha256_file(OUT / "scoring-spec.json"),
        "holdout": sha256_file(OUT / "holdout-pods.json"),
        "analysisSpec": sha256_file(OUT / "analysis-spec.json"),
        "profilesV2Immutable": sha256_file(PROF2 / "IMMUTABLE.json"),
        "k30Immutable": sha256_file(K3 / "IMMUTABLE.json"),
        "pressureV4Immutable": sha256_file(MS / "deck-pressure-v4" / "IMMUTABLE.json"),
        "predictorScript": sha256_file(Path(__file__)),
    }
    write_json(OUT / "instrument-config-bundle.json", bundle)
    freeze = {
        "artifactType": "TopDeckHoldoutPredictionFreeze",
        "status": "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN",
        "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN": True,
        "winnersRevealed": False,
        "nPods": 5000,
        "nStableDirectionPairs": n_stable,
        "nUniqueWinnerPreference": n_unique,
        "gitSha": GIT_SHA,
        "createdAt": pred["createdAt"],
        "checksums": {
            "holdoutManifest": sha256_file(OUT / "holdout-pods.json"),
            "predictionArtifact": sha256_file(OUT / "holdout-predictions-v1.json"),
            "profiles": sha256_file(OUT / "holdout-profiles-v2.json"),
            "instrumentConfigBundle": sha256_file(OUT / "instrument-config-bundle.json"),
            "scoringSpec": bundle["scoringSpec"],
        },
    }
    freeze["predictionFreezeSha256"] = sha256_obj(freeze)
    write_json(OUT / "PREDICTION_FROZEN.json", freeze)
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN",
            "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN": True,
            "winnersRevealed": False,
            "predictionFreezeSha256": freeze["predictionFreezeSha256"],
        },
    )
    CKPT.unlink(missing_ok=True)
    print(json.dumps({"frozen": True, "nPods": 5000, "nStable": n_stable, "nUniquePref": n_unique, "sha": freeze["predictionFreezeSha256"]}, indent=2))


if __name__ == "__main__":
    main()
