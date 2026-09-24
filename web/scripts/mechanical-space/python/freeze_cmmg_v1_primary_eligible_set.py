#!/usr/bin/env python3
"""Freeze the spent-development ≥20 commander set. Future appearances cannot enlarge it."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from outcome_firewall_v1 import CMMG_V1_C1_SHA256, CMMG_V1_C2_SHA256, assert_cmmg_v1_models_frozen
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
OUT = WEB / "data" / "milestones" / "mechanical-space" / "commander-meta-matchup-geometry-v1"
DEV = OUT / "development-model-freeze-v1"
DEST = OUT / "PRIMARY_ELIGIBLE_COMMANDER_SET_FROZEN.json"
THRESHOLD = 20
EXPECTED_N = 368


def sha256_obj(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main() -> None:
    assert_cmmg_v1_models_frozen()
    vocab = load_json(DEV / "commander-vocabulary.json")
    if int(vocab["exposureThreshold"]) != THRESHOLD:
        raise SystemExit("exposure threshold is no longer 20")
    ids = sorted(r["commanderIdentity"] for r in vocab["identities"] if int(r["nPodAppearances"]) >= THRESHOLD)
    if len(ids) != EXPECTED_N:
        raise SystemExit(f"frozen ≥20 set is {len(ids)}, expected {EXPECTED_N}")
    payload = {
        "artifactType": "CmmgV1PrimaryEligibleCommanderSetFrozen",
        "source": "SPENT_DEVELOPMENT_CORPUS appearance counts only",
        "futureAppearancesCannotPromote": True,
        "exposureThreshold": THRESHOLD,
        "nIdentities": len(ids),
        "COMMANDER_META_MODELS_FROZEN": True,
        "C1_SHA256": CMMG_V1_C1_SHA256,
        "C2_SHA256": CMMG_V1_C2_SHA256,
        "commanderIdentities": ids,
    }
    payload["setSha256"] = sha256_obj(ids)
    if DEST.exists():
        prior = load_json(DEST)
        if prior.get("setSha256") != payload["setSha256"]:
            raise SystemExit("refusing to mutate the frozen primary-eligible commander set")
        print("already frozen", payload["setSha256"])
        return
    DEST.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print({"n": len(ids), "setSha256": payload["setSha256"]})


if __name__ == "__main__":
    main()
