#!/usr/bin/env python3
"""
Track B — re-fetch captions for the frozen 51 EGV1 games.

Stored YouTube ids were lowercased; recover the same video by title search
only when the recovered id matches case-insensitively. No WatchEDH recaps.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import time
from pathlib import Path

from extract_egv1_transcript_outcomes_v2 import fetch_captions
from outcome_firewall_v1 import assert_omv1_mechanism_gates
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
EGV = MS / "external-gameplay-validation-v1"
OUT = MS / "observed-mechanism-validation-v1"
RAW = WEB / ".data" / "omv1-transcripts"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def titles() -> dict[str, str]:
    out = {}
    for path in (
        EGV / "source-manifest.seed80.json",
        EGV / "source-expansion-v2" / "source-manifest.expansion-v2.seed60.json",
    ):
        blob = load_json(path)
        for rec in blob.get("records") or []:
            if rec.get("externalGameId") and rec.get("title"):
                out[rec["externalGameId"]] = rec["title"]
    return out


def recover_id(stored: str, title: str) -> tuple[str | None, str | None]:
    q = f"ytsearch3:{title}"
    r = subprocess.run(
        ["yt-dlp", "--skip-download", "--no-warnings", "--print", "%(id)s", q],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    ids = [ln.strip() for ln in (r.stdout or "").splitlines() if ln.strip()]
    for cand in ids:
        if cand.lower() == stored.lower():
            return cand, None
    return None, f"no_case_match stored={stored} candidates={ids[:3]}"


def main() -> None:
    assert_omv1_mechanism_gates()
    items = load_json(OUT / "blind-mechanism-items-v1.json")
    if items.get("n") != 612:
        raise SystemExit("frozen 612 items were mutated")
    games = load_json(EGV / "combined-qualified-set-v1.json")["games"]
    title_of = titles()
    by_game = {}
    for it in items["items"]:
        by_game.setdefault(it["externalGameId"], []).append(it["itemId"])
    RAW.mkdir(parents=True, exist_ok=True)
    rows = []
    for g in games:
        gid = g["externalGameId"]
        stored = g.get("youtubeVideoId")
        title = title_of.get(gid) or ""
        print(f"  resolve {gid}", flush=True)
        recovered, rerr = recover_id(stored, title) if title else (None, "no_title")
        text, err = None, rerr
        if recovered:
            with tempfile.TemporaryDirectory() as tmp:
                text, err = fetch_captions(recovered, Path(tmp))
        rec = {
            "externalGameId": gid,
            "youtubeVideoIdStoredLowercase": stored,
            "youtubeVideoIdRecovered": recovered,
            "titleUsedForRecovery": title,
            "source": "yt-dlp auto/manual en VTT after case-preserving title recovery",
            "language": "en",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "propositionIds": by_game.get(gid, []),
            "retrieved": bool(text),
            "transcriptSha256": sha256_bytes(text.encode("utf-8")) if text else None,
            "nChars": len(text) if text else 0,
            "error": err,
        }
        if text:
            (RAW / f"{gid}.vtt").write_text(text, encoding="utf-8")
        rows.append(rec)
        time.sleep(0.8)
    write = {
        "lineage": "observed-mechanism-validation-v1",
        "outcomesOpened": False,
        "usedWatchEdhRecaps": False,
        "nGames": len(rows),
        "nRetrieved": sum(1 for r in rows if r["retrieved"]),
        "games": rows,
    }
    (OUT / "transcript-index-v1.json").write_text(json.dumps(write, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"nGames": len(rows), "nRetrieved": write["nRetrieved"]}, indent=2))


if __name__ == "__main__":
    main()
