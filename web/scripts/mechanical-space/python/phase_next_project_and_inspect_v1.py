#!/usr/bin/env python3
"""Family holdout, regularized alignment, full-corpus projection, qualitative inspection."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from phase_next_compare_and_align_v1 import GRAPH, NEU, RC8, SB, SUP, WEB, l2, load_json, load_space, zscore_train
from train_experiments import SEED, set_seeds

MS = WEB / "data" / "milestones" / "mechanical-space"
OUT = MS / "mechanical-alignment-v1"
PROJ = MS / "oracle-mechanical-projection-v1"
CMP = MS / "representation-comparison-v1"


def family_split():
    variants = load_json(SB / "variants-sample.json")
    family_cards: dict[int, set[str]] = defaultdict(set)
    card_families: dict[str, set[int]] = defaultdict(set)
    for v in variants:
        fams = v.get("of") or [v["id"]]
        for fam in fams:
            for u in v.get("uses") or []:
                oid = u.get("oracleId")
                if oid:
                    family_cards[int(fam) if not isinstance(fam, str) else hash(fam) % 10_000_000].add(oid)
                    card_families[oid].add(int(fam) if not isinstance(fam, str) else hash(fam) % 10_000_000)
    fams = sorted(family_cards)
    rng = np.random.RandomState(SEED)
    rng.shuffle(fams)
    cut = max(1, int(0.16 * len(fams)))
    hold_f = set(fams[:cut])
    train_f = set(fams[cut:])
    train, hold, leaky = [], [], []
    for oid, fs in card_families.items():
        in_h, in_t = bool(fs & hold_f), bool(fs & train_f)
        if in_h and in_t:
            leaky.append(oid)
        elif in_h:
            hold.append(oid)
        else:
            train.append(oid)
    return {
        "trainFamilies": len(train_f),
        "holdoutFamilies": len(hold_f),
        "trainCards": sorted(train),
        "holdoutCards": sorted(hold),
        "leakyExcluded": sorted(leaky),
    }


def align_regularized(Xtr, Gtr, Xva, Gva, device="cpu", hidden=64, epochs=200, lr=1e-3, wd=1e-4):
    import torch
    import torch.nn as nn

    Gtr, Gva = l2(Gtr), l2(Gva)
    model = nn.Sequential(nn.Linear(Xtr.shape[1], hidden), nn.ReLU(), nn.Dropout(0.2), nn.Linear(hidden, Gtr.shape[1])).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=wd)
    xt = torch.tensor(Xtr, dtype=torch.float32, device=device)
    gt = torch.tensor(Gtr, dtype=torch.float32, device=device)
    xv = torch.tensor(Xva, dtype=torch.float32, device=device)
    gv = torch.tensor(Gva, dtype=torch.float32, device=device)
    best, best_state, best_ep = -1.0, None, 0
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        pred = torch.nn.functional.normalize(model(xt), dim=1)
        loss = 1 - (pred * gt).sum(-1).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        model.eval()
        with torch.no_grad():
            pv = torch.nn.functional.normalize(model(xv), dim=1)
            val = float((pv * gv).sum(-1).mean())
        if val > best:
            best, best_ep = val, ep
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        tr = float((torch.nn.functional.normalize(model(xt), dim=1) * gt).sum(-1).mean())
    return model, {"trainCosine": tr, "valCosine": best, "bestEpoch": best_ep, "seconds": time.time() - t0}


def predict(model, X, device):
    import torch

    model.eval()
    with torch.no_grad():
        return torch.nn.functional.normalize(model(torch.tensor(X, dtype=torch.float32, device=device)), dim=1).detach().cpu().numpy()


def feature_map():
    cards = load_json(SB / "cards-slim.json")
    out = {}
    for c in cards:
        if c.get("oracleId"):
            out[c["oracleId"]] = [f.get("featureName") or str(f.get("featureId")) for f in (c.get("features") or [])]
    return out


def nearest(query, gallery, gallery_ids, k=5):
    sims = query @ gallery.T
    top = np.argsort(-sims)[:k]
    return [{"oracleId": gallery_ids[j], "cosine": float(sims[j])} for j in top]


def main():
    set_seeds(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    PROJ.mkdir(parents=True, exist_ok=True)
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    rc8_man, rc8, rc8_id, names = load_space(RC8)
    neu_man, neu, neu_id, _ = load_space(NEU)
    snap_idx = [json.loads(line) for line in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if line]
    text = {r["oracleId"]: r.get("oracleText") or "" for r in snap_idx}
    types = {r["oracleId"]: r.get("typeLine") or "" for r in snap_idx}

    X_neu = np.zeros((rc8.shape[0], neu.shape[1]), dtype=np.float32)
    for oid, i in rc8_id.items():
        if oid in neu_id:
            X_neu[i] = neu[neu_id[oid]]
    splits = load_json(SUP / "splits-eval-a-random.json")
    train_idx = [rc8_id[i] for i in splits["train"] if i in rc8_id]
    X_hyb = np.concatenate([l2(X_neu), zscore_train(rc8[train_idx], rc8)], axis=1)

    nodes = load_json(GRAPH / "nodes.json")
    g = np.fromfile(GRAPH / "node-vectors.f32", dtype=np.float32)
    dim = int(load_json(GRAPH / "manifest.json")["dim"])
    g = g.reshape(len(nodes), dim)
    card_nodes = {n[5:]: i for i, n in enumerate(nodes) if n.startswith("card:")}
    known = [oid for oid in rc8_id if oid in card_nodes]
    feats = feature_map()

    fam = family_split()
    fam_train = [i for i in fam["trainCards"] if i in card_nodes and i in rc8_id]
    fam_hold = [i for i in fam["holdoutCards"] if i in card_nodes and i in rc8_id]
    # val from train
    rng = np.random.RandomState(SEED)
    perm = rng.permutation(len(fam_train))
    nval = max(20, len(fam_train) // 8)
    val_ids = [fam_train[i] for i in perm[:nval]]
    tr_ids = [fam_train[i] for i in perm[nval:]]

    spaces = {"Neural": X_neu, "RC8": rc8, "Hybrid": X_hyb}
    maps = {}
    models = {}
    for key, X in spaces.items():
        Xtr = np.stack([X[rc8_id[i]] for i in tr_ids])
        Gtr = np.stack([g[card_nodes[i]] for i in tr_ids])
        Xva = np.stack([X[rc8_id[i]] for i in val_ids])
        Gva = np.stack([g[card_nodes[i]] for i in val_ids])
        Xho = np.stack([X[rc8_id[i]] for i in fam_hold]) if fam_hold else Xva
        Gho = np.stack([g[card_nodes[i]] for i in fam_hold]) if fam_hold else Gva
        model, stats = align_regularized(Xtr, Gtr, Xva, Gva, device=device)
        pred_ho = predict(model, Xho, device)
        hold_cos = float((pred_ho * l2(Gho)).sum(-1).mean()) if len(pred_ho) else None
        maps[key] = {**stats, "familyHoldoutCosine": hold_cos, "familyHoldoutCards": len(fam_hold)}
        models[key] = model

    # Project full corpus with best val mapping (prefer Neural as the intended semantic encoder)
    best_key = max(maps, key=lambda k: maps[k]["valCosine"])
    full_pred = predict(models["Neural"], X_neu, device)
    full_pred.astype(np.float32).tofile(PROJ / "predicted-mechanical.f32")
    known_g = l2(np.stack([g[card_nodes[i]] for i in known]))
    known_ids = known

    # Sanity: family-holdout known cards — neighbor feature overlap
    sanity = []
    if fam_hold:
        Xho = np.stack([X_neu[rc8_id[i]] for i in fam_hold])
        pred = predict(models["Neural"], Xho, device)
        gallery_ids = tr_ids
        gallery = l2(np.stack([g[card_nodes[i]] for i in gallery_ids]))
        for i, oid in enumerate(fam_hold[:12]):
            nbrs = nearest(pred[i], gallery, gallery_ids, 5)
            for n in nbrs:
                n["name"] = names.get(n["oracleId"], n["oracleId"])
                n["features"] = feats.get(n["oracleId"], [])[:6]
            sanity.append(
                {
                    "card": names.get(oid, oid),
                    "oracleId": oid,
                    "features": feats.get(oid, [])[:6],
                    "oracleText": (text.get(oid) or "")[:280],
                    "neighbors": nbrs,
                    "overlapAny": bool(set(feats.get(oid, [])) & {f for n in nbrs for f in n["features"]}),
                }
            )

    keywords = ("create", "token", "sacrifice", "untap", "whenever", "graveyard", "exile", "counter")
    uncovered = [oid for oid in rc8_id if oid not in card_nodes]
    interesting = []
    for oid in uncovered:
        t = (text.get(oid) or "").lower()
        if any(k in t for k in keywords) and len(t) > 40:
            interesting.append(oid)
    rng.shuffle(interesting)
    sample = interesting[:16]
    inspect = []
    if sample:
        Xu = np.stack([X_neu[rc8_id[i]] for i in sample])
        pu = predict(models["Neural"], Xu, device)
        gallery = known_g
        for i, oid in enumerate(sample):
            nbrs = nearest(pu[i], gallery, known_ids, 5)
            for n in nbrs:
                n["name"] = names.get(n["oracleId"], n["oracleId"])
                n["features"] = feats.get(n["oracleId"], [])[:6]
            inspect.append(
                {
                    "uncoveredCard": names.get(oid, oid),
                    "oracleId": oid,
                    "typeLine": types.get(oid, ""),
                    "oracleText": (text.get(oid) or "")[:320],
                    "nearestKnownMechanical": nbrs,
                    "plausible": None,
                }
            )

    (PROJ / "manifest.json").write_text(
        json.dumps(
            {
                "version": "oracle-mechanical-projection-v1",
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "cardCount": int(full_pred.shape[0]),
                "dimensions": int(full_pred.shape[1]),
                "source": "Neural Oracle BGE-large → f(x) → node2vec mechanical space",
                "alignmentUsed": "Neural",
                "bestValMapping": best_key,
                "checksumNote": "predicted-mechanical.f32 row-aligned to RC8 snapshot index",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "family-holdout.json").write_text(json.dumps({**{k: fam[k] for k in fam if k not in ("trainCards", "holdoutCards", "leakyExcluded")}, "trainCardCount": len(fam_train), "holdoutCardCount": len(fam_hold), "leakyCount": len(fam["leakyExcluded"])}, indent=2) + "\n")
    (OUT / "regularized-report.json").write_text(
        json.dumps(
            {
                "version": "mechanical-alignment-regularized-v1",
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "familySplit": {
                    "trainFamilies": fam["trainFamilies"],
                    "holdoutFamilies": fam["holdoutFamilies"],
                    "trainCards": len(fam_train),
                    "holdoutCards": len(fam_hold),
                    "leakyExcluded": len(fam["leakyExcluded"]),
                },
                "mappings": maps,
                "knownCardSanity": sanity,
                "uncoveredInspection": inspect,
                "winner": max(maps, key=lambda k: (maps[k]["familyHoldoutCosine"] or -1)),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"maps": maps, "winner": max(maps, key=lambda k: (maps[k]["familyHoldoutCosine"] or -1)), "inspectPreview": inspect[:3]}, indent=2))


if __name__ == "__main__":
    main()
