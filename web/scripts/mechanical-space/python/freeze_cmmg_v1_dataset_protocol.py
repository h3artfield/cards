#!/usr/bin/env python3
"""
COMMANDER_META_MATCHUP_GEOMETRY_V1 — dataset feasibility + protocol freeze.

Does not train. Does not retain winner identity.
Does not reopen ODSG v1, Pressure/K, or I(A,B).
Prefers completely untouched events. Stops before mixing opened events.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

from outcome_firewall_v1 import (
    ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED,
    ODSG_V1_FINAL_CALL,
    ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED,
    assert_cmmg_v1_training_locked,
    assert_odsg_v1_lineage_closed,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
CEX2 = MS / "corpus-expansion-v2"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
OUT = MS / "commander-meta-matchup-geometry-v1"

DEV_FRAC = 0.70
VAL_FRAC = 0.15
FINAL_FRAC = 0.15
BOOT_SEED = 20260821
BOOT_N = 10000
MIN_UNTOUCHED_EVENTS = 100
MIN_UNTOUCHED_PODS = 2000
FORBIDDEN = {"winner", "winner_id", "winnerId", "winnerPlayerIdHash", "winnerSeat", "placement", "standings"}


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def assert_no_forbidden(obj, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN:
                raise SystemExit(f"forbidden key {k} at {path}")
            assert_no_forbidden(v, f"{path}.{k}")
    elif isinstance(obj, list) and obj and isinstance(obj[0], (dict, list)):
        for i, v in enumerate(obj[:12]):
            assert_no_forbidden(v, f"{path}[{i}]")


def winner_field_present(pod: dict) -> bool:
    if pod.get("draw"):
        return False
    if pod.get("winnerPlayerIdHash"):
        return True
    return sum(1 for p in pod.get("participants") or [] if p.get("winner")) == 1


def commander_identity(oids: list[str]) -> str | None:
    uniq = sorted({str(x).strip() for x in oids if x})
    if not uniq:
        return None
    return "|".join(uniq)


def assign_clean_dated(n: int) -> tuple[int, int, int]:
    n_final = max(1, int(round(FINAL_FRAC * n)))
    n_val = max(1, int(round(VAL_FRAC * n)))
    n_dev = n - n_val - n_final
    if n_dev < 1:
        n_dev = max(1, n - 2)
        n_val = 1 if n >= 2 else 0
        n_final = n - n_dev - n_val
    return n_dev, n_val, n_final


def main() -> None:
    assert_odsg_v1_lineage_closed()
    if ODSG_V1_FINAL_CALL != "SG3_INTERACTION_MODEL_WORSE":
        raise SystemExit("ODSG v1 must remain SG3")
    if ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED or ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED:
        raise SystemExit("ODSG cycle/I(A,B) inspection must stay closed")
    assert_cmmg_v1_training_locked()

    print("  load prior-outcome and discovery exclusions", flush=True)
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    holdout_pods = {str(p["podId"]) for p in holdout.get("pods") or []}
    holdout_tids = {str(p.get("tid") or "") for p in holdout.get("pods") or []}
    holdout_tids.discard("")
    odsg_rows = load_json(ODSG / "eligible-pods.json")["pods"]
    odsg_pods = {str(p["podId"]) for p in odsg_rows}
    odsg_tids = {str(p["tid"]) for p in odsg_rows}
    opened_pods = holdout_pods | odsg_pods
    opened_tids = holdout_tids | odsg_tids
    sealed = load_json(CEX2 / "source-decks-60.json")
    sealed_ids = {str(d.get("deckInstanceId") or "") for d in sealed if d.get("deckInstanceId")}
    sealed_tids = {did.rsplit(":", 1)[0] for did in sealed_ids if ":" in did}

    print("  index commander identities", flush=True)
    cmd_of: dict[str, str | None] = {}
    n_decks = 0
    n_resolved = 0
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        print(f"    decks {path.parent.name}", flush=True)
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did:
                continue
            n_decks += 1
            ident = None
            if (deck.get("commanderResolutionStatus") or "") == "resolved":
                ident = commander_identity(list(deck.get("commanderOracleIds") or []))
                if ident:
                    n_resolved += 1
            cmd_of[did] = ident

    funnel = {
        "nPodsScanned": 0,
        "nCompletedFourPlayer": 0,
        "nWinnerFieldPresent": 0,
        "nCommanderIdentifiable": 0,
        "nMissingCommanderIdentity": 0,
        "nInSpentHoldout5000": 0,
        "nInOdsgV1": 0,
        "nPreviouslyOutcomeOpened": 0,
        "nNeverOutcomeOpened": 0,
        "nOnOpenedEvents": 0,
        "nOnSealed60Events": 0,
        "nUntouchedEventPods": 0,
    }
    commander_valid = []
    seen = set()
    event_dates: dict[str, set[str]] = defaultdict(set)

    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        print(f"    pods {path.parent.name}", flush=True)
        for pod in load_json(path):
            funnel["nPodsScanned"] += 1
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen:
                continue
            if int(pod.get("podSize") or 0) != 4:
                continue
            if (pod.get("status") or "") != "Completed":
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            funnel["nCompletedFourPlayer"] += 1
            if not winner_field_present(pod):
                continue
            funnel["nWinnerFieldPresent"] += 1
            seen.add(pid)
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                funnel["nMissingCommanderIdentity"] += 1
                continue
            funnel["nCommanderIdentifiable"] += 1
            tid = str(pod.get("tid") or "")
            date = pod.get("tournamentDate") if isinstance(pod.get("tournamentDate"), str) else None
            if date and date.strip():
                event_dates[tid].add(date.strip())
            opened = pid in opened_pods
            if pid in holdout_pods:
                funnel["nInSpentHoldout5000"] += 1
            if pid in odsg_pods:
                funnel["nInOdsgV1"] += 1
            if opened:
                funnel["nPreviouslyOutcomeOpened"] += 1
            else:
                funnel["nNeverOutcomeOpened"] += 1
            commander_valid.append(
                {
                    "podId": pid,
                    "tid": tid,
                    "round": pod.get("round"),
                    "table": pod.get("table"),
                    "commanderIdentities": idents,
                    "tournamentDate": date.strip() if isinstance(date, str) and date.strip() else None,
                    "winnerIdentityRetained": False,
                    "previouslyOutcomeOpened": opened,
                    "onOpenedEvent": tid in opened_tids,
                    "onSealed60Event": tid in sealed_tids,
                }
            )

    never_opened = [r for r in commander_valid if not r["previouslyOutcomeOpened"]]
    on_opened_event = [r for r in never_opened if r["onOpenedEvent"]]
    on_sealed = [r for r in never_opened if r["onSealed60Event"] and not r["onOpenedEvent"]]
    untouched = [r for r in never_opened if not r["onOpenedEvent"] and not r["onSealed60Event"]]
    funnel["nOnOpenedEvents"] = len(on_opened_event)
    funnel["nOnSealed60Events"] = len(on_sealed)
    funnel["nUntouchedEventPods"] = len(untouched)

    opened_event_ids = sorted(opened_tids)
    untouched_tids = {r["tid"] for r in untouched}
    sealed_only_tids = {r["tid"] for r in on_sealed}
    mixed_tids = {r["tid"] for r in on_opened_event}

    event_info = {}
    for r in untouched:
        info = event_info.setdefault(
            r["tid"],
            {"tid": r["tid"], "dates": sorted(event_dates.get(r["tid"], [])), "nPods": 0},
        )
        info["nPods"] += 1
        info["eventDate"] = info["dates"][0] if info["dates"] else None

    dated_clean = []
    forced_dev = []
    date_conflicts = []
    for info in event_info.values():
        if len(info["dates"]) > 1:
            date_conflicts.append({"tid": info["tid"], "dates": info["dates"]})
        if info["eventDate"] is None or len(info["dates"]) > 1:
            forced_dev.append(info)
        else:
            dated_clean.append(info)
    dated_clean.sort(key=lambda e: (e["eventDate"], e["tid"]))

    clean_enough = len(dated_clean) >= MIN_UNTOUCHED_EVENTS and len(untouched) >= MIN_UNTOUCHED_PODS
    split = None
    remaining = []
    if clean_enough:
        n_dev, n_val, n_final = assign_clean_dated(len(dated_clean))
        partition_of = {e["tid"]: "DEVELOPMENT" for e in forced_dev}
        for ev in dated_clean[:n_dev]:
            partition_of[ev["tid"]] = "DEVELOPMENT"
        for ev in dated_clean[n_dev : n_dev + n_val]:
            partition_of[ev["tid"]] = "VALIDATION"
        for ev in dated_clean[n_dev + n_val :]:
            partition_of[ev["tid"]] = "FINAL_TEST"
        remaining = []
        for r in untouched:
            remaining.append(
                {
                    "podId": r["podId"],
                    "tid": r["tid"],
                    "round": r["round"],
                    "table": r["table"],
                    "commanderIdentities": r["commanderIdentities"],
                    "tournamentDate": r["tournamentDate"],
                    "winnerIdentityRetained": False,
                    "partition": partition_of[r["tid"]],
                }
            )
        remaining.sort(
            key=lambda r: (
                r["partition"],
                str(r.get("tournamentDate") or ""),
                r["tid"],
                str(r["round"]),
                str(r["table"]),
                r["podId"],
            )
        )
        counts = {"DEVELOPMENT": 0, "VALIDATION": 0, "FINAL_TEST": 0}
        events_by = {"DEVELOPMENT": set(), "VALIDATION": set(), "FINAL_TEST": set()}
        for r in remaining:
            counts[r["partition"]] += 1
            events_by[r["partition"]].add(r["tid"])
        split = {
            "unit": "tid",
            "nEvents": {k: len(v) for k, v in events_by.items()},
            "nPods": counts,
            "nForcedDevelopmentUndatedOrConflict": len(forced_dev),
            "nCleanDatedEvents": len(dated_clean),
            "cleanDatedSplit": {"DEVELOPMENT": n_dev, "VALIDATION": n_val, "FINAL_TEST": n_final},
            "validationDateRange": [dated_clean[n_dev]["eventDate"], dated_clean[n_dev + n_val - 1]["eventDate"]]
            if n_val
            else None,
            "finalTestDateRange": [dated_clean[n_dev + n_val]["eventDate"], dated_clean[-1]["eventDate"]]
            if n_final
            else None,
            "events": {k: sorted(v) for k, v in events_by.items()},
        }

    print("  exposure audit on untouched corpus", flush=True)
    ident_pods: dict[str, set[str]] = defaultdict(set)
    pair_enc: Counter = Counter()
    for r in untouched:
        ids = list(r["commanderIdentities"])
        for c in set(ids):
            ident_pods[c].add(r["podId"])
        for a, b in combinations(sorted(set(ids)), 2):
            pair_enc[(a, b)] += 1

    appear = Counter({k: len(v) for k, v in ident_pods.items()})
    pair_counts = list(pair_enc.values())
    exposure = {
        "nUntouchedPods": len(untouched),
        "nUntouchedEvents": len(untouched_tids),
        "nUniqueCommanderIdentities": len(appear),
        "identityPodAppearance": {
            "min": int(min(appear.values())) if appear else 0,
            "median": int(sorted(appear.values())[len(appear) // 2]) if appear else 0,
            "max": int(max(appear.values())) if appear else 0,
            "nAtLeast": {str(t): int(sum(1 for n in appear.values() if n >= t)) for t in (20, 50, 100, 250, 500)},
        },
        "nUniqueUnorderedPairs": len(pair_enc),
        "pairEncounters": {
            "min": int(min(pair_counts)) if pair_counts else 0,
            "median": int(sorted(pair_counts)[len(pair_counts) // 2]) if pair_counts else 0,
            "max": int(max(pair_counts)) if pair_counts else 0,
            "nAtLeast": {str(t): int(sum(1 for n in pair_counts if n >= t)) for t in (5, 10, 20, 50)},
        },
        "outcomesInspected": False,
    }

    identity_def = {
        "single": "canonical commander Oracle ID",
        "multi": "sorted unique command-zone Oracle IDs joined by '|'",
        "orderDoesNotCreateSeparateIdentities": True,
        "noArchetypeGrouping": True,
        "noEdhrecLabels": True,
        "noWinrateOrPopularity": True,
        "unit": "commander / commander-pair identity itself",
    }
    models = {
        "notARepairOfSg3": True,
        "hypothesis": "COMMANDER_LEVEL_MATCHUP_RESIDUAL",
        "differenceFromOdsgV1": (
            "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1 tested interaction between high-dimensional exact deck "
            "representations. This lineage tests repeatable effects attached to commander/meta identities "
            "across many independently submitted decks."
        ),
        "C0_UNIFORM": {"P": "1/4"},
        "C1_COMMANDER_STRENGTH": {
            "S": "S_c for each canonical commander identity",
            "u_i": "S_{c_i}",
            "P": "softmax(u)",
            "role": "transitive / meta-strength null",
        },
        "C2_COMMANDER_STRENGTH_PLUS_MATCHUP": {
            "sameScalarS": True,
            "I": "I(c,d)=a_c·b_d - a_d·b_c with a,b in R^r",
            "antisymmetry": "I(c,d)=-I(d,c); I(c,c)=0",
            "u_i": "S_{c_i} + sum_{j!=i} I(c_i,c_j)",
            "P": "softmax(u)",
            "usesExactDeckContents": False,
        },
        "rankingsAloneAreNotRps": True,
        "cycleAudit": "only if MG1 on FINAL_TEST; separately authorized",
    }
    gates = {
        "primaryMetric": "pod multiclass log loss",
        "delta": "Delta_meta = LL(C1) - LL(C2)",
        "positiveFavors": "commander matchup residual",
        "bootstrap": {"cluster": "tid", "nResamples": BOOT_N, "seed": BOOT_SEED, "frozenBeforeOutcomeUnlock": True},
        "MG1_COMMANDER_MATCHUP_SIGNAL": "95% CI lower(Delta_meta) > 0",
        "MG2_NO_ESTABLISHED_COMMANDER_MATCHUP_SIGNAL": "CI includes 0",
        "MG3_COMMANDER_INTERACTION_WORSE": "95% CI upper(Delta_meta) < 0",
    }

    protocol = {
        "artifactType": "CommanderMetaMatchupGeometryProtocol",
        "version": "commander-meta-matchup-geometry-v1",
        "status": "FROZEN" if clean_enough else "FEASIBILITY_ONLY_NO_PRIMARY_SPLIT",
        "trainingAuthorized": False,
        "parentLineagesRemainClosed": {
            "profilesKv3PressureV4": "PERMANENTLY_FROZEN_FAIL",
            "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1": "SG3_INTERACTION_MODEL_WORSE",
            "doNotReopen": True,
            "doNotInspectOdsgInteractionMatrix": True,
        },
        "researchQuestion": (
            "After controlling for a commander's overall strength, does the identity of the opposing "
            "commanders provide reproducible held-out winner information?"
        ),
        "hypothesis": "COMMANDER_LEVEL_MATCHUP_RESIDUAL",
        "identity": identity_def,
        "models": models,
        "gates": gates,
        "primaryCorpusRule": "completely untouched events only; do not silently mix previously opened events",
        "feasibilityBar": {"minUntouchedEvents": MIN_UNTOUCHED_EVENTS, "minUntouchedPods": MIN_UNTOUCHED_PODS},
        "cleanUntouchedCorpusExists": clean_enough,
        "winnerIdentityRetained": False,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    write_json(OUT / "PROTOCOL.json", protocol)
    write_json(OUT / "identity-definition.json", identity_def)
    write_json(OUT / "model-spec.json", models)
    write_json(OUT / "gates.json", gates)
    write_json(OUT / "exposure-audit.json", exposure)
    write_json(
        OUT / "prior-outcome-firewall.json",
        {
            "nWinnerPresentFourPlayer": funnel["nWinnerFieldPresent"],
            "nCommanderIdentifiable": funnel["nCommanderIdentifiable"],
            "nSpentHoldout5000Overlap": funnel["nInSpentHoldout5000"],
            "nOdsgV1Overlap": funnel["nInOdsgV1"],
            "nPreviouslyOutcomeOpened": funnel["nPreviouslyOutcomeOpened"],
            "nNeverOutcomeOpened": funnel["nNeverOutcomeOpened"],
            "nEventsWithAnyOpenedPod": len(opened_event_ids),
            "nCompletelyUntouchedEvents": len(untouched_tids),
            "nNeverOpenedPodsOnOpenedEvents": len(on_opened_event),
            "nNeverOpenedPodsOnSealed60EventsOnly": len(on_sealed),
            "nSealed60Events": len(sealed_tids),
            "nSealed60OnlyEventsInNeverOpened": len(sealed_only_tids),
            "nMixedOpenedEventsWithLeftoverCommanderPods": len(mixed_tids),
            "preferredPrimary": "completely untouched events",
            "mixedOpenedEventsIntoPrimary": False,
        },
    )
    write_json(OUT / "eligibility-funnel.json", {"nDecksIndexed": n_decks, "nCommanderResolvedDecks": n_resolved, "funnel": funnel})
    with (OUT / "identity-appearance-counts.jsonl").open("w", encoding="utf-8") as fh:
        for ident, n in sorted(appear.items(), key=lambda kv: (-kv[1], kv[0])):
            fh.write(json.dumps({"commanderIdentity": ident, "nPodAppearances": n}) + "\n")

    if clean_enough:
        write_json(OUT / "split-manifest.json", split)
        write_json(
            OUT / "eligible-pods.json",
            {"n": len(remaining), "winnerIdentityRetained": False, "pods": remaining},
        )
        write_json(
            OUT / "event-date-audit.json",
            {
                "nUntouchedEvents": len(event_info),
                "nCleanDated": len(dated_clean),
                "nForcedDevelopmentUndatedOrConflict": len(forced_dev),
                "nDateConflicts": len(date_conflicts),
                "dateConflicts": date_conflicts[:50],
                "minCleanDate": dated_clean[0]["eventDate"] if dated_clean else None,
                "maxCleanDate": dated_clean[-1]["eventDate"] if dated_clean else None,
            },
        )

    report = {
        "artifactType": "CommanderMetaMatchupGeometryDatasetProtocolFreeze",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": protocol["status"],
        "nStructuredWinnerFourPlayerPods": funnel["nWinnerFieldPresent"],
        "nCommanderIdentifiablePods": funnel["nCommanderIdentifiable"],
        "nAlreadyOutcomeOpened": funnel["nPreviouslyOutcomeOpened"],
        "nNeverOutcomeOpened": funnel["nNeverOutcomeOpened"],
        "nUntouchedEventPods": len(untouched),
        "nUntouchedEvents": len(untouched_tids),
        "nEventsWithAnyOpenedPod": len(opened_event_ids),
        "exposure": exposure,
        "proposedSplit": None
        if not clean_enough
        else {
            "DEVELOPMENT": {"events": split["nEvents"]["DEVELOPMENT"], "pods": split["nPods"]["DEVELOPMENT"]},
            "VALIDATION": {"events": split["nEvents"]["VALIDATION"], "pods": split["nPods"]["VALIDATION"]},
            "FINAL_TEST": {"events": split["nEvents"]["FINAL_TEST"], "pods": split["nPods"]["FINAL_TEST"]},
            "dateRanges": {
                "VALIDATION": split["validationDateRange"],
                "FINAL_TEST": split["finalTestDateRange"],
            },
        },
        "scientificallyCleanUntouchedCorpusExists": clean_enough,
        "stopBeforeWeakeningUntouchedEventRule": not clean_enough,
        "WINNER_IDENTITIES_OPENED": "NO",
        "TRAINING_EXECUTED": "NO",
        "odsgV1Remains": "SG3_INTERACTION_MODEL_WORSE",
    }
    write_json(OUT / "REPORT.json", report)
    for path in OUT.glob("*.json"):
        assert_no_forbidden(load_json(path), path.name)

    checks = {p.name: sha256_file(p) for p in sorted(OUT.iterdir()) if p.is_file() and p.name != "checksums.txt"}
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": protocol["status"],
            "trainingAuthorized": False,
            "winnerIdentityRetained": False,
            "cleanUntouchedCorpusExists": clean_enough,
            "doNotReopenOdsgV1": True,
        },
    )
    print(json.dumps({k: report[k] for k in (
        "status",
        "nStructuredWinnerFourPlayerPods",
        "nCommanderIdentifiablePods",
        "nAlreadyOutcomeOpened",
        "nNeverOutcomeOpened",
        "nUntouchedEventPods",
        "nUntouchedEvents",
        "scientificallyCleanUntouchedCorpusExists",
        "proposedSplit",
        "WINNER_IDENTITIES_OPENED",
        "TRAINING_EXECUTED",
    )}, indent=2))


if __name__ == "__main__":
    main()
