#!/usr/bin/env python3
"""
External Gameplay Outcome Audit v1.

Outcomes only. Transcripts remain locked. Predictions are not rerun.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from egv1_deck_hosts import norm_name
from egv1_http import curl_text, polite_sleep
from outcome_firewall_v1 import (
    OUTCOME_UNLOCKED,
    TRANSCRIPT_UNLOCKED,
    assert_outcome_audit_gates,
    extract_comments,
    extract_gameplay_summary,
    extract_transcript,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
EGV = MS / "external-gameplay-validation-v1"
OUT = MS / "external-gameplay-outcome-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
PRED_SHA = "2f02c78a421c4c5da53831af5e1c860c92d228019e9e25471391f604c562ad4a"
MAJOR_CHANNELS = ("MTG Muddstah", "The Spike Feeders")
STRATA = ("MTG Muddstah", "The Spike Feeders", "Elder Dragon Hijinks", "Combat Step")

YT_ID_RE = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})")
WINNER_PATTERNS = [
    re.compile(r"\bwinner\s*[:\-]\s*(.+)$", re.I | re.M),
    re.compile(r"\bwon by\s+(.+)$", re.I | re.M),
    re.compile(r"\bvictory (?:goes )?to\s+(.+)$", re.I | re.M),
    re.compile(r"^(.+?)\s+wins\b", re.I | re.M),
    re.compile(r"^(.+?)\s+won\b", re.I | re.M),
    re.compile(r"\b(.+?)\s+takes? the win\b", re.I),
    re.compile(r"\bcongratulations to\s+(.+)$", re.I | re.M),
]
PLACE_LINE = re.compile(
    r"^\s*(1st|2nd|3rd|4th|first|second|third|fourth)(?:\s+place)?\s*[:\-]\s*(.+)$",
    re.I | re.M,
)
ORD = {"1st": 1, "first": 1, "2nd": 2, "second": 2, "3rd": 3, "third": 3, "4th": 4, "fourth": 4}
TERM_RE = re.compile(
    r"\b(?:the game (?:was a |ended in a )?(?:draw|tie)|ended in a draw|mutual concession|game drawn)\b",
    re.I,
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def match_commander(text: str, seats: list[dict]) -> str | None:
    hits = []
    blob = norm_name(text)
    if not blob:
        return None
    for seat in seats:
        names = [norm_name(n) for n in seat["commanderNames"]]
        if any(n and (n in blob or blob in n or n[:10] == blob[:10]) for n in names if n):
            hits.append(seat["deckId"])
    if len(set(hits)) == 1:
        return hits[0]
    return None


def parse_explicit_fields(text: str, seats: list[dict]) -> dict:
    winner = None
    placements = {}
    for pat in WINNER_PATTERNS:
        for m in pat.finditer(text):
            did = match_commander(m.group(1)[:80], seats)
            if did:
                winner = did
                break
        if winner:
            break
    for m in PLACE_LINE.finditer(text):
        place = ORD.get(m.group(1).lower())
        did = match_commander(m.group(2)[:80], seats)
        if place and did and place not in placements:
            placements[place] = did
    termination = "completed"
    tm = TERM_RE.search(text)
    if tm and not winner and len(placements) < 4:
        word = tm.group(1).lower()
        if word in {"draw", "tie"}:
            termination = "draw"
        elif word in {"concession", "conceded"}:
            termination = "concession"
        else:
            termination = "unusual"
    if winner and 1 not in placements:
        placements[1] = winner
    return {"winnerDeckId": winner, "placements": placements, "termination": termination}


def real_youtube_id(watch_html: str, fallback: str) -> str:
    ids = YT_ID_RE.findall(watch_html)
    return ids[0] if ids else fallback


def youtube_description(video_id: str) -> str:
    r = subprocess.run(
        ["yt-dlp", "--skip-download", "--no-warnings", "--print", "%(description)s", f"https://www.youtube.com/watch?v={video_id}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return r.stdout if r.returncode == 0 else ""


def extract_game_outcome(watch_url: str, fallback_yt: str, seats: list[dict]) -> dict:
    polite_sleep(0.15)
    html = curl_text(watch_url)
    yt = real_youtube_id(html, fallback_yt)
    # explicit clauses only; discard page after regex
    page_text = re.sub(r"<[^>]+>", "\n", html)
    page_text = re.sub(r"[ \t]+", " ", page_text)
    from_page = parse_explicit_fields(page_text, seats)
    del html, page_text
    desc = youtube_description(yt)
    from_desc = parse_explicit_fields(desc, seats)
    del desc
    winner = from_desc["winnerDeckId"] or from_page["winnerDeckId"]
    placements = dict(from_page["placements"])
    placements.update(from_desc["placements"])
    if winner and 1 not in placements:
        placements[1] = winner
    full = len(set(placements.values())) == 4 and set(placements) == {1, 2, 3, 4}
    usable = winner is not None or full or from_desc["termination"] == "draw" or from_page["termination"] == "draw"
    return {
        "youtubeVideoIdActual": yt,
        "winnerDeckId": winner,
        "placements": {str(k): v for k, v in sorted(placements.items())},
        "fullPlacement": full,
        "termination": from_desc["termination"] if from_desc["termination"] != "completed" else from_page["termination"],
        "usable": usable,
        "source": "youtube_description" if from_desc["winnerDeckId"] or from_desc["placements"] else ("watchedh_explicit" if from_page["winnerDeckId"] or from_page["placements"] else "none"),
        "transcriptOpened": False,
        "commentsOpened": False,
        "gameplaySummaryUsedAsEvidence": False,
    }


def relative_score(pred_above: str, pred_below: str, outcome: dict) -> str | int:
    if outcome.get("termination") == "draw":
        return "NA"
    places = {v: int(k) for k, v in (outcome.get("placements") or {}).items()}
    if pred_above in places and pred_below in places:
        return 1 if places[pred_above] < places[pred_below] else 0
    winner = outcome.get("winnerDeckId")
    if winner == pred_above and pred_below != pred_above:
        return 1
    if winner == pred_below and pred_above != pred_below:
        return 0
    return "NA"


def bootstrap_ci(pod_ys: list[list[int]], draws: int = 10000, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    n = len(pod_ys)
    if n == 0:
        return {"nPods": 0, "nObs": 0, "point": None, "ciLow": None, "ciHigh": None}
    all_y = [y for pod in pod_ys for y in pod]
    point = float(np.mean(all_y)) if all_y else None
    accs = []
    for _ in range(draws):
        idx = rng.integers(0, n, size=n)
        ys = [y for i in idx for y in pod_ys[i]]
        if ys:
            accs.append(float(np.mean(ys)))
    if not accs:
        return {"nPods": n, "nObs": len(all_y), "point": point, "ciLow": None, "ciHigh": None}
    lo, hi = np.percentile(accs, [2.5, 97.5])
    return {
        "nPods": n,
        "nObs": len(all_y),
        "point": round(point, 6) if point is not None else None,
        "ciLow": round(float(lo), 6),
        "ciHigh": round(float(hi), 6),
        "draws": draws,
        "seed": seed,
    }


def decide(ci: dict, n_usable: int, n_resolved: int) -> str:
    if n_usable < 40 or n_resolved < 100:
        return "XO4"
    if ci.get("ciLow") is None:
        return "XO4"
    if ci["ciLow"] > 0.50:
        return "XO1"
    if ci["ciHigh"] < 0.50:
        return "XO3"
    return "XO2"


def main() -> None:
    assert_outcome_audit_gates()
    if not OUTCOME_UNLOCKED or TRANSCRIPT_UNLOCKED:
        raise SystemExit("gates must be OUTCOME_UNLOCKED=true TRANSCRIPT_UNLOCKED=false")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if sha256_file(COMPAT_PY) != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")
    spec = load_json(OUT / "analysis-spec.json")
    if spec.get("status") != "FROZEN_BEFORE_OUTCOMES":
        raise SystemExit("analysis spec must be frozen first")
    freeze = load_json(EGV / "prediction-freeze-v1.json")
    if freeze.get("predictionFreezeSha256") != PRED_SHA:
        raise SystemExit("prediction freeze SHA mismatch")
    if sha256_file(EGV / "combined-qualified-set-v1.json") != freeze["checksums"]["combinedQualifiedSet"]:
        raise SystemExit("combined qualified set changed")
    if sha256_file(EGV / "external-game-pair-predictions-v1.json") != freeze["checksums"]["externalGamePairPredictions"]:
        raise SystemExit("predictions changed")
    for locked_fn, label in (
        (extract_transcript, "transcript"),
        (extract_comments, "comments"),
        (extract_gameplay_summary, "gameplay summary"),
    ):
        try:
            locked_fn()
        except Exception:
            pass
        else:
            raise SystemExit(f"{label} function did not throw")

    combined = load_json(EGV / "combined-qualified-set-v1.json")
    games = combined["games"]
    if len(games) != 51:
        raise SystemExit("expected 51 qualified games")

    watch_of = {}
    for rec in load_json(EGV / "source-manifest.seed80.json")["records"]:
        watch_of[rec["externalGameId"]] = rec["watchEdhUrl"]
    for rec in load_json(EGV / "source-expansion-v2" / "source-manifest.expansion-v2.seed60.json")["records"]:
        watch_of[rec["externalGameId"]] = rec["watchEdhUrl"]

    seats_of = {}
    channel_of = {}
    for g in games:
        channel_of[g["externalGameId"]] = g["channel"]
        seats_of[g["externalGameId"]] = [
            {"deckId": f"{g['externalGameId']}-{d['seatKey']}", "seatKey": d["seatKey"], "commanderNames": d["commanderNames"]}
            for d in g["deckSnapshots"]
        ]

    outcomes = {}
    for i, g in enumerate(games, 1):
        gid = g["externalGameId"]
        print(f"  outcome {gid} {i}/51", flush=True)
        outcomes[gid] = extract_game_outcome(watch_of[gid], g["youtubeVideoId"], seats_of[gid]) | {
            "externalGameId": gid,
            "channel": g["channel"],
        }

    pred = load_json(EGV / "external-game-pair-predictions-v1.json")
    scored = []
    for p in pred["pairs"]:
        gid = p["externalGameId"]
        oc = outcomes[gid]
        direction = p.get("direction")
        y = "NA"
        if p["relation"] == "STABLE_DIRECTION" and direction:
            y = relative_score(direction["from"], direction["to"], oc)
        elif p["relation"] != "STABLE_DIRECTION":
            # no invented direction; record whether relative finish is known
            if oc.get("fullPlacement"):
                y = "RESOLVED_NO_DIRECTION"
            elif oc.get("winnerDeckId") in {p["a"], p["b"]}:
                y = "RESOLVED_NO_DIRECTION"
            else:
                y = "NA"
        scored.append(
            {
                "externalGameId": gid,
                "channel": channel_of[gid],
                "a": p["a"],
                "b": p["b"],
                "relation": p["relation"],
                "direction": direction,
                "score": y,
                "fullPlacement": oc.get("fullPlacement"),
                "outcomeOpened": True,
                "transcriptOpened": False,
            }
        )

    usable_games = [gid for gid, oc in outcomes.items() if oc.get("usable")]
    stable_resolved = [r for r in scored if r["relation"] == "STABLE_DIRECTION" and r["score"] in (0, 1)]
    n_usable = len(usable_games)
    n_stable_res = len(stable_resolved)

    by_pod = defaultdict(list)
    for r in stable_resolved:
        by_pod[r["externalGameId"]].append(int(r["score"]))
    pod_ys = [by_pod[gid] for gid in usable_games if by_pod[gid]]
    ci = bootstrap_ci(pod_ys)
    call = decide(ci, n_usable, n_stable_res)

    strata = {}
    for ch in STRATA:
        ch_pods = [by_pod[gid] for gid in usable_games if channel_of[gid] == ch and by_pod[gid]]
        ys = [y for pod in ch_pods for y in pod]
        strata[ch] = {
            "nUsableGames": sum(1 for gid in usable_games if channel_of[gid] == ch),
            "nResolvedStable": len(ys),
            "point": round(float(np.mean(ys)), 6) if ys else None,
        }

    loo = {}
    source_flag = None
    if call == "XO1":
        source_flag = "SOURCE_ROBUST"
        for ch in MAJOR_CHANNELS:
            pods = [by_pod[gid] for gid in usable_games if channel_of[gid] != ch and by_pod[gid]]
            ys = [y for pod in pods for y in pod]
            pt = float(np.mean(ys)) if ys else None
            loo[ch] = {"removed": ch, "nObs": len(ys), "point": round(pt, 6) if pt is not None else None}
            if pt is None or pt <= 0.50:
                source_flag = "SOURCE_SENSITIVE"

    game_fracs = []
    for gid, ys in by_pod.items():
        if not ys:
            continue
        game_fracs.append({"externalGameId": gid, "channel": channel_of[gid], "n": len(ys), "correct": sum(ys), "frac": sum(ys) / len(ys)})
    fracs = [g["frac"] for g in game_fracs]
    diagnostic = {
        "nGamesWithResolvedStable": len(game_fracs),
        "gamesAbove50": sum(1 for f in fracs if f > 0.5),
        "gamesExactly50": sum(1 for f in fracs if abs(f - 0.5) < 1e-12),
        "gamesBelow50": sum(1 for f in fracs if f < 0.5),
        "median": float(np.median(fracs)) if fracs else None,
        "acceptanceRule": False,
    }

    incomp = [r for r in scored if r["relation"] != "STABLE_DIRECTION"]
    incomp_report = {
        "nPairs": len(incomp),
        "nResolvedNoDirection": sum(1 for r in incomp if r["score"] == "RESOLVED_NO_DIRECTION"),
        "nUnresolved": sum(1 for r in incomp if r["score"] == "NA"),
        "inventedDirection": False,
        "note": "Frozen negative-control-like class. No directional accuracy computed.",
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "game-outcomes-v1.json").write_text(
        json.dumps({"outcomesOpened": True, "transcriptsOpened": False, "games": list(outcomes.values())}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "pair-scores-v1.json").write_text(json.dumps({"n": len(scored), "pairs": scored}, indent=2) + "\n", encoding="utf-8")

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "predictionFreezeSha256": PRED_SHA,
        "outcomesOpened": True,
        "transcriptsOpened": False,
        "outcomeUnlocked": True,
        "transcriptUnlocked": False,
        "nQualifiedGames": 51,
        "nUsableOutcomeGames": n_usable,
        "nResolvedStableDirection": n_stable_res,
        "minimumEvidence": {"usableGames": 40, "resolvedStable": 100, "met": n_usable >= 40 and n_stable_res >= 100},
        "directionalAccuracy": ci,
        "call": call,
        "sourceFlag": source_flag,
        "channelStrata": strata,
        "leaveOneMajorChannelOut": loo,
        "perGameDiagnostic": diagnostic,
        "incomparable": incomp_report,
        "outcomeSources": dict(Counter(oc["source"] for oc in outcomes.values())),
        "not": spec["not"],
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ExternalGameplayOutcomeAudit",
                "version": "external-gameplay-outcome-audit-v1",
                "status": "FROZEN",
                "call": call,
                "sourceFlag": source_flag,
                "nUsableOutcomeGames": n_usable,
                "nResolvedStableDirection": n_stable_res,
                "directionalAccuracy": ci.get("point"),
                "ciLow": ci.get("ciLow"),
                "ciHigh": ci.get("ciHigh"),
                "predictionFreezeSha256": PRED_SHA,
                "outcomesOpened": True,
                "transcriptsOpened": False,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({k: report[k] for k in ("call", "sourceFlag", "nUsableOutcomeGames", "nResolvedStableDirection", "directionalAccuracy", "outcomeSources")}, indent=2))


if __name__ == "__main__":
    main()
