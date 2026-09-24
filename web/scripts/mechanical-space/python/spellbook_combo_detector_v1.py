#!/usr/bin/env python3
"""
Deterministic Commander Spellbook exact-deck combo detector.

CARD_COMPLETE = every concrete `uses` card is present. Templates/prerequisites
are stored separately and do not complete a combo. No semantic substitution.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
MIRROR = MS / "commanderspellbook-full-mirror-v1"
OUT = MS / "commanderspellbook-exact-deck-detector-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
VERSION = "commanderspellbook-exact-deck-detector-v1"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def norm_name(name: str) -> str:
    s = (name or "").strip().lower()
    s = "".join(ch for ch in s if ch.isalnum())
    return s


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_mirror() -> tuple[list[dict], dict]:
    variants = []
    with (MIRROR / "variants.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                variants.append(json.loads(line))
    cards = []
    with (MIRROR / "cards.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                cards.append(json.loads(line))
    return variants, {"cards": cards, "manifest": load_json(MIRROR / "MANIFEST.json")}


def resolve_card(card: dict, name_to_oids: dict[str, set[str]]) -> dict:
    oid = (card.get("oracleId") or "").strip()
    name = card.get("name") or ""
    if oid:
        return {"oracleId": oid, "name": name, "status": "EXACT_RESOLVED", "source": "spellbook_oracle_id"}
    key = norm_name(name)
    hits = sorted(name_to_oids.get(key) or [])
    if len(hits) == 1:
        return {"oracleId": hits[0], "name": name, "status": "ALIAS_CANONICAL_RESOLVED", "source": "unique_normalized_name_in_mirror"}
    if len(hits) > 1:
        return {"oracleId": None, "name": name, "status": "AMBIGUOUS", "candidates": hits}
    return {"oracleId": None, "name": name, "status": "UNRESOLVED"}


def compile_variants(raw_variants: list[dict], name_to_oids: dict[str, set[str]]) -> tuple[list[dict], dict]:
    compiled = []
    card_stats = Counter()
    for v in raw_variants:
        uses = []
        unresolved = False
        ambiguous = False
        for u in v.get("uses") or []:
            card = u.get("card") or {}
            resolved = resolve_card(card, name_to_oids)
            card_stats[resolved["status"]] += 1
            if resolved["status"] == "UNRESOLVED":
                unresolved = True
            if resolved["status"] == "AMBIGUOUS":
                ambiguous = True
            uses.append(
                {
                    **resolved,
                    "quantity": int(u.get("quantity") or 1),
                    "zoneLocations": u.get("zoneLocations") or [],
                    "mustBeCommander": bool(u.get("mustBeCommander")),
                    "battlefieldCardState": u.get("battlefieldCardState") or "",
                    "graveyardCardState": u.get("graveyardCardState") or "",
                    "libraryCardState": u.get("libraryCardState") or "",
                    "exileCardState": u.get("exileCardState") or "",
                    "spellbookCardId": card.get("id"),
                }
            )
        oids = [u["oracleId"] for u in uses if u["oracleId"]]
        signature = "|".join(sorted(set(oids)))
        templates = []
        for r in v.get("requires") or []:
            tmpl = r.get("template") or {}
            templates.append(
                {
                    "templateId": tmpl.get("id"),
                    "name": tmpl.get("name"),
                    "scryfallQuery": tmpl.get("scryfallQuery"),
                    "quantity": r.get("quantity"),
                    "zoneLocations": r.get("zoneLocations") or [],
                    "mustBeCommander": bool(r.get("mustBeCommander")),
                }
            )
        produces = []
        for p in v.get("produces") or []:
            feat = p.get("feature") or {}
            produces.append({"featureId": feat.get("id"), "name": feat.get("name"), "quantity": p.get("quantity")})
        compiled.append(
            {
                "variantId": v.get("id"),
                "sourceComboIds": [x.get("id") for x in (v.get("of") or []) if x.get("id") is not None],
                "includesIds": [x.get("id") for x in (v.get("includes") or []) if x.get("id") is not None],
                "uses": uses,
                "requiredOracleIds": sorted(set(oids)),
                "cardSetSignature": signature,
                "comboCardCount": len(set(oids)),
                "templates": templates,
                "produces": produces,
                "easyPrerequisites": v.get("easyPrerequisites") or "",
                "notablePrerequisites": v.get("notablePrerequisites") or "",
                "description": v.get("description") or "",
                "manaNeeded": v.get("manaNeeded") or "",
                "manaValueNeeded": v.get("manaValueNeeded"),
                "identity": v.get("identity"),
                "status": v.get("status"),
                "legalities": v.get("legalities") or {},
                "unresolvedConcreteCard": unresolved,
                "ambiguousConcreteCard": ambiguous,
            }
        )
    return compiled, dict(card_stats)


def detect(deck_oids: set[str], commander_oids: set[str], compiled: list[dict], index=None) -> dict:
    present = set(deck_oids) | set(commander_oids)
    complete = []
    near = []
    if index is None:
        candidates = compiled
    else:
        seen = set()
        candidates = []
        for oid in present:
            for vi in index.get(oid, ()):
                if vi not in seen:
                    seen.add(vi)
                    candidates.append(compiled[vi])
    for v in candidates:
        req = v["requiredOracleIds"]
        if not req or v["unresolvedConcreteCard"] or v["ambiguousConcreteCard"]:
            continue
        missing = [oid for oid in req if oid not in present]
        if not missing:
            commander_involved = any(oid in commander_oids for oid in req) or any(u.get("mustBeCommander") and u.get("oracleId") in present for u in v["uses"])
            complete.append(
                {
                    "variantId": v["variantId"],
                    "sourceComboIds": v["sourceComboIds"],
                    "cardSetSignature": v["cardSetSignature"],
                    "comboCardCount": v["comboCardCount"],
                    "commanderInvolved": commander_involved,
                    "produces": v["produces"],
                    "templates": v["templates"],
                    "easyPrerequisites": v["easyPrerequisites"],
                    "notablePrerequisites": v["notablePrerequisites"],
                    "manaNeeded": v["manaNeeded"],
                    "manaValueNeeded": v["manaValueNeeded"],
                    "zoneRequirements": [u["zoneLocations"] for u in v["uses"]],
                    "status": "CARD_COMPLETE",
                    "executableFromCurrentGameState": False,
                }
            )
        elif len(missing) == 1:
            near.append({"variantId": v["variantId"], "missingOracleId": missing[0], "comboCardCount": v["comboCardCount"]})
    sizes = [c["comboCardCount"] for c in complete]
    produce_ids = [p["featureId"] for c in complete for p in c["produces"] if p.get("featureId") is not None]
    card_hits = Counter()
    for c in complete:
        for oid in c["cardSetSignature"].split("|") if c["cardSetSignature"] else []:
            card_hits[oid] += 1
    shared = {oid: n for oid, n in card_hits.items() if n > 1}
    return {
        "completeVariantIds": [c["variantId"] for c in complete],
        "complete": complete,
        "sourceComboIds": sorted({i for c in complete for i in c["sourceComboIds"]}),
        "cardSetSignatures": sorted({c["cardSetSignature"] for c in complete}),
        "nCompleteVariants": len(complete),
        "nDistinctSourceCombos": len({i for c in complete for i in c["sourceComboIds"]}),
        "nDistinctCardSetSignatures": len({c["cardSetSignature"] for c in complete}),
        "minComboSize": min(sizes) if sizes else None,
        "comboCardCounts": sizes,
        "nCommanderInvolved": sum(1 for c in complete if c["commanderInvolved"]),
        "commanderInvolved": any(c["commanderInvolved"] for c in complete),
        "produceFeatureIds": produce_ids,
        "sharedPieceCounts": shared,
        "nearMissingExactlyOne": near,
        "nNearMissingExactlyOne": len(near),
    }


def build_rare_index(compiled: list[dict]) -> dict[str, list[int]]:
    freq: Counter = Counter()
    for v in compiled:
        for oid in v["requiredOracleIds"]:
            freq[oid] += 1
    index: dict[str, list[int]] = defaultdict(list)
    for i, v in enumerate(compiled):
        req = v["requiredOracleIds"]
        if not req:
            continue
        rare = min(req, key=lambda o: (freq[o], o))
        index[rare].append(i)
        for oid in req:
            if oid != rare:
                index[oid].append(i)
    return dict(index)


def fingerprint(deck: dict, compiled: list[dict], index=None) -> dict | None:
    cmd = [str(x) for x in (deck.get("commanderOracleIds") or []) if x]
    mb = []
    for card in deck.get("mainboard") or []:
        oid = card.get("oracleId") or card.get("oracle_id")
        if oid:
            mb.append(str(oid))
    if (deck.get("commanderResolutionStatus") or "") != "resolved" or not cmd:
        return None
    if len(mb) < 90:
        return None
    if any(not (c.get("oracleId") or c.get("oracle_id")) for c in (deck.get("mainboard") or [])):
        return None
    det = detect(set(mb) | set(cmd), set(cmd), compiled, index)
    return {
        "deckInstanceId": deck.get("deckInstanceId"),
        "tid": deck.get("tid"),
        "nMainboardResolved": len(mb),
        "nCommander": len(cmd),
        **{k: det[k] for k in det if k != "complete"},
        "completeVariantIds": det["completeVariantIds"],
        "completeSummaries": [
            {
                "variantId": c["variantId"],
                "sourceComboIds": c["sourceComboIds"],
                "cardSetSignature": c["cardSetSignature"],
                "comboCardCount": c["comboCardCount"],
                "commanderInvolved": c["commanderInvolved"],
                "produceFeatureIds": [p["featureId"] for p in c["produces"]],
                "manaNeeded": c["manaNeeded"],
                "nTemplates": len(c["templates"]),
            }
            for c in det["complete"]
        ],
        "nNearMissingExactlyOne": det["nNearMissingExactlyOne"],
    }


def run_fixtures(compiled: list[dict]) -> dict:
    by_id = {v["variantId"]: v for v in compiled}
    hull = next((v for v in compiled if "Hullbreaker" in json.dumps(v.get("uses")) and any((u.get("name") or "").startswith("Sol Ring") for u in v["uses"])), None)
    commander_v = next((v for v in compiled if any(u.get("mustBeCommander") for u in v["uses"]) and v["comboCardCount"] >= 2 and not v["unresolvedConcreteCard"]), None)
    three = next((v for v in compiled if v["comboCardCount"] == 3 and not v["unresolvedConcreteCard"] and not v["templates"]), None)
    if three is None:
        three = next((v for v in compiled if v["comboCardCount"] == 3 and not v["unresolvedConcreteCard"]), None)
    results = []

    def add(name, deck, commander, expect_complete, expect_near=None):
        det = detect(set(deck), set(commander), compiled)
        ok = (len(det["complete"]) >= 1) is expect_complete if isinstance(expect_complete, bool) else expect_complete(det)
        row = {"name": name, "pass": bool(ok), "nComplete": det["nCompleteVariants"], "nNear": det["nNearMissingExactlyOne"], "completeIds": det["completeVariantIds"][:8]}
        if expect_near is not None:
            row["nearOk"] = (det["nNearMissingExactlyOne"] >= 1) is expect_near
            row["pass"] = row["pass"] and row["nearOk"]
        results.append(row)
        return det

    if hull:
        oids = hull["requiredOracleIds"]
        det_h = detect(set(oids), set(), compiled)
        results.append(
            {
                "name": "two_card_hullbreaker_sol_ring",
                "pass": hull["variantId"] in det_h["completeVariantIds"],
                "nComplete": det_h["nCompleteVariants"],
                "target": hull["variantId"],
            }
        )
        one = oids[:1]
        det_n = detect(set(one), set(), compiled)
        results.append(
            {
                "name": "one_card_away_and_false_positive_control",
                "pass": hull["variantId"] not in det_n["completeVariantIds"]
                and any(n["variantId"] == hull["variantId"] for n in det_n["nearMissingExactlyOne"]),
                "nComplete": det_n["nCompleteVariants"],
                "nNear": det_n["nNearMissingExactlyOne"],
                "target": hull["variantId"],
            }
        )
    if commander_v:
        oids = commander_v["requiredOracleIds"]
        cmd = [u["oracleId"] for u in commander_v["uses"] if u.get("mustBeCommander") and u.get("oracleId")]
        add("commander_involved", oids, cmd or oids[:1], True)
    if three:
        add("three_card", three["requiredOracleIds"], [], True)
    # overlapping: a deck with two variants sharing a card
    shared = None
    for a in compiled:
        if a["comboCardCount"] != 2 or a["unresolvedConcreteCard"]:
            continue
        sa = set(a["requiredOracleIds"])
        for b in compiled:
            if a is b or b["comboCardCount"] != 2 or b["unresolvedConcreteCard"]:
                continue
            sb = set(b["requiredOracleIds"])
            if sa & sb and sa != sb:
                shared = (a, b)
                break
        if shared:
            break
    if shared:
        a, b = shared
        det = add("overlapping_variants", a["requiredOracleIds"] + b["requiredOracleIds"], [], True)
        results[-1]["nComplete"] = det["nCompleteVariants"]
        results[-1]["pass"] = det["nCompleteVariants"] >= 2

    # control: empty / unrelated
    add("false_positive_empty", [], [], False)
    return {"fixtures": results, "allPass": all(r["pass"] for r in results), "n": len(results)}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw_variants, aux = load_mirror()
    name_to_oids: dict[str, set[str]] = defaultdict(set)
    for c in aux["cards"]:
        if c.get("oracleId") and c.get("name"):
            name_to_oids[norm_name(c["name"])].add(c["oracleId"])
    compiled, card_stats = compile_variants(raw_variants, name_to_oids)
    index = build_rare_index(compiled)
    n_unresolved_cards = sum(1 for c in aux["cards"] if not (c.get("oracleId") or "").strip())
    n_exact = sum(1 for c in aux["cards"] if (c.get("oracleId") or "").strip())
    write_json(OUT / "compiled-variant-index-meta.json", {"nVariants": len(compiled), "useCardResolution": card_stats, "nCardsExactOracleId": n_exact, "nCardsMissingOracleId": n_unresolved_cards})
    fixtures = run_fixtures(compiled)
    write_json(OUT / "FIXTURES.json", fixtures)
    if not fixtures["allPass"]:
        raise SystemExit(f"detector fixture failure: {fixtures}")

    prints = []
    produce = Counter()
    combo_n = Counter()
    min_size = Counter()
    n_with = 0
    n_cmd = 0
    n_near = 0
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            fp = fingerprint(deck, compiled, index)
            if fp is None:
                continue
            prints.append(fp)
            combo_n[fp["nCompleteVariants"]] += 1
            if fp["nCompleteVariants"] > 0:
                n_with += 1
                if fp["minComboSize"] is not None:
                    min_size[fp["minComboSize"]] += 1
            if fp["commanderInvolved"]:
                n_cmd += 1
            n_near += fp["nNearMissingExactlyOne"]
            produce.update(fp.get("produceFeatureIds") or [])
        print(f"    fingerprint {path.parent.name} n={len(prints)}", flush=True)

    # keep fingerprints compact
    (OUT / "topdeck-fingerprints.jsonl").write_text("\n".join(json.dumps(p, ensure_ascii=False) for p in prints) + "\n", encoding="utf-8")
    detector_src = Path(__file__).read_text(encoding="utf-8")
    report = {
        "artifactType": "CommanderSpellbookExactDeckDetectorV1",
        "detectorVersion": VERSION,
        "mirrorSha": aux["manifest"].get("variantsFileSha256"),
        "detectorSha": sha256_text(detector_src),
        "nMirrorVariants": len(compiled),
        "nSourceComboGroups": aux["manifest"]["counts"].get("sourceComboGroupIds"),
        "nMirrorCards": len(aux["cards"]),
        "oracleIdCoverage": {"exactOnCard": n_exact, "missingOnCard": n_unresolved_cards, "useResolution": card_stats},
        "fixtures": fixtures,
        "nExactTopDeckListsFingerprinted": len(prints),
        "completeCombosPerDeck": {str(k): combo_n[k] for k in sorted(combo_n)},
        "minComboSizeAmongDecksWithAtLeastOne": {str(k): min_size[k] for k in sorted(min_size)},
        "fractionAtLeastOneComplete": (n_with / len(prints)) if prints else None,
        "fractionCommanderInvolved": (n_cmd / len(prints)) if prints else None,
        "mostCommonProduceFeatureIds": produce.most_common(20),
        "nNearMissingExactlyOneTotal": n_near,
        "nearCombosExcludedFromPrimaryFingerprintCounts": True,
        "outcomesJoined": False,
        "professorChanged": False,
    }
    write_json(OUT / "REPORT.json", report)
    print(json.dumps({k: report[k] for k in report if k not in ("completeCombosPerDeck",)}, indent=2)[:4000])
    print("fingerprinted", len(prints), "frac>=1", report["fractionAtLeastOneComplete"])


if __name__ == "__main__":
    main()
