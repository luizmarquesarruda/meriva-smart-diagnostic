#!/usr/bin/env python3
"""Apply only narrowly-scoped, deterministic repairs for known CI failures."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
tick = chr(96)
REPAIRS = {
    "app/saude.tsx": [
        (r";\n  const normal", ";\n  const normal"),
    ],
    "src/diagnostics/diagnosticEngine.ts": [
        ("    blockedStaleObservations,\n    blockedNonLiveDtcs,",
         "    blockedStaleObservations,\n    freshDiagnosticEvidenceGroups,\n    blockedNonLiveDtcs,"),
    ],
    "src/obd/readinessMonitor.ts": [
        ("    monitors.push(monitor(id, label, c, d, mask));",
         "    monitors.push(monitor(id, label, (c & mask) !== 0, (d & mask) !== 0));"),
    ],
    "src/obd/exportBluetoothDiagnosticTxt.ts": [
        (tick + r",\n    " + tick + "LEITURAS REAL_OBD",
         tick + ",\n    " + tick + "LEITURAS REAL_OBD"),
        (tick + r",\n    " + tick + "GRUPOS DE EVIDÊNCIA PID",
         tick + ",\n    " + tick + "GRUPOS DE EVIDÊNCIA PID"),
    ],
}

changed = []
for relative, replacements in REPAIRS.items():
    path = ROOT / relative
    if not path.exists():
        continue
    original = path.read_text(encoding="utf-8")
    updated = original
    for bad, good in replacements:
        updated = updated.replace(bad, good)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        changed.append(relative)

if changed:
    print("Applied deterministic CI repairs:")
    print("\n".join(f" - {path}" for path in changed))
else:
    print("No known safe repair matched. No files changed.")
