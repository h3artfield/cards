"""Extract only deck-host URLs. Never persist WatchEDH outcome sections or YouTube descriptions."""

from __future__ import annotations

import re

from egv1_http import canonicalize_deck_url, curl_text, polite_sleep
from outcome_firewall_v1 import assert_outcomes_locked, looks_like_outcome_query

DECK_URL_RE = re.compile(
    r"https?://(?:www\.)?(?:"
    r"moxfield\.com/decks/[A-Za-z0-9_-]+|"
    r"archidekt\.com/decks/\d+(?:/[A-Za-z0-9_-]+)?|"
    r"tappedout\.net/mtg-decks/[A-Za-z0-9_-]+|"
    r"deckstats\.net/decks/\d+/\d+|"
    r"mtggoldfish\.com/deck/\d+|"
    r"manabox\.app/decks/[A-Za-z0-9-]+"
    r")",
    re.I,
)
SECTION_END = ("Gameplay Insights", "Gameplay Summary", "Comments")


def _unique_canon(urls: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for u in urls:
        c = canonicalize_deck_url(u)
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def extract_deck_urls_from_text(text: str) -> list[str]:
    if not text:
        return []
    return _unique_canon(DECK_URL_RE.findall(text))


def watchedh_decklist_urls(watch_edh_url: str) -> tuple[list[str], str]:
    """Return (urls, status). Parses only the Decklists HTML range."""
    assert_outcomes_locked()
    if looks_like_outcome_query(watch_edh_url):
        return [], "refused_outcome_url"
    polite_sleep()
    html = curl_text(watch_edh_url)
    start = html.find("Decklists")
    if start < 0:
        return [], "no_decklists_heading"
    ends = [html.find(s, start + 9) for s in SECTION_END]
    ends = [e for e in ends if e != -1]
    end = min(ends) if ends else min(len(html), start + 8000)
    slice_ = html[start:end]
    # drop the source document immediately after slicing
    del html
    urls = extract_deck_urls_from_text(slice_)
    del slice_
    return urls, "ok"


def youtube_description_deck_urls(video_id: str) -> tuple[list[str], str]:
    """Regex-extract allowlisted deck URLs from the raw description, then discard it."""
    assert_outcomes_locked()
    if looks_like_outcome_query(video_id):
        return [], "refused_outcome_query"
    polite_sleep()
    html = curl_text(f"https://www.youtube.com/watch?v={video_id}")
    desc = _short_description(html)
    del html
    urls = extract_deck_urls_from_text(desc)
    del desc
    return urls, "ok"


def _short_description(html: str) -> str:
    marker = '"shortDescription":"'
    i = html.find(marker)
    if i < 0:
        marker = '"shortDescription": "'
        i = html.find(marker)
    if i < 0:
        return ""
    i += len(marker)
    out = []
    esc = False
    for ch in html[i:]:
        if esc:
            mapping = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "/": "/", "r": "\r"}
            out.append(mapping.get(ch, ch))
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            break
        out.append(ch)
        if len(out) > 20000:
            break
    return "".join(out)
