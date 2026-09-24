#!/usr/bin/env python3
"""
COS v2 helpers. Outcome-blind feature construction and authorized loaders.
Does not open FINAL_TEST winners. Does not open CMMG reserved winners.
Does not change frozen COS v1 artifacts.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from run_intrinsic_deck_optimization_geometry_v1 import (
    ACCESS_KEYS,
    RX_DRAW,
    RX_INTERACT,
    RX_PROTECT,
    RX_RAMP,
    RX_RECUR,
    RX_TUTOR,
    deck_features,
    families,
    vec,
)
from run_spellbook_historical_outcome_association_v1 import (
    BATCH,
    FEATURE_NAMES,
    LAM_S,
    LAM_W,
    LR,
    MAX_EPOCHS,
    SEED,
    fp_vector,
    metrics,
    set_seeds,
    standardize,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
ARCH = MS / "spellbook-win-architecture-space-v1"
CMMG = MS / "commander-meta-matchup-geometry-v1"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
DET = MS / "commanderspellbook-exact-deck-detector-v1"
COS1 = MS / "commander-optimization-score-v1"
COS2 = MS / "commander-optimization-score-v2"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"

V1_HEADLINE = list(FEATURE_NAMES) + list(ACCESS_KEYS)
HIER_K = 30.0
LAM_P = 1e-3

RX_TUTOR_ANY = re.compile(r"search your library for (?:a card|up to .{0,24} cards)\b", re.I)
RX_TUTOR_NAMED = re.compile(r"search your library for (?:a card )?named ([^\.\n]+)", re.I)
RX_TUTOR_CREATURE = re.compile(r"search your library for .{0,40}creature", re.I)
RX_TUTOR_ARTIFACT = re.compile(r"search your library for .{0,40}artifact", re.I)
RX_TUTOR_ENCHANT = re.compile(r"search your library for .{0,40}enchantment", re.I)
RX_TUTOR_INSTANT = re.compile(r"search your library for .{0,40}instant", re.I)
RX_TUTOR_SORCERY = re.compile(r"search your library for .{0,40}sorcery", re.I)
RX_TUTOR_PLANES = re.compile(r"search your library for .{0,40}planeswalker", re.I)
RX_TUTOR_LAND = re.compile(r"search your library for .{0,40}(?:basic )?land", re.I)
RX_ADD_MANA = re.compile(r"add \{[wubrgc\d]", re.I)
RX_COLORED_ADD = re.compile(r"add \{[wubrg]", re.I)

ACCESS_KEYS_V2 = [
    "minPieceAccess",
    "meanPieceAccess",
    "fracPiecesWithAccess",
    "logAccessOverlap",
    "mustDrawCount",
    "fracDeckTouchesPackage",
    "logIndependentTerminal",
    "bottleneckShare",
    "variantToFunctionalRatio",
    "minLineMana",
    "fastManaFrac",
    "curveLe1",
    "curveLe2",
    "curveLe3",
    "coloredSourceGap",
    "commanderMv",
    "cmdComboPiece",
    "cmdManaEngine",
    "cmdAccessEngine",
    "cmdTutorEngine",
    "cmdProtectEngine",
    "cmdPayoff",
    "cmdRecurEngine",
    "cmdIndependentRoutes",
]

INTERACTION_KEYS = [
    "ix_compact_access",
    "ix_compact_protect",
    "ix_access_draw",
    "ix_fast_exec",
    "ix_cmdpiece_tutor",
    "ix_termredund_protect",
]

CMD_PRIOR_KEYS = [
    "cmdPriorMv",
    "cmdPriorNColors",
    "cmdPriorTutor",
    "cmdPriorDraw",
    "cmdPriorRamp",
    "cmdPriorInteract",
    "cmdPriorProtect",
    "cmdPriorRecur",
    "cmdPriorCreature",
    "cmdPriorActivated",
]


def usable_list(deck: dict) -> bool:
    main = deck.get("mainboard") or []
    if len(main) < 80:
        return False
    resolved = sum(1 for c in main if c.get("oracleId") or c.get("oracle_id"))
    return resolved >= 70


def read_ids(path: Path) -> list[str]:
    return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def load_combo_dictionary() -> tuple[list[dict], dict[str, list[int]]]:
    rows = []
    freq: Counter[str] = Counter()
    with (ARCH / "normalized-combo-dictionary.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json_loads(line)
            oids = [x for x in str(rec.get("cardSetSignature") or "").split("|") if x]
            rec["_oids"] = oids
            rec["_mana"] = _numeric_mana(rec)
            rows.append(rec)
            for oid in oids:
                freq[oid] += 1
    index: dict[str, list[int]] = defaultdict(list)
    for i, rec in enumerate(rows):
        oids = rec["_oids"]
        if not oids:
            continue
        rare = min(oids, key=lambda o: (freq[o], o))
        index[rare].append(i)
    return rows, dict(index)


def json_loads(line: str):
    import json

    return json.loads(line)


def _numeric_mana(rec: dict) -> float | None:
    vals = []
    for x in rec.get("manaValueNeeded") or []:
        if isinstance(x, (int, float)) and not isinstance(x, bool):
            vals.append(float(x))
        elif isinstance(x, str):
            try:
                vals.append(float(x))
            except ValueError:
                continue
    for x in rec.get("manaNeededValues") or []:
        if isinstance(x, (int, float)) and not isinstance(x, bool):
            vals.append(float(x))
    return min(vals) if vals else None


def detect_combos(present: set[str], combos: list[dict], index: dict[str, list[int]]) -> list[dict]:
    seen: set[int] = set()
    hits = []
    for oid in present:
        for i in index.get(oid, ()):
            if i in seen:
                continue
            seen.add(i)
            rec = combos[i]
            if rec["_oids"] and all(x in present for x in rec["_oids"]):
                hits.append(rec)
    return hits


def architecture_from_combos(hits: list[dict], commander_oids: set[str], n_native: int) -> dict:
    n2 = n3 = n4 = 0
    n_cmd = 0
    term_ids: set = set()
    enab_ids: set = set()
    t_buck: set = set()
    e_buck: set = set()
    n_term_r = n_res_r = n_prereq = n_mana = 0
    zones: Counter = Counter()
    card_hits: Counter = Counter()
    min_c = None
    for d in hits:
        k = int(d.get("comboCardCount") or len(d["_oids"]))
        min_c = k if min_c is None else min(min_c, k)
        if k == 2:
            n2 += 1
        elif k == 3:
            n3 += 1
        elif k >= 4:
            n4 += 1
        if any(oid in commander_oids for oid in d["_oids"]):
            n_cmd += 1
        term_ids.update(d.get("terminalFeatureIds") or [])
        enab_ids.update(d.get("enablingFeatureIds") or [])
        t_buck.update(d.get("terminalBuckets") or [])
        e_buck.update(d.get("enablingBuckets") or [])
        if d.get("isTerminalRoute"):
            n_term_r += 1
        if d.get("isResourceOnlyLoop"):
            n_res_r += 1
        if d.get("hasEasyPrereq") or d.get("hasNotablePrereq") or int(d.get("nTemplates") or 0) > 0:
            n_prereq += 1
        if d.get("_mana") is not None or d.get("manaNeededValues") or d.get("manaValueNeeded"):
            n_mana += 1
        zones.update(d.get("zoneLocations") or {})
        for oid in d["_oids"]:
            card_hits[oid] += 1
    n_set = len(hits)
    if n_set == 0:
        cmd_mode = "NONE"
        frac_cmd = 0.0
        top_share = 0.0
        shared_n = 0
    else:
        frac_cmd = n_cmd / n_set
        if n_cmd == 0:
            cmd_mode = "COMMANDER_INDEPENDENT"
        elif n_cmd == n_set:
            cmd_mode = "COMMANDER_DEPENDENT"
        else:
            cmd_mode = "MIXED"
        shared_n = sum(1 for c in card_hits.values() if c > 1)
        top_share = max(card_hits.values()) / n_set if card_hits else 0.0
    return {
        "nNativeVariants": int(n_native),
        "nNormalizedCombos": n_set,
        "minComboCardCount": min_c,
        "nTwoCard": n2,
        "nThreeCard": n3,
        "nFourPlusCard": n4,
        "nCommanderInvolved": n_cmd,
        "fractionCommanderInvolved": frac_cmd,
        "commanderDependence": cmd_mode,
        "terminalBuckets": sorted(t_buck),
        "enablingBuckets": sorted(e_buck),
        "nTerminalRoutes": n_term_r,
        "nResourceOnlyLoops": n_res_r,
        "nCardsInMultipleComboSets": shared_n,
        "sharedPieceConcentration": top_share,
        "nCombosWithPrereqOrTemplate": n_prereq,
        "nCombosWithManaNeeded": n_mana,
        "zoneProfile": dict(zones),
        "hasTerminal": bool(t_buck),
    }


def finder_kinds(text: str) -> set[str]:
    if not text:
        return set()
    kinds = set()
    if RX_TUTOR_ANY.search(text) or re.search(r"search your library for a card\b", text, re.I):
        kinds.add("any")
    if RX_TUTOR_CREATURE.search(text):
        kinds.add("creature")
    if RX_TUTOR_ARTIFACT.search(text):
        kinds.add("artifact")
    if RX_TUTOR_ENCHANT.search(text):
        kinds.add("enchantment")
    if RX_TUTOR_INSTANT.search(text):
        kinds.add("instant")
    if RX_TUTOR_SORCERY.search(text):
        kinds.add("sorcery")
    if RX_TUTOR_PLANES.search(text):
        kinds.add("planeswalker")
    if RX_TUTOR_LAND.search(text):
        kinds.add("land")
    named = RX_TUTOR_NAMED.findall(text)
    for nm in named:
        kinds.add("named:" + re.sub(r"[^a-z0-9]+", "", nm.lower()))
    if not kinds and RX_TUTOR.search(text):
        kinds.add("any")
    return kinds


def piece_types(pt: dict | None, name: str) -> set[str]:
    tl = ((pt.get("typeLine") if pt else "") or "").lower()
    kinds = set()
    for key in ("creature", "artifact", "enchantment", "instant", "sorcery", "planeswalker", "land"):
        if key in tl:
            kinds.add(key)
    if name:
        kinds.add("named:" + re.sub(r"[^a-z0-9]+", "", name.lower()))
    return kinds


def can_find(finder: set[str], piece: set[str]) -> bool:
    if "any" in finder:
        return True
    return bool(finder & piece)


def independent_terminal_count(hits: list[dict]) -> int:
    term = [set(h["_oids"]) for h in hits if h.get("isTerminalRoute")]
    if not term:
        return 0
    term.sort(key=len)
    chosen: list[set[str]] = []
    for s in term:
        if all(s.isdisjoint(c) for c in chosen):
            chosen.append(s)
    return len(chosen)


def v2_family_features(
    cmd_oids: list[str],
    mainboard: list[dict],
    hits: list[dict],
    fp: dict,
    points: dict,
    texts: dict,
    v1_feat: dict,
) -> dict:
    cmd = set(cmd_oids)
    mb_oids = []
    name_of = {}
    for card in mainboard:
        oid = str(card.get("oracleId") or card.get("oracle_id") or "")
        if oid:
            mb_oids.append(oid)
            pt = points.get(oid) or {}
            name_of[oid] = str(pt.get("name") or pt.get("canonicalName") or "")
    present = set(mb_oids) | cmd
    finders = []
    for oid in mb_oids:
        kinds = finder_kinds(texts.get(oid, ""))
        if kinds:
            finders.append((oid, kinds))
    piece_need: Counter[str] = Counter()
    term_piece: Counter[str] = Counter()
    for h in hits:
        for oid in h["_oids"]:
            if oid not in cmd:
                piece_need[oid] += 1
                if h.get("isTerminalRoute"):
                    term_piece[oid] += 1
    access = []
    for oid, n in piece_need.items():
        pt = points.get(oid)
        ptypes = piece_types(pt, name_of.get(oid, ""))
        n_find = sum(1 for _fo, kinds in finders if can_find(kinds, ptypes))
        access.append(n_find)
    min_acc = float(min(access)) if access else 0.0
    mean_acc = float(sum(access) / len(access)) if access else 0.0
    frac_acc = (sum(1 for a in access if a > 0) / len(access)) if access else 0.0
    must_draw = float(sum(1 for a in access if a <= 0)) if access else 0.0
    package = set(piece_need) | cmd
    touch = 0
    tot_nl = 0
    mvs = []
    fast = 0
    colored_src = 0
    lands = 0
    for oid in mb_oids:
        pt = points.get(oid) or {}
        tl = (pt.get("typeLine") or "").lower()
        is_land = "land" in tl
        if is_land:
            lands += 1
        else:
            tot_nl += 1
            mv = pt.get("manaValue")
            if mv is not None:
                mvs.append(float(mv))
                if float(mv) <= 1 and ("artifact" in tl) and (RX_ADD_MANA.search(texts.get(oid, "")) or "ramp" in families(texts.get(oid, ""))):
                    fast += 1
        ident = set(pt.get("colorIdentity") or [])
        if is_land and ident:
            colored_src += 1
        elif RX_COLORED_ADD.search(texts.get(oid, "")):
            colored_src += 1
        hits_f = families(texts.get(oid, ""))
        if oid in package or hits_f & {"tutor", "ramp"}:
            touch += 1
    cmd_colors = set()
    cmd_mv = 0.0
    cmd_text_fams: set[str] = set()
    cmd_creature = 0.0
    cmd_activated = 0.0
    for oid in cmd:
        pt = points.get(oid) or {}
        cmd_colors.update(pt.get("colorIdentity") or [])
        if pt.get("manaValue") is not None:
            cmd_mv = max(cmd_mv, float(pt["manaValue"]))
        txt = texts.get(oid, "")
        cmd_text_fams |= families(txt)
        tl = (pt.get("typeLine") or "").lower()
        if "creature" in tl:
            cmd_creature = 1.0
        if ":" in txt:
            cmd_activated = 1.0
    n_term = sum(1 for h in hits if h.get("isTerminalRoute"))
    bottleneck = 0.0
    if n_term and term_piece:
        bottleneck = max(term_piece.values()) / n_term
    n_ind = independent_terminal_count(hits)
    n_func = max(int(fp.get("nNormalizedCombos") or 0), 1)
    n_var = max(int(fp.get("nNativeVariants") or 0), 0)
    line_manas = [h["_mana"] for h in hits if h.get("_mana") is not None]
    min_line = float(min(line_manas)) if line_manas else 0.0
    cmd_in_combo = 1.0 if any(any(o in cmd for o in h["_oids"]) for h in hits) else 0.0
    cmd_payoff = 1.0 if any(h.get("isTerminalRoute") and any(o in cmd for o in h["_oids"]) for h in hits) else 0.0
    cmd_indep = float(sum(1 for h in hits if h.get("isTerminalRoute") and not any(o in cmd for o in h["_oids"])))
    colored_need = float(len(cmd_colors))
    gap = max(colored_need - math.log1p(colored_src), 0.0)
    nl = max(tot_nl, 1)
    return {
        "minPieceAccess": min_acc,
        "meanPieceAccess": mean_acc,
        "fracPiecesWithAccess": frac_acc,
        "logAccessOverlap": math.log1p(sum(1 for a in access if a >= 2) if access else 0),
        "mustDrawCount": must_draw,
        "fracDeckTouchesPackage": touch / max(len(mb_oids), 1),
        "logIndependentTerminal": math.log1p(n_ind),
        "bottleneckShare": bottleneck,
        "variantToFunctionalRatio": (n_var / n_func) if n_func else 0.0,
        "minLineMana": min_line,
        "fastManaFrac": fast / nl,
        "curveLe1": (sum(1 for x in mvs if x <= 1) / len(mvs)) if mvs else 0.0,
        "curveLe2": (sum(1 for x in mvs if x <= 2) / len(mvs)) if mvs else 0.0,
        "curveLe3": (sum(1 for x in mvs if x <= 3) / len(mvs)) if mvs else 0.0,
        "coloredSourceGap": gap,
        "commanderMv": cmd_mv,
        "cmdComboPiece": cmd_in_combo,
        "cmdManaEngine": 1.0 if "ramp" in cmd_text_fams else 0.0,
        "cmdAccessEngine": 1.0 if "draw" in cmd_text_fams else 0.0,
        "cmdTutorEngine": 1.0 if "tutor" in cmd_text_fams else 0.0,
        "cmdProtectEngine": 1.0 if "protect" in cmd_text_fams else 0.0,
        "cmdPayoff": cmd_payoff,
        "cmdRecurEngine": 1.0 if "recur" in cmd_text_fams else 0.0,
        "cmdIndependentRoutes": math.log1p(cmd_indep),
        "cmdPriorMv": cmd_mv,
        "cmdPriorNColors": float(len(cmd_colors)),
        "cmdPriorTutor": 1.0 if "tutor" in cmd_text_fams else 0.0,
        "cmdPriorDraw": 1.0 if "draw" in cmd_text_fams else 0.0,
        "cmdPriorRamp": 1.0 if "ramp" in cmd_text_fams else 0.0,
        "cmdPriorInteract": 1.0 if "interact" in cmd_text_fams else 0.0,
        "cmdPriorProtect": 1.0 if "protect" in cmd_text_fams else 0.0,
        "cmdPriorRecur": 1.0 if "recur" in cmd_text_fams else 0.0,
        "cmdPriorCreature": cmd_creature,
        "cmdPriorActivated": cmd_activated,
        "ix_compact_access": (1.0 if int(fp.get("nTwoCard") or 0) else 0.0) * mean_acc,
        "ix_compact_protect": (1.0 if int(fp.get("nTwoCard") or 0) else 0.0) * float(v1_feat.get("protectFrac") or 0),
        "ix_access_draw": mean_acc * float(v1_feat.get("drawFrac") or 0),
        "ix_fast_exec": (fast / nl) * (1.0 / (1.0 + min_line)),
        "ix_cmdpiece_tutor": cmd_in_combo * float(v1_feat.get("tutorFrac") or 0),
        "ix_termredund_protect": math.log1p(n_ind) * float(v1_feat.get("protectFrac") or 0),
    }


class H1Nuisance(nn.Module):
    def __init__(self, n_ident: int, n_player: int, d: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=0)
        self.P = nn.Embedding(n_player + 1, 1, padding_idx=0)
        self.beta = nn.Linear(d, 1)
        nn.init.zeros_(self.S.weight)
        nn.init.zeros_(self.P.weight)
        nn.init.zeros_(self.beta.weight)
        nn.init.zeros_(self.beta.bias)

    def utilities(self, c, p, w, use_player: bool = True):
        u = self.S(c).squeeze(-1) + self.beta(w).squeeze(-1)
        if use_player:
            u = u + self.P(p).squeeze(-1)
        return u

    def center(self) -> None:
        with torch.no_grad():
            self.S.weight[1:] -= self.S.weight[1:].mean()
            if self.P.weight.shape[0] > 1:
                self.P.weight[1:] -= self.P.weight[1:].mean()


class H1Hier(nn.Module):
    def __init__(self, n_ident: int, d: int, d_cmd: int) -> None:
        super().__init__()
        self.S = nn.Embedding(n_ident + 1, 1, padding_idx=0)
        self.beta = nn.Linear(d, 1)
        self.gamma = nn.Linear(d_cmd, 1)
        nn.init.zeros_(self.S.weight)
        nn.init.zeros_(self.beta.weight)
        nn.init.zeros_(self.beta.bias)
        nn.init.zeros_(self.gamma.weight)
        nn.init.zeros_(self.gamma.bias)

    def utilities(self, c, mix, cmd_z, w):
        prior = self.gamma(cmd_z).squeeze(-1)
        return mix * self.S(c).squeeze(-1) + (1.0 - mix) * prior + self.beta(w).squeeze(-1)

    def center(self) -> None:
        with torch.no_grad():
            self.S.weight[1:] -= self.S.weight[1:].mean()


def train_h1(n_ident, c, w, y, device):
    from freeze_commander_optimization_score_v1 import train_full

    return train_full(n_ident, c, w, y, device)


def train_predict_h1(n_ident, c, w, y, train_idx, test_idx, device):
    d = w.shape[-1]
    model = __import__("run_spellbook_historical_outcome_association_v1", fromlist=["H1"]).H1(n_ident, d).to(device)
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
            loss = loss + LAM_W * model.beta.weight.pow(2).sum()
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
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return p, s, beta


def train_predict_nuisance(n_ident, n_player, c, pids, w, y, train_idx, test_idx, device):
    d = w.shape[-1]
    model = H1Nuisance(n_ident, n_player, d).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c[train_idx]).to(device)
    pt = torch.from_numpy(pids[train_idx]).to(device)
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
        te_c = torch.from_numpy(c[test_idx]).to(device)
        te_p = torch.from_numpy(pids[test_idx]).to(device)
        te_w = torch.from_numpy(w[test_idx]).float().to(device)
        p_prod = torch.softmax(model.utilities(te_c, te_p, te_w, False), dim=-1).cpu().numpy()
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return p_prod, s, beta


def train_predict_hier(n_ident, c, mix, cmd_z, w, y, train_idx, test_idx, device):
    d = w.shape[-1]
    d_cmd = cmd_z.shape[-1]
    model = H1Hier(n_ident, d, d_cmd).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c[train_idx]).to(device)
    mt = torch.from_numpy(mix[train_idx]).float().to(device)
    zt = torch.from_numpy(cmd_z[train_idx]).float().to(device)
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
                torch.from_numpy(c[test_idx]).to(device),
                torch.from_numpy(mix[test_idx]).float().to(device),
                torch.from_numpy(cmd_z[test_idx]).float().to(device),
                torch.from_numpy(w[test_idx]).float().to(device),
            ),
            dim=-1,
        ).cpu().numpy()
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
        gamma = model.gamma.weight.detach().cpu().numpy().reshape(-1)
    return p, s, beta, gamma


def event_logloss(p, y, tids) -> dict:
    buckets = defaultdict(list)
    for i, tid in enumerate(tids):
        buckets[tid].append(-math.log(float(np.clip(p[i, y[i]], 1e-12, 1))))
    xs = np.array([float(np.mean(v)) for v in buckets.values()], dtype=np.float64)
    return {
        "nEvents": int(len(xs)),
        "eventMeanLogloss": float(xs.mean()) if len(xs) else None,
        "eventP50Logloss": float(np.median(xs)) if len(xs) else None,
    }


def calibration_bins(p, y, n_bins: int = 10) -> dict:
    pw = p[np.arange(len(y)), y]
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []
    ece = 0.0
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (pw >= lo) & (pw < hi if i < n_bins - 1 else pw <= hi)
        if not np.any(mask):
            continue
        pred = float(pw[mask].mean())
        acc = 1.0  # winner-prob of true winner; reliability vs 1 is wrong
        # Use predicted max-class confidence vs hit rate instead
        conf = p.max(axis=1)
        hit = (p.argmax(axis=1) == y).astype(np.float64)
        m2 = (conf >= lo) & (conf < hi if i < n_bins - 1 else conf <= hi)
        if not np.any(m2):
            continue
        pred_c = float(conf[m2].mean())
        acc_c = float(hit[m2].mean())
        w = float(m2.mean())
        ece += w * abs(pred_c - acc_c)
        rows.append({"lo": float(lo), "hi": float(hi), "n": int(m2.sum()), "meanConf": pred_c, "hitRate": acc_c})
    return {"ece": float(ece), "bins": rows}


def apply_frozen_v1(x, commanders, model) -> np.ndarray:
    mu = np.asarray(model["mu"], dtype=np.float64)
    sd = np.asarray(model["sd"], dtype=np.float64)
    beta = np.asarray(model["beta"], dtype=np.float64)
    S = np.asarray(model["S"], dtype=np.float64)
    ids = model["commanderIdentities"]
    z = (x - mu) / np.where(sd < 1e-8, 1.0, sd)
    resid = z @ beta
    util = np.zeros((x.shape[0], 4), dtype=np.float64)
    for i in range(x.shape[0]):
        for j in range(4):
            ident = commanders[i][j]
            idx = ids.index(ident) if ident in ids else -1
            s = float(S[idx + 1]) if idx >= 0 else 0.0
            util[i, j] = s + float(resid[i, j])
    return _softmax(util)


def _softmax(u: np.ndarray) -> np.ndarray:
    m = u.max(axis=1, keepdims=True)
    e = np.exp(u - m)
    return e / e.sum(axis=1, keepdims=True)
