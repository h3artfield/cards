#!/usr/bin/env python3
"""
SPELLBOOK_HISTORICAL_OUTCOME_ASSOCIATION_V1

Spent-data exploratory join of frozen win-architecture fingerprints.
Does not regenerate the representation. Does not open CMMG sealed outcomes.
Does not inspect H2 interaction geometry. Does not call MG.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
ARCH = MS / "spellbook-win-architecture-space-v1"
CMMG = MS / "commander-meta-matchup-geometry-v1"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "spellbook-historical-outcome-association-v1"

EXPECTED = {
    "taxonomy": ("FEATURE_TAXONOMY.json", "7d78da72aebf6530d528d4db295b7e2100f90ca842200b6ea13bb4e1b883a8bb"),
    "comboDictionary": ("normalized-combo-dictionary.jsonl", "8a6b782f0ae01181eee01397081026fd4f077e4c5103a6a433c4bbb26c791845"),
    "fingerprints": ("architecture-fingerprints.jsonl", "172f0e83b8f8db6dfb16ee0b8894a199ea27062ea752daad61de1e90a274cfd1"),
    "heterogeneity": ("commander-coverage-heterogeneity.json", "20cecf8094fa88e1f66c919f66282fce18a0a4d5f601e26438ac61a8b3ba2fd5"),
    "motifs": ("architecture-motifs.json", "260ee262fd0d1a2c00e54b515c3a9a974f19d3e7ae06ac1409d4390aefdb20bd"),
    "schema": ("SCHEMA.json", "d5c70bed6871da62687490fefd822eb90d5d3b5c6a0d4e90c1f8f5bb036722d8"),
}

# heterogeneity hash in REPORT is 20cecf...a8b3ba2fd5 — copied from frozen REPORT
EXPECTED["heterogeneity"] = (
    "commander-coverage-heterogeneity.json",
    "20cecf8094fa88e1f66c919f66282fce18a0a4d5f601a26438ac61a8b3ba2fd5",
)

SEED = 20260821
LAM_S = 1e-5
LAM_W = 1e-4
LAM_I = 1e-3
MAX_EPOCHS = 28
BATCH = 128
LR = 1e-3
N_FOLDS = 5
ZDIM = 8
RANK = 2
TERM_BUCKETS = [
    "WIN_THE_GAME",
    "OPPONENT_LOSES_THE_GAME",
    "DRAW_THE_GAME",
    "INFINITE_DAMAGE",
    "INFINITE_LIFELOSS",
    "INFINITE_MILL",
    "EXILE_LIBRARIES",
    "LIFE_TOTAL_MANIPULATION",
]
ENAB_BUCKETS = [
    "MANA",
    "DRAW",
    "TOKENS",
    "ETB",
    "LTB",
    "COUNTERS",
    "STORM",
    "UNTAP",
    "SELF_MILL",
    "CASTS",
    "LANDFALL",
    "MAGECRAFT",
    "SACRIFICE",
    "OTHER_ENABLING",
]
DEP = ["NONE", "COMMANDER_INDEPENDENT", "MIXED", "COMMANDER_DEPENDENT"]
ZONE_KEYS = ["B", "H", "G", "E", "L", "C"]


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_freeze() -> dict:
    rows = []
    ok = True
    for key, (name, expected) in EXPECTED.items():
        path = ARCH / name
        got = sha256_file(path) if path.exists() else "MISSING"
        match = got == expected
        ok = ok and match
        rows.append({"key": key, "file": name, "expected": expected, "got": got, "match": match})
    rec = {"SPELLBOOK_REPRESENTATION_HASH_VERIFIED": ok, "checks": rows}
    write_json(OUT / "P0_VERIFY.json", rec)
    return rec


def fp_vector(fp: dict | None) -> np.ndarray:
    if fp is None or int(fp.get("nNormalizedCombos") or 0) == 0:
        raw = {
            "logCombos": 0.0,
            "logNative": 0.0,
            "zeroCombo": 1.0,
            "minSize": 0.0,
            "logTwo": 0.0,
            "logThree": 0.0,
            "logFour": 0.0,
            "fracCmd": 0.0,
            "logCmdInv": 0.0,
            "logTermRoutes": 0.0,
            "logResLoops": 0.0,
            "logSharedCards": 0.0,
            "sharedConc": 0.0,
            "logPrereq": 0.0,
            "logMana": 0.0,
            "hasTerminal": 0.0,
        }
        dep = "NONE"
        terms, enabs, zones = [], [], {}
    else:
        raw = {
            "logCombos": math.log1p(int(fp.get("nNormalizedCombos") or 0)),
            "logNative": math.log1p(int(fp.get("nNativeVariants") or 0)),
            "zeroCombo": 0.0,
            "minSize": float(fp.get("minComboCardCount") or 0),
            "logTwo": math.log1p(int(fp.get("nTwoCard") or 0)),
            "logThree": math.log1p(int(fp.get("nThreeCard") or 0)),
            "logFour": math.log1p(int(fp.get("nFourPlusCard") or 0)),
            "fracCmd": float(fp.get("fractionCommanderInvolved") or 0),
            "logCmdInv": math.log1p(int(fp.get("nCommanderInvolved") or 0)),
            "logTermRoutes": math.log1p(int(fp.get("nTerminalRoutes") or 0)),
            "logResLoops": math.log1p(int(fp.get("nResourceOnlyLoops") or 0)),
            "logSharedCards": math.log1p(int(fp.get("nCardsInMultipleComboSets") or 0)),
            "sharedConc": float(fp.get("sharedPieceConcentration") or 0),
            "logPrereq": math.log1p(int(fp.get("nCombosWithPrereqOrTemplate") or 0)),
            "logMana": math.log1p(int(fp.get("nCombosWithManaNeeded") or 0)),
            "hasTerminal": 1.0 if fp.get("terminalBuckets") else 0.0,
        }
        dep = fp.get("commanderDependence") or "NONE"
        terms = fp.get("terminalBuckets") or []
        enabs = fp.get("enablingBuckets") or []
        zones = fp.get("zoneProfile") or {}
    vec = list(raw.values())
    vec += [1.0 if dep == d else 0.0 for d in DEP]
    vec += [1.0 if b in terms else 0.0 for b in TERM_BUCKETS]
    vec += [1.0 if b in enabs else 0.0 for b in ENAB_BUCKETS]
    vec += [math.log1p(float(zones.get(z) or 0)) for z in ZONE_KEYS]
    return np.asarray(vec, dtype=np.float64)


FEATURE_NAMES = (
    list(
        {
            "logCombos": 0,
            "logNative": 0,
            "zeroCombo": 0,
            "minSize": 0,
            "logTwo": 0,
            "logThree": 0,
            "logFour": 0,
            "fracCmd": 0,
            "logCmdInv": 0,
            "logTermRoutes": 0,
            "logResLoops": 0,
            "logSharedCards": 0,
            "sharedConc": 0,
            "logPrereq": 0,
            "logMana": 0,
            "hasTerminal": 0,
        }.keys()
    )
    + [f"dep_{d}" for d in DEP]
    + [f"term_{b}" for b in TERM_BUCKETS]
    + [f"enab_{b}" for b in ENAB_BUCKETS]
    + [f"zone_{z}" for z in ZONE_KEYS]
)


def count_only_vector(fp: dict | None) -> np.ndarray:
    n = 0 if fp is None else int(fp.get("nNormalizedCombos") or 0)
    nv = 0 if fp is None else int(fp.get("nNativeVariants") or 0)
    return np.asarray([math.log1p(n), math.log1p(nv), 1.0 if n == 0 else 0.0], dtype=np.float64)


class H0(nn.Module):
    def __init__(self, n_ident: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=0)
        nn.init.zeros_(self.S.weight)

    def utilities(self, c, w):
        return self.S(c).squeeze(-1)

    def center(self) -> None:
        with torch.no_grad():
            self.S.weight[1:] -= self.S.weight[1:].mean()

    def l2(self) -> torch.Tensor:
        return self.S.weight[1:].pow(2).sum()


class H1(nn.Module):
    def __init__(self, n_ident: int, d: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=0)
        self.beta = nn.Linear(d, 1)
        nn.init.zeros_(self.S.weight)
        nn.init.zeros_(self.beta.weight)
        nn.init.zeros_(self.beta.bias)

    def utilities(self, c, w):
        return self.S(c).squeeze(-1) + self.beta(w).squeeze(-1)

    def center(self) -> None:
        with torch.no_grad():
            self.S.weight[1:] -= self.S.weight[1:].mean()

    def l2(self) -> torch.Tensor:
        return self.S.weight[1:].pow(2).sum() + self.beta.weight.pow(2).sum()


class H2(nn.Module):
    def __init__(self, n_ident: int, d: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=0)
        self.beta = nn.Linear(d, 1)
        self.enc = nn.Linear(d, ZDIM)
        self.A = nn.Linear(ZDIM, RANK)
        self.B = nn.Linear(ZDIM, RANK)
        nn.init.zeros_(self.S.weight)
        nn.init.zeros_(self.beta.weight)
        nn.init.zeros_(self.beta.bias)
        nn.init.normal_(self.enc.weight, std=0.05)
        nn.init.normal_(self.A.weight, std=0.02)
        nn.init.normal_(self.B.weight, std=0.02)

    def utilities(self, c, w):
        own = self.S(c).squeeze(-1) + self.beta(w).squeeze(-1)
        z = torch.tanh(self.enc(w))
        a = self.A(z)
        b = self.B(z)
        inter = (a * b.sum(dim=-2, keepdim=True)).sum(dim=-1) - (a.sum(dim=-2, keepdim=True) * b).sum(dim=-1)
        return own + inter

    def center(self) -> None:
        with torch.no_grad():
            self.S.weight[1:] -= self.S.weight[1:].mean()

    def l2(self) -> torch.Tensor:
        return (
            self.S.weight[1:].pow(2).sum()
            + self.beta.weight.pow(2).sum()
            + LAM_I / LAM_W * (self.A.weight.pow(2).sum() + self.B.weight.pow(2).sum() + self.enc.weight.pow(2).sum())
        )


def set_seeds(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_eval(cls, n_ident, c, w, y, train_idx, test_idx, device, lam_w=LAM_W):
    d = w.shape[-1]
    model = cls(n_ident, d).to(device) if cls is not H0 else H0(n_ident).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c[train_idx]).to(device)
    wt = torch.from_numpy(w[train_idx]).float().to(device)
    yt = torch.from_numpy(y[train_idx]).to(device)
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
            loss = F.nll_loss(F.log_softmax(u, dim=-1), yt[ii]) + LAM_S * model.S.weight[1:].pow(2).sum()
            if cls is H1:
                loss = loss + lam_w * model.beta.weight.pow(2).sum()
            elif cls is H2:
                loss = loss + lam_w * model.beta.weight.pow(2).sum() + LAM_I * (
                    model.A.weight.pow(2).sum() + model.B.weight.pow(2).sum() + model.enc.weight.pow(2).sum()
                )
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center()
    model.eval()
    with torch.no_grad():
        p = torch.softmax(
            model.utilities(torch.from_numpy(c[test_idx]).to(device), torch.from_numpy(w[test_idx]).float().to(device)),
            dim=-1,
        ).cpu().numpy()
        beta = None
        if cls is not H0:
            beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return p, beta


def metrics(p, y) -> dict:
    n = len(y)
    pw = p[np.arange(n), y]
    ll = float(-np.log(np.clip(pw, 1e-12, 1.0)).mean())
    one = np.zeros_like(p)
    one[np.arange(n), y] = 1.0
    brier = float(((p - one) ** 2).sum(axis=1).mean())
    top1 = float((p.argmax(axis=1) == y).mean())
    return {"n": n, "logloss": ll, "brier": brier, "top1": top1}


def standardize(train, test):
    mu = train.mean(axis=(0, 1), keepdims=True)
    sd = train.std(axis=(0, 1), keepdims=True)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return (train - mu) / sd, (test - mu) / sd


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    print("  P0 verify freeze", flush=True)
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", {"reason": "FROZEN_REPRESENTATION_HASH_MISMATCH", **ver})
        raise SystemExit("STOP: frozen Spellbook representation hash mismatch")
    print("  SPELLBOOK_REPRESENTATION_HASH_VERIFIED = true", flush=True)
    assert_cmmg_v1_reserved_winners_locked()

    print("  load architecture fingerprints", flush=True)
    fps = {}
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                fps[str(rec["deckInstanceId"])] = rec

    reserved_ids = {p["podId"] for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}

    print("  join spent pods", flush=True)
    cmd_of = {}
    names = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and (deck.get("commanderResolutionStatus") or "") == "resolved":
                ident = commander_identity(list(deck.get("commanderOracleIds") or []))
                cmd_of[did] = ident
                parts = []
                for c in deck.get("commanders") or []:
                    if isinstance(c, dict):
                        nm = (c.get("canonicalOracleName") or "").strip()
                        if nm:
                            parts.append(nm)
                if ident and parts:
                    names[ident] = " / ".join(parts)

    wanted = {}
    rows = []
    n_spent_scanned = 0
    n_missing_fp = 0
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if pid in reserved_ids or pid not in spent_ids:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            if not winner_field_present(pod):
                continue
            ids = [str(p.get("deckInstanceId") or "") for p in (pod.get("participants") or [])]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                continue
            n_spent_scanned += 1
            if any(d not in fps for d in ids):
                n_missing_fp += 1
                continue
            wanted[pid] = ids
            rows.append({"podId": pid, "tid": str(pod.get("tid") or ""), "decks": ids, "commanders": idents})

    seats = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            if pid in reserved_ids or pid not in wanted:
                continue
            did = winner_deck_instance_id(raw)
            seats[pid] = wanted[pid].index(did)
    if reserved_ids & set(seats):
        raise SystemExit("reserved winners leaked")
    rows = [r for r in rows if r["podId"] in seats]
    print(f"    joined pods {len(rows)} spent_commander_pods {n_spent_scanned} missing_fp {n_missing_fp}", flush=True)

    appear = defaultdict(int)
    for r in rows:
        for c in r["commanders"]:
            appear[c] += 1
    vocab = sorted(appear)
    cidx = {c: i + 1 for i, c in enumerate(vocab)}
    n = len(rows)
    c = np.zeros((n, 4), dtype=np.int64)
    y = np.zeros(n, dtype=np.int64)
    w = np.zeros((n, 4, len(FEATURE_NAMES)), dtype=np.float64)
    wcount = np.zeros((n, 4, 3), dtype=np.float64)
    zero_seat = np.zeros((n, 4), dtype=bool)
    motifs = []
    deck_ids = []
    for i, r in enumerate(rows):
        y[i] = seats[r["podId"]]
        ms = []
        ds = []
        for j, did in enumerate(r["decks"]):
            c[i, j] = cidx[r["commanders"][j]]
            fp = fps[did]
            w[i, j] = fp_vector(fp)
            wcount[i, j] = count_only_vector(fp)
            zero_seat[i, j] = int(fp.get("nNormalizedCombos") or 0) == 0
            ms.append(fp.get("architectureMotif") or "NO_TERMINAL|NO_ENABLING|min0|NONE")
            ds.append(did)
        motifs.append(ms)
        deck_ids.append(ds)

    # within-commander shuffle of architecture
    by_cmd_decks = defaultdict(list)
    seen_deck = set()
    for i, r in enumerate(rows):
        for j, did in enumerate(r["decks"]):
            if did in seen_deck:
                continue
            seen_deck.add(did)
            by_cmd_decks[r["commanders"][j]].append(did)
    rng = np.random.default_rng(SEED)
    remap = {}
    for ident, dids in by_cmd_decks.items():
        dest = list(dids)
        rng.shuffle(dest)
        for a, b in zip(dids, dest):
            remap[a] = b
    wshuf = np.zeros_like(w)
    for i, r in enumerate(rows):
        for j, did in enumerate(r["decks"]):
            wshuf[i, j] = fp_vector(fps[remap[did]])

    folds = np.array([int(hashlib.sha256(f"SWA_V1_EVENT:{r['tid']}".encode()).hexdigest(), 16) % N_FOLDS for r in rows])
    tids = [r["tid"] for r in rows]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  event CV {N_FOLDS} folds on {device}", flush=True)

    oof = {k: np.zeros((n, 4), dtype=np.float64) for k in ("h0", "h1", "h2", "h1shuf", "h1count")}
    betas = []
    for fold in range(N_FOLDS):
        tr = np.where(folds != fold)[0]
        te = np.where(folds == fold)[0]
        print(f"    fold {fold} train {len(tr)} test {len(te)}", flush=True)
        wtr, wte = standardize(w[tr], w[te])
        wctr, wcte = standardize(wcount[tr], wcount[te])
        wstr, wste = standardize(wshuf[tr], wshuf[te])
        w_std = np.zeros_like(w)
        w_std[tr], w_std[te] = wtr, wte
        wc_std = np.zeros_like(wcount)
        wc_std[tr], wc_std[te] = wctr, wcte
        ws_std = np.zeros_like(wshuf)
        ws_std[tr], ws_std[te] = wstr, wste
        oof["h0"][te], _ = train_eval(H0, len(vocab), c, w_std, y, tr, te, device)
        oof["h1"][te], b1 = train_eval(H1, len(vocab), c, w_std, y, tr, te, device)
        oof["h2"][te], _ = train_eval(H2, len(vocab), c, w_std, y, tr, te, device)
        oof["h1shuf"][te], _ = train_eval(H1, len(vocab), c, ws_std, y, tr, te, device)
        oof["h1count"][te], _ = train_eval(H1, len(vocab), c, wc_std, y, tr, te, device)
        if b1 is not None:
            betas.append(b1)

    def pack(name):
        m = metrics(oof[name], y)
        m["name"] = name
        return m

    m0, m1, m2, ms, mc = pack("h0"), pack("h1"), pack("h2"), pack("h1shuf"), pack("h1count")
    zero_pod = zero_seat.any(axis=1)
    m1z = metrics(oof["h1"][zero_pod], y[zero_pod]) if zero_pod.any() else {"n": 0}
    m1nz = metrics(oof["h1"][~zero_pod], y[~zero_pod])
    m2z = metrics(oof["h2"][zero_pod], y[zero_pod]) if zero_pod.any() else {"n": 0}

    event_ll = defaultdict(lambda: {k: [] for k in oof})
    for i, tid in enumerate(tids):
        for k, p in oof.items():
            pw = float(np.clip(p[i, y[i]], 1e-12, 1.0))
            event_ll[tid][k].append(-math.log(pw))

    def event_delta(a, b):
        xs = []
        for tid, rec in event_ll.items():
            if rec[a] and rec[b]:
                xs.append(float(np.mean(rec[a]) - np.mean(rec[b])))
        arr = np.asarray(xs)
        return {
            "nEvents": int(len(arr)),
            "mean": float(arr.mean()) if len(arr) else 0.0,
            "p50": float(np.median(arr)) if len(arr) else 0.0,
            "p10": float(np.percentile(arr, 10)) if len(arr) else 0.0,
            "p90": float(np.percentile(arr, 90)) if len(arr) else 0.0,
            "fracPositive": float((arr > 0).mean()) if len(arr) else 0.0,
        }

    dim_contrib = []
    if betas:
        mb = np.mean(betas, axis=0)
        for name, val in zip(FEATURE_NAMES, mb):
            dim_contrib.append({"feature": name, "meanBeta": float(val), "abs": float(abs(val))})
        dim_contrib.sort(key=lambda r: -r["abs"])

    # within-commander descriptive
    cmd_stats = defaultdict(lambda: {"n": 0, "wins": 0, "motif": defaultdict(lambda: [0, 0])})
    for i, r in enumerate(rows):
        for j in range(4):
            ident = r["commanders"][j]
            mot = motifs[i][j]
            cmd_stats[ident]["n"] += 1
            cmd_stats[ident]["wins"] += int(y[i] == j)
            cmd_stats[ident]["motif"][mot][0] += 1
            cmd_stats[ident]["motif"][mot][1] += int(y[i] == j)
    within = []
    for ident, rec in cmd_stats.items():
        usable = {m: v for m, v in rec["motif"].items() if v[0] >= 10}
        if rec["n"] < 80 or len(usable) < 2:
            continue
        p0 = rec["wins"] / rec["n"]
        rates = []
        for m, (nn, ww) in usable.items():
            raw = ww / nn
            shrink = (nn / (nn + 20.0)) * raw + (20.0 / (nn + 20.0)) * p0
            rates.append({"motif": m, "n": nn, "wins": ww, "raw": raw, "shrunk": shrink})
        rates.sort(key=lambda x: -x["shrunk"])
        within.append(
            {
                "commanderIdentity": ident,
                "name": names.get(ident, ident[:16]),
                "nSeats": rec["n"],
                "nMotifsGe10": len(usable),
                "commanderWinRate": p0,
                "shrunkSpread": rates[0]["shrunk"] - rates[-1]["shrunk"],
                "best": rates[0],
                "worst": rates[-1],
            }
        )
    within.sort(key=lambda r: -r["shrunkSpread"])

    n_zero_lists = int(zero_seat.sum())
    n_seats = n * 4
    report = {
        "artifactType": "SpellbookHistoricalOutcomeAssociationV1",
        "role": "HISTORICAL_EXPLORATORY_ONLY",
        "confirmatory": False,
        "SPELLBOOK_REPRESENTATION_HASH_VERIFIED": True,
        "SPELLBOOK_REPRESENTATION_CHANGED_AFTER_OUTCOME_JOIN": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "CMMG_CONFIRMATORY_LINEAGE_CHANGED": False,
        "coverage": {
            "spentCommanderIdentifiablePods": 44625,
            "spentCommanderPodsScanned": n_spent_scanned,
            "joinedPodsAllFourFingerprinted": n,
            "nEvents": len(set(tids)),
            "nCommanders": len(vocab),
            "exactListsOnSeats": n_seats,
            "zeroComboSeats": n_zero_lists,
            "zeroComboSeatFraction": n_zero_lists / n_seats,
            "podsWithAnyZeroComboSeat": int(zero_pod.sum()),
            "podsDroppedMissingFingerprint": n_missing_fp,
        },
        "H0": m0,
        "H1": m1,
        "H2": m2,
        "deltaOwnArch_LL_H0_minus_H1": m0["logloss"] - m1["logloss"],
        "deltaMatchArch_LL_H1_minus_H2": m1["logloss"] - m2["logloss"],
        "eventDeltaH0H1": event_delta("h0", "h1"),
        "eventDeltaH1H2": event_delta("h1", "h2"),
        "controls": {"shuffledArchitectureWithinCommander": ms, "comboCountOnly": mc},
        "zeroComboSubset": {"H1": m1z, "H2": m2z, "H1nonzero": m1nz},
        "h1DimensionContribution": dim_contrib[:25] if (m0["logloss"] - m1["logloss"]) > 0 else [],
        "withinCommander": {"nCommandersReported": len(within), "topSpreads": within[:20]},
        "h2InteractionInspected": False,
        "rpsSearched": False,
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(OUT / "WITHIN_COMMANDER.json", {"commanders": within})
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "status": "HISTORICAL_ASSOCIATION_REPORTED",
            "SPELLBOOK_REPRESENTATION_CHANGED_AFTER_OUTCOME_JOIN": False,
            "CMMG_SEALED_OUTCOMES_OPENED": False,
            "PROFESSOR_CHANGED": False,
        },
    )
    print(json.dumps({k: report[k] for k in ("H0", "H1", "H2", "deltaOwnArch_LL_H0_minus_H1", "deltaMatchArch_LL_H1_minus_H2", "coverage")}, indent=2))


if __name__ == "__main__":
    main()
