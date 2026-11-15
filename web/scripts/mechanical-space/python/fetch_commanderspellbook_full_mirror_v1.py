#!/usr/bin/env python3
"""Full local Commander Spellbook /variants/ mirror. No 400-row cap. No Firestore write."""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from pathlib import Path

API = "https://backend.commanderspellbook.com"
PAGE = 100
UA = "cards-mechanical-space-local-research/1.0"
WEB = Path(__file__).resolve().parents[3]
OUT = WEB / "data" / "milestones" / "mechanical-space" / "commanderspellbook-full-mirror-v1"
SLEEP = 0.25
IMAGE_KEYS = {
    "imageUriBackPng",
    "imageUriFrontPng",
    "imageUriBackLarge",
    "imageUriBackSmall",
    "imageUriBackNormal",
    "imageUriFrontLarge",
    "imageUriFrontSmall",
    "imageUriFrontNormal",
    "imageUriBackArtCrop",
    "imageUriFrontArtCrop",
    "layoutRotationFront",
}


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def get_json(url: str) -> dict:
    delay = 15.0
    for attempt in range(8):
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                version = resp.headers.get("X-API-Version") or resp.headers.get("X-Spellbook-Version") or ""
                raw = resp.read()
                obj = json.loads(raw.decode())
                obj["_http_version_header"] = version
                obj["_raw_sha256"] = sha256_bytes(raw)
                obj["_server"] = resp.headers.get("Server", "")
                return obj
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 7:
                raise
            print(f"    429 on {url}; sleep {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 180)
    raise RuntimeError(f"failed {url}")


def slim_card(card: dict) -> dict:
    out = {k: v for k, v in card.items() if k not in IMAGE_KEYS}
    return out


def slim_variant(v: dict) -> dict:
    uses = []
    for u in v.get("uses") or []:
        rec = dict(u)
        if isinstance(rec.get("card"), dict):
            rec["card"] = slim_card(rec["card"])
        uses.append(rec)
    return {
        "id": v.get("id"),
        "of": v.get("of") or [],
        "includes": v.get("includes") or [],
        "uses": uses,
        "requires": v.get("requires") or [],
        "produces": v.get("produces") or [],
        "notes": v.get("notes"),
        "status": v.get("status"),
        "spoiler": v.get("spoiler"),
        "identity": v.get("identity"),
        "legalities": v.get("legalities"),
        "bracketTag": v.get("bracketTag"),
        "description": v.get("description"),
        "manaNeeded": v.get("manaNeeded"),
        "manaValueNeeded": v.get("manaValueNeeded"),
        "easyPrerequisites": v.get("easyPrerequisites"),
        "notablePrerequisites": v.get("notablePrerequisites"),
        "variantCount": v.get("variantCount"),
        "popularity": v.get("popularity"),
    }


def paginate(path: str) -> tuple[list, list, str]:
    items = []
    page_sums = []
    version = ""
    url = f"{API}{path}{'&' if '?' in path else '?'}limit={PAGE}"
    page_i = 0
    while url:
        page_i += 1
        obj = get_json(url)
        version = version or obj.get("_http_version_header") or ""
        rows = obj.get("results") or []
        ids = [str(r.get("id")) for r in rows]
        page_sums.append({"page": page_i, "n": len(rows), "idsSha256": sha256_bytes(",".join(ids).encode()), "rawSha256": obj["_raw_sha256"]})
        items.extend(rows)
        url = obj.get("next")
        print(f"    {path} page {page_i} +{len(rows)} total={len(items)}", flush=True)
        time.sleep(SLEEP)
    return items, page_sums, version


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print("  fetch /features/", flush=True)
    features, feat_pages, ver_f = paginate("/features/")
    print("  fetch /templates/", flush=True)
    try:
        templates, tmpl_pages, ver_t = paginate("/templates/")
    except Exception as exc:
        print(f"  templates failed: {exc}", flush=True)
        templates, tmpl_pages, ver_t = [], [], ""
    print("  fetch /cards/", flush=True)
    cards, card_pages, ver_c = paginate("/cards/")
    print("  fetch /variants/ (no cap)", flush=True)
    variants_raw, var_pages, ver_v = paginate("/variants/")
    variants = [slim_variant(v) for v in variants_raw]
    cards_slim = [slim_card(c) for c in cards]

    (OUT / "features.json").write_text(json.dumps(features, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "templates.json").write_text(json.dumps(templates, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "cards.jsonl").write_text("\n".join(json.dumps(c, ensure_ascii=False) for c in cards_slim) + "\n", encoding="utf-8")
    (OUT / "variants.jsonl").write_text("\n".join(json.dumps(v, ensure_ascii=False) for v in variants) + "\n", encoding="utf-8")

    of_ids = sorted({int(x["id"]) for v in variants for x in (v.get("of") or []) if x.get("id") is not None})
    unique_cards = {(c.get("id"), c.get("oracleId"), c.get("name")) for c in cards_slim}
    schema = sorted({k for v in variants[:50] for k in v.keys()})
    manifest = {
        "artifactType": "CommanderSpellbookFullMirrorV1",
        "sourceUrl": API,
        "apiVersionObserved": ver_v or ver_c or ver_f or ver_t or "6.2.5-from-html",
        "htmlTitleVersion": "6.2.5",
        "fetchedAt": fetched_at,
        "paginationExhausted": True,
        "prior400SampleNotUsed": True,
        "counts": {
            "features": len(features),
            "templates": len(templates),
            "cards": len(cards_slim),
            "variants": len(variants),
            "sourceComboGroupIds": len(of_ids),
            "uniqueCardTuples": len(unique_cards),
        },
        "pageChecksums": {"features": feat_pages, "templates": tmpl_pages, "cards": card_pages, "variants": var_pages},
        "schemaKeys": schema,
        "files": {
            "features": "features.json",
            "templates": "templates.json",
            "cards": "cards.jsonl",
            "variants": "variants.jsonl",
        },
        "notes": [
            "Image CDN URIs stripped from card objects; all combo-relevant source fields retained.",
            "count field on API list endpoints is null; exhaustion is next==null.",
        ],
    }
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    manifest["manifestSha256"] = sha256_bytes(raw)
    manifest["variantsFileSha256"] = sha256_bytes((OUT / "variants.jsonl").read_bytes())
    manifest["cardsFileSha256"] = sha256_bytes((OUT / "cards.jsonl").read_bytes())
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest["counts"], indent=2))
    print("variantsFileSha256", manifest["variantsFileSha256"])


if __name__ == "__main__":
    main()
