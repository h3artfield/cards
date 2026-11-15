#!/usr/bin/env python3
"""
SPELLBOOK_WIN_ARCHITECTURE_SPACE_V1

Outcome-blind representation freeze. No TopDeck winners. No Professor change.
Does not touch CMMG C1/C2, reserve, accumulator, or MG gates.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from freeze_cmmg_v1_dataset_protocol import commander_identity
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
MIRROR = MS / "commanderspellbook-full-mirror-v1"
DET = MS / "commanderspellbook-exact-deck-detector-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HIST = MS / "historical-commander-meta-geometry-v1"
OUT = MS / "spellbook-win-architecture-space-v1"
LINEAGE = "SPELLBOOK_WIN_ARCHITECTURE_SPACE_V1"
MIN_CMD_LISTS = 50


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def classify_feature(name: str, status: str) -> dict:
    n = (name or "").strip()
    nl = n.lower()
    if (status or "") == "PU" or nl.startswith(
        (
            "card ",
            "cards ",
            "card that",
            "cards that",
            "creature with",
            "creature that",
            "permanent with",
            "permanent allowing",
            "permanent that",
            "animator -",
            "doubler -",
            "increaser -",
            "artifact that",
            "artifact type",
            "aura ",
            "aura or",
        )
    ):
        return {"class": "COMPONENT_OR_TEMPLATE", "bucket": None}

    if re.search(r"\bwin the game\b", nl):
        return {"class": "TERMINAL", "bucket": "WIN_THE_GAME"}
    if nl == "draw the game":
        return {"class": "TERMINAL", "bucket": "DRAW_THE_GAME"}
    if re.search(r"lose[s]? the game", nl):
        if any(x in nl for x in ("can't lose", "unable to lose", "don't lose", "do not lose", "unless an opponent")):
            return {"class": "UNCLASSIFIED", "bucket": None}
        return {"class": "TERMINAL", "bucket": "OPPONENT_LOSES_THE_GAME"}
    if re.search(r"\b(near-)?infinite mill\b", nl) and "self-mill" not in nl:
        return {"class": "TERMINAL", "bucket": "INFINITE_MILL"}
    if any(
        x in nl
        for x in (
            "exile each opponent's library",
            "exile all libraries",
            "exile target opponent's library",
            "exile your opponents' library",
        )
    ):
        return {"class": "TERMINAL", "bucket": "EXILE_LIBRARIES"}
    if "life total becomes 1" in nl or "set all life totals to 1" in nl:
        return {"class": "TERMINAL", "bucket": "LIFE_TOTAL_MANIPULATION"}
    if "lethal damage to opponents" in nl:
        return {"class": "TERMINAL", "bucket": "INFINITE_DAMAGE"}
    if "draw from an empty library and lose the game" in nl:
        return {"class": "TERMINAL", "bucket": "OPPONENT_LOSES_THE_GAME"}
    if re.search(r"(near-)?infinite lifeloss", nl):
        return {"class": "TERMINAL", "bucket": "INFINITE_LIFELOSS"}
    if re.search(r"(near-)?infinite (combat )?damage", nl):
        creature_only = bool(re.search(r"to (all |most |some )?creatures", nl)) and not re.search(
            r"opponent|all players|one opponent|target player|to you", nl
        )
        to_you_only = "to you" in nl and "opponent" not in nl and "player" not in nl
        if creature_only or to_you_only:
            return {"class": "UNCLASSIFIED", "bucket": None}
        return {"class": "TERMINAL", "bucket": "INFINITE_DAMAGE"}

    if re.search(r"(near-)?infinite", nl) or re.search(r"\binfinite\b", nl):
        if re.search(r"\bmana\b", nl):
            return {"class": "ENABLING", "bucket": "MANA"}
        if "card draw" in nl or "draw trigger" in nl:
            return {"class": "ENABLING", "bucket": "DRAW"}
        if "token" in nl:
            return {"class": "ENABLING", "bucket": "TOKENS"}
        if re.search(r"\betb\b", nl):
            return {"class": "ENABLING", "bucket": "ETB"}
        if re.search(r"\bltb\b", nl) or "death trigger" in nl:
            return {"class": "ENABLING", "bucket": "LTB"}
        if "proliferate" in nl or "counter" in nl:
            return {"class": "ENABLING", "bucket": "COUNTERS"}
        if "storm" in nl:
            return {"class": "ENABLING", "bucket": "STORM"}
        if "untap" in nl:
            return {"class": "ENABLING", "bucket": "UNTAP"}
        if "self-mill" in nl:
            return {"class": "ENABLING", "bucket": "SELF_MILL"}
        if "cast" in nl:
            return {"class": "ENABLING", "bucket": "CASTS"}
        if "landfall" in nl:
            return {"class": "ENABLING", "bucket": "LANDFALL"}
        if "magecraft" in nl:
            return {"class": "ENABLING", "bucket": "MAGECRAFT"}
        if "sacrific" in nl:
            return {"class": "ENABLING", "bucket": "SACRIFICE"}
        return {"class": "ENABLING", "bucket": "OTHER_ENABLING"}
    return {"class": "UNCLASSIFIED", "bucket": None}


def entropy(counts: list[int]) -> float:
    n = sum(counts)
    if n <= 0:
        return 0.0
    return -sum((c / n) * math.log(c / n, 2) for c in counts if c > 0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    features = load_json(MIRROR / "features.json")
    taxonomy = []
    by_id = {}
    class_n = Counter()
    for f in features:
        rec = classify_feature(f.get("name") or "", f.get("status") or "")
        row = {"featureId": f["id"], "name": f.get("name"), "status": f.get("status"), **rec}
        taxonomy.append(row)
        by_id[int(f["id"])] = row
        class_n[rec["class"]] += 1
    write_json(
        OUT / "FEATURE_TAXONOMY.json",
        {
            "rule": "Deterministic regex on CommanderSpellbook feature names only. No LLM categories.",
            "classes": ["TERMINAL", "ENABLING", "COMPONENT_OR_TEMPLATE", "UNCLASSIFIED"],
            "counts": dict(class_n),
            "features": taxonomy,
        },
    )

    print("  compile combo dictionary from mirror", flush=True)
    combo: dict[str, dict] = {}
    n_var = 0
    produce_seen = set()
    with (MIRROR / "variants.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            v = json.loads(line)
            n_var += 1
            oids = []
            zones = Counter()
            for u in v.get("uses") or []:
                card = u.get("card") or {}
                oid = (card.get("oracleId") or "").strip()
                if oid:
                    oids.append(oid)
                for z in u.get("zoneLocations") or []:
                    zones[str(z)] += 1
            sig = "|".join(sorted(set(oids)))
            if not sig:
                continue
            produces = []
            for p in v.get("produces") or []:
                fid = (p.get("feature") or {}).get("id")
                if fid is not None:
                    produces.append(int(fid))
                    produce_seen.add(int(fid))
            templates = [(r.get("template") or {}).get("id") for r in (v.get("requires") or [])]
            rec = combo.setdefault(
                sig,
                {
                    "cardSetSignature": sig,
                    "comboCardCount": len(set(oids)),
                    "variantIds": [],
                    "sourceComboIds": set(),
                    "produceFeatureIds": set(),
                    "templateIds": set(),
                    "manaNeededValues": set(),
                    "manaValueNeeded": set(),
                    "zoneLocations": Counter(),
                    "hasEasyPrereq": False,
                    "hasNotablePrereq": False,
                },
            )
            rec["variantIds"].append(v.get("id"))
            rec["sourceComboIds"].update(x.get("id") for x in (v.get("of") or []) if x.get("id") is not None)
            rec["produceFeatureIds"].update(produces)
            rec["templateIds"].update(t for t in templates if t is not None)
            if v.get("manaNeeded"):
                rec["manaNeededValues"].add(str(v.get("manaNeeded")))
            if v.get("manaValueNeeded") is not None:
                rec["manaValueNeeded"].add(v.get("manaValueNeeded"))
            rec["zoneLocations"].update(zones)
            rec["hasEasyPrereq"] = rec["hasEasyPrereq"] or bool(v.get("easyPrerequisites"))
            rec["hasNotablePrereq"] = rec["hasNotablePrereq"] or bool(v.get("notablePrerequisites"))

    combo_rows = []
    for sig, rec in combo.items():
        pids = sorted(rec["produceFeatureIds"])
        tclass = Counter(by_id[i]["class"] for i in pids if i in by_id)
        tbuck = sorted({by_id[i]["bucket"] for i in pids if i in by_id and by_id[i]["class"] == "TERMINAL" and by_id[i]["bucket"]})
        ebuck = sorted({by_id[i]["bucket"] for i in pids if i in by_id and by_id[i]["class"] == "ENABLING" and by_id[i]["bucket"]})
        combo_rows.append(
            {
                "cardSetSignature": sig,
                "comboCardCount": rec["comboCardCount"],
                "nNativeVariants": len(rec["variantIds"]),
                "variantIds": rec["variantIds"],
                "sourceComboIds": sorted(rec["sourceComboIds"]),
                "produceFeatureIds": pids,
                "terminalFeatureIds": [i for i in pids if i in by_id and by_id[i]["class"] == "TERMINAL"],
                "enablingFeatureIds": [i for i in pids if i in by_id and by_id[i]["class"] == "ENABLING"],
                "unclassifiedProduceIds": [i for i in pids if i in by_id and by_id[i]["class"] == "UNCLASSIFIED"],
                "terminalBuckets": tbuck,
                "enablingBuckets": ebuck,
                "isTerminalRoute": tclass["TERMINAL"] > 0,
                "isResourceOnlyLoop": tclass["TERMINAL"] == 0 and tclass["ENABLING"] > 0,
                "templateIds": sorted(rec["templateIds"]),
                "nTemplates": len(rec["templateIds"]),
                "manaNeededValues": sorted(rec["manaNeededValues"]),
                "manaValueNeeded": sorted(rec["manaValueNeeded"], key=lambda x: (isinstance(x, str), str(x))),
                "zoneLocations": dict(rec["zoneLocations"]),
                "hasEasyPrereq": rec["hasEasyPrereq"],
                "hasNotablePrereq": rec["hasNotablePrereq"],
            }
        )
    combo_rows.sort(key=lambda r: (-r["nNativeVariants"], r["cardSetSignature"]))
    (OUT / "normalized-combo-dictionary.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in combo_rows) + "\n", encoding="utf-8"
    )
    combo_index = {r["cardSetSignature"]: r for r in combo_rows}
    print(f"    variants={n_var} uniqueCardSets={len(combo_rows)}", flush=True)

    print("  index commander identities (no winners)", flush=True)
    cmd_of: dict[str, str] = {}
    names: dict[str, str] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did or (deck.get("commanderResolutionStatus") or "") != "resolved":
                continue
            ident = commander_identity(list(deck.get("commanderOracleIds") or []))
            if not ident:
                continue
            cmd_of[did] = ident
            if ident not in names:
                parts = []
                for c in deck.get("commanders") or []:
                    if isinstance(c, dict):
                        nm = (c.get("canonicalOracleName") or c.get("sourceName") or "").strip()
                        if nm:
                            parts.append(nm)
                if parts:
                    names[ident] = " / ".join(parts)

    print("  stream 72482 fingerprints to architecture", flush=True)
    cov = Counter()
    min_size = Counter()
    term_routes = Counter()
    res_loops = Counter()
    cmd_frac_bin = Counter()
    prereq = Counter()
    motif_n = Counter()
    motif_cmds: dict[str, set[str]] = defaultdict(set)
    term_pkg_n = Counter()
    term_pkg_cmds: dict[str, set[str]] = defaultdict(set)
    per_cmd = defaultdict(lambda: {"n": 0, "withCombo": 0, "nCombos": [], "motifs": Counter(), "termPkgs": Counter()})
    n_decks = 0
    n_zero = n_ge1 = n_ge2 = n_ge5 = n_ge10 = 0
    n_cmd_inv = 0
    n_term = 0
    n_res = 0
    shared_cards = []
    out_fp = (OUT / "architecture-fingerprints.jsonl").open("w", encoding="utf-8")

    with (DET / "topdeck-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            raw = json.loads(line)
            n_decks += 1
            sigs = []
            seen = set()
            for s in raw.get("completeSummaries") or []:
                sig = s.get("cardSetSignature") or ""
                if not sig or sig in seen:
                    continue
                seen.add(sig)
                sigs.append(sig)
            n2 = n3 = n4 = 0
            n_cmd = 0
            cmd_sizes = []
            term_ids = set()
            enab_ids = set()
            t_buck = set()
            e_buck = set()
            n_term_r = 0
            n_res_r = 0
            n_prereq = 0
            n_mana = 0
            zones = Counter()
            card_hits = Counter()
            min_c = None
            min_cmd = None
            for sig in sigs:
                d = combo_index.get(sig)
                if d is None:
                    continue
                k = d["comboCardCount"]
                min_c = k if min_c is None else min(min_c, k)
                if k == 2:
                    n2 += 1
                elif k == 3:
                    n3 += 1
                elif k >= 4:
                    n4 += 1
                involved = any(x.get("cardSetSignature") == sig and x.get("commanderInvolved") for x in (raw.get("completeSummaries") or []))
                if involved:
                    n_cmd += 1
                    cmd_sizes.append(k)
                    min_cmd = k if min_cmd is None else min(min_cmd, k)
                term_ids.update(d["terminalFeatureIds"])
                enab_ids.update(d["enablingFeatureIds"])
                t_buck.update(d["terminalBuckets"])
                e_buck.update(d["enablingBuckets"])
                if d["isTerminalRoute"]:
                    n_term_r += 1
                if d["isResourceOnlyLoop"]:
                    n_res_r += 1
                if d["hasEasyPrereq"] or d["hasNotablePrereq"] or d["nTemplates"] > 0:
                    n_prereq += 1
                if d["manaNeededValues"] or any(x not in (0, 0.0, None) for x in d["manaValueNeeded"]):
                    n_mana += 1
                zones.update(d["zoneLocations"])
                for oid in sig.split("|"):
                    card_hits[oid] += 1
            n_set = len(sigs)
            frac_cmd = (n_cmd / n_set) if n_set else 0.0
            if n_set == 0:
                cmd_mode = "NONE"
            elif n_cmd == 0:
                cmd_mode = "COMMANDER_INDEPENDENT"
            elif n_cmd == n_set:
                cmd_mode = "COMMANDER_DEPENDENT"
            else:
                cmd_mode = "MIXED"
            motif = "|".join(
                [
                    ",".join(sorted(t_buck)) or "NO_TERMINAL",
                    ",".join(sorted(e_buck)) or "NO_ENABLING",
                    f"min{min_c if min_c is not None else 0}",
                    cmd_mode,
                ]
            )
            term_pkg = ",".join(sorted(t_buck)) if t_buck else "NO_TERMINAL"
            shared_n = sum(1 for c in card_hits.values() if c > 1)
            top_share = max(card_hits.values()) / n_set if n_set and card_hits else 0.0
            ident = cmd_of.get(str(raw.get("deckInstanceId") or ""))
            fp = {
                "deckInstanceId": raw.get("deckInstanceId"),
                "commanderIdentity": ident,
                "nNativeVariants": raw.get("nCompleteVariants") or 0,
                "nNormalizedCombos": n_set,
                "minComboCardCount": min_c,
                "nTwoCard": n2,
                "nThreeCard": n3,
                "nFourPlusCard": n4,
                "nCommanderInvolved": n_cmd,
                "fractionCommanderInvolved": frac_cmd,
                "minCommanderInvolvedSize": min_cmd,
                "commanderDependence": cmd_mode,
                "terminalFeatureIds": sorted(term_ids),
                "enablingFeatureIds": sorted(enab_ids),
                "terminalBuckets": sorted(t_buck),
                "enablingBuckets": sorted(e_buck),
                "nTerminalRoutes": n_term_r,
                "nResourceOnlyLoops": n_res_r,
                "nCardsInMultipleComboSets": shared_n,
                "sharedPieceConcentration": top_share,
                "nCombosWithPrereqOrTemplate": n_prereq,
                "nCombosWithManaNeeded": n_mana,
                "zoneProfile": dict(zones),
                "nNearMissingExactlyOne": raw.get("nNearMissingExactlyOne") or 0,
                "architectureMotif": motif,
                "terminalPackage": term_pkg,
            }
            out_fp.write(json.dumps(fp, ensure_ascii=False) + "\n")

            cov[n_set] += 1
            if min_c is not None:
                min_size[min_c] += 1
            term_routes[n_term_r] += 1
            res_loops[n_res_r] += 1
            if n_set == 0:
                n_zero += 1
                cmd_frac_bin["no_complete"] += 1
            else:
                n_ge1 += 1
                if n_set >= 2:
                    n_ge2 += 1
                if n_set >= 5:
                    n_ge5 += 1
                if n_set >= 10:
                    n_ge10 += 1
                if n_cmd:
                    n_cmd_inv += 1
                cmd_frac_bin[cmd_mode] += 1
            if n_term_r:
                n_term += 1
            if n_res_r:
                n_res += 1
            prereq[n_prereq] += 1
            shared_cards.append(shared_n)
            motif_n[motif] += 1
            term_pkg_n[term_pkg] += 1
            if ident:
                motif_cmds[motif].add(ident)
                term_pkg_cmds[term_pkg].add(ident)
                rec = per_cmd[ident]
                rec["n"] += 1
                rec["nCombos"].append(n_set)
                rec["motifs"][motif] += 1
                rec["termPkgs"][term_pkg] += 1
                if n_set:
                    rec["withCombo"] += 1
            if n_decks % 10000 == 0:
                print(f"    decks {n_decks}", flush=True)
    out_fp.close()
    if n_decks != 72482:
        raise SystemExit(f"expected 72482 fingerprints, got {n_decks}")

    het = []
    for ident, rec in per_cmd.items():
        if rec["n"] < MIN_CMD_LISTS:
            continue
        xs = sorted(rec["nCombos"])
        mid = xs[len(xs) // 2]
        modal_m, modal_c = rec["motifs"].most_common(1)[0]
        modal_t, modal_tc = rec["termPkgs"].most_common(1)[0]
        share = modal_c / rec["n"]
        n_m = sum(1 for c in rec["motifs"].values() if c / rec["n"] >= 0.10)
        het.append(
            {
                "commanderIdentity": ident,
                "name": names.get(ident, ident[:16]),
                "nLists": rec["n"],
                "fractionAtLeastOneComplete": rec["withCombo"] / rec["n"],
                "medianNormalizedCombos": mid,
                "nDistinctMotifs": len(rec["motifs"]),
                "motifEntropyBits": entropy(list(rec["motifs"].values())),
                "modalMotifShare": share,
                "nMotifsAtLeast10pct": n_m,
                "modalTerminalPackage": modal_t,
                "modalTerminalPackageShare": modal_tc / rec["n"],
                "materiallySplit": share < 0.60 and n_m >= 2,
            }
        )
    het.sort(key=lambda r: (not r["materiallySplit"], -r["motifEntropyBits"], -r["nLists"]))
    write_json(OUT / "commander-coverage-heterogeneity.json", {"minLists": MIN_CMD_LISTS, "nCommanders": len(het), "commanders": het})

    motifs = []
    for key, n in motif_n.most_common():
        motifs.append({"motif": key, "nDecks": n, "nCommanders": len(motif_cmds[key])})
    pkgs = []
    for key, n in term_pkg_n.most_common():
        pkgs.append({"terminalPackage": key, "nDecks": n, "nCommanders": len(term_pkg_cmds[key])})
    write_json(
        OUT / "architecture-motifs.json",
        {
            "rule": "Motif = terminalBuckets + enablingBuckets + minComboSize + commanderDependence. Not a fitted cluster model.",
            "nDistinctMotifs": len(motifs),
            "nMotifsUsedByAtLeastTwoCommanders": sum(1 for m in motifs if m["nCommanders"] >= 2),
            "nMotifsWithAtLeast50Decks": sum(1 for m in motifs if m["nDecks"] >= 50),
            "topMotifs": motifs[:40],
            "topTerminalPackages": pkgs[:30],
        },
    )

    unclassified_prod = [by_id[i] for i in sorted(produce_seen) if i in by_id and by_id[i]["class"] == "UNCLASSIFIED"]
    produced_class = Counter(by_id[i]["class"] for i in produce_seen if i in by_id)
    shared_cards.sort()
    report = {
        "artifactType": "SpellbookWinArchitectureSpaceV1",
        "lineage": LINEAGE,
        "status": "OUTCOME_BLIND_REPRESENTATION_FROZEN",
        "TOPDECK_OUTCOMES_JOINED": False,
        "PROFESSOR_CHANGED": False,
        "CMMG_CONFIRMATORY_LINEAGE_CHANGED": False,
        "HISTORICAL_COMMANDER_3_CYCLE_NOT_DISTINGUISHED_FROM_STRENGTH_NULL": True,
        "nNativeVariants": n_var,
        "nNormalizedUniqueComboCardSets": len(combo_rows),
        "nUniqueProducedFeatures": len(produce_seen),
        "taxonomyAllFeatures": dict(class_n),
        "taxonomyProducedFeatures": dict(produced_class),
        "nUnclassifiedProducedFeatures": len(unclassified_prod),
        "nExactLists": n_decks,
        "coverage": {
            "zero": n_zero,
            "ge1": n_ge1,
            "ge2": n_ge2,
            "ge5": n_ge5,
            "ge10": n_ge10,
            "fractionGe1": n_ge1 / n_decks,
            "fractionCommanderInvolved": n_cmd_inv / n_decks,
            "fractionWithTerminalRoute": n_term / n_decks,
            "fractionWithResourceOnlyLoop": n_res / n_decks,
        },
        "minComboSizeDistribution": {str(k): min_size[k] for k in sorted(min_size)},
        "commanderDependence": dict(cmd_frac_bin),
        "medianCardsInMultipleComboSets": shared_cards[len(shared_cards) // 2] if shared_cards else 0,
        "nDistinctArchitectureMotifs": len(motif_n),
        "nMotifsUsedByAtLeastTwoCommanders": sum(1 for m in motifs if m["nCommanders"] >= 2),
        "nCommandersWithAtLeast50Lists": len(het),
        "nCommandersMateriallySplit": sum(1 for r in het if r["materiallySplit"]),
        "naturalStructure": "REUSABLE_FAMILIES" if sum(1 for m in motifs if m["nDecks"] >= 50) >= 5 else "SPARSE_OR_UNIQUE",
        "comboPowerScore": None,
        "checksums": {},
    }
    write_json(OUT / "unclassified-produced-features.json", {"n": len(unclassified_prod), "features": unclassified_prod})
    write_json(OUT / "COVERAGE.json", {k: report[k] for k in ("coverage", "minComboSizeDistribution", "commanderDependence")})
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "lineage": LINEAGE,
            "status": "OUTCOME_BLIND_REPRESENTATION_FROZEN",
            "TOPDECK_OUTCOMES_JOINED": False,
            "PROFESSOR_CHANGED": False,
            "CMMG_CONFIRMATORY_LINEAGE_CHANGED": False,
        },
    )
    write_json(
        HIST / "CYCLE_STATUS.json",
        {
            "status": "HISTORICAL_COMMANDER_3_CYCLE_NOT_DISTINGUISHED_FROM_STRENGTH_NULL",
            "carryForwardAsEvidence": False,
            "note": "Retired as a discovery artifact after the strength-only null. Not called false.",
        },
    )

    schema = {
        "lineage": LINEAGE,
        "objects": ["A_spellbook_variant", "B_normalized_combo_card_set", "C_win_architecture_signature"],
        "fingerprintFields": [
            "nNormalizedCombos",
            "nNativeVariants",
            "minComboCardCount",
            "nTwoCard",
            "nThreeCard",
            "nFourPlusCard",
            "nCommanderInvolved",
            "commanderDependence",
            "terminalFeatureIds",
            "nTerminalRoutes",
            "enablingFeatureIds",
            "nResourceOnlyLoops",
            "nCardsInMultipleComboSets",
            "sharedPieceConcentration",
            "nCombosWithPrereqOrTemplate",
            "zoneProfile",
            "architectureMotif",
        ],
        "nearCombosInPrimaryArchitecture": False,
        "comboPowerScore": False,
    }
    write_json(OUT / "SCHEMA.json", schema)
    write_json(OUT / "PROTOCOL.json", {"authorized": LINEAGE, "outcomesJoined": False, "professorChanged": False, "cmmgUntouched": True})

    report["checksums"] = {
        "taxonomy": sha256_file(OUT / "FEATURE_TAXONOMY.json"),
        "comboDictionary": sha256_file(OUT / "normalized-combo-dictionary.jsonl"),
        "fingerprints": sha256_file(OUT / "architecture-fingerprints.jsonl"),
        "heterogeneity": sha256_file(OUT / "commander-coverage-heterogeneity.json"),
        "motifs": sha256_file(OUT / "architecture-motifs.json"),
        "schema": sha256_file(OUT / "SCHEMA.json"),
        "script": sha256_text(Path(__file__).read_text(encoding="utf-8")),
        "mirrorVariants": load_json(MIRROR / "MANIFEST.json").get("variantsFileSha256"),
        "detector": load_json(DET / "REPORT.json").get("detectorSha"),
    }
    write_json(OUT / "REPORT.json", report)
    print(json.dumps({k: report[k] for k in report if k != "checksums"}, indent=2)[:4000])
    print("checksums", report["checksums"])


if __name__ == "__main__":
    main()
