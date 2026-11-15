"""Re-apply direction classes without retraining."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from train_mechanical_directions_v2 import classify_direction

MS = Path(__file__).resolve().parents[3] / "data/milestones/mechanical-space"
OUT = MS / "mechanical-directions-v2"

report = json.loads((OUT / "report.json").read_text(encoding="utf-8"))
counts = defaultdict(int)
for row in report["perConcept"]:
    if row["id"] == "IS_A_TOKEN":
        continue
    row["directionClass"] = classify_direction(row)
    counts[row["directionClass"]] += 1
report["directionClassCounts"] = dict(counts)
(OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

audit = json.loads((OUT / "audit.json").read_text(encoding="utf-8"))
by_id = {r["id"]: r for r in report["perConcept"]}
for row in audit["directions"]:
    if row["id"] in by_id:
        row["directionClass"] = by_id[row["id"]]["directionClass"]
(OUT / "audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")

summary = json.loads((MS / "mechanical-ontology-precision-v2-report.json").read_text(encoding="utf-8"))
summary["directionClassCounts"] = dict(counts)
summary["classExamples"] = {
    cls: [r["id"] for r in report["perConcept"] if r["id"] != "IS_A_TOKEN" and r["directionClass"] == cls]
    for cls in counts
}
showcase_ids = {r["id"] for r in summary.get("showcase", [])}
summary["showcase"] = [r for r in report["perConcept"] if r["id"] in showcase_ids]
(MS / "mechanical-ontology-precision-v2-report.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"classes": dict(counts), "examples": summary["classExamples"]}, indent=2))
