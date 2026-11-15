#!/usr/bin/env python3
"""
Build oracle-neural-semantic-space-v1 from local Oracle text.

No OpenAI. No Firestore writes. Does not replace RC8.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import time
from pathlib import Path

import numpy as np

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
SNAP = MS / "semantic-oracle-snapshot-v1"
POINTS = WEB / "data" / "milestones" / "catalog-shadow" / "catalog-semantic-visualization-v1-points.json.gz"
OUT = MS / "oracle-neural-semantic-space-v1"

MODEL_ID = "BAAI/bge-large-en-v1.5"
FALLBACK_MODEL = "sentence-transformers/all-mpnet-base-v2"
BATCH = 64
SEED = 42


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_text(name: str, type_line: str, mana_cost: str, oracle_text: str) -> str:
    parts = [name.strip(), type_line.strip()]
    if mana_cost.strip():
        parts.append(mana_cost.strip())
    parts.append("")
    parts.append((oracle_text or "").strip())
    return "\n".join(parts).strip() + "\n"


def load_mana_costs() -> dict[str, str]:
    if not POINTS.exists():
        return {}
    with gzip.open(POINTS, "rt", encoding="utf-8") as f:
        points = json.load(f)
    return {p["oracleId"]: (p.get("manaCost") or "") for p in points}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = [json.loads(line) for line in (SNAP / "index.jsonl").read_text(encoding="utf-8").splitlines() if line]
    index.sort(key=lambda r: r["i"])
    mana = load_mana_costs()

    texts = []
    rows = []
    hasher = hashlib.sha256()
    missing_text = 0
    for row in index:
        text = build_text(row.get("name") or "", row.get("typeLine") or "", mana.get(row["oracleId"], ""), row.get("oracleText") or "")
        if not (row.get("oracleText") or "").strip():
            missing_text += 1
        texts.append(text)
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        hasher.update(row["oracleId"].encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(digest.encode("utf-8"))
        hasher.update(b"\n")
        rows.append({"i": row["i"], "oracleId": row["oracleId"], "name": row["name"], "textSha256": digest})

    corpus_hash = hasher.hexdigest()

    from sentence_transformers import SentenceTransformer
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_id = MODEL_ID
    t0 = time.time()
    try:
        model = SentenceTransformer(model_id, device=device)
    except Exception as exc:
        print(f"primary model failed ({exc}); falling back to {FALLBACK_MODEL}")
        model_id = FALLBACK_MODEL
        model = SentenceTransformer(model_id, device=device)

    vectors = model.encode(
        texts,
        batch_size=BATCH,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype(np.float32)

    elapsed = time.time() - t0
    n, d = vectors.shape
    if n != len(index):
        raise SystemExit(f"vector count {n} != index {len(index)}")
    if not np.isfinite(vectors).all():
        raise SystemExit("non-finite neural vectors")

    vec_path = OUT / "vectors.f32"
    vectors.tofile(vec_path)
    (OUT / "index.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")

    checksum = hashlib.sha256()
    order = np.argsort([r["oracleId"] for r in rows])
    for idx in order:
        checksum.update(rows[idx]["oracleId"].encode("utf-8"))
        checksum.update(b"\0")
        checksum.update(vectors[idx].tobytes())
        checksum.update(b"\n")

    manifest = {
        "artifactType": "OracleNeuralSemanticSpace",
        "version": "oracle-neural-semantic-space-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cardCount": n,
        "vectorCount": n,
        "dimensions": int(d),
        "model": model_id,
        "embeddingVersion": "oracle-neural-semantic-space-v1",
        "normalization": "l2",
        "device": device,
        "batchSize": BATCH,
        "encodeSeconds": elapsed,
        "textTemplate": "NAME\\nTYPE LINE\\nMANA COST\\n\\nORACLE TEXT",
        "corpusTextChecksum": corpus_hash,
        "checksum": checksum.hexdigest(),
        "vectorsSha256": sha256_bytes(vectors.tobytes()),
        "missingOracleText": missing_text,
        "notes": [
            "This is the TRUE neural Oracle-text space. It is not RC8.",
            "RC8 117-d vectors remain a separate explicit parser representation.",
            "No OpenAI. Local sentence-transformers only.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
