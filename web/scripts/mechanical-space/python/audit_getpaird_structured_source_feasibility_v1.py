#!/usr/bin/env python3
"""
GetPaird Structured Source Feasibility Audit v1.

Official public tournament API only. Result values are dropped in memory.
No predictions / Pressure / scoring.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

from egv1_deck_hosts import build_name_maps, legal_commander_snapshot, resolve_oid
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
MELEE = MS / "melee-structured-source-feasibility-v1"
OUT = MS / "getpaird-structured-source-feasibility-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
BASE = "https://getpaird.io/api/v1"
GAME = "Magic: The Gathering"
FORMAT_CANDIDATES = (
    "Commander Multiplayer",
    "EDH Multiplayer",
    "cEDH",
    "cEDH Multiplayer",
    "Commander",
    "EDH",
)
MULTI_KINDS = {"multiplayer_swiss", "multiplayer_elimination"}
EXCLUDE_FMT = ("duel", "1v1", "two-headed", "2hg", "oathbreaker", "brawl", "draft")
SEARCH_START = 1609459200  # 2021-01-01 UTC; query mode is completed-only


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_api_key() -> str | None:
    key = (os.environ.get("GETPAIRD_API_KEY") or "").strip()
    if key:
        return key
    env = WEB / ".env.local"
    if not env.exists():
        return None
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("GETPAIRD_API_KEY="):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            return val or None
    return None


def api(method: str, path: str, key: str, body: dict | None = None, timeout: int = 45) -> tuple[int, object]:
    cmd = [
        "curl.exe",
        "-sS",
        "--ssl-no-revoke",
        "--max-time",
        str(timeout),
        "-w",
        "\n__HTTP_CODE__:%{http_code}",
        "-H",
        f"Authorization: {key}",
        "-H",
        "Accept: application/json",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body)]
    cmd += ["-X", method, f"{BASE}{path}"]
    r = subprocess.run(cmd, capture_output=True)
    raw = r.stdout or b""
    code = 0
    if b"__HTTP_CODE__:" in raw:
        raw, _, tail = raw.rpartition(b"__HTTP_CODE__:")
        try:
            code = int(tail.decode("ascii", "replace").strip())
        except ValueError:
            code = 0
    try:
        parsed = json.loads(raw.decode("utf-8", "replace")) if raw.strip() else None
    except json.JSONDecodeError:
        parsed = {"_nonjson": True, "nBytes": len(raw)}
    if code == 429:
        wait = 30
        if isinstance(parsed, dict):
            wait = int(parsed.get("retryAfterSeconds") or 30)
        time.sleep(wait + 1)
        return api(method, path, key, body, timeout)
    return code, parsed


def meta_only_search_row(row: dict) -> dict:
    return {
        "TID": row.get("TID") or row.get("tid"),
        "tournamentName": row.get("tournamentName") or row.get("name"),
        "game": row.get("game"),
        "format": row.get("format"),
        "startDate": row.get("startDate"),
        "swissNum": row.get("swissNum"),
        "topCut": row.get("topCut"),
    }


def discover_format(key: str) -> dict:
    tried = []
    chosen: list[str] = []
    now = int(time.time())
    for label in FORMAT_CANDIDATES:
        code, data = api(
            "POST",
            "/tournaments",
            key,
            {
                "game": GAME,
                "format": label,
                "start": SEARCH_START,
                "end": now,
                "columns": ["name", "id"],
                "rounds": False,
            },
        )
        n = len(data) if isinstance(data, list) else 0
        tried.append({"label": label, "httpStatus": code, "nReturned": n})
        if code == 200 and n > 0:
            chosen.append(label)
        time.sleep(3.2)
    return {"tried": tried, "chosen": chosen}


def collect_events(key: str, formats: list[str]) -> list[dict]:
    now = int(time.time())
    seen = {}
    for fmt in formats:
        code, data = api(
            "POST",
            "/tournaments",
            key,
            {
                "game": GAME,
                "format": fmt,
                "start": SEARCH_START,
                "end": now,
                "columns": ["name", "id"],
                "rounds": False,
            },
        )
        if code == 200 and isinstance(data, list):
            for row in data:
                if isinstance(row, dict):
                    rec = meta_only_search_row(row)
                    if rec.get("TID"):
                        seen[rec["TID"]] = rec
        time.sleep(3.2)
    rows = list(seen.values())
    rows.sort(key=lambda r: (r.get("startDate") or 0, r.get("TID") or ""))
    return rows


def info_ok(info: dict) -> tuple[bool, str]:
    data = info.get("data") if "data" in info and isinstance(info.get("data"), dict) else info
    game = (data.get("game") or "").strip()
    fmt = (data.get("format") or "").strip()
    status = (data.get("status") or "").strip()
    if game != GAME:
        return False, f"game:{game}"
    low = fmt.lower()
    if any(x in low for x in EXCLUDE_FMT):
        return False, f"excluded_format:{fmt}"
    if "commander" not in low and "edh" not in low:
        return False, f"not_commander:{fmt}"
    if "duel" in low or "1v1" in low:
        return False, f"excluded_format:{fmt}"
    if status.lower() not in {"complete", "completed"}:
        return False, f"status:{status}"
    if data.get("isTeamEvent"):
        return False, "team_event"
    phases = data.get("phases") or []
    kinds = {p.get("kind") for p in phases if isinstance(p, dict)}
    # cEDH / Commander Multiplayer are public Commander labels; four-player
    # tables are required later. Reject 1v1/team phase kinds when advertised.
    if kinds and kinds <= {"single_elimination", "double_elimination", "draft"} and not (kinds & MULTI_KINDS):
        return False, f"phase_kinds:{sorted(k for k in kinds if k)}"
    return True, "ok"


def redact_table(table: dict) -> dict:
    players = table.get("players") or []
    ids = []
    if isinstance(players, list):
        for p in players:
            if isinstance(p, dict) and p.get("id") is not None:
                ids.append(p["id"])
    return {
        "table": table.get("table"),
        "pod_players_count": len(ids),
        "participant_ids": ids,
        "winner_field_present": "winner" in table,
        "winner_id_field_present": "winner_id" in table,
        "draw_representable": True,
        "status_field_present": "status" in table,
    }


def snapshot_from_deckobj(deck_obj: dict, exact: dict, norm: dict) -> dict:
    cmd = {}
    main = {}
    if isinstance(deck_obj, dict):
        for k, v in deck_obj.items():
            lk = (k or "").lower()
            if not isinstance(v, dict):
                continue
            if "command" in lk:
                cmd.update(v)
            elif lk in {"mainboard", "main", "deck"} or "main" in lk:
                main.update(v)
    command = []
    named_cmd = 0
    resolved_cmd = 0
    for name, qty in cmd.items():
        named_cmd += int(qty or 1)
        oid = resolve_oid(str(name), exact, norm)
        if oid:
            resolved_cmd += int(qty or 1)
        command.append({"name": name, "quantity": int(qty or 1), "oracleId": oid})
    mainboard = []
    named_main = 0
    resolved_main = 0
    for name, qty in main.items():
        named_main += int(qty or 1)
        oid = resolve_oid(str(name), exact, norm)
        if oid:
            resolved_main += int(qty or 1)
        mainboard.append({"name": name, "quantity": int(qty or 1), "oracleId": oid})
    snap = {
        "nNamedCommand": named_cmd,
        "nResolvedCommand": resolved_cmd,
        "nNamedMain": named_main,
        "nResolvedMain": resolved_main,
        "command": command,
        "main": mainboard,
        "format": "commander",
        "checksum": sha256_bytes(json.dumps(deck_obj, sort_keys=True, ensure_ascii=False).encode("utf-8")),
    }
    ok, reason = legal_commander_snapshot(snap)
    snap["legal"] = ok
    snap["legalReason"] = reason
    return snap


def player_deck(tid: str, pid: int, key: str, exact: dict, norm: dict) -> dict:
    code, data = api("GET", f"/tournaments/{tid}/players/{pid}", key)
    if code != 200 or not isinstance(data, dict):
        return {"registration_id": pid, "joined": False, "listAvailable": False, "httpStatus": code}
    deck_obj = data.get("deckObj")
    text = data.get("decklist")
    has_list = isinstance(deck_obj, dict) and bool(deck_obj) or bool(text)
    out = {
        "registration_id": pid,
        "joined": data.get("id") == pid,
        "listAvailable": bool(has_list),
        "hasDeckObj": isinstance(deck_obj, dict) and bool(deck_obj),
        "hasDecklistText": bool(text),
        "httpStatus": code,
    }
    if isinstance(deck_obj, dict) and deck_obj:
        snap = snapshot_from_deckobj(deck_obj, exact, norm)
        out.update(
            {
                "nNamedCommand": snap["nNamedCommand"],
                "nNamedMain": snap["nNamedMain"],
                "legal": snap["legal"],
                "legalReason": snap["legalReason"],
                "snapshotChecksum": snap["checksum"],
            }
        )
    return out


def needs_key_report() -> None:
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "call": "NEEDS_PUBLIC_API_KEY",
        "source": "getpaird.io",
        "note": "GETPAIRD_API_KEY is not configured. Official public API only; do not scrape around authentication.",
        "predictionsRun": False,
        "pressureRun": False,
        "resultContentsOpened": False,
    }
    write_json(OUT / "getpaird-source-report.json", report)
    write_json(OUT / "IMMUTABLE.json", {"status": "FROZEN", "call": "NEEDS_PUBLIC_API_KEY"})
    print(json.dumps({"call": "NEEDS_PUBLIC_API_KEY"}, indent=2))


def main() -> None:
    if load_json(MELEE / "FAIL_PERMANENT.json").get("doNotReopen") is not True:
        raise SystemExit("Melee feasibility FAIL must remain permanently frozen")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN_BEFORE_FETCH":
        raise SystemExit("GetPaird spec must be frozen first")
    key = load_api_key()
    if not key:
        needs_key_report()
        return

    rows = []
    with (RC8 / "index.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rows.append(json.loads(line))
    exact, norm = build_name_maps(rows)

    fmt_disc = discover_format(key)
    if not fmt_disc["chosen"]:
        report = {
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "REPORT_AND_WAIT",
            "call": "FAIL",
            "source": "getpaird.io",
            "formatDiscovery": fmt_disc,
            "failureReasons": ["no_qualifying_multiplayer_events"],
            "resultContentsOpened": False,
            "predictionsRun": False,
            "pressureRun": False,
            "attribution": "Data provided by GetPaird (https://getpaird.io)",
        }
        write_json(OUT / "getpaird-source-report.json", report)
        write_json(OUT / "getpaird-feasibility-events.json", {"n": 0, "events": []})
        write_json(OUT / "getpaird-feasibility-pods.json", {"n": 0, "pods": [], "resultValuesRetained": False})
        write_json(OUT / "getpaird-deck-snapshot-schema.json", {"validated": 0})
        print(json.dumps({"call": "FAIL", "reasons": report["failureReasons"], "formats": fmt_disc}, indent=2))
        return

    catalog = collect_events(key, fmt_disc["chosen"])
    fmt = ",".join(fmt_disc["chosen"])
    events = []
    pods = []
    snapshots = []
    for row in catalog:
        if len(events) >= 10:
            break
        tid = row["TID"]
        print(f"  info {tid}", flush=True)
        code, info = api("GET", f"/tournaments/{tid}/info", key)
        time.sleep(0.7)
        if code != 200 or not isinstance(info, dict):
            continue
        ok, why = info_ok(info)
        if not ok:
            continue
        data = info.get("data") if isinstance(info.get("data"), dict) else info
        code_r, rounds = api("GET", f"/tournaments/{tid}/rounds", key)
        time.sleep(0.7)
        if code_r != 200 or not isinstance(rounds, list):
            continue
        four = []
        for rnd in rounds:
            if not isinstance(rnd, dict):
                continue
            for table in rnd.get("tables") or []:
                if not isinstance(table, dict):
                    continue
                red = redact_table(table)
                if red["pod_players_count"] == 4:
                    four.append(
                        {
                            "event_id": tid,
                            "round": rnd.get("round"),
                            "phaseName": rnd.get("phaseName"),
                            **red,
                        }
                    )
        if not four:
            continue
        # This event enters the deterministic 10-event sample.
        ev_pods = []
        n_complete = 0
        n_join_fail = 0
        n_invalid = 0
        n_unpublished = 0
        for pod in four:
            seats = []
            for pid in pod["participant_ids"]:
                rec = player_deck(tid, int(pid), key, exact, norm)
                time.sleep(0.65)
                seats.append(rec)
                if rec.get("hasDeckObj"):
                    snapshots.append(
                        {
                            "event_id": tid,
                            "registration_id": pid,
                            "legal": rec.get("legal"),
                            "legalReason": rec.get("legalReason"),
                            "nNamedCommand": rec.get("nNamedCommand"),
                            "nNamedMain": rec.get("nNamedMain"),
                            "snapshotChecksum": rec.get("snapshotChecksum"),
                            "joinedByRegistrationId": rec.get("joined"),
                        }
                    )
            lists_ok = all(s.get("legal") for s in seats)
            joined = all(s.get("joined") for s in seats)
            result_field = pod["winner_field_present"] and pod["winner_id_field_present"]
            if not all(s.get("listAvailable") for s in seats):
                n_unpublished += 1
            if not joined:
                n_join_fail += 1
            if all(s.get("listAvailable") for s in seats) and not lists_ok:
                n_invalid += 1
            complete = lists_ok and joined and result_field and len(seats) == 4
            if complete:
                n_complete += 1
            ev_pods.append(
                {
                    "event_id": tid,
                    "round": pod["round"],
                    "table": pod["table"],
                    "participant_ids": pod["participant_ids"],
                    "pod_players_count": 4,
                    "winner_field_present": pod["winner_field_present"],
                    "winner_id_field_present": pod["winner_id_field_present"],
                    "draw_representable": True,
                    "nExactLegalLists": sum(1 for s in seats if s.get("legal")),
                    "nJoinedByRegistrationId": sum(1 for s in seats if s.get("joined")),
                    "complete": complete,
                    "resultValueRetained": False,
                }
            )
        pods.extend(ev_pods)
        all_schemas = n_complete > 0 or (
            any(p["winner_field_present"] for p in four)
            and any(s.get("hasDeckObj") for s in []) is False
        )
        # Event exposes all required schemas if at least one complete pod, or
        # lists+membership+result field are present even if some lists fail size checks.
        schema = any(p["complete"] for p in ev_pods) or (
            any(p["winner_field_present"] and p["nExactLegalLists"] == 4 and p["nJoinedByRegistrationId"] == 4 for p in ev_pods)
        )
        events.append(
            {
                "event_id": tid,
                "event_date": row.get("startDate"),
                "format": data.get("format"),
                "status": data.get("status"),
                "player_count": data.get("registeredCount"),
                "round_count": len(rounds),
                "nFourPlayerPods": len(four),
                "nCompletePods": n_complete,
                "nUnpublishedLists": n_unpublished,
                "nJoinFailures": n_join_fail,
                "nInvalidSnapshots": n_invalid,
                "allRequiredSchemas": schema,
                "resultValuesRetained": False,
            }
        )

    n_schema = sum(1 for e in events if e.get("allRequiredSchemas"))
    n_complete = sum(1 for p in pods if p.get("complete"))
    passed = len(events) >= 1 and n_schema >= 5 and n_complete >= 40
    reasons = []
    if not passed:
        if not events:
            reasons.append("no_qualifying_multiplayer_events")
        if n_schema < 5:
            reasons.append("insufficient_events_exposing_all_required_schemas")
        if n_complete < 40:
            reasons.append("insufficient_pod_count")
        if events and all(e.get("nUnpublishedLists", 0) == e.get("nFourPlayerPods", 0) for e in events):
            reasons.append("lists_unpublished")
        if events and all(e.get("nFourPlayerPods", 0) == 0 for e in events):
            reasons.append("non_four_player_tables")
        if events and all(not any(p.get("winner_field_present") for p in pods if p["event_id"] == e["event_id"]) for e in events):
            reasons.append("result_schema_absent")
        if sum(e.get("nJoinFailures") or 0 for e in events) and n_complete == 0:
            reasons.append("player_deck_join_failure")
        if sum(e.get("nInvalidSnapshots") or 0 for e in events) and n_complete == 0:
            reasons.append("invalid_deck_snapshots")

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "call": "PASS" if passed else "FAIL",
        "source": "getpaird.io",
        "api": BASE,
        "formatDiscovery": fmt_disc,
        "nCatalogEvents": len(catalog),
        "nSampleEvents": len(events),
        "nEventsExposingAllRequiredSchemas": n_schema,
        "nFourPlayerPodsComplete": n_complete,
        "passGate": {"events": 5, "pods": 40, "met": passed},
        "failureReasons": reasons,
        "resultContentsOpened": False,
        "predictionsRun": False,
        "pressureRun": False,
        "attribution": "Data provided by GetPaird (https://getpaird.io)",
        "notes": [
            "Melee feasibility FAIL remains permanently frozen.",
            "Winner/draw values were redacted and not written.",
            "Standings were not used as outcomes.",
        ],
    }
    write_json(OUT / "getpaird-feasibility-events.json", {"n": len(events), "format": fmt, "events": events})
    write_json(OUT / "getpaird-feasibility-pods.json", {"n": len(pods), "resultValuesRetained": False, "pods": pods})
    write_json(
        OUT / "getpaird-deck-snapshot-schema.json",
        {"n": len(snapshots), "rule": "legal_commander_snapshot (command 1–3, total 90–110, ≥95% resolved)", "snapshots": snapshots},
    )
    write_json(OUT / "getpaird-source-report.json", report)
    checks = {
        "analysisSpec": sha256_bytes((OUT / "analysis-spec.json").read_bytes()),
        "events": sha256_bytes((OUT / "getpaird-feasibility-events.json").read_bytes()),
        "pods": sha256_bytes((OUT / "getpaird-feasibility-pods.json").read_bytes()),
        "snapshots": sha256_bytes((OUT / "getpaird-deck-snapshot-schema.json").read_bytes()),
        "report": sha256_bytes((OUT / "getpaird-source-report.json").read_bytes()),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(OUT / "IMMUTABLE.json", {"status": "FROZEN", "call": report["call"], "source": "getpaird.io", "resultValuesRetained": False})
    print(
        json.dumps(
            {
                "call": report["call"],
                "format": fmt,
                "catalog": len(catalog),
                "sample": len(events),
                "schemaEvents": n_schema,
                "completePods": n_complete,
                "reasons": reasons,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
