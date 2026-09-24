#!/usr/bin/env python3
"""
Melee Structured Source Feasibility Audit v1.

Public melee.gg only. No credentials. Result values are dropped in-memory
and never written. No predictions / Pressure / scoring.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
V3 = MS / "external-gameplay-outcome-audit-v3"
OUT = MS / "melee-structured-source-feasibility-v1"
CACHE = WEB / ".data" / "melee-feasibility-v1"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
BASE = "https://melee.gg"
EXCLUDE_NAME = re.compile(
    r"2hg|two[- ]headed|emperor|team commander|precon|duel commander|1v1|brawl|oathbreaker",
    re.I,
)
RESULT_KEY_RE = re.compile(r"result|winner|wins|losses|draws|record|points|place|rank|standing", re.I)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def curl(args: list[str], timeout: int = 45) -> bytes:
    r = subprocess.run(["curl.exe", "-sS", "--max-time", str(timeout), "-A", UA, *args], capture_output=True)
    return r.stdout or b""


def listing() -> list[dict]:
    raw = curl(
        [
            "-H",
            "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
            "--data-binary",
            urlencode({"draw": 1, "start": 0, "length": 250}),
            f"{BASE}/Tournament/SearchResults?timeZoneId=UTC&formats=Commander&statuses=Ended",
        ]
    )
    rows = json.loads(raw)
    keep = []
    for r in rows:
        keep.append(
            {
                "event_id": r.get("id"),
                "event_date": r.get("startDate"),
                "player_count": r.get("enrolledPlayerCount"),
                "formatString": r.get("formatString"),
                "status": r.get("status"),
                "gameDescription": r.get("gameDescription"),
                "name": r.get("name"),
            }
        )
    keep.sort(key=lambda x: (x.get("event_date") or "", x.get("event_id") or 0))
    return keep


def view_meta(event_id: int, jar: Path) -> dict:
    html = curl(["-c", str(jar), "-b", str(jar), f"{BASE}/Tournament/View/{event_id}"]).decode("utf-8", "replace")
    rounds = []
    seen = set()
    for rid, name in re.findall(r'data-id="(\d+)" data-name="([^"]+)"', html):
        if rid not in seen:
            seen.add(rid)
            rounds.append({"round_id": int(rid), "name": name})
    en = re.search(r'name="DecklistEnabled"[^>]*value="([^"]+)"', html)
    return {
        "round_count": len(rounds),
        "rounds": rounds,
        "decklistEnabled": (en.group(1).lower() == "true") if en else False,
        "viewOk": "round-selector" in html or bool(rounds),
    }


def pairing_body() -> str:
    cols = ["TableNumber", "PodNumber", "Teams", "Decklists", "ResultString"]
    q = {"draw": 1, "start": 0, "length": 250, "search[value]": "", "search[regex]": "false"}
    for i, name in enumerate(cols):
        q[f"columns[{i}][data]"] = name
        q[f"columns[{i}][name]"] = name
        q[f"columns[{i}][searchable]"] = "true"
        q[f"columns[{i}][orderable]"] = "true"
        q[f"columns[{i}][search][value]"] = ""
        q[f"columns[{i}][search][regex]"] = "false"
    return urlencode(q)


def redact_match(rec: dict) -> dict:
    competitors = rec.get("Competitors") or rec.get("Teams") or rec.get("Players") or []
    people = []
    if isinstance(competitors, list):
        for c in competitors:
            if not isinstance(c, dict):
                continue
            deck_id = None
            for k, v in c.items():
                if "decklist" in k.lower() and isinstance(v, (int, str)) and str(v).isdigit():
                    deck_id = int(v)
            people.append({"player_id": c.get("ID") or c.get("Id") or c.get("PlayerId"), "decklist_id": deck_id})
    result_present = False
    for k, v in rec.items():
        if RESULT_KEY_RE.search(k) and v not in (None, "", [], {}):
            result_present = True
    if isinstance(competitors, list):
        for c in competitors:
            if isinstance(c, dict):
                for k, v in c.items():
                    if RESULT_KEY_RE.search(k) and v not in (None, "", 0, [], {}):
                        # numeric 0 is empty-ish; any other value means the field is populated
                        if v not in (0, 0.0, False):
                            result_present = True
    return {
        "nCompetitors": len(people),
        "player_ids": [p["player_id"] for p in people],
        "decklist_ids": [p["decklist_id"] for p in people if p["decklist_id"]],
        "pod_number_present": rec.get("PodNumber") not in (None, ""),
        "structured_result_available": result_present,
    }


def fetch_matches(round_id: int, event_id: int, jar: Path) -> list[dict]:
    raw = curl(
        [
            "-b",
            str(jar),
            "-H",
            "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
            "-H",
            "X-Requested-With: XMLHttpRequest",
            "-H",
            f"Referer: {BASE}/Tournament/View/{event_id}",
            "--data-binary",
            pairing_body(),
            f"{BASE}/Match/GetRoundMatches/{round_id}",
        ]
    )
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    recs = parsed.get("data") if isinstance(parsed, dict) else None
    if not isinstance(recs, list):
        return []
    return [redact_match(r) for r in recs if isinstance(r, dict)]


def decklist_ok(deck_id: int) -> dict:
    raw = curl([f"{BASE}/Decklist/GetDecklistDetails?id={deck_id}"])
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"available": False, "reason": "not_json"}
    if parsed.get("Error"):
        return {"available": False, "reason": "error_object"}
    # Count cards without keeping names in the event/pod artifacts.
    blob = json.dumps(parsed, sort_keys=True).encode("utf-8")
    text = json.dumps(parsed).lower()
    n_cards = 0
    for key in ("cards", "mainboard", "mainDeck", "Decklist", "spells", "creatures", "lands"):
        if key in parsed and isinstance(parsed[key], list):
            for item in parsed[key]:
                if isinstance(item, dict):
                    n_cards += int(item.get("Quantity") or item.get("Count") or item.get("quantity") or 1)
                elif isinstance(item, str):
                    n_cards += 1
    has_commander = "commander" in text
    return {
        "available": True,
        "hasCommanderField": has_commander,
        "nCardsSeen": n_cards,
        "checksum": sha256_bytes(blob),
        "exactish": has_commander and n_cards >= 90,
    }


def main() -> None:
    if json.loads((V3 / "XO4_PERMANENT.json").read_text(encoding="utf-8")).get("doNotReopen") is not True:
        raise SystemExit("v3 must remain permanently frozen")
    CACHE.mkdir(parents=True, exist_ok=True)
    jar = CACHE / "cookies.txt"
    listed = listing()
    candidates = [
        r
        for r in listed
        if r.get("status") == "Ended"
        and r.get("gameDescription") == "MagicTheGathering"
        and "Commander" in (r.get("formatString") or "")
        and not EXCLUDE_NAME.search(r.get("name") or "")
    ]
    prev = OUT / "melee-feasibility-events.json"
    events = json.loads(prev.read_text(encoding="utf-8"))["events"] if prev.exists() else []
    prev_p = OUT / "melee-feasibility-pods.json"
    pods = json.loads(prev_p.read_text(encoding="utf-8"))["pods"] if prev_p.exists() else []
    inspected = 0
    seen_ids = {e.get("event_id") for e in events}
    for row in candidates:
        if row["event_id"] in seen_ids:
            continue
        if inspected >= 80 and len([e for e in events if e.get("qualifying")]) == 0:
            break
        if len([e for e in events if e.get("qualifying")]) >= 10:
            break
        inspected += 1
        print(f"  event {row['event_id']} {inspected}", flush=True)
        meta = view_meta(row["event_id"], jar)
        time.sleep(0.2)
        if (row.get("player_count") or 0) < 4:
            events.append(
                {
                    "event_id": row["event_id"],
                    "event_date": row["event_date"],
                    "player_count": row["player_count"],
                    "round_count": meta["round_count"],
                    "pod_count": 0,
                    "formatString": row["formatString"],
                    "status": row["status"],
                    "decklist_available": meta["decklistEnabled"],
                    "pod_membership_available": False,
                    "structured_result_available": False,
                    "nFourPlayerPodsWithResultField": 0,
                    "nDecklistIdsSeen": 0,
                    "nExactListsRecovered": 0,
                    "decklistEnabledFlag": meta["decklistEnabled"],
                    "qualifying": False,
                    "allRequiredSchemas": False,
                    "nameExcluded": False,
                    "skipReason": "fewer_than_4_enrolled_players",
                }
            )
            continue
        matches = []
        for rnd in meta["rounds"]:
            matches.extend(fetch_matches(rnd["round_id"], row["event_id"], jar))
            time.sleep(0.15)
        four = [m for m in matches if m["nCompetitors"] == 4]
        result_field = sum(1 for m in four if m["structured_result_available"])
        deck_ids = []
        for m in four:
            deck_ids.extend(m["decklist_ids"])
        unique_decks = sorted(set(deck_ids))
        recovered = 0
        deck_checks = []
        for did in unique_decks[:16]:
            info = decklist_ok(did)
            deck_checks.append({"decklist_id": did, **{k: v for k, v in info.items() if k != "checksum"}, "hasChecksum": bool(info.get("checksum"))})
            if info.get("available") and info.get("exactish"):
                recovered += 1
            time.sleep(0.12)
        pods_complete = 0
        for i, m in enumerate(four):
            lists_ok = len(m["decklist_ids"]) == 4
            complete = lists_ok and m["structured_result_available"] and m["nCompetitors"] == 4
            if complete:
                pods_complete += 1
            pods.append(
                {
                    "event_id": row["event_id"],
                    "pod_index": i,
                    "nPlayers": 4,
                    "pod_membership_available": True,
                    "nExactListsLinked": len(m["decklist_ids"]),
                    "structured_result_available": m["structured_result_available"],
                    "complete": complete,
                    "resultValueRetained": False,
                }
            )
        qualifying = (
            meta["viewOk"]
            and meta["round_count"] > 0
            and len(four) > 0
            and result_field > 0
            and (recovered >= 4 or meta["decklistEnabled"] or unique_decks)
        )
        # Public-data requirement: lists + membership + result field. Lists may exist
        # as IDs even when DecklistEnabled is false; then available=false.
        all_schemas = bool(four) and result_field > 0 and (recovered > 0 or meta["decklistEnabled"])
        events.append(
            {
                "event_id": row["event_id"],
                "event_date": row["event_date"],
                "player_count": row["player_count"],
                "round_count": meta["round_count"],
                "pod_count": len(four),
                "formatString": row["formatString"],
                "status": row["status"],
                "decklist_available": recovered > 0 or meta["decklistEnabled"],
                "pod_membership_available": bool(four),
                "structured_result_available": result_field > 0,
                "nFourPlayerPodsWithResultField": result_field,
                "nDecklistIdsSeen": len(unique_decks),
                "nExactListsRecovered": recovered,
                "decklistEnabledFlag": meta["decklistEnabled"],
                "qualifying": qualifying and all_schemas,
                "allRequiredSchemas": all_schemas,
                "nameExcluded": False,
            }
        )
        time.sleep(0.2)

    n_schema = sum(1 for e in events if e.get("allRequiredSchemas"))
    n_complete = sum(1 for p in pods if p.get("complete"))
    passed = n_schema >= 5 and n_complete >= 40
    reasons = []
    if not passed:
        if n_schema < 5:
            reasons.append("insufficient_events_exposing_all_required_schemas")
        if n_complete < 40:
            reasons.append("insufficient_four_player_pods_with_lists_membership_and_result_field")
        if all(not e.get("decklist_available") for e in events):
            reasons.append("decklists_unavailable")
        if all(not e.get("pod_membership_available") for e in events):
            reasons.append("pod_membership_unavailable")
        if all(not e.get("structured_result_available") for e in events):
            reasons.append("results_unavailable")
        if not candidates:
            reasons.append("insufficient_qualifying_events")

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "source": "melee.gg",
        "credentialsUsed": False,
        "call": "PASS" if passed else "FAIL",
        "publicIndex": {
            "endpoint": "/Tournament/SearchResults?formats=Commander&statuses=Ended",
            "nListed": len(listed),
            "nAfterVariantExclude": len(candidates),
            "indexAppearsCappedAt": 250,
            "selection": "first 10 qualifying under chronological startDate, then event_id",
        },
        "nEventsInspected": len(events),
        "nEventsExposingAllRequiredSchemas": n_schema,
        "nFourPlayerPodsComplete": n_complete,
        "passGate": {"eventsExposingAllRequiredSchemas": 5, "fourPlayerPods": 40, "met": passed},
        "failureReasons": reasons,
        "resultContentsOpened": False,
        "predictionsRun": False,
        "pressureRun": False,
        "notes": [
            "Official organizer API was not used.",
            "Result / winner / standings values were redacted in memory and not written.",
            "v1–v3 YouTube/WatchEDH audits remain permanently frozen.",
        ],
    }
    write_json(OUT / "melee-feasibility-events.json", {"n": len(events), "events": events})
    write_json(OUT / "melee-feasibility-pods.json", {"n": len(pods), "resultValuesRetained": False, "pods": pods})
    write_json(OUT / "melee-feasibility-report.json", report)
    checks = {
        "analysisSpec": sha256_bytes((OUT / "analysis-spec.json").read_bytes()),
        "events": sha256_bytes((OUT / "melee-feasibility-events.json").read_bytes()),
        "pods": sha256_bytes((OUT / "melee-feasibility-pods.json").read_bytes()),
        "report": sha256_bytes((OUT / "melee-feasibility-report.json").read_bytes()),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {"status": "FROZEN", "call": report["call"], "source": "melee.gg", "credentialsUsed": False, "barsNotApplicable": True},
    )
    print(json.dumps({"call": report["call"], "inspected": len(events), "schemaEvents": n_schema, "completePods": n_complete, "reasons": reasons}, indent=2))


if __name__ == "__main__":
    main()
