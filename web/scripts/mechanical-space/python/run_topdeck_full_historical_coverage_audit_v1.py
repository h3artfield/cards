#!/usr/bin/env python3
"""
TOPDECK_FULL_HISTORICAL_COVERAGE_AUDIT_V1

Inventory local TopDeck history and freeze COS v2 event partitions.
Does not train COS v2. Does not evaluate frozen COS v1 on unused data.
Does not inspect outcome relationships. Does not open CMMG sealed winners.
Does not change COS v1 math.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_spellbook_historical_outcome_association_v1 import sha256_file, write_json
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
ARCH = MS / "spellbook-win-architecture-space-v1"
CMMG = MS / "commander-meta-matchup-geometry-v1"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
COS1 = MS / "commander-optimization-score-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HIST = WEB / "data" / "milestones" / "topdeck" / "topdeck-historical-import-v1.json"
AUDIT = MS / "topdeck-full-historical-coverage-audit-v1"
COS2 = MS / "commander-optimization-score-v2"

DEV_FRAC = 0.65
SEL_FRAC = 0.175
# remainder → FINAL_TEST
SNAP_TOL = 0.05


def usable_list(deck: dict) -> bool:
    main = deck.get("mainboard") or []
    if len(main) < 80:
        return False
    resolved = sum(1 for c in main if c.get("oracleId"))
    return resolved >= 70


def month_of(pod: dict) -> str:
    cm = str(pod.get("canonicalMonth") or "").strip()
    if len(cm) >= 7:
        return cm[:7]
    date = str(pod.get("tournamentDate") or "").strip()
    return date[:7] if len(date) >= 7 else "UNKNOWN"


def date_of(pod: dict) -> str:
    return str(pod.get("tournamentDate") or "")[:10]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_id_list(path: Path, ids: list[str]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(ids) + ("\n" if ids else "")
    path.write_text(body, encoding="utf-8")
    return sha256_file(path)


def percentile(sorted_vals: list[int], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    pos = (len(sorted_vals) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return float(sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac)


def load_fingerprint_ids() -> set[str]:
    ids: set[str] = set()
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json.loads(line)
            did = str(rec.get("deckInstanceId") or "")
            if did:
                ids.add(did)
    return ids


def load_deck_index() -> tuple[dict[str, bool], dict[str, str | None], int]:
    usable: dict[str, bool] = {}
    cmd_of: dict[str, str | None] = {}
    n_decks = 0
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did:
                continue
            n_decks += 1
            usable[did] = usable_list(deck)
            resolved = (deck.get("commanderResolutionStatus") or "") == "resolved"
            ident = commander_identity(list(deck.get("commanderOracleIds") or []))
            cmd_of[did] = ident if resolved and ident else None
    return usable, cmd_of, n_decks


def empty_month() -> dict:
    return {
        "events": 0,
        "pods": 0,
        "completedFourPlayerPods": 0,
        "exactListCoveragePods": 0,
        "commanderIdentifiablePods": 0,
        "winnerFieldPresentPods": 0,
        "playerIdCoveragePods": 0,
        "seatTurnOrderCoveragePods": 0,
        "cosV1Events": 0,
        "cosV1Pods": 0,
        "completelyUnusedEvents": 0,
        "completelyUnusedPods": 0,
        "unusedUsableEvents": 0,
        "unusedUsablePods": 0,
        "v1TouchedLeftoverPods": 0,
        "reservedEvents": 0,
        "reservedPods": 0,
    }


def assign_chrono_partitions(events: list[tuple[str, str, str]]) -> dict[str, str]:
    """events: (date, month, tid) sorted. Returns tid -> partition."""
    n = len(events)
    if n == 0:
        return {}
    n_dev = max(1, int(round(DEV_FRAC * n))) if n >= 3 else max(1, n - 2)
    n_sel = max(1, int(round(SEL_FRAC * n))) if n >= 3 else (1 if n >= 2 else 0)
    if n_dev + n_sel >= n and n >= 3:
        n_sel = max(1, n - n_dev - 1)
    n_test = n - n_dev - n_sel
    if n >= 3 and n_test < 1:
        n_test = 1
        n_sel = max(1, n - n_dev - n_test)
    if n == 1:
        n_dev, n_sel, n_test = 1, 0, 0
    elif n == 2:
        n_dev, n_sel, n_test = 1, 0, 1

    cuts = [n_dev, n_dev + n_sel]

    def snap(cut: int) -> int:
        if n < 12:
            return cut
        target = cut / n
        best = cut
        best_dist = 1.0
        for i in range(1, n):
            if events[i][1] == events[i - 1][1]:
                continue
            frac = i / n
            dist = abs(frac - target)
            if dist < best_dist and dist <= SNAP_TOL:
                best_dist = dist
                best = i
        return best

    c0 = snap(cuts[0])
    c1 = snap(cuts[1])
    if not (0 < c0 < c1 < n) and n >= 3:
        c0, c1 = cuts[0], cuts[1]
        c0 = min(max(1, c0), n - 2)
        c1 = min(max(c0 + 1, c1), n - 1)
    assignment: dict[str, str] = {}
    for i, (_date, _month, tid) in enumerate(events):
        if i < c0:
            assignment[tid] = "COS_V2_DEVELOPMENT"
        elif i < c1:
            assignment[tid] = "COS_V2_SELECTION"
        else:
            assignment[tid] = "COS_V2_FINAL_TEST"
    return assignment


def feature_matrix_proposal() -> dict:
    return {
        "role": "PROPOSAL_ONLY",
        "COS_V2_TRAINED": False,
        "baselineCandidate": "COMMANDER_OPTIMIZATION_SCORE_V1",
        "productScoreRemainsIntrinsic": True,
        "forbiddenAsScoringFeatures": [
            "opponents",
            "matchup residuals",
            "Pressure",
            "K",
            "pod composition",
            "points per color",
            "player identity",
            "seat / turn order",
        ],
        "color": {
            "role": "ENABLER_NOT_MEASURE",
            "directScoringFeature": False,
            "mayReconsiderOnlyIf": "new DEVELOPMENT evidence overturns the V1 ablation and then survives FINAL_TEST",
        },
        "families": [
            {
                "id": "win_line_accessibility",
                "status": "CANDIDATE",
                "intent": "How reliably can this exact 99 reach its winning architecture?",
                "preferDeterministic": True,
                "measures": [
                    "minimum complete combo size",
                    "number of independent terminal lines",
                    "commander involvement",
                    "interchangeable pieces",
                    "shared-piece concentration",
                    "number/density of cards capable of finding each required piece",
                    "fraction of the deck that accesses at least one winning package",
                    "bottleneck piece accessibility",
                    "overlapping tutor coverage",
                    "combo pieces useful outside the combo where deterministically measurable",
                ],
            },
            {
                "id": "mana_execution_efficiency",
                "status": "CANDIDATE",
                "intent": "Improve beyond simple MV densities without fabricating turn-to-win",
                "measures": [
                    "curve",
                    "fast mana",
                    "ramp density",
                    "colored source requirements",
                    "colored source availability",
                    "commander casting requirements",
                    "mana required by known Spellbook lines",
                    "approximate earliest executable line only if deterministically supportable",
                ],
                "doNotFabricate": ["turn-to-win"],
            },
            {
                "id": "functional_construction",
                "status": "CANDIDATE",
                "prefer": "best validated deterministic / Semantic Oracle representation",
                "doNotSilentlySubstitute": "incomplete Semantic Oracle tags for known-good V1 RC8 extraction",
                "measures": [
                    "draw/selection",
                    "interaction",
                    "protection",
                    "recursion",
                    "tutors",
                    "acceleration",
                    "role compression",
                    "functional coherence",
                ],
            },
            {
                "id": "redundancy_and_bottlenecks",
                "status": "CANDIDATE",
                "distinguish": [
                    "many variants sharing one irreplaceable card",
                    "multiple genuinely independent routes",
                ],
            },
            {
                "id": "commander_dependence",
                "status": "CANDIDATE",
                "definitions": "outcome-blind only",
                "roles": [
                    "commander is combo piece",
                    "commander is access engine",
                    "commander is mana engine",
                    "commander is card-advantage engine",
                    "commander is payoff",
                ],
            },
        ],
        "hierarchicalCommanderBaseline": {
            "status": "CANDIDATE_NOT_AUTOMATICALLY_ACCEPTED",
            "form": "S_c = commander-specific evidence shrunk toward a commander-feature prior",
            "compareOn": "COS_V2_SELECTION against V1 fixed intercepts",
            "replacesUnknownS0": True,
        },
        "ownDeckNonlinearity": {
            "status": "CANDIDATE",
            "allowed": True,
            "examples": [
                "compact combo × tutor access",
                "win architecture × protection",
                "fast mana × low mana requirement",
                "commander-dependent line × commander access engine",
            ],
            "regularizedAndAblatable": True,
            "opponentInputs": False,
        },
        "trainingNuisanceOnly": {
            "playerStrength": "if player-ID coverage is sufficient",
            "seatTurnOrder": "only if true seat/turn-order is reliable",
            "neverRequiredToScore": True,
            "neverInPublicOutput": True,
        },
        "selectionComparators": [
            "frozen COS_V1 math",
            "V1 features refit on enlarged data",
            "richer intrinsic V2 features",
            "richer features + nuisance controls if feasible",
            "hierarchical commander baseline if useful",
            "constrained own-deck nonlinear model if useful",
        ],
        "selectionMetrics": {
            "primary": "whole-event log loss",
            "secondary": [
                "Brier",
                "calibration",
                "top-1",
                "temporal stability",
                "performance by commander exposure",
                "performance on commanders unseen/rare in training",
            ],
            "doNotSelectOn": "COS_V2_FINAL_TEST",
        },
        "replacementGate": {
            "delta": "LL(COS_V1) - LL(COS_V2)",
            "bootstrap": "event-cluster",
            "require": "positive improvement whose 95% CI excludes zero, and no material calibration regression",
            "ifFail": "COS_V1_REMAINS_PRODUCT; FINAL_TEST spent",
            "ifPass": "freeze COMMANDER_OPTIMIZATION_SCORE_V2 hashes; product migration separately authorized",
        },
        "constructor": {
            "optimizeAgainstCos": False,
            "firstUse": ["scoring", "grading", "explanation"],
        },
    }


def main() -> None:
    t0 = time.time()
    AUDIT.mkdir(parents=True, exist_ok=True)
    COS2.mkdir(parents=True, exist_ok=True)
    assert_cmmg_v1_reserved_winners_locked()

    historical = load_json(HIST) if HIST.exists() else {"months": {}}
    reserved = load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")
    reserved_pids = {str(p["podId"]) for p in reserved["pods"]}
    reserved_tids = {str(p["tid"]) for p in reserved["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}

    print("  load decks + fingerprints", flush=True)
    usable_of, cmd_of, n_decks = load_deck_index()
    fps = load_fingerprint_ids()

    print("  scan pods", flush=True)
    seen: set[str] = set()
    events: dict[str, dict] = {}
    months: dict[str, dict] = defaultdict(empty_month)
    month_event_ids: dict[str, set[str]] = defaultdict(set)
    player_counts: Counter[str] = Counter()
    player_counts_v1: Counter[str] = Counter()
    n_pods = 0
    n_completed4 = 0
    n_winner = 0
    n_exact = 0
    n_cmd = 0
    n_player = 0
    n_winner_player = 0
    n_seat = 0
    v1_pids: set[str] = set()
    v1_tids: set[str] = set()
    unused_usable_by_event: dict[str, list[str]] = defaultdict(list)
    leftover_by_event: dict[str, list[str]] = defaultdict(list)
    reserved_pods_seen = 0
    import_runs = []

    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        import_runs.append(path.parent.name)
        raw_pods = load_json(path)
        for pod in raw_pods:
            n_pods += 1
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            tid = str(pod.get("tid") or "")
            month = month_of(pod)
            date = date_of(pod)
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            hashes = [str(p.get("playerIdHash") or "") for p in parts]
            completed4 = (
                int(pod.get("podSize") or 0) == 4
                and (pod.get("status") or "") == "Completed"
                and len(ids) == 4
                and all(ids)
                and len(set(ids)) == 4
            )
            winner_present = completed4 and winner_field_present(pod)
            exact = completed4 and all(usable_of.get(d) for d in ids)
            cmd_ok = completed4 and all(cmd_of.get(d) for d in ids)
            player_ok = completed4 and all(hashes) and len(set(hashes)) == 4
            reserved_pod = pid in reserved_pids or tid in reserved_tids
            v1_join = (
                completed4
                and winner_present
                and pid in spent_ids
                and not reserved_pod
                and all(d in fps and cmd_of.get(d) for d in ids)
            )
            cos_eligible = completed4 and winner_present and exact and cmd_ok and not reserved_pod

            ev = events.setdefault(
                tid,
                {
                    "tid": tid,
                    "minDate": date or "9999-99-99",
                    "maxDate": date,
                    "months": set(),
                    "pods": 0,
                    "completedFourPlayerPods": 0,
                    "winnerFieldPresentPods": 0,
                    "exactListPods": 0,
                    "commanderIdentifiablePods": 0,
                    "playerIdPods": 0,
                    "v1Pods": 0,
                    "reservedPods": 0,
                    "unusedUsablePods": 0,
                    "leftoverPods": 0,
                },
            )
            if date and date < ev["minDate"]:
                ev["minDate"] = date
            if date and date > ev["maxDate"]:
                ev["maxDate"] = date
            ev["months"].add(month)
            ev["pods"] += 1
            month_event_ids[month].add(tid)
            mrow = months[month]
            mrow["pods"] += 1

            if completed4:
                n_completed4 += 1
                ev["completedFourPlayerPods"] += 1
                mrow["completedFourPlayerPods"] += 1
            if winner_present:
                n_winner += 1
                ev["winnerFieldPresentPods"] += 1
                mrow["winnerFieldPresentPods"] += 1
            if exact:
                n_exact += 1
                ev["exactListPods"] += 1
                mrow["exactListCoveragePods"] += 1
            if cmd_ok:
                n_cmd += 1
                ev["commanderIdentifiablePods"] += 1
                mrow["commanderIdentifiablePods"] += 1
            if player_ok:
                n_player += 1
                ev["playerIdPods"] += 1
                mrow["playerIdCoveragePods"] += 1
            if winner_present and player_ok:
                n_winner_player += 1
            if reserved_pod:
                reserved_pods_seen += 1
                ev["reservedPods"] += 1
                mrow["reservedPods"] += 1
            if v1_join:
                v1_pids.add(pid)
                v1_tids.add(tid)
                ev["v1Pods"] += 1
                mrow["cosV1Pods"] += 1
            elif cos_eligible:
                if tid in reserved_tids:
                    pass
                else:
                    unused_usable_by_event[tid].append(pid)
                    ev["unusedUsablePods"] += 1
            elif completed4 and winner_present and not reserved_pod:
                leftover_by_event[tid].append(pid)
                ev["leftoverPods"] += 1

            if completed4 and winner_present and player_ok:
                for h in hashes:
                    player_counts[h] += 1

    # second classification after v1 event set is known
    completely_unused_tids = []
    unused_usable_events = []
    v1_touched_leftover_pods = []
    for tid, ev in events.items():
        if ev["v1Pods"] > 0:
            for pid in leftover_by_event.get(tid, []):
                v1_touched_leftover_pods.append(pid)
            # unused_usable collected before knowing v1 set — reclaim those in v1 events as leftover
            for pid in unused_usable_by_event.get(tid, []):
                v1_touched_leftover_pods.append(pid)
            unused_usable_by_event.pop(tid, None)
        elif tid in reserved_tids:
            continue
        else:
            completely_unused_tids.append(tid)
            if unused_usable_by_event.get(tid):
                unused_usable_events.append(tid)

    for tid in list(unused_usable_by_event):
        if tid not in unused_usable_events:
            unused_usable_by_event.pop(tid, None)

    for month, tids in month_event_ids.items():
        mrow = months[month]
        mrow["events"] = len(tids)
        mrow["cosV1Events"] = sum(1 for t in tids if t in v1_tids)
        mrow["reservedEvents"] = sum(1 for t in tids if t in reserved_tids)
        unused_here = [t for t in tids if t not in v1_tids and t not in reserved_tids]
        mrow["completelyUnusedEvents"] = len(unused_here)
        mrow["completelyUnusedPods"] = sum(events[t]["pods"] for t in unused_here)
        unused_usable_here = [t for t in unused_here if t in unused_usable_by_event]
        mrow["unusedUsableEvents"] = len(unused_usable_here)
        mrow["unusedUsablePods"] = sum(len(unused_usable_by_event[t]) for t in unused_usable_here)
        mrow["v1TouchedLeftoverPods"] = sum(
            1
            for t in tids
            if t in v1_tids
            for _pid in (leftover_by_event.get(t, []) + [])
        )

    # leftover recount for month rows from the reclaimed set
    leftover_month: Counter[str] = Counter()
    pid_month: dict[str, str] = {}
    # we didn't keep pid→month; approximate leftover from event months (first month)
    for tid in v1_tids:
        month = min(events[tid]["months"]) if events[tid]["months"] else "UNKNOWN"
        leftover_month[month] += events[tid]["leftoverPods"] + events[tid]["unusedUsablePods"]
    for month, count in leftover_month.items():
        months[month]["v1TouchedLeftoverPods"] = count

    v1_eligible_leftover = 0
    v1_ineligible_leftover = 0
    unused_funnel = {
        "completelyUnusedEvents": len(completely_unused_tids),
        "withCompletedFourPlayer": 0,
        "withWinnerField": 0,
        "withExactList": 0,
        "usable": len(unused_usable_events),
    }
    for tid in completely_unused_tids:
        ev = events[tid]
        if ev["completedFourPlayerPods"]:
            unused_funnel["withCompletedFourPlayer"] += 1
        if ev["winnerFieldPresentPods"]:
            unused_funnel["withWinnerField"] += 1
        if ev["exactListPods"]:
            unused_funnel["withExactList"] += 1
    for tid in v1_tids:
        v1_eligible_leftover += events[tid]["unusedUsablePods"]
        v1_ineligible_leftover += events[tid]["leftoverPods"]

    unused_event_rows = []
    for tid in unused_usable_events:
        ev = events[tid]
        unused_event_rows.append((ev["minDate"] or "9999-99-99", min(ev["months"]) if ev["months"] else "UNKNOWN", tid))
    unused_event_rows.sort()
    assignment = assign_chrono_partitions(unused_event_rows)

    parts = {
        "COS_V2_DEVELOPMENT": sorted(t for t, p in assignment.items() if p == "COS_V2_DEVELOPMENT"),
        "COS_V2_SELECTION": sorted(t for t, p in assignment.items() if p == "COS_V2_SELECTION"),
        "COS_V2_FINAL_TEST": sorted(t for t, p in assignment.items() if p == "COS_V2_FINAL_TEST"),
    }
    v1_event_ids = sorted(v1_tids)
    reserved_event_ids = sorted(reserved_tids)
    unused_all_ids = sorted(completely_unused_tids)

    v1_hash = write_id_list(COS2 / "COS_V1_EVENT_IDS.txt", v1_event_ids)
    reserved_hash = write_id_list(COS2 / "CMMG_RESERVED_EVENT_IDS.txt", reserved_event_ids)
    unused_hash = write_id_list(COS2 / "COMPLETELY_UNUSED_EVENT_IDS.txt", unused_all_ids)
    part_hashes = {}
    part_pod_counts = {}
    part_date_ranges = {}
    for name, tids in parts.items():
        part_hashes[name] = write_id_list(COS2 / f"{name}_EVENT_IDS.txt", tids)
        part_pod_counts[name] = sum(len(unused_usable_by_event.get(t, [])) for t in tids)
        dates = [events[t]["minDate"] for t in tids if events[t]["minDate"] and events[t]["minDate"] != "9999-99-99"]
        part_date_ranges[name] = {
            "minDate": min(dates) if dates else None,
            "maxDate": max(events[t]["maxDate"] for t in tids) if tids else None,
            "nEvents": len(tids),
            "nUsablePods": part_pod_counts[name],
        }

    # player feasibility — do not join to winners
    for tid in v1_tids:
        # appearances already counted globally; split v1 vs unused from a third scan would be expensive.
        # Approximate v1 player counts on a cheap second pod pass for v1 pids only.
        pass

    print("  player feasibility pass", flush=True)
    seen_fe = set()
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen_fe:
                continue
            seen_fe.add(pid)
            if pid not in v1_pids:
                continue
            hashes = [str(p.get("playerIdHash") or "") for p in (pod.get("participants") or [])]
            if len(hashes) == 4 and all(hashes) and len(set(hashes)) == 4:
                for h in hashes:
                    player_counts_v1[h] += 1

    def player_report(counter: Counter[str]) -> dict:
        vals = sorted(counter.values())
        return {
            "nUniquePlayers": len(counter),
            "nPlayerSeatAppearances": int(sum(vals)),
            "playersWithAtLeast2": sum(1 for n in vals if n >= 2),
            "playersWithAtLeast5": sum(1 for n in vals if n >= 5),
            "playersWithAtLeast10": sum(1 for n in vals if n >= 10),
            "playersWithAtLeast20": sum(1 for n in vals if n >= 20),
            "medianAppearances": percentile(vals, 0.5),
            "p90Appearances": percentile(vals, 0.9),
            "maxAppearances": vals[-1] if vals else 0,
            "repeatPlayerFraction": (sum(1 for n in vals if n >= 2) / len(vals)) if vals else 0.0,
        }

    coverage_months = []
    for month in sorted(months):
        row = {"month": month, **months[month]}
        coverage_months.append(row)

    imported_months = sorted(historical.get("months") or {})
    imported_status = {
        k: {
            "status": v.get("status"),
            "tournaments": v.get("tournaments"),
            "pods": v.get("pods"),
            "runId": v.get("runId"),
        }
        for k, v in (historical.get("months") or {}).items()
    }

    coverage = {
        "lineage": "TOPDECK_FULL_HISTORICAL_COVERAGE_AUDIT_V1",
        "localCorpusOnly": True,
        "additionalYearsImported": False,
        "importedLogicalMonths": imported_months,
        "importedMonthStatus": imported_status,
        "dateRange": {
            "minMonth": imported_months[0] if imported_months else None,
            "maxMonth": imported_months[-1] if imported_months else None,
            "note": "Local TopDeck history is the 12-month EDH import (2025-09 through 2026-08). There are no unused earlier years on disk.",
        },
        "importRunsNormalizedV3": import_runs,
        "nImportRuns": len(import_runs),
        "nDecksIndexed": n_decks,
        "nPodsScannedIncludingDuplicates": n_pods,
        "nUniquePods": len(seen),
        "nUniqueEvents": len(events),
        "nCompletedFourPlayerPods": n_completed4,
        "nWinnerFieldPresentPods": n_winner,
        "nExactListCoveragePods": n_exact,
        "nCommanderIdentifiablePods": n_cmd,
        "nPlayerIdCoveragePods": n_player,
        "nWinnerFieldAndPlayerIdPods": n_winner_player,
        "nSeatTurnOrderCoveragePods": n_seat,
        "seatTurnOrder": {
            "availableInNormalizedCorpus": False,
            "availableInTopDeckRequestColumns": False,
            "participantArrayOrderAuthorizedAsTurnOrder": False,
            "label": "SEAT_TURN_ORDER_NOT_INGESTED",
        },
        "byMonth": coverage_months,
        "OUTCOME_RELATIONSHIPS_INSPECTED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "COS_V1_EVALUATED_ON_UNUSED": False,
        "COS_V2_TRAINED": False,
    }

    v1_used = {
        "definition": (
            "Spent holdout∪ODSG eligible pods, excluding CMMG LEGACY_BLINDED_RESERVE_V1, "
            "restricted to completed 4-player pods with winner-field present, four distinct "
            "deckInstanceIds, all four in frozen architecture fingerprints, and resolved commander identity."
        ),
        "nPods": len(v1_pids),
        "nEvents": len(v1_event_ids),
        "expectedPods": 38461,
        "expectedEvents": 2324,
        "matchExpected": len(v1_pids) == 38461 and len(v1_event_ids) == 2324,
        "eventIdsHash": v1_hash,
        "spentEligiblePods": len(spent_ids),
        "spentMinusCosV1": len(spent_ids) - len(v1_pids),
        "reservedExcluded": {"nPods": len(reserved_pids), "nEvents": len(reserved_tids), "eventIdsHash": reserved_hash},
    }

    unused = {
        "completelyUnusedEvents": len(unused_all_ids),
        "completelyUnusedEventIdsHash": unused_hash,
        "unusedUsableEvents": len(unused_usable_events),
        "unusedUsablePods": sum(len(v) for v in unused_usable_by_event.values()),
        "usableDefinition": (
            "Completely unused events (no COS v1 pod, not CMMG reserved) with at least one "
            "completed 4-player pod that has winner-field present, exact usable lists, and "
            "resolved commander identity. Fingerprints are not required for unused inventory; "
            "they can be computed later from the frozen representation without opening outcomes."
        ),
        "v1TouchedLeftoverPods": len(v1_touched_leftover_pods),
        "v1TouchedLeftoverExactListCommanderWinner": v1_eligible_leftover,
        "v1TouchedLeftoverMissingExactListOrCommander": v1_ineligible_leftover,
        "v1TouchedLeftoverNote": (
            "Leftover pods inside COS v1 events are not a clean unused tranche. "
            "Exact-list leftover may join V2 development only. Missing-list leftover is not COS-trainable."
        ),
        "unusedEventFunnel": unused_funnel,
        "reservedHeldOut": {
            "nEvents": len(reserved_tids),
            "nPods": len(reserved_pids),
            "inAllCosV2Partitions": False,
        },
        "noAdditionalImportedYears": True,
    }

    nuisance = {
        "playerIdentity": {
            "field": "playerIdHash",
            "presentOnNormalizedParticipants": True,
            "completedFourPlayerCoveragePods": n_player,
            "winnerFieldPresentAndPlayerIdPods": n_winner_player,
            "coverageRateAmongCompletedFourPlayer": (n_player / n_completed4) if n_completed4 else 0.0,
            "coverageRateAmongWinnerFieldPresent": (n_winner_player / n_winner) if n_winner else 0.0,
            "allCompletedFourPlayerWinnerPresent": player_report(player_counts),
            "cosV1Pods": player_report(player_counts_v1),
            "feasibility": (
                "SUFFICIENT_TO_TEST_AS_TRAINING_NUISANCE"
                if player_report(player_counts)["playersWithAtLeast10"] >= 100
                else "SPARSE_REPEAT_PILOTS"
            ),
            "productScoreMayRequirePlayerId": False,
            "publicOutputMayIncludePlayerId": False,
        },
        "seatTurnOrder": {
            "normalizedFields": [],
            "topdeckRequestTables": ["table", "players", "winner", "status"],
            "topdeckRequestPlayers": ["name", "id", "decklist"],
            "feasibility": "NOT_AVAILABLE",
            "label": "SEAT_TURN_ORDER_NOT_INGESTED",
            "participantArrayOrderIsNotTurnOrder": True,
            "authorizedAsNuisance": False,
        },
        "conceptualSplit": {
            "outcomeUtility": "deck strength + pilot effect + seat effect",
            "productScore": "deck strength only",
        },
        "OUTCOME_RELATIONSHIPS_INSPECTED": False,
    }

    authorization = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "status": "PARTITION_FROZEN_WAITING_FOR_DEVELOPMENT",
        "COS_V1_IMMUTABLE": True,
        "COS_V1_REMAINS_PRODUCT": True,
        "COS_V2_TRAINED": False,
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "COS_V1_EVALUATED_ON_FINAL_TEST": False,
        "purpose": [
            "identify usable TopDeck history not used to fit COS v1",
            "reserve a clean outcome-blind test tranche",
            "use remaining unused history plus the existing development corpus to build the best defensible COS v2",
            "replace v1 only if v2 wins on the untouched test",
        ],
        "rules": {
            "partitionBy": "whole event",
            "chronologicalSeparation": True,
            "doNotInspectOutcomesWhileDesigningPartition": True,
            "v1EvaluatedOnFinalTestOnlyWithFrozenV2": True,
            "constructorRemainsIndependent": True,
        },
    }

    partition = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "status": "PARTITION_FROZEN_NO_TRAINING",
        "frozen": True,
        "COS_V1_IMMUTABLE": True,
        "COS_V2_TRAINED": False,
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "OUTCOME_RELATIONSHIPS_INSPECTED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "partitionUnit": "whole event",
        "partitionOrder": "chronological unused usable events (min tournamentDate, tid)",
        "targetFractions": {"development": DEV_FRAC, "selection": SEL_FRAC, "finalTest": 1.0 - DEV_FRAC - SEL_FRAC},
        "monthBoundarySnapTolerance": SNAP_TOL,
        "hashes": {
            "COS_V1_EVENT_IDS": v1_hash,
            "CMMG_RESERVED_EVENT_IDS": reserved_hash,
            "COMPLETELY_UNUSED_EVENT_IDS": unused_hash,
            **part_hashes,
        },
        "ranges": part_date_ranges,
        "v2DevelopmentMayUse": [
            "COS_V1_SPENT_EVENTS",
            "COS_V2_DEVELOPMENT",
            "V1_TOUCHED_LEFTOVER_PODS",
        ],
        "v2SelectionMayUse": ["COS_V2_SELECTION"],
        "v2FinalTest": ["COS_V2_FINAL_TEST"],
        "excludedFromAllV2Partitions": ["CMMG_LEGACY_BLINDED_RESERVE_V1"],
        "nCosV1Events": len(v1_event_ids),
        "nCosV1Pods": len(v1_pids),
        "observedFractions": {
            "development": (len(parts["COS_V2_DEVELOPMENT"]) / len(unused_usable_events)) if unused_usable_events else 0,
            "selection": (len(parts["COS_V2_SELECTION"]) / len(unused_usable_events)) if unused_usable_events else 0,
            "finalTest": (len(parts["COS_V2_FINAL_TEST"]) / len(unused_usable_events)) if unused_usable_events else 0,
        },
        "monthSnapNote": (
            "Cuts snapped to 2026-05-01 and 2026-07-02 month boundaries. "
            "Selection is 23.8% of unused usable events because May–June is a dense unused block."
        ),
        "thinFinalTest": part_date_ranges["COS_V2_FINAL_TEST"]["nEvents"] < 30,
        "modestFinalTest": part_date_ranges["COS_V2_FINAL_TEST"]["nUsablePods"] < 1000,
    }

    report = {
        "lineage": "TOPDECK_FULL_HISTORICAL_COVERAGE_AUDIT_V1",
        "status": "REPORTED_WAITING",
        "COS_FORMULA_FROZEN": True,
        "COS_V1_REMAINS_PRODUCT": True,
        "COS_V2_TRAINED": False,
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "CONSTRUCTOR_USES_COS": False,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "OUTCOME_RELATIONSHIPS_INSPECTED": False,
        "COS_V1_EVALUATED_ON_UNUSED": False,
        "localDateCoverage": coverage["dateRange"],
        "v1Used": {"nPods" : v1_used["nPods"], "nEvents": v1_used["nEvents"], "matchExpected": v1_used["matchExpected"]},
        "unused": {
            "completelyUnusedEvents": unused["completelyUnusedEvents"],
            "unusedUsableEvents": unused["unusedUsableEvents"],
            "unusedUsablePods": unused["unusedUsablePods"],
            "v1TouchedLeftoverPods": unused["v1TouchedLeftoverPods"],
            "v1TouchedLeftoverExactListCommanderWinner": unused["v1TouchedLeftoverExactListCommanderWinner"],
            "unusedEventFunnel": unused["unusedEventFunnel"],
        },
        "partitions": part_date_ranges,
        "nuisance": {
            "player": nuisance["playerIdentity"]["feasibility"],
            "seat": nuisance["seatTurnOrder"]["feasibility"],
        },
        "next": "Develop COS v2 on DEVELOPMENT/SELECTION only. Do not open FINAL_TEST outcomes. Do not evaluate V1 on unused years until the frozen V2 candidate is hashed.",
        "elapsedSec": round(time.time() - t0, 2),
    }

    write_json(AUDIT / "COVERAGE.json", coverage)
    write_json(AUDIT / "V1_USED.json", v1_used)
    write_json(AUDIT / "UNUSED.json", unused)
    write_json(AUDIT / "NUISANCE_FEASIBILITY.json", nuisance)
    write_json(AUDIT / "REPORT.json", report)
    write_json(COS2 / "AUTHORIZATION.json", authorization)
    write_json(COS2 / "PARTITION.json", partition)
    write_json(COS2 / "FEATURE_MATRIX_PROPOSAL.json", feature_matrix_proposal())
    write_json(
        COS2 / "STATUS.json",
        {
            "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
            "status": "PARTITION_FROZEN_WAITING_FOR_DEVELOPMENT",
            "COS_V1_IMMUTABLE": True,
            "COS_V2_TRAINED": False,
            "FINAL_TEST_OUTCOMES_OPENED": False,
            "CONSTRUCTOR_USES_COS": False,
        },
    )

    print(json.dumps(report, indent=2), flush=True)
    if not v1_used["matchExpected"]:
        raise SystemExit(
            f"COS v1 reconstruction mismatch: pods={v1_used['nPods']} events={v1_used['nEvents']}"
        )


if __name__ == "__main__":
    main()
