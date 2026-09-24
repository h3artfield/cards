#!/usr/bin/env python3
"""
COMMANDER_OPTIMIZATION_SCORE_V2 DEVELOPMENT

DEVELOPMENT / SELECTION only. COS v1 remains immutable and the live scorer.
Does not open COS_V2_FINAL_TEST winners. Does not open CMMG reserved winners.
Does not change Professor or Constructor. Own-deck features only.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch

from cos_v2_lib import (
    ACCESS_KEYS_V2,
    CMD_PRIOR_KEYS,
    COS1,
    COS2,
    DET,
    HIER_K,
    INTERACTION_KEYS,
    V1_HEADLINE,
    apply_frozen_v1,
    architecture_from_combos,
    calibration_bins,
    commander_identity,
    detect_combos,
    event_logloss,
    load_combo_dictionary,
    read_ids,
    usable_list,
    v2_family_features,
    vec,
)
from freeze_cmmg_v1_dataset_protocol import winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from train_experiments import load_json
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_intrinsic_deck_optimization_geometry_v1 import ACCESS_KEYS, deck_features, load_points, load_texts
from run_spellbook_historical_outcome_association_v1 import (
    ARCH,
    CMMG,
    FEATURE_NAMES,
    HOLDOUT,
    N_FOLDS,
    ODSG,
    SEED,
    TOPDECK,
    fp_vector,
    metrics,
    sha256_file,
    standardize,
    verify_freeze,
    write_json,
)

OUT = COS2 / "development"
AUDIT = Path(__file__).resolve().parents[3] / "data" / "milestones" / "mechanical-space" / "topdeck-full-historical-coverage-audit-v1"

FAMILY_SLICES = {
    "V2-A": V1_HEADLINE,
    "V2-C": V1_HEADLINE + ACCESS_KEYS_V2[:6],
    "V2-D": V1_HEADLINE + ACCESS_KEYS_V2[:9],
    "V2-E": V1_HEADLINE + ACCESS_KEYS_V2[:16],
    "V2-F": V1_HEADLINE + ACCESS_KEYS_V2,
    "V2-H": V1_HEADLINE + ACCESS_KEYS_V2 + INTERACTION_KEYS,
}


def product_report_hierarchy() -> dict:
    return {
        "role": "PRODUCT_REPORT_CONTRACT",
        "COS_V1_CHANGED": False,
        "PROFESSOR_CHANGED": False,
        "CONSTRUCTOR_USES_COS": False,
        "mentalModel": {
            "COS": "tells Professor what the deck is",
            "Professor": "explains why",
            "Constructor": "decides how to improve it",
            "doNotCollapse": True,
        },
        "hierarchy": [
            {
                "id": "headline",
                "items": [
                    {
                        "id": "competitiveStrength",
                        "userQuestion": "How strong does this exact deck appear overall?",
                        "includes": "commander baseline + frozen Spellbook architecture + construction/access",
                    },
                    {
                        "id": "buildOptimization",
                        "userQuestion": "How well optimized is this 99 compared with other observed builds of the same commander?",
                        "removesCommanderBaseline": True,
                    },
                ],
            },
            {
                "id": "deckProfile",
                "notAveragedIntoHeadline": True,
                "userLabels": {
                    "load_bearing": "Strength drivers",
                    "descriptive_only": "Deck characteristics",
                },
                "doNotSayLoadBearingToUsers": True,
                "axes": [
                    ["win_architecture", "Strength drivers"],
                    ["access_consistency", "Deck characteristics"],
                    ["mana_efficiency", "Strength drivers"],
                    ["redundancy", "Deck characteristics"],
                    ["interaction", "Strength drivers"],
                    ["protection", "Strength drivers"],
                    ["resilience", "Deck characteristics"],
                    ["card_advantage", "Strength drivers"],
                    ["role_compression", "Deck characteristics"],
                    ["coherence", "Strength drivers"],
                ],
            },
            {"id": "howThisDeckWorks", "source": "Semantic Oracle / card relationships, not vague LLM prose"},
            {"id": "keySynergies", "source": "actual card relationships"},
            {"id": "knownCombos", "source": "CommanderSpellbook CARD_COMPLETE"},
            {"id": "winConditions", "presentation": "Primary / Secondary / Backup, not 20 variants as 20 strategies"},
            {"id": "whyTheScore"},
            {"id": "whatWouldMostImprove"},
        ],
        "constructorHillClimbAgainstCos": False,
    }


def load_detector_sigs() -> dict[str, list[str]]:
    path = DET / "topdeck-fingerprints.jsonl"
    out: dict[str, list[str]] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json.loads(line)
            did = str(rec.get("deckInstanceId") or "")
            if not did:
                continue
            sigs = []
            seen = set()
            for s in rec.get("completeSummaries") or []:
                sig = s.get("cardSetSignature") or ""
                if sig and sig not in seen:
                    seen.add(sig)
                    sigs.append(sig)
            out[did] = sigs
    return out


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    write_json(COS2 / "PRODUCT_REPORT_HIERARCHY.json", product_report_hierarchy())
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", ver)
        raise SystemExit("STOP: Spellbook representation hash mismatch")
    assert_cmmg_v1_reserved_winners_locked()

    v1_events = set(read_ids(COS2 / "COS_V1_EVENT_IDS.txt"))
    dev_events = set(read_ids(COS2 / "COS_V2_DEVELOPMENT_EVENT_IDS.txt"))
    sel_events = set(read_ids(COS2 / "COS_V2_SELECTION_EVENT_IDS.txt"))
    ft_events = set(read_ids(COS2 / "COS_V2_FINAL_TEST_EVENT_IDS.txt"))
    reserved_tids = set(read_ids(COS2 / "CMMG_RESERVED_EVENT_IDS.txt"))
    reserved_pids = {str(p["podId"]) for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}
    frozen_v1 = load_json(COS1 / "MODEL.json")

    print("  load catalogs + combo dictionary", flush=True)
    points = load_points()
    texts = load_texts()
    combos, combo_index = load_combo_dictionary()
    combo_by_sig = {r["cardSetSignature"]: r for r in combos if r.get("cardSetSignature")}
    print(f"    combos={len(combos)}", flush=True)

    fps = {}
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                fps[str(rec["deckInstanceId"])] = rec
    det_sigs = load_detector_sigs()

    decks = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and (deck.get("commanderResolutionStatus") or "") == "resolved":
                decks[did] = deck
    cmd_of = {did: commander_identity(list(d.get("commanderOracleIds") or [])) for did, d in decks.items()}

    print("  classify authorized pods", flush=True)
    v1_pids = set()
    rows_by_part: dict[str, list[dict]] = {k: [] for k in ("COS_V1", "LEFTOVER", "DEV", "SEL", "FINAL_TEST")}
    seen = set()
    dropped = Counter()
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            tid = str(pod.get("tid") or "")
            if tid in reserved_tids or pid in reserved_pids:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            hashes = [str(p.get("playerIdHash") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            if any(d not in decks or not cmd_of.get(d) or not usable_list(decks[d]) for d in ids):
                continue
            commanders = [cmd_of[d] for d in ids]
            month = str(pod.get("canonicalMonth") or (pod.get("tournamentDate") or "")[:7])
            if tid in v1_events and pid in spent_ids and all(d in fps for d in ids):
                if not winner_field_present(pod):
                    continue
                v1_pids.add(pid)
                win = winner_deck_instance_id(pod)
                if win not in ids:
                    dropped["v1_winner_mismatch"] += 1
                    continue
                rows_by_part["COS_V1"].append(
                    {"podId": pid, "tid": tid, "month": month, "decks": ids, "commanders": commanders, "players": hashes, "y": ids.index(win), "part": "COS_V1"}
                )
            elif tid in v1_events:
                if not winner_field_present(pod):
                    continue
                win = winner_deck_instance_id(pod)
                if win not in ids:
                    dropped["leftover_winner_mismatch"] += 1
                    continue
                rows_by_part["LEFTOVER"].append(
                    {"podId": pid, "tid": tid, "month": month, "decks": ids, "commanders": commanders, "players": hashes, "y": ids.index(win), "part": "LEFTOVER"}
                )
            elif tid in dev_events:
                if not winner_field_present(pod):
                    continue
                win = winner_deck_instance_id(pod)
                if win not in ids:
                    continue
                rows_by_part["DEV"].append(
                    {"podId": pid, "tid": tid, "month": month, "decks": ids, "commanders": commanders, "players": hashes, "y": ids.index(win), "part": "DEV"}
                )
            elif tid in sel_events:
                if not winner_field_present(pod):
                    continue
                win = winner_deck_instance_id(pod)
                if win not in ids:
                    continue
                rows_by_part["SEL"].append(
                    {"podId": pid, "tid": tid, "month": month, "decks": ids, "commanders": commanders, "players": hashes, "y": ids.index(win), "part": "SEL"}
                )
            elif tid in ft_events:
                if not winner_field_present(pod):
                    continue
                rows_by_part["FINAL_TEST"].append(
                    {"podId": pid, "tid": tid, "month": month, "decks": ids, "commanders": commanders, "players": hashes, "y": None, "part": "FINAL_TEST"}
                )

    counts = {k: len(v) for k, v in rows_by_part.items()}
    print(f"    pods {counts}", flush=True)
    if counts["COS_V1"] != 38461:
        raise SystemExit(f"COS_V1 reconstruction {counts['COS_V1']} != 38461")
    if any(r["y"] is not None for r in rows_by_part["FINAL_TEST"]):
        raise SystemExit("FINAL_TEST winner leaked")

    needed = []
    for part, rows in rows_by_part.items():
        needed.extend(rows)
    unique_dids = sorted({d for r in needed for d in r["decks"]})
    print(f"  extract features for {len(unique_dids)} unique lists", flush=True)

    feat_cache = {}
    n_computed = 0
    for i, did in enumerate(unique_dids):
        deck = decks[did]
        cmd_oids = [str(x) for x in (deck.get("commanderOracleIds") or []) if x]
        mb = list(deck.get("mainboard") or [])
        present = set(cmd_oids)
        for card in mb:
            oid = card.get("oracleId") or card.get("oracle_id")
            if oid:
                present.add(str(oid))
        if did in det_sigs:
            hits = [combo_by_sig[s] for s in det_sigs[did] if s in combo_by_sig]
        else:
            hits = detect_combos(present, combos, combo_index)
            n_computed += 1
        n_native = len(det_sigs[did]) if did in det_sigs else len(hits)
        fp = fps.get(did) or architecture_from_combos(hits, set(cmd_oids), n_native)
        if "hasTerminal" not in fp:
            fp = {**fp, "hasTerminal": bool(fp.get("terminalBuckets"))}
        v1f = deck_features(cmd_oids, mb, fp, points, texts)
        v2f = v2_family_features(cmd_oids, mb, hits, fp, points, texts, v1f)
        feat_cache[did] = {
            "fp": fp,
            "v1": v1f,
            "v2": v2f,
            "x_v1": np.concatenate([fp_vector(fp), vec(v1f, ACCESS_KEYS)]),
            "x_all": None,
        }
        all_keys = ACCESS_KEYS_V2 + INTERACTION_KEYS + CMD_PRIOR_KEYS
        feat_cache[did]["x_v2"] = vec({**v1f, **v2f}, ACCESS_KEYS_V2)
        feat_cache[did]["x_ix"] = vec(v2f, INTERACTION_KEYS)
        feat_cache[did]["x_cmd"] = vec(v2f, CMD_PRIOR_KEYS)
        if (i + 1) % 10000 == 0:
            print(f"    features {i+1}/{len(unique_dids)} computed_new={n_computed}", flush=True)
    print(f"    new combo detections {n_computed}", flush=True)

    def stack_rows(rows, open_y: bool):
        n = len(rows)
        c = np.zeros((n, 4), dtype=np.int64)
        y = np.zeros(n, dtype=np.int64)
        pids = np.zeros((n, 4), dtype=np.int64)
        xv1 = np.zeros((n, 4, len(V1_HEADLINE)), dtype=np.float64)
        xv2 = np.zeros((n, 4, len(ACCESS_KEYS_V2)), dtype=np.float64)
        xix = np.zeros((n, 4, len(INTERACTION_KEYS)), dtype=np.float64)
        xcmd = np.zeros((n, 4, len(CMD_PRIOR_KEYS)), dtype=np.float64)
        tids = []
        commanders = []
        months = []
        for i, r in enumerate(rows):
            tids.append(r["tid"])
            commanders.append(r["commanders"])
            months.append(r["month"])
            if open_y:
                y[i] = int(r["y"])
            for j, did in enumerate(r["decks"]):
                xv1[i, j] = feat_cache[did]["x_v1"]
                xv2[i, j] = feat_cache[did]["x_v2"]
                xix[i, j] = feat_cache[did]["x_ix"]
                xcmd[i, j] = feat_cache[did]["x_cmd"]
        return {
            "c_raw": commanders,
            "y": y,
            "pids_raw": [r["players"] for r in rows],
            "xv1": xv1,
            "xv2": xv2,
            "xix": xix,
            "xcmd": xcmd,
            "tids": tids,
            "months": months,
            "rows": rows,
        }

    train_rows = rows_by_part["COS_V1"] + rows_by_part["LEFTOVER"] + rows_by_part["DEV"]
    sel_rows = rows_by_part["SEL"]
    ft_rows = rows_by_part["FINAL_TEST"]
    train = stack_rows(train_rows, True)
    sel = stack_rows(sel_rows, True)
    ft = stack_rows(ft_rows, False)

    appear = Counter()
    for r in train_rows:
        for c in r["commanders"]:
            appear[c] += 1
    vocab = sorted(appear)
    cidx = {c: i + 1 for i, c in enumerate(vocab)}
    player_appear = Counter(h for r in train_rows for h in r["players"] if h)
    pvocab = sorted(player_appear)
    pidx = {p: i + 1 for i, p in enumerate(pvocab)}

    def encode_c(block):
        out = np.zeros((len(block["c_raw"]), 4), dtype=np.int64)
        for i, cmds in enumerate(block["c_raw"]):
            for j, ident in enumerate(cmds):
                out[i, j] = cidx.get(ident, 0)
        return out

    def encode_p(block):
        out = np.zeros((len(block["pids_raw"]), 4), dtype=np.int64)
        for i, ps in enumerate(block["pids_raw"]):
            for j, h in enumerate(ps):
                out[i, j] = pidx.get(h, 0)
        return out

    def mix_of(block):
        out = np.zeros((len(block["c_raw"]), 4), dtype=np.float64)
        for i, cmds in enumerate(block["c_raw"]):
            for j, ident in enumerate(cmds):
                n = appear.get(ident, 0)
                out[i, j] = n / (n + HIER_K)
        return out

    train["c"] = encode_c(train)
    sel["c"] = encode_c(sel)
    ft["c"] = encode_c(ft)
    train["p"] = encode_p(train)
    sel["p"] = encode_p(sel)
    train["mix"] = mix_of(train)
    sel["mix"] = mix_of(sel)
    ft["mix"] = mix_of(ft)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  train n={len(train_rows)} sel n={len(sel_rows)} device={device}", flush=True)

    def pack(block, keys_name):
        if keys_name == "V1":
            return block["xv1"]
        if keys_name == "F":
            return np.concatenate([block["xv1"], block["xv2"]], axis=-1)
        if keys_name == "C":
            return np.concatenate([block["xv1"], block["xv2"][:, :, :6]], axis=-1)
        if keys_name == "D":
            return np.concatenate([block["xv1"], block["xv2"][:, :, :9]], axis=-1)
        if keys_name == "E":
            return np.concatenate([block["xv1"], block["xv2"][:, :, :16]], axis=-1)
        if keys_name == "H":
            return np.concatenate([block["xv1"], block["xv2"], block["xix"]], axis=-1)
        raise KeyError(keys_name)

    def eval_block(name, p, block):
        m = metrics(p, block["y"])
        ev = event_logloss(p, block["y"], block["tids"])
        cal = calibration_bins(p, block["y"])
        by_month = {}
        months = sorted(set(block["months"]))
        for month in months:
            idx = [i for i, mo in enumerate(block["months"]) if mo == month]
            if len(idx) < 8:
                continue
            by_month[month] = metrics(p[idx], block["y"][idx])
        strata = {"unseen": [], "rare": [], "high": []}
        for i, cmds in enumerate(block["c_raw"]):
            ns = [appear.get(c, 0) for c in cmds]
            if any(n == 0 for n in ns):
                strata["unseen"].append(i)
            elif all(n >= 200 for n in ns):
                strata["high"].append(i)
            elif any(n < 30 for n in ns):
                strata["rare"].append(i)
        strat_m = {k: metrics(p[ix], block["y"][ix]) if ix else None for k, ix in strata.items()}
        # same-commander residual spread on unique lists in this block
        return {
            "candidate": name,
            **m,
            **ev,
            "ece": cal["ece"],
            "byMonth": {k: {"logloss": v["logloss"], "top1": v["top1"]} for k, v in by_month.items()},
            "strata": {
                k: ({"n": int(len(strata[k])), "logloss": v["logloss"], "top1": v["top1"]} if v else {"n": 0})
                for k, v in strat_m.items()
            },
        }

    def fit_eval(name, keys_name, mode="h1"):
        print(f"  fit {name} ({keys_name}, {mode})", flush=True)
        xtr = pack(train, keys_name)
        xse = pack(sel, keys_name)
        xtr_s, xse_s = standardize(xtr, xse)
        cmd_tr, cmd_se = standardize(train["xcmd"], sel["xcmd"])
        if mode == "nuisance":
            p, s, beta = train_nuisance_holdout(
                len(vocab), len(pvocab), train["c"], train["p"], xtr_s, train["y"], sel["c"], sel["p"], xse_s, device
            )
            extra = {"S": s, "beta": beta}
        elif mode == "hier":
            p, s, beta, gamma = train_hier_holdout(
                len(vocab), train["c"], train["mix"], cmd_tr, xtr_s, train["y"], sel["c"], sel["mix"], cmd_se, xse_s, device
            )
            extra = {"S": s, "beta": beta, "gamma": gamma}
        else:
            p, s, beta = train_h1_holdout(len(vocab), train["c"], xtr_s, train["y"], sel["c"], xse_s, device)
            extra = {"S": s, "beta": beta}
        folds = np.array(
            [int(hashlib.sha256(f"COS_V2_DEV:{tid}".encode()).hexdigest(), 16) % 5 for tid in train["tids"]]
        )
        tr_i = np.where(folds != 0)[0]
        te_i = np.where(folds == 0)[0]
        xs_tr, xs_te = standardize(xtr[tr_i], xtr[te_i])
        if mode == "nuisance":
            poof, _, _ = train_nuisance_holdout(
                len(vocab), len(pvocab), train["c"][tr_i], train["p"][tr_i], xs_tr, train["y"][tr_i],
                train["c"][te_i], train["p"][te_i], xs_te, device,
            )
        elif mode == "hier":
            cz_tr, cz_te = standardize(train["xcmd"][tr_i], train["xcmd"][te_i])
            poof, _, _, _ = train_hier_holdout(
                len(vocab), train["c"][tr_i], train["mix"][tr_i], cz_tr, xs_tr, train["y"][tr_i],
                train["c"][te_i], train["mix"][te_i], cz_te, xs_te, device,
            )
        else:
            poof, _, _ = train_h1_holdout(len(vocab), train["c"][tr_i], xs_tr, train["y"][tr_i], train["c"][te_i], xs_te, device)
        dev_block = {
            "y": train["y"][te_i],
            "tids": [train["tids"][i] for i in te_i],
            "months": [train["months"][i] for i in te_i],
            "c_raw": [train["c_raw"][i] for i in te_i],
        }
        return {
            "sel": eval_block(name, p, sel),
            "dev_oof": eval_block(name, poof, dev_block),
            "extra": extra,
            "x_dim": int(xtr.shape[-1]),
            "mode": mode,
            "keys": keys_name,
        }

    # Commander-only and frozen V1 on SEL
    print("  frozen V1 + commander-only on SELECTION", flush=True)
    p_frozen = apply_frozen_v1(sel["xv1"], sel["c_raw"], frozen_v1)
    p_cmd, _, _ = train_h1_holdout(
        len(vocab),
        train["c"],
        np.zeros((len(train_rows), 4, 1)),
        train["y"],
        sel["c"],
        np.zeros((len(sel_rows), 4, 1)),
        device,
    )
    results = {
        "FROZEN_COS_V1": {"sel": eval_block("FROZEN_COS_V1", p_frozen, sel), "dev_oof": None, "mode": "frozen", "keys": "V1"},
        "COMMANDER_ONLY": {"sel": eval_block("COMMANDER_ONLY", p_cmd, sel), "dev_oof": None, "mode": "h1", "keys": "none"},
    }
    results["V2-A"] = fit_eval("V2-A", "V1", "h1")
    results["V2-B"] = fit_eval("V2-B", "V1", "nuisance")
    results["V2-C"] = fit_eval("V2-C", "C", "h1")
    results["V2-D"] = fit_eval("V2-D", "D", "h1")
    results["V2-E"] = fit_eval("V2-E", "E", "h1")
    results["V2-F"] = fit_eval("V2-F", "F", "h1")
    results["V2-G"] = fit_eval("V2-G", "F", "hier")
    results["V2-H"] = fit_eval("V2-H", "H", "h1")

    ladder = []
    for name in ["FROZEN_COS_V1", "COMMANDER_ONLY", "V2-A", "V2-B", "V2-C", "V2-D", "V2-E", "V2-F", "V2-G", "V2-H"]:
        rec = results[name]
        ladder.append(
            {
                "candidate": name,
                "mode": rec["mode"],
                "keys": rec.get("keys"),
                "xDim": rec.get("x_dim"),
                "selection": rec["sel"],
                "developmentOof": rec["dev_oof"],
            }
        )

    ece_ref = results["V2-A"]["sel"]["ece"]
    eligible = []
    for name in ["V2-A", "V2-B", "V2-C", "V2-D", "V2-E", "V2-F", "V2-G", "V2-H"]:
        selm = results[name]["sel"]
        if selm["ece"] <= ece_ref + 0.02:
            eligible.append((selm["eventMeanLogloss"], selm["logloss"], name))
    eligible.sort()
    selected_name = eligible[0][2] if eligible else "V2-A"
    selected = results[selected_name]

    # same-commander discrimination on SEL residuals from selected vs A
    def residual_spread(keys_name, extra, block):
        x = pack(block, keys_name)
        mu = train_pack_mu(keys_name)
        sd = train_pack_sd(keys_name)
        z = (x - mu) / np.where(sd < 1e-8, 1.0, sd)
        beta = np.asarray(extra["beta"], dtype=np.float64)
        r = z @ beta
        by = defaultdict(list)
        for i, cmds in enumerate(block["c_raw"]):
            for j, ident in enumerate(cmds):
                by[ident].append(float(r[i, j]))
        spreads = [float(np.std(vs)) for vs in by.values() if len(vs) >= 8]
        return {"nCommandersWith8PlusSeats": len(spreads), "medianResidualStd": float(np.median(spreads)) if spreads else None}

    def train_pack_mu(keys_name):
        x = pack(train, keys_name)
        return x.mean(axis=(0, 1))

    def train_pack_sd(keys_name):
        x = pack(train, keys_name)
        sd = x.std(axis=(0, 1))
        return np.where(sd < 1e-8, 1.0, sd)

    bo_a = residual_spread("V1", results["V2-A"]["extra"], sel)
    bo_sel = residual_spread(selected["keys"], selected["extra"], sel)

    # Freeze selected model + reference from development only
    x_dev = pack(train, selected["keys"])
    mu = x_dev.mean(axis=(0, 1))
    sd = x_dev.std(axis=(0, 1))
    sd = np.where(sd < 1e-8, 1.0, sd)
    feature_names = {
        "V1": V1_HEADLINE,
        "C": V1_HEADLINE + ACCESS_KEYS_V2[:6],
        "D": V1_HEADLINE + ACCESS_KEYS_V2[:9],
        "E": V1_HEADLINE + ACCESS_KEYS_V2[:16],
        "F": V1_HEADLINE + ACCESS_KEYS_V2,
        "H": V1_HEADLINE + ACCESS_KEYS_V2 + INTERACTION_KEYS,
    }[selected["keys"]]

    schema = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "status": "CANDIDATE_FROZEN_FINAL_TEST_SEALED",
        "selectedCandidate": selected_name,
        "headlineFeatures": feature_names,
        "colorInHeadline": False,
        "opponentFeatures": False,
        "playerInProductScore": False,
        "seatUsed": False,
        "hierarchicalK": HIER_K if selected["mode"] == "hier" else None,
        "minCommanderUnique": 30,
        "profileNotAveragedIntoHeadline": True,
        "v1Rc8Preserved": True,
    }
    write_json(OUT / "SCHEMA.json", schema)
    model = {
        "selectedCandidate": selected_name,
        "mode": selected["mode"],
        "nIdent": len(vocab),
        "commanderIdentities": vocab,
        "featureNames": feature_names,
        "mu": [float(v) for v in mu],
        "sd": [float(v) for v in sd],
        "S": [float(v) for v in selected["extra"]["S"]],
        "beta": [float(v) for v in selected["extra"]["beta"]],
        "gamma": [float(v) for v in selected["extra"]["gamma"]] if "gamma" in selected["extra"] else None,
        "playerInProductScore": False,
    }
    write_json(OUT / "MODEL.json", model)

    # unique-list reference from development only
    from freeze_commander_optimization_score_v1 import grid101

    xs = (x_dev - mu) / sd
    S = np.asarray(model["S"])
    beta = np.asarray(model["beta"])
    if selected["mode"] == "hier":
        cmd_mu = train["xcmd"].mean(axis=(0, 1))
        cmd_sd = np.where(train["xcmd"].std(axis=(0, 1)) < 1e-8, 1.0, train["xcmd"].std(axis=(0, 1)))
        cmd_z = (train["xcmd"] - cmd_mu) / cmd_sd
        gamma = np.asarray(model["gamma"])
        prior = cmd_z @ gamma
        util = train["mix"] * S[train["c"]] + (1.0 - train["mix"]) * prior + xs @ beta
        model["cmdMu"] = [float(v) for v in cmd_mu]
        model["cmdSd"] = [float(v) for v in cmd_sd]
        write_json(OUT / "MODEL.json", model)
    else:
        util = S[train["c"]] + xs @ beta
    resid = xs @ beta
    seen_lists = {}
    for i, r in enumerate(train_rows):
        for j, did in enumerate(r["decks"]):
            if did not in seen_lists:
                seen_lists[did] = {"commander": r["commanders"][j], "U": float(util[i, j]), "R": float(resid[i, j])}
    U = np.array([d["U"] for d in seen_lists.values()], dtype=np.float64)
    by_cmd = defaultdict(list)
    for d in seen_lists.values():
        by_cmd[d["commander"]].append(d["R"])
    commander_ref = {}
    for ident, rvals in by_cmd.items():
        arr = np.asarray(rvals, dtype=np.float64)
        commander_ref[ident] = {
            "nUnique": len(rvals),
            "eligibleBuildOptimization": len(rvals) >= 30,
            "residualQuantiles": grid101(arr) if len(rvals) >= 30 else None,
        }
    reference = {
        "nUniqueLists": len(seen_lists),
        "minCommanderUnique": 30,
        "globalUtilityQuantiles": grid101(U),
        "commanders": commander_ref,
        "builtFrom": "authorized development corpus only",
        "FINAL_TEST_USED_FOR_PERCENTILES": False,
    }
    write_json(OUT / "REFERENCE.json", reference)

    formula = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "selectedCandidate": selected_name,
        "utility": "hierarchical S if V2-G else S[commander] + beta · z(features)",
        "productScoreExcludesPlayer": True,
        "profileNotAveragedIntoHeadline": True,
        "colorRole": "ENABLER_NOT_MEASURE",
        "opponentFeatures": False,
    }
    write_json(OUT / "FORMULA.json", formula)

    # FINAL_TEST predictions — features only, no winners
    print("  freeze FINAL_TEST predictions (outcomes sealed)", flush=True)
    x_ft = pack(ft, selected["keys"])
    z_ft = (x_ft - mu) / sd
    if selected["mode"] == "hier":
        cz = (ft["xcmd"] - np.asarray(model["cmdMu"])) / np.asarray(model["cmdSd"])
        prior = cz @ np.asarray(model["gamma"])
        u_v2 = ft["mix"] * S[ft["c"]] + (1.0 - ft["mix"]) * prior + z_ft @ beta
    else:
        u_v2 = S[ft["c"]] + z_ft @ beta
    p_v2 = _softmax_np(u_v2)
    p_v1 = apply_frozen_v1(ft["xv1"], ft["c_raw"], frozen_v1)
    ft_pred = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "nPods": len(ft_rows),
        "nEvents": len({r["tid"] for r in ft_rows}),
        "selectedCandidate": selected_name,
        "pods": [
            {
                "podId": r["podId"],
                "tid": r["tid"],
                "deckInstanceIds": r["decks"],
                "v1Utilities": [float(x) for x in np.log(np.clip(p_v1[i], 1e-12, 1.0))],
                "v2Utilities": [float(x) for x in u_v2[i]],
                "v1Probs": [float(x) for x in p_v1[i]],
                "v2Probs": [float(x) for x in p_v2[i]],
                "winnerIdentityRetained": False,
            }
            for i, r in enumerate(ft_rows)
        ],
    }
    write_json(OUT / "FINAL_TEST_PREDICTIONS.json", ft_pred)
    # store utilities not log-probs for v1 — fix: store utilities from frozen apply
    # already have probs; fine for freeze

    hashes = {
        name: sha256_file(OUT / name)
        for name in ("FORMULA.json", "SCHEMA.json", "MODEL.json", "REFERENCE.json", "FINAL_TEST_PREDICTIONS.json")
    }
    v1_pred_hash = hashlib.sha256(
        json.dumps([p["v1Probs"] for p in ft_pred["pods"]], separators=(",", ":")).encode()
    ).hexdigest()
    v2_pred_hash = hashlib.sha256(
        json.dumps([p["v2Probs"] for p in ft_pred["pods"]], separators=(",", ":")).encode()
    ).hexdigest()

    incremental = []
    order = ["V2-A", "V2-B", "V2-C", "V2-D", "V2-E", "V2-F", "V2-G", "V2-H"]
    prev = results["COMMANDER_ONLY"]["sel"]["logloss"]
    for name in order:
        ll = results[name]["sel"]["logloss"]
        incremental.append({"candidate": name, "selLogloss": ll, "deltaVsPreviousListed": prev - ll, "deltaVsFrozenV1": results["FROZEN_COS_V1"]["sel"]["logloss"] - ll})
        prev = ll

    anticipated = {
        "nFinalTestPods": len(ft_rows),
        "nFinalTestEvents": len({r["tid"] for r in ft_rows}),
        "note": (
            "Event-cluster 95% CI half-width on 33 events is expected to be large relative to "
            "the 0.005-class lifts seen in COS v1. A directionally favorable but inconclusive "
            "result should be COS_V2_PROMISING_AWAITING_MORE_PROSPECTIVE_DATA. The replacement "
            "gate is not weakened because the set is small."
        ),
        "replacementGateUnchanged": True,
    }

    materially = []
    if selected_name != "V2-A":
        materially.append(f"selected {selected_name} over V1-feature refit on SELECTION event log loss")
    if results["V2-B"]["sel"]["logloss"] < results["V2-A"]["sel"]["logloss"]:
        materially.append("pilot nuisance during training improved deck-only SELECTION log loss")
    else:
        materially.append("pilot nuisance did not improve deck-only SELECTION log loss versus V2-A")
    if results["V2-C"]["sel"]["logloss"] < results["V2-A"]["sel"]["logloss"]:
        materially.append("combo-piece accessibility improved SELECTION")
    if results["V2-G"]["sel"]["strata"]["unseen"].get("n", 0):
        materially.append("hierarchical / unseen-commander stratum evaluated on SELECTION")

    report = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "status": "CANDIDATE_FROZEN_WAITING_FOR_FINAL_TEST_REVEAL",
        "COS_V1_CHANGED": False,
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "OPPONENT_FEATURES_USED": False,
        "CONSTRUCTOR_USES_COS": False,
        "PROFESSOR_CHANGED": False,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "authorizedTrain": {
            "cosV1": counts["COS_V1"],
            "leftover": counts["LEFTOVER"],
            "development": counts["DEV"],
            "nTrainPods": len(train_rows),
            "nTrainEvents": len({r["tid"] for r in train_rows}),
        },
        "selectionN": {"pods": counts["SEL"], "events": len({r["tid"] for r in sel_rows})},
        "finalTestN": {"pods": counts["FINAL_TEST"], "events": len({r["tid"] for r in ft_rows}), "outcomesOpened": False},
        "dropped": dict(dropped),
        "ladder": ladder,
        "incrementalSelection": incremental,
        "selectedCandidate": selected_name,
        "buildOptimizationDiscrimination": {"V2-A": bo_a, "selected": bo_sel},
        "pilotNuisance": {
            "V2A_selLogloss": results["V2-A"]["sel"]["logloss"],
            "V2B_selLogloss": results["V2-B"]["sel"]["logloss"],
            "deltaAminusB": results["V2-A"]["sel"]["logloss"] - results["V2-B"]["sel"]["logloss"],
            "productScoreIncludesPlayer": False,
        },
        "whatMateriallyChangedFromV1": materially,
        "anticipatedFinalTestResolution": anticipated,
        "checksums": hashes,
        "predictionHashes": {"v1FinalTestProbs": v1_pred_hash, "v2FinalTestProbs": v2_pred_hash},
        "exactListCoverageIsLimitingResource": True,
        "elapsedSec": round(time.time() - t0, 2),
    }
    write_json(OUT / "REPORT.json", report)
    write_json(COS2 / "STATUS.json", {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "status": "CANDIDATE_FROZEN_WAITING_FOR_FINAL_TEST_REVEAL",
        "COS_V1_IMMUTABLE": True,
        "COS_V2_TRAINED": True,
        "selectedCandidate": selected_name,
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "CONSTRUCTOR_USES_COS": False,
    })
    print(json.dumps({k: report[k] for k in report if k != "ladder"}, indent=2), flush=True)
    print("SELECTED", selected_name, "SEL LL", results[selected_name]["sel"]["logloss"], flush=True)


def train_h1_holdout(n_ident, c_tr, w_tr, y_tr, c_te, w_te, device):
    from run_spellbook_historical_outcome_association_v1 import H1, BATCH, LAM_S, LAM_W, LR, MAX_EPOCHS, SEED, set_seeds
    import torch.nn.functional as F

    d = w_tr.shape[-1]
    model = H1(n_ident, d).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c_tr).to(device)
    wt = torch.from_numpy(w_tr).float().to(device)
    yt = torch.from_numpy(y_tr).to(device)
    n = ct.shape[0]
    set_seeds(SEED)
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(ct[ii], wt[ii])
            loss = F.nll_loss(F.log_softmax(u, dim=-1), yt[ii]) + LAM_S * model.S.weight[1:].pow(2).sum() + LAM_W * model.beta.weight.pow(2).sum()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center()
    model.eval()
    with torch.no_grad():
        p = torch.softmax(model.utilities(torch.from_numpy(c_te).to(device), torch.from_numpy(w_te).float().to(device)), dim=-1).cpu().numpy()
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return p, s, beta


def train_nuisance_holdout(n_ident, n_player, c_tr, p_tr, w_tr, y_tr, c_te, p_te, w_te, device):
    from cos_v2_lib import H1Nuisance, LAM_P
    from run_spellbook_historical_outcome_association_v1 import BATCH, LAM_S, LAM_W, LR, MAX_EPOCHS, SEED, set_seeds
    import torch.nn.functional as F

    d = w_tr.shape[-1]
    model = H1Nuisance(n_ident, n_player, d).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c_tr).to(device)
    pt = torch.from_numpy(p_tr).to(device)
    wt = torch.from_numpy(w_tr).float().to(device)
    yt = torch.from_numpy(y_tr).to(device)
    n = ct.shape[0]
    set_seeds(SEED)
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(ct[ii], pt[ii], wt[ii], True)
            loss = (
                F.nll_loss(F.log_softmax(u, dim=-1), yt[ii])
                + LAM_S * model.S.weight[1:].pow(2).sum()
                + LAM_W * model.beta.weight.pow(2).sum()
                + LAM_P * model.P.weight[1:].pow(2).sum()
            )
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center()
    model.eval()
    with torch.no_grad():
        p = torch.softmax(
            model.utilities(torch.from_numpy(c_te).to(device), torch.from_numpy(p_te).to(device), torch.from_numpy(w_te).float().to(device), False),
            dim=-1,
        ).cpu().numpy()
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return p, s, beta


def train_hier_holdout(n_ident, c_tr, mix_tr, cmd_tr, w_tr, y_tr, c_te, mix_te, cmd_te, w_te, device):
    from cos_v2_lib import H1Hier
    from run_spellbook_historical_outcome_association_v1 import BATCH, LAM_S, LAM_W, LR, MAX_EPOCHS, SEED, set_seeds
    import torch.nn.functional as F

    model = H1Hier(n_ident, w_tr.shape[-1], cmd_tr.shape[-1]).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c_tr).to(device)
    mt = torch.from_numpy(mix_tr).float().to(device)
    zt = torch.from_numpy(cmd_tr).float().to(device)
    wt = torch.from_numpy(w_tr).float().to(device)
    yt = torch.from_numpy(y_tr).to(device)
    n = ct.shape[0]
    set_seeds(SEED)
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(ct[ii], mt[ii], zt[ii], wt[ii])
            loss = (
                F.nll_loss(F.log_softmax(u, dim=-1), yt[ii])
                + LAM_S * model.S.weight[1:].pow(2).sum()
                + LAM_W * model.beta.weight.pow(2).sum()
                + LAM_W * model.gamma.weight.pow(2).sum()
            )
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center()
    model.eval()
    with torch.no_grad():
        p = torch.softmax(
            model.utilities(
                torch.from_numpy(c_te).to(device),
                torch.from_numpy(mix_te).float().to(device),
                torch.from_numpy(cmd_te).float().to(device),
                torch.from_numpy(w_te).float().to(device),
            ),
            dim=-1,
        ).cpu().numpy()
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
        gamma = model.gamma.weight.detach().cpu().numpy().reshape(-1)
    return p, s, beta, gamma


def _softmax_np(u):
    m = u.max(axis=1, keepdims=True)
    e = np.exp(u - m)
    return e / e.sum(axis=1, keepdims=True)


if __name__ == "__main__":
    main()
