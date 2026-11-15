#!/usr/bin/env python3
"""Compact CARD_COMPLETE variant table for COS v1 live scoring. Does not change frozen math."""

from __future__ import annotations

import json
from pathlib import Path

from spellbook_combo_detector_v1 import compile_variants, load_mirror, norm_name
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
MIRROR = MS / "commanderspellbook-full-mirror-v1"
OUT = MS / "commander-optimization-score-v1" / "detector-complete-variants.jsonl"


def main() -> None:
    variants, aux = load_mirror()
    name_to_oids = {}
    for c in aux["cards"]:
        oid = (c.get("oracleId") or "").strip()
        name = c.get("name") or ""
        if oid and name:
            name_to_oids.setdefault(norm_name(name), set()).add(oid)
    compiled, _ = compile_variants(variants, name_to_oids)
    n = 0
    with OUT.open("w", encoding="utf-8") as fh:
        for v in compiled:
            if v["unresolvedConcreteCard"] or v["ambiguousConcreteCard"] or not v["requiredOracleIds"]:
                continue
            must = [u["oracleId"] for u in v["uses"] if u.get("mustBeCommander") and u.get("oracleId")]
            fh.write(
                json.dumps(
                    {
                        "requiredOracleIds": v["requiredOracleIds"],
                        "cardSetSignature": v["cardSetSignature"],
                        "mustBeCommanderOracleIds": must,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            n += 1
    print(json.dumps({"wrote": str(OUT), "n": n}))


if __name__ == "__main__":
    main()
