"""Snapshot exact lists from allowlisted hosts. Persist raw+normalized, never outcomes."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from egv1_http import curl_bytes, curl_text, host_of, polite_sleep
from outcome_firewall_v1 import assert_outcomes_locked

MOX_EXTRA = [
    "-H", "Accept: application/json",
    "-H", "Origin: https://www.moxfield.com",
    "-H", "Referer: https://www.moxfield.com/",
]


def norm_name(name: str) -> str:
    s = (name or "").strip()
    s = s.replace("Æ", "Ae").replace("æ", "ae").replace("œ", "oe")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.split("//")[0].split("/")[0].strip()
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s


def build_name_maps(rc8_rows: list[dict]) -> tuple[dict[str, str], dict[str, str]]:
    exact: dict[str, str] = {}
    norm: dict[str, str] = {}
    for r in rc8_rows:
        oid = r.get("oracleId")
        name = r.get("name") or ""
        if not oid or not name:
            continue
        exact[name.lower()] = oid
        n = norm_name(name)
        if n and n not in norm:
            norm[n] = oid
        if " // " in name:
            front = norm_name(name.split(" // ")[0])
            if front and front not in norm:
                norm[front] = oid
    return exact, norm


def resolve_oid(name: str, exact: dict[str, str], norm: dict[str, str], given: str | None = None) -> str | None:
    if given:
        return given
    if not name:
        return None
    if name.lower() in exact:
        return exact[name.lower()]
    n = norm_name(name)
    return norm.get(n)


def snapshot_deck(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict[str, Any]:
    assert_outcomes_locked()
    polite_sleep()
    host = host_of(url)
    if host == "moxfield.com":
        return _moxfield(url, exact, norm)
    if host == "archidekt.com":
        return _archidekt(url, exact, norm)
    if host == "tappedout.net":
        return _tappedout(url, exact, norm)
    if host == "deckstats.net":
        return _deckstats(url, exact, norm)
    if host == "mtggoldfish.com":
        return _goldfish(url, exact, norm)
    raise RuntimeError(f"unsupported host {host}")


def _entry(name: str, qty: int, oid: str | None) -> dict:
    rec = {"name": name, "quantity": max(1, int(qty))}
    if oid:
        rec["oracleId"] = oid
    return rec


def _pack(url: str, host: str, raw: Any, commanders: list[dict], mainboard: list[dict], fmt: str | None) -> dict:
    raw_text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, sort_keys=True)
    cmd_oids = [c["oracleId"] for c in commanders if c.get("oracleId")]
    return {
        "sourceUrl": url,
        "host": host,
        "format": fmt,
        "rawText": raw_text,
        "commanders": commanders,
        "commanderNames": [c["name"] for c in commanders],
        "commanderOracleIds": cmd_oids,
        "mainboard": mainboard,
        "nNamedMain": sum(int(x["quantity"]) for x in mainboard),
        "nNamedCommand": sum(int(x["quantity"]) for x in commanders),
        "nResolvedMain": sum(int(x["quantity"]) for x in mainboard if x.get("oracleId")),
        "nResolvedCommand": sum(int(x["quantity"]) for x in commanders if x.get("oracleId")),
        "unresolvedNames": sorted(
            {x["name"] for x in mainboard + commanders if not x.get("oracleId")}
        ),
    }


def _moxfield(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict:
    public_id = url.rstrip("/").split("/decks/")[-1]
    api = f"https://api2.moxfield.com/v3/decks/all/{public_id}"
    raw_full = json.loads(curl_bytes(api, extra=MOX_EXTRA))
    raw = {
        "id": raw_full.get("id"),
        "name": raw_full.get("name"),
        "format": raw_full.get("format"),
        "publicId": raw_full.get("publicId"),
        "boards": raw_full.get("boards") or {},
    }
    boards = raw["boards"]

    def board(name: str) -> list[dict]:
        cards = ((boards.get(name) or {}).get("cards") or {})
        out = []
        for rec in cards.values():
            card = rec.get("card") or {}
            nm = card.get("name") or ""
            oid = resolve_oid(nm, exact, norm)
            out.append(_entry(nm, rec.get("quantity") or 1, oid))
        return out

    return _pack(url, "moxfield.com", raw, board("commanders"), board("mainboard"), raw.get("format"))


def _archidekt(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict:
    deck_id = url.rstrip("/").split("/decks/")[-1].split("/")[0]
    raw_full = json.loads(curl_bytes(f"https://archidekt.com/api/decks/{deck_id}/"))
    raw = {
        "id": raw_full.get("id"),
        "name": raw_full.get("name"),
        "deckFormat": raw_full.get("deckFormat") or raw_full.get("format"),
        "cards": raw_full.get("cards") or [],
    }
    commanders, mainboard = [], []
    for rec in raw.get("cards") or []:
        card = rec.get("card") or {}
        oc = card.get("oracleCard") or {}
        nm = oc.get("name") or card.get("displayName") or ""
        oid = resolve_oid(nm, exact, norm, oc.get("uid"))
        cats = [c.lower() for c in (rec.get("categories") or [])]
        entry = _entry(nm, rec.get("quantity") or 1, oid)
        if "commander" in cats or rec.get("companion"):
            if "commander" in cats:
                commanders.append(entry)
                continue
        mainboard.append(entry)
    fmt = None
    deck_fmt = raw.get("deckFormat") or raw.get("format")
    if isinstance(deck_fmt, dict):
        fmt = deck_fmt.get("name") or str(deck_fmt.get("id"))
    elif deck_fmt is not None:
        fmt = str(deck_fmt)
    return _pack(url, "archidekt.com", raw, commanders, mainboard, fmt)


def _parse_text_list(text: str, exact: dict[str, str], norm: dict[str, str]) -> tuple[list[dict], list[dict]]:
    commanders, mainboard = [], []
    section = "main"
    line_re = re.compile(r"^\s*(\d+)\s*[xX]?\s+(.+?)\s*$")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            low = line.lower()
            if "commander" in low:
                section = "cmd"
            elif low.startswith("side") or low.startswith("maybe"):
                section = "skip"
            elif low.startswith("main") or low.startswith("deck"):
                section = "main"
            continue
        if line.lower() in {"commander", "commanders", "command zone"}:
            section = "cmd"
            continue
        if line.lower() in {"sideboard", "maybeboard", "maybe board"}:
            section = "skip"
            continue
        m = line_re.match(line) or re.match(r"^\s*(.+?)\s*$", line)
        if not m:
            continue
        if line_re.match(line):
            qty, name = int(m.group(1)), m.group(2)
        else:
            qty, name = 1, m.group(1)
        name = re.sub(r"\s+\(.*\)$", "", name).strip()
        if not name or section == "skip":
            continue
        entry = _entry(name, qty, resolve_oid(name, exact, norm))
        if section == "cmd":
            commanders.append(entry)
        else:
            mainboard.append(entry)
    return commanders, mainboard


def _tappedout(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict:
    text = curl_text(url.rstrip("/") + "/?fmt=txt")
    commanders, mainboard = _parse_text_list(text, exact, norm)
    return _pack(url, "tappedout.net", text, commanders, mainboard, "commander")


def _deckstats(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict:
    text = curl_text(url + "?export_dec=1")
    commanders, mainboard = _parse_text_list(text, exact, norm)
    return _pack(url, "deckstats.net", text, commanders, mainboard, None)


def _goldfish(url: str, exact: dict[str, str], norm: dict[str, str]) -> dict:
    deck_id = url.rstrip("/").split("/deck/")[-1]
    text = curl_text(f"https://www.mtggoldfish.com/deck/download/{deck_id}")
    commanders, mainboard = _parse_text_list(text, exact, norm)
    return _pack(url, "mtggoldfish.com", text, commanders, mainboard, None)


def legal_commander_snapshot(snap: dict) -> tuple[bool, str]:
    fmt = (snap.get("format") or "").lower()
    if fmt and fmt not in {"commander", "edh", "1", "3"}:
        # Archidekt often uses numeric format ids; 3 historically = commander. Allow empty.
        if fmt not in {"historic", "standard", "modern", "legacy", "vintage", "pauper", "brawl", "oathbreaker"}:
            pass
        else:
            return False, f"nonstandard_format:{fmt}"
    n_cmd = snap["nNamedCommand"]
    if n_cmd < 1 or n_cmd > 3:
        return False, f"command_zone_size:{n_cmd}"
    total = snap["nNamedMain"] + snap["nNamedCommand"]
    if total < 90 or total > 110:
        return False, f"total_size:{total}"
    named = snap["nNamedMain"] + snap["nNamedCommand"]
    resolved = snap["nResolvedMain"] + snap["nResolvedCommand"]
    if named and resolved / named < 0.95:
        return False, f"resolution:{resolved}/{named}"
    if snap["nResolvedCommand"] < 1:
        return False, "commander_unresolved"
    return True, "ok"
