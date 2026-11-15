#!/usr/bin/env python3
"""
Track B — adjudicate frozen 612 mechanism propositions from transcripts.

Does not load Track A. Does not extract winners. Does not regenerate items.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

from extract_egv1_transcript_outcomes_v2 import parse_vtt
from outcome_firewall_v1 import assert_omv1_mechanism_gates
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
OUT = MS / "observed-mechanism-validation-v1"
RAW = WEB / ".data" / "omv1-transcripts"

MATERIAL = re.compile(
    r"\b(?:shut(?:s|ting)? down|stops?|stopped|can't|cannot|exile[ds]?|exiling|"
    r"hate|hoses?|blank(?:s|ed)?|prevent(?:s|ed)?|delay(?:s|ed)?|lock(?:s|ed)?|"
    r"turn(?:s|ed)? off|no longer|doesn't get|never get|rips?|wipes?|"
    r"graveyard('s| is)? gone|can't reanimate|can't get (?:it|them|cards) back|"
    r"countered|stifled|removed from|eats? the)\b",
    re.I,
)
WINNER_LEAK = re.compile(r"\b(?:wins? the game|won the game|is the winner|takes the win)\b", re.I)

OVERLAY: dict[str, list[str]] = {
    "GRAVEYARD_DENIAL": ["rest in peace", "bojuka", "leyline of the void", "endurance", "scavenger grounds", "dauthi voidwalker", "soul-guide", "exile the graveyard", "exile from the graveyard", "can't get back", "graveyard hate", "gy hate", "empty the graveyard", "rips the graveyard"],
    "CARES_ABOUT_GRAVEYARD": ["reanimate", "reanimation", "from the graveyard", "flashback", "escape", "undying", "persist", "dredge", "unearth", "living death", "return from the yard", "back from the graveyard"],
    "EXILE": ["exile", "exiled", "exiling", "path to exile", "swords to plowshares"],
    "DESTROY": ["destroy", "destroyed", "kills", "killed", "remove that", "swords", "beast within", "chaos warp"],
    "BOUNCE": ["bounce", "bounced", "return to hand", "back to hand", "cyclonic"],
    "FOG": ["fog", "prevent combat", "no combat damage", "combat damage is prevented", "ghostly prison"],
    "ARTIFACT_SHUTDOWN": ["null rod", "collector ouphe", "can't activate", "artifacts don't work", "shut off artifacts", "stony silence", "karn, the great creator"],
    "ARTIFACT_REMOVAL": ["blow up the artifact", "destroy the artifact", "artifact gone", "nature's claim", "wear tear", "vandalblast"],
    "MASS_CREATURE_REMOVAL": ["wrath", "board wipe", "damnation", "toxic deluge", "farewell", "clear the board"],
    "DISCARD_CARD": ["discard", "discards", "thoughtseize", "mind twist", "wheels"],
    "HAND_ATTACK": ["discard", "thoughtseize", "from the hand", "empty hand"],
    "COMBAT_DAMAGE_DEALT": ["combat damage", "connects", "hits for", "commander damage", "in combat"],
    "NONCOMBAT_DAMAGE": ["ping", "drain", "shock", "bolt", "noncombat"],
    "DAMAGE_CREATURE": ["ping", "bolt the", "damage to"],
    "EDICT": ["edict", "sacrifice a creature", "each player sacrifices"],
    "TAP": ["taps it down", "tap down", "frost titan", "doesn't untap"],
    "TAX_SPELL": ["tax", "rhystic", "smothering tithe", "rule of law", "can't cast"],
    "COST_INCREASE": ["costs more", "tax", "thorn of amethyst", "sphere"],
    "COUNTER_SPELL": ["counterspell", "counter that", "counters it", "force of will", "force of negation", "on the stack"],
    "AURA_EQUIPMENT_INVESTMENT": ["aura", "equipment", "equip", "enchant", "voltron", "suited up"],
    "ARTIFACT_TOKEN_DEPENDENCY": ["treasure", "clue", "food", "tokens", "artifact tokens"],
    "CARES_ABOUT_ARTIFACT_ACTIVATIONS": ["activate", "taps for", "artifact ability", "use the artifact"],
    "MUST_ATTACK_WITH_ONE_CREATURE": ["has to attack", "must attack", "go to combat", "only attacker"],
    "MUST_KEEP_ONE_CREATURE_ON_BATTLEFIELD": ["needs that creature", "only creature", "protects the", "keeps it alive"],
    "CARES_ABOUT_COMBAT_DAMAGE": ["combat damage", "connect", "commander damage"],
    "CARD_ACCESS_DEPENDENCY": ["draw", "tutor", "finds the", "needs to find"],
    "CARES_ABOUT_CREATURES": ["creature", "board presence", "needs creatures"],
    "CARES_ABOUT_RESOLUTION": ["resolves", "on the stack", "needs to resolve"],
    "CARES_ABOUT_LARGE_HAND": ["big hand", "cards in hand", "empty handed"],
    "MUST_ATTACK": ["has to attack", "must attack"],
    "CARES_ABOUT_ARTIFACTS": ["artifacts", "artifact"],
    "SPELL_VELOCITY_DEPENDENCY": ["storm", "cast a lot", "spells this turn"],
}


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def phrases(cid: str) -> list[str]:
    base = [cid.lower().replace("_", " ")]
    parts = cid.lower().split("_")
    if len(parts) >= 2:
        base.append(" ".join(parts))
    base.extend(OVERLAY.get(cid, []))
    return list(dict.fromkeys(p for p in base if len(p) >= 4))


def hit(text: str, needles: list[str]) -> str | None:
    low = text.lower()
    for n in needles:
        if n in low:
            return n
    return None


def commander_needles(names: list[str]) -> list[str]:
    out = []
    for name in names:
        for part in name.replace(" // ", "//").split("//"):
            part = part.strip()
            if "," in part:
                out.append(part.split(",")[0].strip().lower())
            if len(part) >= 5:
                out.append(part.lower())
    return list(dict.fromkeys(out))


def adjudicate_item(item: dict, cues: list[tuple[float, str]]) -> dict:
    if not cues:
        return {"label": "INSUFFICIENT_EVIDENCE", "evidence": [], "note": "no_transcript"}
    if len(cues) < 40:
        return {"label": "INSUFFICIENT_EVIDENCE", "evidence": [], "note": "transcript_too_short"}
    cap_p = phrases(item["capability"])
    dep_p = phrases(item["dependency"])
    from_n = commander_needles(item.get("fromCommanders") or [])
    to_n = commander_needles(item.get("toCommanders") or [])
    evidence = []
    cap_hits = 0
    dep_hits = 0
    both_windows = 0
    material_both = 0
    for i, (t, line) in enumerate(cues):
        if WINNER_LEAK.search(line):
            continue
        window = " ".join(cues[j][1] for j in range(max(0, i - 3), min(len(cues), i + 4)))
        c = hit(window, cap_p)
        d = hit(window, dep_p)
        if c:
            cap_hits += 1
        if d:
            dep_hits += 1
        if c and d:
            both_windows += 1
            mat = bool(MATERIAL.search(window))
            if mat:
                material_both += 1
            src = hit(window, from_n)
            dst = hit(window, to_n)
            if len(evidence) < 4:
                evidence.append(
                    {
                        "t": t,
                        "quote": line[:180],
                        "capabilityHit": c,
                        "dependencyHit": d,
                        "materialLanguage": mat,
                        "sourceNameNearby": bool(src),
                        "targetNameNearby": bool(dst),
                    }
                )
    if material_both and both_windows:
        label = "MECHANISM_OBSERVED"
        note = "capability and dependency co-occur with material interference language"
    elif both_windows:
        label = "MECHANISM_PARTIALLY_OBSERVED"
        note = "capability and dependency co-occur without clear material effect language"
    elif cap_hits and dep_hits:
        label = "MECHANISM_PARTIALLY_OBSERVED"
        note = "both sides mentioned in the game, not in the same window"
    elif cap_hits or dep_hits:
        label = "MECHANISM_NOT_OBSERVED"
        note = "only one side of the predicted interaction appears"
    else:
        label = "MECHANISM_NOT_OBSERVED"
        note = "neither capability nor dependency language found"
    return {"label": label, "evidence": evidence, "note": note, "capHits": cap_hits, "depHits": dep_hits}


def main() -> None:
    assert_omv1_mechanism_gates()
    items = load_json(OUT / "blind-mechanism-items-v1.json")
    if items.get("n") != 612:
        raise SystemExit("do not regenerate propositions")
    index = load_json(OUT / "transcript-index-v1.json")
    if index.get("outcomesOpened") is not False:
        raise SystemExit("transcript index opened outcomes")
    by_game = {r["externalGameId"]: r for r in index["games"]}
    cues_of = {}
    for gid, rec in by_game.items():
        path = RAW / f"{gid}.vtt"
        if rec.get("retrieved") and path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            if hashlib.sha256(text.encode("utf-8")).hexdigest() != rec.get("transcriptSha256"):
                raise SystemExit(f"transcript checksum mismatch {gid}")
            cues_of[gid] = parse_vtt(text)
        else:
            cues_of[gid] = []

    rows = []
    counts = Counter()
    by_cap = defaultdict(Counter)
    for item in items["items"]:
        adj = adjudicate_item(item, cues_of.get(item["externalGameId"]) or [])
        if not (by_game.get(item["externalGameId"]) or {}).get("retrieved"):
            adj = {"label": "INSUFFICIENT_EVIDENCE", "evidence": [], "note": "transcript_missing"}
        counts[adj["label"]] += 1
        by_cap[item["capability"]][adj["label"]] += 1
        rows.append(
            {
                "itemId": item["itemId"],
                "externalGameId": item["externalGameId"],
                "capability": item["capability"],
                "dependency": item["dependency"],
                "label": adj["label"],
                "note": adj["note"],
                "evidence": adj.get("evidence") or [],
            }
        )

    n = 612
    insuff = counts["INSUFFICIENT_EVIDENCE"]
    adj_n = n - insuff
    obs = counts["MECHANISM_OBSERVED"]
    part = counts["MECHANISM_PARTIALLY_OBSERVED"]
    not_ = counts["MECHANISM_NOT_OBSERVED"]
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lineage": "YOUTUBE_MECHANISM_VALIDATION",
        "status": "REPORT_AND_WAIT",
        "outcomesOpened": False,
        "mergedWithTrackA": False,
        "nPropositions": n,
        "nAdjudicable": adj_n,
        "nInsufficientEvidence": insuff,
        "nObserved": obs,
        "nPartiallyObserved": part,
        "nNotObserved": not_,
        "strictObservedRate": None if not adj_n else round(obs / adj_n, 4),
        "observedPlusPartialRate": None if not adj_n else round((obs + part) / adj_n, 4),
        "byCapability": {k: dict(v) for k, v in sorted(by_cap.items(), key=lambda kv: -sum(kv[1].values()))},
        "reviewer": "deterministic_transcript_lexicon_v1",
        "nReviewers": 1,
        "reviewerAgreement": None,
        "note": "Material occurrence required. A card name alone is not enough. No winner correlations.",
    }
    (OUT / "mechanism-adjudications-v1.json").write_text(
        json.dumps({"n": n, "outcomesOpened": False, "rows": rows}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT / "track-b-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "checksums.txt").write_text(
        "\n".join(
            [
                f"items {sha256_bytes((OUT / 'blind-mechanism-items-v1.json').read_bytes())}",
                f"transcripts {sha256_bytes((OUT / 'transcript-index-v1.json').read_bytes())}",
                f"adjudications {sha256_bytes((OUT / 'mechanism-adjudications-v1.json').read_bytes())}",
                f"report {sha256_bytes((OUT / 'track-b-report.json').read_bytes())}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps({"status": "TRACK_B_REPORTED", "outcomesOpened": False, "nItems": n, "mergedWithTrackA": False}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({k: report[k] for k in ("nPropositions", "nAdjudicable", "nObserved", "nPartiallyObserved", "nNotObserved", "nInsufficientEvidence", "strictObservedRate", "observedPlusPartialRate")}, indent=2))


if __name__ == "__main__":
    main()
