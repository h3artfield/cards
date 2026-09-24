"""
ODSG v1 outcome-blind deck representation x_D.
No winners. No Pressure/K. No player/tournament identity.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter

import numpy as np

ACTIONS = [
    "add_mana",
    "draw",
    "put_into_hand",
    "discard",
    "search_library",
    "deal_damage",
    "destroy",
    "exile",
    "counter",
    "return_to_hand",
    "return_to_battlefield",
    "create_token",
    "cast",
    "play",
    "put_onto_battlefield",
    "copy",
    "sacrifice",
    "mill",
    "gain_life",
    "lose_life",
    "scry",
    "surveil",
    "tap",
    "untap",
    "put_counter",
    "shuffle_library",
    "shuffle_into_library",
]
ROLES = [
    "removal",
    "board_interaction",
    "card_draw",
    "card_advantage",
    "ramp",
    "mana_generation",
    "recursion",
    "reanimation",
    "token_generation",
    "sacrifice_outlet",
    "sacrifice_payoff",
    "blink_flicker",
    "graveyard_setup",
    "cast_from_exile",
    "spell_copying",
    "countermagic",
    "counter_synergy",
    "combat_manipulation",
    "life_gain",
    "life_loss",
    "mill",
    "tutor",
    "protection",
    "board_wipe",
    "cost_reduction",
    "copy_effects",
    "combat_payoff",
]
STRUCTURES = ["static", "activated", "triggered", "spell_effect", "replacement", "loyalty", "modal", "saga"]
ZONES = ["hand", "library", "battlefield", "graveyard", "exile", "stack"]
OWNERS = ["source_card", "granted_object", "created_object", "granted_ability", "token_definition"]
REPEAT = ["repeatable", "one_shot", "mixed", "unknown"]
CONDITIONS = ["trigger", "activation", "replacement", "continuous", "on_resolution", "loyalty"]
RESOURCES = [
    "add_mana",
    "draw",
    "put_into_hand",
    "create_token",
    "search_library",
    "put_onto_battlefield",
    "put_counter",
    "gain_life",
    "copy",
]
SCOPE = ["mass", "targeted", "self"]
COLORS = ["W", "U", "B", "R", "G"]
TYPES = ["creature", "artifact", "enchantment", "planeswalker", "instant", "sorcery", "battle", "land", "other"]
MV_BINS = ["mv0", "mv1", "mv2", "mv3", "mv4", "mv5", "mv6", "mv7plus"]
REPEATABLE_STRUCTURES = {"activated", "triggered", "replacement", "static", "loyalty"}
ONE_SHOT_STRUCTURES = {"spell_effect"}
BGE_DIM = 1024


def _norm(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def infer_repeatability(ability_types: list[str]) -> str:
    toks = {_norm(t) for t in ability_types}
    has_r = bool(toks & REPEATABLE_STRUCTURES)
    has_o = bool(toks & ONE_SHOT_STRUCTURES)
    if has_r and has_o:
        return "mixed"
    if has_r:
        return "repeatable"
    if has_o:
        return "one_shot"
    return "unknown"


def infer_conditions(ability_types: list[str]) -> list[str]:
    out = []
    for raw in ability_types:
        t = _norm(raw)
        if t == "triggered":
            out.append("trigger")
        elif t == "activated":
            out.append("activation")
        elif t == "replacement":
            out.append("replacement")
        elif t == "static":
            out.append("continuous")
        elif t == "spell_effect":
            out.append("on_resolution")
        elif t == "loyalty":
            out.append("loyalty")
    return list(dict.fromkeys(out))


def infer_scope(roles: list[str]) -> list[str]:
    r = {_norm(x) for x in roles}
    scope = []
    if "board_wipe" in r:
        scope.append("mass")
    if "removal" in r or "countermagic" in r:
        scope.append("targeted")
    if r & {"card_draw", "card_advantage", "ramp", "protection"}:
        scope.append("self")
    return scope


def field_manifest() -> list[str]:
    names = []
    for c in COLORS:
        names.append(f"identity_{c}")
    names.append("identity_colorless")
    names.extend(["land_frac", "nonland_frac"])
    names.extend(MV_BINS)
    names.extend([f"type_{t}" for t in TYPES])
    names.extend(["permanent_frac", "spell_frac", "commander_count_norm"])
    names.extend(["missing_bge_cmd", "missing_bge_99", "missing_sem_cmd", "missing_sem_99"])
    for prefix in ("cmd", "lib"):
        names.extend([f"{prefix}_action_{a}" for a in ACTIONS])
        names.extend([f"{prefix}_role_{a}" for a in ROLES])
        names.extend([f"{prefix}_struct_{a}" for a in STRUCTURES])
        names.extend([f"{prefix}_zone_{a}" for a in ZONES])
        names.extend([f"{prefix}_owner_{a}" for a in OWNERS])
        names.extend([f"{prefix}_repeat_{a}" for a in REPEAT])
        names.extend([f"{prefix}_cond_{a}" for a in CONDITIONS])
        names.extend([f"{prefix}_resource_{a}" for a in RESOURCES])
        names.extend([f"{prefix}_scope_{a}" for a in SCOPE])
    names.extend([f"bge_cmd_{i}" for i in range(BGE_DIM)])
    names.extend([f"bge_lib_mean_{i}" for i in range(BGE_DIM)])
    names.extend([f"bge_lib_std_{i}" for i in range(BGE_DIM)])
    names.extend([f"bge_lib_max_{i}" for i in range(BGE_DIM)])
    return names


INPUT_DIM = len(field_manifest())


def exact_list_hash(commander_oids: list[str], mainboard: list[dict]) -> str:
    cards = []
    for c in mainboard:
        oid = c.get("oracleId")
        if not oid:
            continue
        cards.append({"oracleId": str(oid), "quantity": int(c.get("quantity") or 1)})
    cards.sort(key=lambda r: (r["oracleId"], r["quantity"]))
    blob = {
        "commanderOracleIds": sorted({str(x) for x in commander_oids if x}),
        "mainboard": cards,
    }
    return hashlib.sha256(json.dumps(blob, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def _frac_vocab(counter: Counter, vocab: list[str], denom: float) -> list[float]:
    d = max(denom, 1.0)
    return [counter.get(k, 0.0) / d for k in vocab]


def _semantic_block(points: list[dict], weights: list[float]) -> list[float]:
    n = float(sum(weights)) if weights else 0.0
    act = Counter()
    role = Counter()
    st = Counter()
    zn = Counter()
    own = Counter()
    rp = Counter()
    cd = Counter()
    rs = Counter()
    sc = Counter()
    for pt, w in zip(points, weights):
        actions = [_norm(a) for a in (pt.get("topActions") or [])]
        roles = [_norm(a) for a in (pt.get("derivedRoles") or [])]
        structs = [_norm(a) for a in (pt.get("abilityTypes") or [])]
        zones = [_norm(a) for a in (pt.get("zones") or [])]
        owners = [_norm(a) for a in (pt.get("semanticOwners") or [])]
        for a in actions:
            act[a] += w
            if a in RESOURCES:
                rs[a] += w
        for a in roles:
            role[a] += w
        for a in structs:
            st[a] += w
        for a in zones:
            zn[a] += w
        for a in owners:
            own[a] += w
        rp[infer_repeatability(pt.get("abilityTypes") or [])] += w
        for a in infer_conditions(pt.get("abilityTypes") or []):
            cd[a] += w
        for a in infer_scope(pt.get("derivedRoles") or []):
            sc[a] += w
    out = []
    out.extend(_frac_vocab(act, ACTIONS, n))
    out.extend(_frac_vocab(role, ROLES, n))
    out.extend(_frac_vocab(st, STRUCTURES, n))
    out.extend(_frac_vocab(zn, ZONES, n))
    out.extend(_frac_vocab(own, OWNERS, n))
    out.extend(_frac_vocab(rp, REPEAT, n))
    out.extend(_frac_vocab(cd, CONDITIONS, n))
    out.extend(_frac_vocab(rs, RESOURCES, n))
    out.extend(_frac_vocab(sc, SCOPE, n))
    return out


def _type_flags(type_line: str) -> set[str]:
    t = type_line.lower()
    flags = set()
    for name in TYPES:
        if name != "other" and name in t:
            flags.add(name)
    if not flags:
        flags.add("other")
    return flags


def build_x_d(
    commander_oids: list[str],
    mainboard: list[dict],
    points: dict[str, dict],
    bge_row: dict[str, int],
    bge: np.ndarray,
) -> tuple[np.ndarray, dict]:
    cmd_set = [str(x) for x in commander_oids if x]
    lib = []
    for c in mainboard:
        oid = c.get("oracleId")
        if not oid or str(oid) in cmd_set:
            continue
        lib.append((str(oid), int(c.get("quantity") or 1)))

    identity = set()
    land_w = 0.0
    nonland_w = 0.0
    mv = Counter()
    types = Counter()
    perm_w = 0.0
    spell_w = 0.0
    all_w = 0.0

    def consume(oid: str, w: float, is_cmd: bool) -> None:
        nonlocal land_w, nonland_w, perm_w, spell_w, all_w
        pt = points.get(oid)
        all_w += w
        tl = (pt.get("typeLine") if pt else "") or ""
        flags = _type_flags(tl)
        for f in flags:
            types[f] += w
        if "land" in flags:
            land_w += w
        else:
            nonland_w += w
            mv_val = int(pt.get("manaValue") or 0) if pt else 0
            mv[min(mv_val, 7)] += w
        if flags & {"instant", "sorcery"} and "land" not in flags:
            spell_w += w
        else:
            perm_w += w
        if pt:
            for c in pt.get("colorIdentity") or []:
                identity.add(c)

    for oid in cmd_set:
        consume(oid, 1.0, True)
    for oid, q in lib:
        consume(oid, float(q), False)

    struct = []
    for c in COLORS:
        struct.append(1.0 if c in identity else 0.0)
    struct.append(1.0 if not identity else 0.0)
    tot = max(all_w, 1.0)
    nl = max(nonland_w, 1.0)
    struct.extend([land_w / tot, nonland_w / tot])
    for i, _name in enumerate(MV_BINS):
        key = i if i < 7 else 7
        struct.append(mv.get(key, 0.0) / nl)
    for t in TYPES:
        struct.append(types.get(t, 0.0) / tot)
    struct.extend([perm_w / tot, spell_w / tot, len(cmd_set) / 2.0])

    cmd_pts = [points[o] for o in cmd_set if o in points]
    lib_pts = []
    lib_w = []
    for oid, q in lib:
        if oid in points:
            lib_pts.append(points[oid])
            lib_w.append(float(q))
    miss_sem_cmd = 0.0 if not cmd_set else 1.0 - (len(cmd_pts) / len(cmd_set))
    miss_sem_99 = 0.0 if not lib else 1.0 - (len(lib_pts) / len(lib))
    struct.extend([0.0, 0.0, miss_sem_cmd, miss_sem_99])

    sem = _semantic_block(cmd_pts, [1.0] * len(cmd_pts)) + _semantic_block(lib_pts, lib_w)

    def bge_of(oid: str) -> np.ndarray | None:
        i = bge_row.get(oid)
        if i is None:
            return None
        return bge[i]

    cmd_vecs = [bge_of(o) for o in cmd_set]
    cmd_ok = [v for v in cmd_vecs if v is not None]
    lib_vecs = []
    for oid, q in lib:
        v = bge_of(oid)
        if v is not None:
            for _ in range(q):
                lib_vecs.append(v)
    miss_bge_cmd = 1.0 if cmd_set and not cmd_ok else 0.0
    miss_bge_99 = 1.0 if lib and not lib_vecs else 0.0
    struct[28] = miss_bge_cmd
    struct[29] = miss_bge_99

    cmd_agg = np.mean(np.stack(cmd_ok), axis=0) if cmd_ok else np.zeros(BGE_DIM, dtype=np.float32)
    if lib_vecs:
        stacked = np.stack(lib_vecs).astype(np.float32)
        lib_mean = stacked.mean(axis=0)
        lib_std = stacked.std(axis=0)
        lib_max = stacked.max(axis=0)
    else:
        lib_mean = np.zeros(BGE_DIM, dtype=np.float32)
        lib_std = np.zeros(BGE_DIM, dtype=np.float32)
        lib_max = np.zeros(BGE_DIM, dtype=np.float32)

    x = np.concatenate(
        [
            np.asarray(struct, dtype=np.float32),
            np.asarray(sem, dtype=np.float32),
            cmd_agg.astype(np.float32),
            lib_mean.astype(np.float32),
            lib_std.astype(np.float32),
            lib_max.astype(np.float32),
        ]
    )
    if x.shape[0] != INPUT_DIM:
        raise RuntimeError(f"x_D dim {x.shape[0]} != {INPUT_DIM}")
    coverage = {
        "nCommanders": len(cmd_set),
        "nLibraryEntries": len(lib),
        "nSemCmd": len(cmd_pts),
        "nSemLib": len(lib_pts),
        "nBgeCmd": len(cmd_ok),
        "nBgeLib": len(lib_vecs),
        "missingSemCmd": miss_sem_cmd,
        "missingSem99": miss_sem_99,
        "missingBgeCmd": miss_bge_cmd,
        "missingBge99": miss_bge_99,
    }
    return x, coverage
