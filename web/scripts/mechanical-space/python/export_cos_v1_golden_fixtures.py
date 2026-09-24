#!/usr/bin/env python3
"""Export bit-for-bit COS v1 golden fixtures. Does not retrain or alter MODEL."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from freeze_commander_optimization_score_v1 import HEADLINE_KEYS, pct_from_grid, profile_scalars
from freeze_cmmg_v1_dataset_protocol import commander_identity
from run_intrinsic_deck_optimization_geometry_v1 import ACCESS_KEYS, deck_features, load_points, load_texts, vec
from run_spellbook_historical_outcome_association_v1 import fp_vector, sha256_file
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
COS = MS / "commander-optimization-score-v1"
ARCH = MS / "spellbook-win-architecture-space-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"

EXPECTED = {
    "FORMULA.json": "10c4e3ab09d393a98b7921343379c6cc436fed30d01189e805ba98dc1d79882f",
    "SCHEMA.json": "76f24597ed59578b1d8b8e941cdd896b58deb3c633f668c99e8e63fbbe28490c",
    "MODEL.json": "5f51e063a848508a1663201cbc7b8d3539872bd37ff8115fc8ed82d86343c9a9",
    "REFERENCE.json": "b728a42fe81de3ab0abb7488761c95f460a0d0c48cf4d29b144a7f12b4b7d8ab",
}

WANTED = {
    "tymna_kraum": "Tymna the Weaver / Kraum, Ludevic's Opus",
    "kinnan": "Kinnan, Bonder Prodigy",
    "etali": "Etali, Primal Conqueror",
    "magda": "Magda, Brazen Outlaw",
}


def verify() -> dict:
    rows = []
    ok = True
    for name, expected in EXPECTED.items():
        got = sha256_file(COS / name)
        match = got == expected
        ok = ok and match
        rows.append({"file": name, "expected": expected, "got": got, "match": match})
    return {"ok": ok, "checks": rows}


def main() -> None:
    ver = verify()
    if not ver["ok"]:
        raise SystemExit(json.dumps(ver, indent=2))
    model = load_json(COS / "MODEL.json")
    ref = load_json(COS / "REFERENCE.json")
    ident_by_name = {rec["name"]: ident for ident, rec in ref["commanders"].items()}
    wanted_idents = {}
    for key, name in WANTED.items():
        hits = [ident for n, ident in ident_by_name.items() if name in n]
        if not hits:
            raise SystemExit(f"missing commander {name}")
        wanted_idents[key] = hits[0]

    fps = {}
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                fps[str(rec["deckInstanceId"])] = rec

    decks = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and did in fps:
                decks[did] = deck

    print("  load catalog extractors", flush=True)
    points = load_points()
    texts = load_texts()

    mu = np.asarray(model["mu"], dtype=np.float64)
    sd = np.asarray(model["sd"], dtype=np.float64)
    beta = np.asarray(model["beta"], dtype=np.float64)
    S = np.asarray(model["S"], dtype=np.float64)
    cidx = {c: i + 1 for i, c in enumerate(model["commanderIdentities"])}
    grid_u = ref["globalUtilityQuantiles"]

    picked = {k: None for k in WANTED}
    interp_lock = []
    for did, deck in decks.items():
        ident = commander_identity(list(deck.get("commanderOracleIds") or []))
        key = next((k for k, i in wanted_idents.items() if i == ident), None)
        if key is None or picked[key] is not None:
            continue
        feat = deck_features(
            list(deck.get("commanderOracleIds") or []),
            list(deck.get("mainboard") or []),
            fps[did],
            points,
            texts,
        )
        x = np.concatenate([fp_vector(fps[did]), vec(feat, ACCESS_KEYS)])
        z = (x - mu) / sd
        R = float(z @ beta)
        U = float(S[cidx[ident]] + R)
        cmd_ref = ref["commanders"][ident]
        cs = pct_from_grid(U, grid_u)
        bo = pct_from_grid(R, cmd_ref["residualQuantiles"]) if cmd_ref.get("residualQuantiles") else None
        scalars = profile_scalars(feat, fps[did])
        profile = {}
        for ax, val in scalars.items():
            q = cmd_ref["profileQuantiles"].get(ax) if cmd_ref.get("profileQuantiles") else None
            mapping = "within_commander"
            if not q:
                q = ref["globalProfileQuantiles"][ax]
                mapping = "global"
            profile[ax] = {"scalar": val, "percentile": pct_from_grid(val, q), "mapping": mapping}
        picked[key] = {
            "id": key,
            "deckInstanceId": did,
            "commanderIdentity": ident,
            "commanderName": WANTED[key],
            "x": [float(v) for v in x],
            "z": [float(v) for v in z],
            "R": R,
            "U": U,
            "S": float(S[cidx[ident]]),
            "competitiveStrength": cs,
            "buildOptimization": bo,
            "profile": profile,
            "headlineKeys": HEADLINE_KEYS,
        }
        if key == "kinnan":
            for v in (U - 0.5, U, U + 0.5, grid_u[0] - 1, grid_u[-1] + 1):
                interp_lock.append({"value": float(v), "result": pct_from_grid(float(v), grid_u)})
        if all(picked.values()):
            break
    missing = [k for k, v in picked.items() if v is None]
    if missing:
        raise SystemExit(f"could not pick decks for {missing}")

    out = {
        "scoreVersion": "COMMANDER_OPTIMIZATION_SCORE_V1",
        "hashVerification": ver,
        "interpolation": {"grid": "REFERENCE.globalUtilityQuantiles", "cases": interp_lock},
        "decks": list(picked.values()),
    }
    dest = COS / "GOLDEN_FIXTURES.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"wrote": str(dest), "ids": {k: picked[k]["deckInstanceId"] for k in picked}}, indent=2))


if __name__ == "__main__":
    main()
