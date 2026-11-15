#!/usr/bin/env python3
"""
Outcome Audit v2 — prediction-blind transcript outcome extraction.

Does not load pair predictions, Pressure, R, K, or expected winners.
Persists only explicit outcome fields and short evidence clauses.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

from egv1_deck_hosts import norm_name
from outcome_firewall_v1 import (
    TRANSCRIPT_MECHANISM_UNLOCKED,
    TRANSCRIPT_UNLOCKED,
    assert_transcript_outcome_gates,
    extract_comments,
    extract_gameplay_summary,
    extract_transcript,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
EGV = MS / "external-gameplay-validation-v1"
V1 = MS / "external-gameplay-outcome-audit-v1"
OUT = MS / "external-gameplay-outcome-audit-v2"

WIN_RE = re.compile(
    r"\b(?:wins? the game|won the game|is the winner|winner is|takes the win|takes the game|wins it)\b",
    re.I,
)
LOSE_RE = re.compile(
    r"\b(?:loses? the game|lost the game|eliminated from the game|out of the game)\b",
    re.I,
)
SCOOP_RE = re.compile(r"\b(?:scoop(?:s|ed|ing)?|concede(?:s|d|r)?)\b", re.I)
DRAW_RE = re.compile(
    r"\b(?:the game (?:is|was|ended in) a draw|it's a draw|ended in a draw|game is a draw)\b",
    re.I,
)
TIME_RE = re.compile(
    r"(?:(\d+):)?(\d+):(\d+)[.,](\d+)\s+-->\s+(?:(\d+):)?(\d+):(\d+)[.,](\d+)"
)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def aliases(names: list[str]) -> list[str]:
    out = []
    for name in names:
        parts = [p.strip() for p in name.replace(" // ", "//").split("//")]
        for p in parts:
            if p:
                out.append(p)
            if "," in p:
                out.append(p.split(",")[0].strip())
                out.append(p.split(",", 1)[1].strip())
    seen = set()
    uniq = []
    for a in out:
        n = norm_name(a)
        if n and n not in seen and len(n) >= 4:
            seen.add(n)
            uniq.append(a)
    return uniq


def unique_match(text: str, seats: list[dict]) -> str | None:
    blob = norm_name(text)
    if not blob:
        return None
    hits = []
    for seat in seats:
        for a in seat["aliases"]:
            n = norm_name(a)
            if n and (n in blob or blob in n):
                hits.append(seat["deckId"])
                break
    if len(set(hits)) == 1:
        return hits[0]
    return None


def parse_vtt(vtt: str) -> list[tuple[float, str]]:
    cues = []
    blocks = re.split(r"\n\n+", vtt.replace("\r\n", "\n"))
    for block in blocks:
        m = TIME_RE.search(block)
        if not m:
            continue
        hh = int(m.group(1) or 0)
        mm = int(m.group(2))
        ss = int(m.group(3))
        t = hh * 3600 + mm * 60 + ss
        lines = []
        for line in block.splitlines():
            if "-->" in line or line.strip().isdigit() or line.startswith("WEBVTT"):
                continue
            clean = re.sub(r"<[^>]+>", "", line).strip()
            if clean:
                lines.append(clean)
        if lines:
            cues.append((float(t), " ".join(lines)))
    return cues


def fetch_captions(video_id: str, tmp: Path) -> tuple[str | None, str | None]:
    dest = tmp / video_id
    r = subprocess.run(
        [
            "yt-dlp",
            "--skip-download",
            "--no-warnings",
            "--write-sub",
            "--write-auto-sub",
            "--sub-langs",
            "en.*,en",
            "--sub-format",
            "vtt",
            "--convert-subs",
            "vtt",
            "-o",
            str(dest),
            f"https://www.youtube.com/watch?v={video_id}",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    files = sorted(tmp.glob(f"{video_id}*.vtt"))
    if not files:
        return None, (r.stderr or r.stdout)[-180:] if r.returncode else "no_vtt"
    text = files[0].read_text(encoding="utf-8", errors="replace")
    return text, None


def extract_events(cues: list[tuple[float, str]], seats: list[dict]) -> list[dict]:
    events = []
    for i, (t, line) in enumerate(cues):
        window = " ".join(x[1] for x in cues[max(0, i - 1) : i + 2])
        quote = line[:160]
        if DRAW_RE.search(window):
            events.append({"type": "DRAW", "deckId": None, "t": t, "quote": quote})
            continue
        kind = None
        if WIN_RE.search(window):
            kind = "WIN"
        elif LOSE_RE.search(window):
            kind = "LOSE"
        elif SCOOP_RE.search(window):
            kind = "SCOOP"
        if not kind:
            continue
        did = unique_match(window, seats)
        if not did:
            events.append({"type": "AMBIGUOUS_" + kind, "deckId": None, "t": t, "quote": quote})
            continue
        events.append({"type": kind, "deckId": did, "t": t, "quote": quote})
    return events


def relations_from_events(events: list[dict], deck_ids: list[str]) -> dict:
    above: set[tuple[str, str]] = set()
    winner = None
    lost: list[str] = []
    draw = False
    explicit = []
    for ev in events:
        if ev["type"].startswith("AMBIGUOUS"):
            continue
        if ev["type"] == "DRAW":
            draw = True
            explicit.append(ev)
            continue
        if not ev.get("deckId"):
            continue
        explicit.append(ev)
        if ev["type"] == "WIN":
            winner = ev["deckId"]
        elif ev["type"] in {"LOSE", "SCOOP"}:
            if ev["deckId"] not in lost:
                alive = [d for d in deck_ids if d not in lost and d != ev["deckId"]]
                for y in alive:
                    above.add((y, ev["deckId"]))
                for prev in lost:
                    above.add((ev["deckId"], prev))
                lost.append(ev["deckId"])
    if winner:
        for d in deck_ids:
            if d != winner:
                above.add((winner, d))
    if draw:
        return {
            "winnerDeckId": None,
            "termination": "draw",
            "above": [],
            "usable": True,
            "kind": "draw",
            "evidence": explicit,
        }
    kind = "unresolved"
    if winner and len(lost) >= 2:
        kind = "partial_or_full"
    elif winner:
        kind = "winner_only"
    elif lost:
        kind = "partial"
    usable = bool(winner or lost)
    return {
        "winnerDeckId": winner,
        "termination": "completed" if usable else "unresolved",
        "above": [{"above": a, "below": b} for a, b in sorted(above)],
        "usable": usable,
        "kind": kind if usable else "unresolved",
        "evidence": explicit,
    }


def build_identities() -> list[dict]:
    combined = load_json(EGV / "combined-qualified-set-v1.json")
    yt = {g["externalGameId"]: g.get("youtubeVideoIdActual") for g in load_json(V1 / "game-outcomes-v1.json")["games"]}
    rows = []
    for g in combined["games"]:
        decks = []
        for d in g["deckSnapshots"]:
            decks.append(
                {
                    "deckId": f"{g['externalGameId']}-{d['seatKey']}",
                    "seatKey": d["seatKey"],
                    "commanderNames": d["commanderNames"],
                    "aliases": aliases(d["commanderNames"]),
                }
            )
        rows.append(
            {
                "externalGameId": g["externalGameId"],
                "channel": g["channel"],
                "youtubeVideoId": yt.get(g["externalGameId"]) or g["youtubeVideoId"],
                "decks": decks,
            }
        )
    return rows


def main() -> None:
    assert_transcript_outcome_gates()
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise SystemExit("mechanism transcripts must stay locked")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN_BEFORE_TRANSCRIPTS":
        raise SystemExit("v2 spec must be frozen first")
    if load_json(V1 / "XO4_PERMANENT.json").get("call") != "XO4":
        raise SystemExit("XO4 must remain permanently frozen")
    for locked in (extract_transcript, extract_comments, extract_gameplay_summary):
        try:
            locked()
        except Exception:
            pass
        else:
            raise SystemExit("locked extractor did not throw")

    identities = build_identities()
    if len(identities) != 51:
        raise SystemExit("expected 51 identities")
    (OUT / "extractor-identities-v2.json").write_text(
        json.dumps({"n": 51, "blindToPredictions": True, "games": identities}, indent=2) + "\n",
        encoding="utf-8",
    )

    games = []
    retrieved = 0
    with tempfile.TemporaryDirectory(prefix="egv1-v2-caps-") as td:
        tmp = Path(td)
        for i, game in enumerate(identities, 1):
            print(f"  captions {game['externalGameId']} {i}/51", flush=True)
            vtt, err = fetch_captions(game["youtubeVideoId"], tmp)
            rec = {
                "externalGameId": game["externalGameId"],
                "channel": game["channel"],
                "youtubeVideoId": game["youtubeVideoId"],
                "transcriptRetrieved": bool(vtt),
                "captionSha256": sha256_bytes(vtt.encode("utf-8")) if vtt else None,
                "fetchNote": None if vtt else err,
                "predictionsSeen": False,
            }
            if vtt:
                retrieved += 1
                cues = parse_vtt(vtt)
                events = extract_events(cues, game["decks"])
                rel = relations_from_events(events, [d["deckId"] for d in game["decks"]])
                rec.update(rel)
            else:
                rec.update(
                    {
                        "winnerDeckId": None,
                        "termination": "unresolved",
                        "above": [],
                        "usable": False,
                        "kind": "no_transcript",
                        "evidence": [],
                    }
                )
            games.append(rec)

    payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "OUTCOMES_EXTRACTED_PREDICTION_BLIND",
        "label": "TRANSCRIPT_ASSISTED",
        "predictionsSeen": False,
        "nGames": 51,
        "nTranscriptsRetrieved": retrieved,
        "nUsable": sum(1 for g in games if g.get("usable")),
        "games": games,
        "note": "Explicit outcome clauses only. Full captions discarded after hashing. Predictions were not loaded.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    (OUT / "transcript-outcomes-v2.json").write_text(raw, encoding="utf-8")
    freeze = {
        "artifactType": "ExternalGameplayTranscriptOutcomesV2",
        "status": "FROZEN",
        "predictionsSeen": False,
        "nGames": 51,
        "nTranscriptsRetrieved": retrieved,
        "nUsable": payload["nUsable"],
        "outcomesSha256": sha256_bytes(raw.encode("utf-8")),
        "parentXO4": "PERMANENTLY_FROZEN",
        "predictionFileNotLoaded": True,
    }
    (OUT / "OUTCOMES_FROZEN.json").write_text(json.dumps(freeze, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"retrieved": retrieved, "usable": payload["nUsable"], "sha": freeze["outcomesSha256"]}, indent=2))


if __name__ == "__main__":
    main()
