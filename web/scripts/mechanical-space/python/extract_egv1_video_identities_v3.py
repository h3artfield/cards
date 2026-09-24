#!/usr/bin/env python3
"""
Outcome Audit v3 Step 1 — prediction-blind identity mapping from opening frames.

Uses official YouTube storyboard sheets. Only the first sheets are inspected.
Endgame sheets are written to disk but must not be adjudicated here.
"""

from __future__ import annotations

import hashlib
import json
import time

from egv1_deck_hosts import norm_name
from egv1_video_v3_common import (
    CACHE,
    OUT,
    V2,
    build_blind_identities,
    download_storyboard,
    ocr_image,
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


def main() -> None:
    assert_video_outcome_gates()
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise SystemExit("mechanism transcripts must stay locked")
    if load_json(V2 / "XO4_PERMANENT.json").get("doNotRevise") is not True:
        raise SystemExit("v2 XO4 must remain permanently frozen")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN_BEFORE_VIDEO":
        raise SystemExit("v3 spec must be frozen before video")
    for locked in (extract_transcript, extract_comments, extract_gameplay_summary):
        try:
            locked()
        except Exception:
            pass
        else:
            raise SystemExit("locked extractor did not throw")

    games = build_blind_identities()
    if len(games) != 51:
        raise SystemExit("expected 51 games")
    write_json(OUT / "extractor-identities-v3.json", {"n": 51, "blindToPredictions": True, "games": games})

    mapped = []
    for i, game in enumerate(games, 1):
        gid = game["externalGameId"]
        print(f"  identity {gid} {i}/51", flush=True)
        mhtml = CACHE / gid / "storyboard.mhtml"
        ok = download_storyboard(game["youtubeVideoId"], mhtml)
        print(f"    storyboard={'ok' if ok else 'FAIL'} bytes={mhtml.stat().st_size if mhtml.exists() else 0}", flush=True)
        sheets = split_storyboard_sheets(mhtml, CACHE / gid / "sheets") if ok else []
        opening = sheets[:3]
        ocr_rows = []
        confirmed = set()
        name_hits: dict[str, list[str]] = {d["deckId"]: [] for d in game["decks"]}
        for fp in opening:
            text = ocr_image(fp)
            ocr_rows.append({"file": fp.name, "sha256": sha256_bytes(fp.read_bytes()), "text": text[:1200]})
            blob = norm_name(text)
            for d in game["decks"]:
                if unique_match(text, [d]) == d["deckId"]:
                    confirmed.add(d["deckId"])
                for tok in text.split():
                    t = tok.strip("[]().,:;!").strip()
                    if t[:1].isupper() and t[1:].islower() and 3 <= len(t) <= 14:
                        if any(norm_name(a) in blob for a in d["aliases"]):
                            name_hits[d["deckId"]].append(t)
        decks = []
        for d in game["decks"]:
            guesses = [x for x in name_hits[d["deckId"]] if x.lower() not in {"the", "and", "moxfield", "bracket"}]
            on_screen = guesses[0] if len(set(guesses)) == 1 else None
            decks.append(
                {
                    **d,
                    "commanderConfirmedOnOpening": d["deckId"] in confirmed,
                    "onScreenName": on_screen,
                    "mappingSource": "qualification_seat_plus_opening_storyboard"
                    if d["deckId"] in confirmed
                    else "qualification_seat_only",
                }
            )
        mapped.append(
            {
                "externalGameId": gid,
                "channel": game["channel"],
                "youtubeVideoId": game["youtubeVideoId"],
                "storyboardOk": ok,
                "nSheets": len(sheets),
                "nOpeningSheetsInspected": len(opening),
                "nCommandersConfirmedOnOpening": len(confirmed),
                "mappingStatus": "MAPPED" if len(decks) == 4 else "UNRESOLVED",
                "decks": decks,
                "openingEvidence": ocr_rows,
                "visualSource": "youtube_storyboard_sb0_opening_sheets_only",
                "predictionsSeen": False,
                "endgameInspected": False,
            }
        )

    payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "IDENTITY_MAPPED_PREDICTION_BLIND",
        "label": "VIDEO_ASSISTED_ENDGAME",
        "predictionsSeen": False,
        "endgameAdjudicated": False,
        "nGames": 51,
        "nStoryboards": sum(1 for g in mapped if g["storyboardOk"]),
        "nMapped": sum(1 for g in mapped if g["mappingStatus"] == "MAPPED"),
        "games": mapped,
        "note": "Opening storyboard sheets only. Endgame sheets were not adjudicated.",
    }
    raw_path = OUT / "identity-mapping-v3.json"
    write_json(raw_path, payload)
    freeze = {
        "artifactType": "ExternalGameplayVideoIdentityMappingV3",
        "status": "FROZEN",
        "predictionsSeen": False,
        "endgameAdjudicated": False,
        "nGames": 51,
        "nMapped": payload["nMapped"],
        "nStoryboards": payload["nStoryboards"],
        "identitySha256": hashlib.sha256(raw_path.read_bytes()).hexdigest(),
        "parentV2XO4": "PERMANENTLY_FROZEN",
        "visualSource": "youtube_storyboard_sb0_opening_sheets_only",
    }
    write_json(OUT / "IDENTITY_FROZEN.json", freeze)
    print(json.dumps({"mapped": payload["nMapped"], "storyboards": payload["nStoryboards"], "sha": freeze["identitySha256"]}, indent=2))


if __name__ == "__main__":
    main()
