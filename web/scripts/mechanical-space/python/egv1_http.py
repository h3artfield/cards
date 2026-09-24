"""Outcome-blind HTTP helpers. Prefer curl.exe so Cloudflare-backed hosts respond."""

from __future__ import annotations

import subprocess
import time
import urllib.parse

from outcome_firewall_v1 import looks_like_outcome_query

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def curl_bytes(url: str, extra: list[str] | None = None, timeout: int = 40) -> bytes:
    if looks_like_outcome_query(url):
        raise RuntimeError("refusing outcome-bearing URL")
    cmd = ["curl.exe", "-sS", "-L", "--max-time", str(timeout), "-A", UA, "-H", "Accept-Language: en-US,en;q=0.9"]
    if extra:
        cmd.extend(extra)
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"curl failed {url}: {r.stderr.decode('utf-8', 'replace')[:200]}")
    if not r.stdout:
        raise RuntimeError(f"empty body {url}")
    return r.stdout


def curl_text(url: str, extra: list[str] | None = None) -> str:
    return curl_bytes(url, extra=extra).decode("utf-8", "replace")


def polite_sleep(seconds: float = 0.25) -> None:
    time.sleep(seconds)


def canonicalize_deck_url(url: str) -> str | None:
    raw = (url or "").strip().split("#")[0].rstrip("/")
    if not raw:
        return None
    p = urllib.parse.urlparse(raw)
    host = (p.netloc or "").lower().removeprefix("www.")
    path = p.path
    if host == "moxfield.com" and "/decks/" in path:
        public_id = path.split("/decks/")[1].split("/")[0]
        if public_id:
            return f"https://moxfield.com/decks/{public_id}"
    if host == "archidekt.com" and "/decks/" in path:
        deck_id = path.split("/decks/")[1].split("/")[0]
        if deck_id.isdigit():
            return f"https://archidekt.com/decks/{deck_id}"
    if host == "tappedout.net" and "/mtg-decks/" in path:
        slug = path.split("/mtg-decks/")[1].split("/")[0]
        if slug:
            return f"https://tappedout.net/mtg-decks/{slug}"
    if host == "deckstats.net" and "/decks/" in path:
        parts = [x for x in path.split("/") if x]
        if len(parts) >= 3:
            return f"https://deckstats.net/decks/{parts[1]}/{parts[2]}"
    if host == "mtggoldfish.com" and "/deck/" in path:
        deck_id = path.split("/deck/")[1].split("/")[0]
        if deck_id.isdigit():
            return f"https://www.mtggoldfish.com/deck/{deck_id}"
    if host in {"manabox.app", "www.manabox.app"} and "/decks/" in path:
        deck_id = path.split("/decks/")[1].split("/")[0]
        if deck_id:
            return f"https://manabox.app/decks/{deck_id}"
    return None


def host_of(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")
    return host.split(":")[0]
