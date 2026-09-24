#!/usr/bin/env python3
"""
Qualify the frozen Seed-80 games. Outcome-blind. No substitutions.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

from egv1_deck_hosts import build_name_maps, legal_commander_snapshot, snapshot_deck
from egv1_http import canonicalize_deck_url, host_of
from egv1_source_extract import watchedh_decklist_urls, youtube_description_deck_urls
from outcome_firewall_v1 import OUTCOME_UNLOCKED, assert_outcomes_locked
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "external-gameplay-validation-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
SNAP_DIR = OUT / "deck-snapshots"
RAW_DIR = SNAP_DIR / "raw"
NORM_DIR = SNAP_DIR / "normalized"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def title_commanders(title: str) -> list[str]:
    t = re.sub(r"#\S+", "", title or "")
    t = re.sub(r"\b(commander|gameplay|game|edh|cmdr|cedh)\b", " ", t, flags=re.I)
    parts = re.split(r"\s+vs\.?\s+", t, flags=re.I)
    return [re.sub(r"\s+", " ", p).strip(" -|:,").strip() for p in parts if len(p.strip()) >= 2][:4]


def verify_seed() -> dict[str, str]:
    expected = {}
    for line in (OUT / "manifest-checksums.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        expected[name.strip()] = digest
    got = {}
    for name, digest in expected.items():
        path = OUT / name
        actual = sha256_file(path)
        if actual != digest:
            raise SystemExit(f"checksum mismatch {name}")
        got[name] = actual
    return got


def persist_snapshot(game_id: str, seat: str, url: str, snap: dict) -> dict:
    token = sha256_bytes(url.encode())[:16]
    raw_path = RAW_DIR / f"{game_id}-{seat}-{token}.raw.txt"
    norm = {
        "sourceUrl": url,
        "host": snap["host"],
        "format": snap.get("format"),
        "commanderNames": snap["commanderNames"],
        "commanderOracleIds": snap["commanderOracleIds"],
        "mainboard": [{"name": x["name"], "quantity": x["quantity"], **({"oracleId": x["oracleId"]} if x.get("oracleId") else {})} for x in snap["mainboard"]],
        "commanders": snap["commanders"],
        "nNamedMain": snap["nNamedMain"],
        "nNamedCommand": snap["nNamedCommand"],
        "nResolvedMain": snap["nResolvedMain"],
        "nResolvedCommand": snap["nResolvedCommand"],
        "unresolvedNames": snap["unresolvedNames"],
    }
    raw_path.write_text(snap["rawText"], encoding="utf-8")
    norm_path = NORM_DIR / f"{game_id}-{seat}-{token}.json"
    norm_path.write_text(json.dumps(norm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    raw_sha = sha256_file(raw_path)
    norm_sha = sha256_file(norm_path)
    content_sha = sha256_bytes(
        json.dumps(
            {
                "commanders": sorted((c.get("oracleId") or c["name"], c["quantity"]) for c in snap["commanders"]),
                "mainboard": sorted((c.get("oracleId") or c["name"], c["quantity"]) for c in snap["mainboard"]),
            },
            sort_keys=True,
        ).encode()
    )
    return {
        "seatKey": seat,
        "commanderNames": snap["commanderNames"],
        "sourceUrl": url,
        "host": snap["host"],
        "normalizedMainDeckCardCount": snap["nNamedMain"],
        "commandZoneCardCount": snap["nNamedCommand"],
        "resolvedMainDeckCardCount": snap["nResolvedMain"],
        "resolvedCommandZoneCardCount": snap["nResolvedCommand"],
        "unresolvedNames": snap["unresolvedNames"],
        "rawSha256": raw_sha,
        "snapshotSha256": norm_sha,
        "contentSha256": content_sha,
        "snapshotPath": str(norm_path.relative_to(OUT)).replace("\\", "/"),
        "rawPath": str(raw_path.relative_to(OUT)).replace("\\", "/"),
    }


def collect_urls(rec: dict) -> tuple[list[str], str, list[str]]:
    notes: list[str] = []
    supplied = []
    for u in rec.get("capturedDecklistUrls") or []:
        c = canonicalize_deck_url(u)
        if c:
            supplied.append(c)
    if rec.get("capturedDecklistUrlsComplete") and len(supplied) == 4:
        return supplied, "supplied_captured", notes
    urls = list(supplied)
    source = "supplied_partial" if urls else None
    if len(urls) < 4:
        w_urls, w_st = watchedh_decklist_urls(rec["watchEdhUrl"])
        notes.append(f"watchedh:{w_st}:{len(w_urls)}")
        for u in w_urls:
            if u not in urls:
                urls.append(u)
        if len(urls) >= 4:
            source = "watchedh_decklists"
    if len(urls) < 4:
        y_urls, y_st = youtube_description_deck_urls(rec["youtubeVideoId"])
        notes.append(f"youtube_desc:{y_st}:{len(y_urls)}")
        for u in y_urls:
            if u not in urls:
                urls.append(u)
        if len(urls) >= 4:
            source = "youtube_description"
    if source is None:
        source = "incomplete"
    return urls[:8], source, notes


def qualify_game(rec: dict, exact: dict, norm: dict, cache: dict) -> dict:
    urls, source, notes = collect_urls(rec)
    row = {
        "externalGameId": rec["externalGameId"],
        "channel": rec["channel"],
        "sourceStratum": rec["sourceStratum"],
        "youtubeVideoId": rec["youtubeVideoId"],
        "prequalifiedFourLinks": bool(rec.get("prequalifiedFourLinks")),
        "urlSource": source,
        "sourceDeckUrls": urls,
        "notes": notes,
        "deckSnapshots": [],
        "outcomeOpened": False,
        "transcriptOpened": False,
        "outcomeUnlocked": False,
    }
    if len(urls) < 4:
        row["qualification"] = "HOLD_MISSING_LISTS"
        row["holdReason"] = f"recovered_{len(urls)}_urls"
        return row
    if len(set(urls[:4])) < 4:
        row["qualification"] = "HOLD_AMBIGUOUS_MAPPING"
        row["holdReason"] = "duplicate_url_in_pod"
        return row

    snaps = []
    for url in urls[:4]:
        if url not in cache:
            try:
                cache[url] = snapshot_deck(url, exact, norm)
            except Exception as e:
                cache[url] = {"error": f"{type(e).__name__}:{str(e)[:180]}"}
        snaps.append((url, cache[url]))

    failures = []
    packed = []
    for i, (url, snap) in enumerate(snaps):
        if "error" in snap:
            failures.append(snap["error"])
            continue
        ok, why = legal_commander_snapshot(snap)
        if not ok:
            failures.append(f"{host_of(url)}:{why}")
            continue
        packed.append((url, snap))
    if len(packed) < 4:
        row["qualification"] = "HOLD_MISSING_LISTS"
        row["holdReason"] = ";".join(failures) or "snapshot_failed"
        row["parserFailures"] = failures
        return row

    title_cs = title_commanders(rec.get("title") or "")
    seats = [f"S{i}" for i in range(1, 5)]
    used = set()
    assigned = [None] * 4
    if len(title_cs) == 4:
        for i, (_url, snap) in enumerate(packed):
            names = " ".join(snap["commanderNames"])
            best = None
            for j, tc in enumerate(title_cs):
                if j in used:
                    continue
                if norm_overlap(names, tc):
                    best = j
                    break
            if best is not None:
                used.add(best)
                assigned[i] = f"S{best + 1}"
    if any(x is None for x in assigned) or len(set(x for x in assigned if x)) < 4:
        assigned = seats[:]
        mapping = "snapshot_commander_url_order"
    else:
        mapping = "title_commander_match"
    row["seatMapping"] = mapping
    for seat, (url, snap) in zip(assigned, packed):
        row["deckSnapshots"].append(persist_snapshot(rec["externalGameId"], seat, url, snap))
    row["qualification"] = "QUALIFIED_EXACT_4"
    return row


def norm_overlap(a: str, b: str) -> bool:
    from egv1_deck_hosts import norm_name

    na, nb = norm_name(a), norm_name(b)
    if not na or not nb:
        return False
    return na in nb or nb in na or na[:12] == nb[:12]


def main() -> None:
    assert_outcomes_locked()
    if OUTCOME_UNLOCKED:
        raise SystemExit("OUTCOME_UNLOCKED must be false")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if sha256_file(COMPAT_PY) != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")
    checksums = verify_seed()
    manifest = load_json(OUT / "source-manifest.seed80.json")
    records = manifest["records"]
    if len(records) != 80:
        raise SystemExit(f"expected 80 candidates, got {len(records)}")
    ids = [r["externalGameId"] for r in records]
    if len(set(ids)) != 80:
        raise SystemExit("duplicate externalGameId")

    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    exact, norm = build_name_maps(rc8)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    NORM_DIR.mkdir(parents=True, exist_ok=True)

    cache: dict[str, dict] = {}
    rows = []
    for i, rec in enumerate(records, 1):
        print(f"  qualify {rec['externalGameId']} {i}/80", flush=True)
        rows.append(qualify_game(rec, exact, norm, cache))

    counts = Counter(r["qualification"] for r in rows)
    n_qual = counts.get("QUALIFIED_EXACT_4", 0)
    by_channel = defaultdict(lambda: Counter())
    by_stratum = defaultdict(lambda: Counter())
    by_host = Counter()
    pre_q = {"prequalified": Counter(), "fallback": Counter()}
    for r, rec in zip(rows, records):
        by_channel[rec["channel"]][r["qualification"]] += 1
        by_stratum[rec["sourceStratum"]][r["qualification"]] += 1
        key = "prequalified" if rec.get("prequalifiedFourLinks") else "fallback"
        pre_q[key][r["qualification"]] += 1
        for d in r.get("deckSnapshots") or []:
            by_host[d["host"]] += 1

    url_dup = Counter()
    content_dup = Counter()
    for r in rows:
        for d in r.get("deckSnapshots") or []:
            url_dup[d["sourceUrl"]] += 1
            content_dup[d["contentSha256"]] += 1

    n_snaps = sum(len(r.get("deckSnapshots") or []) for r in rows)
    failures = [r for r in rows if r.get("parserFailures")]
    if any(r["outcomeOpened"] or r["transcriptOpened"] for r in rows):
        raise SystemExit("outcome/transcript flag flipped")

    qual_payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "SOURCE_QUALIFICATION_V1",
        "outcomesOpened": False,
        "transcriptsOpened": False,
        "outcomeUnlocked": False,
        "nCandidates": 80,
        "nQualified": n_qual,
        "counts": dict(counts),
        "records": rows,
        "gate": "PASS" if n_qual >= 40 else "STOP_BELOW_40",
        "note": "Exact sealed lists only. No replacements. No outcomes opened.",
    }
    (OUT / "source-qualification-v1.json").write_text(json.dumps(qual_payload, indent=2) + "\n", encoding="utf-8")
    with (OUT / "source-qualification-v1.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["externalGameId", "channel", "qualification", "urlSource", "nSnapshots", "hosts", "outcomeOpened", "transcriptOpened"])
        for r in rows:
            hosts = "|".join(d["host"] for d in r.get("deckSnapshots") or [])
            w.writerow([r["externalGameId"], r["channel"], r["qualification"], r["urlSource"], len(r.get("deckSnapshots") or []), hosts, False, False])

    snap_manifest = {
        "nSnapshots": n_snaps,
        "byHost": dict(by_host),
        "duplicateUrls": {u: n for u, n in url_dup.items() if n > 1},
        "duplicateContentHashes": {h: n for h, n in content_dup.items() if n > 1},
        "snapshots": [d | {"externalGameId": r["externalGameId"]} for r in rows for d in r.get("deckSnapshots") or []],
    }
    (OUT / "deck-snapshot-manifest-v1.json").write_text(json.dumps(snap_manifest, indent=2) + "\n", encoding="utf-8")

    audit = {
        "createdAt": qual_payload["createdAt"],
        "seedChecksums": checksums,
        "gitSha": "50789e02c667f2150ae70adc3ca92ec8f743942b",
        "runtime": "Python 3.10",
        "frozenLineage": {
            "ontology": "mechanical-ontology-v2.2",
            "profiles": "deck-mechanical-profiles-v2",
            "k": "mechanical-pressure-k-v3.0",
            "pressure": "deck-pressure-v4 / conservative-v2",
            "compatibilityScreen": "compatibility-screen-v1",
            "bge": LOCKED_CHECKSUM,
        },
        "counts": dict(counts),
        "byChannel": {k: dict(v) for k, v in by_channel.items()},
        "byStratum": {k: dict(v) for k, v in by_stratum.items()},
        "byHost": dict(by_host),
        "prequalifiedVsFallback": {k: dict(v) for k, v in pre_q.items()},
        "nQualified": n_qual,
        "nExactDeckSnapshots": n_snaps,
        "nDuplicateUrls": sum(1 for n in url_dup.values() if n > 1),
        "nDuplicateContentHashes": sum(1 for n in content_dup.values() if n > 1),
        "nParserFailures": len(failures),
        "parserFailures": [{"externalGameId": r["externalGameId"], "holdReason": r.get("holdReason")} for r in failures],
        "allOutcomeOpenedFalse": all(r["outcomeOpened"] is False for r in rows),
        "allTranscriptOpenedFalse": all(r["transcriptOpened"] is False for r in rows),
        "selectionIntegrityNote": "The 80 IDs were locked before per-game decklist verification. Some WatchEDH pages co-render gameplay-summary text. No candidate was added, removed, reordered, or reweighted on that text. This pipeline parsed only Decklists / description URLs.",
        "gate": qual_payload["gate"],
    }
    (OUT / "qualification-audit-v1.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    (OUT / "QUALIFICATION_STATUS.json").write_text(
        json.dumps(
            {
                "nQualified": n_qual,
                "gate": qual_payload["gate"],
                "outcomesOpened": False,
                "next": "P4 if nQualified>=40 else REPORT_AND_WAIT",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"nQualified": n_qual, "counts": dict(counts), "gate": qual_payload["gate"]}, indent=2))


if __name__ == "__main__":
    main()
