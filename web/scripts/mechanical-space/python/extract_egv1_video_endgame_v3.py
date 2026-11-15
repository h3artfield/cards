#!/usr/bin/env python3
"""
Outcome Audit v3 Step 2 — prediction-blind endgame outcome recovery.

Requires frozen identity mapping. Does not load pair predictions.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import time
from pathlib import Path

from egv1_video_v3_common import (
    CACHE,
    DRAW_VIS,
    ELIM_VIS,
    OUT,
    PLACE_VIS,
    REJECT_WIN,
    SCOOP_VIS,
    SPEAK_LOSE,
    SPEAK_NAME_WINS,
    SPEAK_WIN,
    WIN_VIS,
    download_storyboard,
    fetch_captions,
    ocr_image,
    parse_vtt,
    sha256_bytes,
    split_storyboard_sheets,
    unique_match,
    write_json,
)
from outcome_firewall_v1 import (
    TRANSCRIPT_MECHANISM_UNLOCKED,
    TRANSCRIPT_UNLOCKED,
    assert_video_outcome_gates,
    extract_comments,
    extract_gameplay_summary,
    extract_transcript,
)
from train_experiments import load_json

PLACE_NUM = {
    "1st": 1,
    "first": 1,
    "2nd": 2,
    "second": 2,
    "3rd": 3,
    "third": 3,
    "4th": 4,
    "fourth": 4,
}


def relations_from(events: list[dict], deck_ids: list[str]) -> dict:
    above: set[tuple[str, str]] = set()
    winner = None
    winner_explicit = False
    lost: list[str] = []
    ranks: dict[str, int] = {}
    draw = False
    notes = []
    for ev in events:
        notes.append(ev)
        if ev["type"] == "DRAW":
            draw = True
            continue
        did = ev.get("deckId")
        if ev["type"] == "WIN" and did:
            winner = did
            winner_explicit = True
        elif ev["type"] in {"LOSE", "SCOOP", "ELIM"} and did and did not in lost:
            alive = [d for d in deck_ids if d not in lost and d != did]
            for y in alive:
                above.add((y, did))
            for prev in lost:
                above.add((did, prev))
            lost.append(did)
        elif ev["type"] == "PLACE" and did and ev.get("place"):
            ranks[did] = ev["place"]
    for a, ra in ranks.items():
        for b, rb in ranks.items():
            if a != b and ra < rb:
                above.add((a, b))
    if winner_explicit and winner:
        for d in deck_ids:
            if d != winner:
                above.add((winner, d))
    elif len(lost) == 3:
        remain = [d for d in deck_ids if d not in lost]
        if len(remain) == 1:
            winner = remain[0]
            for d in lost:
                above.add((winner, d))
    if draw:
        return {
            "winnerDeckId": None,
            "termination": "draw",
            "above": [],
            "usable": True,
            "kind": "draw",
            "evidence": notes,
        }
    kind = "unresolved"
    if winner and len(ranks) == 4:
        kind = "full_placement"
    elif winner and lost:
        kind = "partial_placement"
    elif winner:
        kind = "winner_only"
    elif lost or ranks:
        kind = "partial_placement"
    usable = bool(above) or draw
    if usable and kind == "unresolved":
        kind = "partial_placement"
    return {
        "winnerDeckId": winner,
        "termination": "completed" if usable else "unresolved",
        "above": [{"above": a, "below": b} for a, b in sorted(above)],
        "usable": usable,
        "kind": kind if usable else "unresolved",
        "evidence": notes,
    }


def visual_events(ocr_rows: list[dict], seats: list[dict], t0: float) -> list[dict]:
    events = []
    for i, row in enumerate(ocr_rows):
        text = row["text"]
        t = t0 + i * 12
        if REJECT_WIN.search(text) and WIN_VIS.search(text):
            continue
        if DRAW_VIS.search(text):
            events.append({"type": "DRAW", "deckId": None, "t": t, "evidenceType": "G", "quote": text[:160], "frameSha256": row["sha256"]})
            continue
        did = unique_match(text, seats)
        if WIN_VIS.search(text) and did:
            events.append({"type": "WIN", "deckId": did, "t": t, "evidenceType": "A", "quote": text[:160], "frameSha256": row["sha256"]})
        if ELIM_VIS.search(text) and did:
            events.append({"type": "ELIM", "deckId": did, "t": t, "evidenceType": "C", "quote": text[:160], "frameSha256": row["sha256"]})
        if SCOOP_VIS.search(text) and did:
            events.append({"type": "SCOOP", "deckId": did, "t": t, "evidenceType": "F", "quote": text[:160], "frameSha256": row["sha256"]})
        m = PLACE_VIS.search(text)
        if m and did:
            key = m.group(1).lower()
            events.append(
                {
                    "type": "PLACE",
                    "deckId": did,
                    "place": PLACE_NUM.get(key),
                    "t": t,
                    "evidenceType": "B",
                    "quote": text[:160],
                    "frameSha256": row["sha256"],
                }
            )
    return events


def spoken_events(cues: list[tuple[float, str]], seats: list[dict], t_min: float) -> list[dict]:
    events = []
    endgame = [(t, s) for t, s in cues if t >= t_min]
    for i, (t, line) in enumerate(endgame):
        window = " ".join(x[1] for x in endgame[max(0, i - 1) : i + 2])
        if REJECT_WIN.search(window):
            continue
        if DRAW_VIS.search(window):
            events.append({"type": "DRAW", "deckId": None, "t": t, "evidenceType": "G", "quote": line[:160]})
            continue
        did = unique_match(window, seats)
        if SPEAK_WIN.search(window) and did:
            events.append({"type": "WIN", "deckId": did, "t": t, "evidenceType": "F", "quote": line[:160]})
            continue
        m = SPEAK_NAME_WINS.search(window)
        if m and did:
            events.append({"type": "WIN", "deckId": did, "t": t, "evidenceType": "F", "quote": line[:160]})
            continue
        if SPEAK_LOSE.search(window) and did:
            kind = "SCOOP" if "scoop" in window.lower() or "conced" in window.lower() else "LOSE"
            events.append({"type": kind, "deckId": did, "t": t, "evidenceType": "F", "quote": line[:160]})
    return events


def main() -> None:
    assert_video_outcome_gates()
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise SystemExit("mechanism transcripts must stay locked")
    frozen = load_json(OUT / "IDENTITY_FROZEN.json")
    if frozen.get("predictionsSeen") is not False or frozen.get("endgameAdjudicated") is not False:
        raise SystemExit("identity freeze is not clean")
    ident_path = OUT / "identity-mapping-v3.json"
    if hashlib.sha256(ident_path.read_bytes()).hexdigest() != frozen["identitySha256"]:
        raise SystemExit("identity artifact changed after freeze")
    identities = load_json(ident_path)
    if identities.get("predictionsSeen") is not False:
        raise SystemExit("identity artifact saw predictions")
    for locked in (extract_transcript, extract_comments, extract_gameplay_summary):
        try:
            locked()
        except Exception:
            pass
        else:
            raise SystemExit("locked extractor did not throw")

    games = []
    with tempfile.TemporaryDirectory(prefix="egv1-v3-caps-") as td:
        tmp = Path(td)
        for i, game in enumerate(identities["games"], 1):
            gid = game["externalGameId"]
            print(f"  endgame {gid} {i}/51", flush=True)
            mhtml = CACHE / gid / "storyboard.mhtml"
            if not mhtml.exists():
                download_storyboard(game["youtubeVideoId"], mhtml)
            sheets = split_storyboard_sheets(mhtml, CACHE / gid / "sheets") if mhtml.exists() else []
            # Last 25% of sheets, never the opening third — endgame only.
            start = max(len(sheets) * 3 // 4, 0)
            end_sheets = sheets[start:]
            ocr_rows = []
            for fp in end_sheets:
                text = ocr_image(fp)
                ocr_rows.append({"file": fp.name, "sha256": sha256_bytes(fp.read_bytes()), "text": text[:800]})
            # Approximate timestamps from sheet index; used only as audit anchors.
            t0 = 0.0
            events = visual_events(ocr_rows, game["decks"], t0)
            vtt = fetch_captions(game["youtubeVideoId"], tmp)
            if vtt:
                cues = parse_vtt(vtt)
                tmax = max((t for t, _ in cues), default=0)
                events.extend(spoken_events(cues, game["decks"], max(0, tmax - 240)))
            rel = relations_from(events, [d["deckId"] for d in game["decks"]])
            games.append(
                {
                    "externalGameId": gid,
                    "channel": game["channel"],
                    "youtubeVideoId": game["youtubeVideoId"],
                    "identityMappingStatus": game.get("mappingStatus"),
                    "endgameSheetsOk": bool(end_sheets),
                    "nEndgameSheets": len(end_sheets),
                    "visualSource": "youtube_storyboard_sb0_ending_sheets_only",
                    "predictionsSeen": False,
                    **rel,
                }
            )

    payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "OUTCOMES_EXTRACTED_PREDICTION_BLIND",
        "label": "VIDEO_ASSISTED_ENDGAME",
        "predictionsSeen": False,
        "nGames": 51,
        "nUsable": sum(1 for g in games if g.get("usable")),
        "games": games,
        "note": "Endgame visual overlays and endgame-window spoken declarations only. Predictions were not loaded.",
    }
    raw_path = OUT / "video-outcomes-v3.json"
    write_json(raw_path, payload)
    freeze = {
        "artifactType": "ExternalGameplayVideoOutcomesV3",
        "status": "FROZEN",
        "predictionsSeen": False,
        "nGames": 51,
        "nUsable": payload["nUsable"],
        "outcomesSha256": hashlib.sha256(raw_path.read_bytes()).hexdigest(),
        "identitySha256": frozen["identitySha256"],
        "parentV2XO4": "PERMANENTLY_FROZEN",
        "predictionFileNotLoaded": True,
    }
    write_json(OUT / "OUTCOMES_FROZEN.json", freeze)
    print(json.dumps({"usable": payload["nUsable"], "sha": freeze["outcomesSha256"]}, indent=2))


if __name__ == "__main__":
    main()
