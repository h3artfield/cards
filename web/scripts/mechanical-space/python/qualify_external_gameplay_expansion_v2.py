#!/usr/bin/env python3
"""
Qualify frozen Source Expansion v2 (60). Outcome-blind. No substitutions.
Does not reopen or repair seed80 holds.
"""

from __future__ import annotations

import csv
import hashlib
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

from egv1_deck_hosts import build_name_maps
from outcome_firewall_v1 import OUTCOME_UNLOCKED, assert_outcomes_locked
from qualify_external_gameplay_v1 import (
    COMPAT_PY,
    NORM_DIR,
    OUT,
    RAW_DIR,
    SCREEN,
    qualify_game,
    sha256_file,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
X2 = OUT / "source-expansion-v2"
SEED80_PRIOR = 17


def verify_expansion_checksums() -> dict[str, str]:
    expected = {}
    for line in (X2 / "manifest-checksums.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        expected[name.strip()] = digest
    got = {}
    for name, digest in expected.items():
        actual = sha256_file(X2 / name)
        if actual != digest:
            raise SystemExit(f"expansion checksum mismatch {name}")
        got[name] = actual
    return got


def main() -> None:
    assert_outcomes_locked()
    if OUTCOME_UNLOCKED:
        raise SystemExit("OUTCOME_UNLOCKED must be false")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if sha256_file(COMPAT_PY) != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")

    seed_freeze = load_json(OUT / "SEED80_FROZEN.json")
    if seed_freeze.get("gate") != "STOP_BELOW_40" or seed_freeze.get("nQualified") != SEED80_PRIOR:
        raise SystemExit("seed80 must remain frozen at STOP_BELOW_40 / 17")
    seed_qual = load_json(OUT / "source-qualification-v1.json")
    if seed_qual.get("nQualified") != SEED80_PRIOR or seed_qual.get("gate") != "STOP_BELOW_40":
        raise SystemExit("seed80 qualification artifacts were mutated")
    pinned = seed_freeze.get("checksums") or {}
    if pinned.get("sourceQualification") and sha256_file(OUT / "source-qualification-v1.json") != pinned["sourceQualification"]:
        raise SystemExit("seed80 source-qualification-v1.json checksum changed")
    seed_ids = {r["externalGameId"] for r in seed_qual["records"] if r["qualification"] == "QUALIFIED_EXACT_4"}
    if seed_ids != set(seed_freeze["qualifiedIds"]):
        raise SystemExit("frozen 17 IDs do not match seed80 qualification")

    checksums = verify_expansion_checksums()
    manifest = load_json(X2 / "source-manifest.expansion-v2.seed60.json")
    records = manifest["records"]
    if len(records) != 60:
        raise SystemExit(f"expected 60 expansion candidates, got {len(records)}")
    x_ids = [r["externalGameId"] for r in records]
    if len(set(x_ids)) != 60:
        raise SystemExit("duplicate expansion externalGameId")

    seed_yt = {r["youtubeVideoId"] for r in load_json(OUT / "source-manifest.seed80.json")["records"]}
    x_yt = [r["youtubeVideoId"] for r in records]
    overlap = set(x_yt) & seed_yt
    if overlap:
        raise SystemExit(f"youtube overlap with seed80: {sorted(overlap)[:8]}")
    if len(set(x_yt)) != 60:
        raise SystemExit("duplicate youtube IDs inside expansion v2")

    channels = Counter(r["channel"] for r in records)
    if dict(channels) != {"MTG Muddstah": 39, "The Spike Feeders": 16, "Elder Dragon Hijinks": 5}:
        raise SystemExit(f"channel allocation mutated: {dict(channels)}")

    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    exact, norm = build_name_maps(rc8)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    NORM_DIR.mkdir(parents=True, exist_ok=True)

    cache: dict[str, dict] = {}
    rows = []
    for i, rec in enumerate(records, 1):
        print(f"  qualify {rec['externalGameId']} {i}/60", flush=True)
        rows.append(qualify_game(rec, exact, norm, cache))

    counts = Counter(r["qualification"] for r in rows)
    n_new = counts.get("QUALIFIED_EXACT_4", 0)
    cumulative = SEED80_PRIOR + n_new
    gate = "CUMULATIVE_PASS" if cumulative >= 40 else "STOP_BELOW_40_AGAIN"

    by_channel = defaultdict(lambda: Counter())
    by_host = Counter()
    hold_reasons = Counter()
    for r in rows:
        by_channel[r["channel"]][r["qualification"]] += 1
        if r["qualification"] != "QUALIFIED_EXACT_4":
            hold_reasons[r.get("holdReason") or "unknown"] += 1
        for d in r.get("deckSnapshots") or []:
            by_host[d["host"]] += 1

    if any(r["outcomeOpened"] or r["transcriptOpened"] for r in rows):
        raise SystemExit("outcome/transcript flag flipped")

    n_snaps = sum(len(r.get("deckSnapshots") or []) for r in rows)
    qual_payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "SOURCE_EXPANSION_V2_QUALIFICATION",
        "outcomesOpened": False,
        "transcriptsOpened": False,
        "outcomeUnlocked": False,
        "nCandidates": 60,
        "nQualified": n_new,
        "priorSeed80Qualified": SEED80_PRIOR,
        "cumulativeQualified": cumulative,
        "counts": dict(counts),
        "holdReasons": dict(hold_reasons),
        "records": rows,
        "gate": gate,
        "listRecoverabilityWeighted": True,
        "notARepresentativeChannelSample": True,
        "note": "Same exact-list rules as seed80. Seed80 holds were not repaired. No replacements.",
    }
    (X2 / "source-qualification-v2.json").write_text(json.dumps(qual_payload, indent=2) + "\n", encoding="utf-8")
    with (X2 / "source-qualification-v2.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["externalGameId", "channel", "qualification", "urlSource", "nSnapshots", "hosts", "outcomeOpened", "transcriptOpened"])
        for r in rows:
            hosts = "|".join(d["host"] for d in r.get("deckSnapshots") or [])
            w.writerow([r["externalGameId"], r["channel"], r["qualification"], r["urlSource"], len(r.get("deckSnapshots") or []), hosts, False, False])

    url_dup = Counter()
    content_dup = Counter()
    snaps = []
    for r in rows:
        for d in r.get("deckSnapshots") or []:
            url_dup[d["sourceUrl"]] += 1
            content_dup[d["contentSha256"]] += 1
            snaps.append(d | {"externalGameId": r["externalGameId"], "batch": "expansion-v2"})
    (X2 / "deck-snapshot-manifest-v2.json").write_text(
        json.dumps({"nSnapshots": n_snaps, "byHost": dict(by_host), "snapshots": snaps}, indent=2) + "\n",
        encoding="utf-8",
    )

    audit = {
        "createdAt": qual_payload["createdAt"],
        "expansionChecksums": checksums,
        "youtubeOverlapWithSeed80": 0,
        "channelAllocation": dict(channels),
        "counts": dict(counts),
        "holdReasons": dict(hold_reasons),
        "byChannel": {k: dict(v) for k, v in by_channel.items()},
        "byHost": dict(by_host),
        "nQualified": n_new,
        "priorSeed80Qualified": SEED80_PRIOR,
        "cumulativeQualified": cumulative,
        "nExactDeckSnapshots": n_snaps,
        "allOutcomeOpenedFalse": True,
        "allTranscriptOpenedFalse": True,
        "selectionIntegrityNote": manifest.get("provenanceNote"),
        "gate": gate,
    }
    (X2 / "qualification-audit-v2.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")

    combined_games = [r for r in seed_qual["records"] if r["qualification"] == "QUALIFIED_EXACT_4"] + [
        r for r in rows if r["qualification"] == "QUALIFIED_EXACT_4"
    ]
    if len(combined_games) != cumulative:
        raise SystemExit("combined count mismatch")

    combined = {
        "createdAt": qual_payload["createdAt"],
        "status": "COMBINED_QUALIFIED_SET_FROZEN" if gate == "CUMULATIVE_PASS" else "COMBINED_BELOW_GATE",
        "outcomesOpened": False,
        "transcriptsOpened": False,
        "outcomeUnlocked": False,
        "priorSeed80Qualified": SEED80_PRIOR,
        "expansionV2Qualified": n_new,
        "cumulativeQualified": cumulative,
        "gate": gate,
        "games": [
            {
                "externalGameId": g["externalGameId"],
                "batch": "seed80" if g["externalGameId"].startswith("EGV1-S") else "expansion-v2",
                "channel": g["channel"],
                "youtubeVideoId": g["youtubeVideoId"],
                "qualification": g["qualification"],
                "deckSnapshots": g["deckSnapshots"],
                "outcomeOpened": False,
                "transcriptOpened": False,
            }
            for g in combined_games
        ],
    }
    (OUT / "combined-qualified-set-v1.json").write_text(json.dumps(combined, indent=2) + "\n", encoding="utf-8")

    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ExternalGameplayValidation",
                "version": "external-gameplay-validation-v1",
                "status": "REPORT_AND_WAIT",
                "seed80Gate": "STOP_BELOW_40",
                "expansionV2Gate": gate,
                "nQualifiedSeed80": SEED80_PRIOR,
                "nQualifiedExpansionV2": n_new,
                "nQualifiedCumulative": cumulative,
                "predictionsRun": False,
                "outcomesOpened": False,
                "transcriptsOpened": False,
                "outcomeUnlocked": False,
                "replacementsChosen": False,
                "modelTouched": False,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "nNew": n_new,
                "cumulative": cumulative,
                "counts": dict(counts),
                "holdReasons": dict(hold_reasons),
                "byChannel": {k: dict(v) for k, v in by_channel.items()},
                "gate": gate,
                "outcomesOpened": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
