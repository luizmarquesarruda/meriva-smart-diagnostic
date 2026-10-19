#!/usr/bin/env python3
"""Apply only narrowly-scoped, deterministic repairs for known CI syntax artifacts.

This deliberately does not attempt speculative source-code rewrites. Unknown failures
remain failed and must be diagnosed from the CI logs.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPAIRS = {
    "app/saude.tsx": [
        (r";\\n  const normal", ";\n  const normal"),
    ],
    "src/obd/exportBluetoothDiagnosticTxt.ts": [
        (r"`,\\n    `LEITURAS REAL_OBD", "`,\n    `LEITURAS REAL_OBD"),
        (r"`,\\n    `GRUPOS DE EVIDÊNCIA PID", "`,\n    `GRUPOS DE EVIDÊNCIA PID"),
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
    print("No known safe automatic repair matched. No files changed.")
