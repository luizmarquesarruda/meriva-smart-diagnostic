#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes de contrato do verificador de autosave; não executam CI."""
import json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "verify_autosave.py"

def run(payload, *args):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "autosave.txt"
        path.write_text(payload, encoding="utf-8")
        return subprocess.run([sys.executable, str(SCRIPT), str(path), "--json", *args],
                              text=True, capture_output=True, check=False)

def block(n, saved, reading="2026-10-16T18:41:00.000Z"):
    return (
        "=== SALVAMENTO_BEGIN ===\n"
        f"NÚMERO: {n}\nMOTIVO: checkpoint\n"
        "MERIVA SMART DIAGNOSTIC\nSAVE EXPORT\n"
        f"Saved At: {saved}\n"
        "[OBD]\nStatus: CONECTADO\n"
        "[LAST READINGS]\n"
        f"010C Engine RPM: 800 rpm [RESPONDEU] fonte=REAL {reading}\n"
        "=== SALVAMENTO_END ===\n"
    )

def main():
    good = block(1, "2026-10-16T18:41:30.000Z") + block(2, "2026-10-16T18:42:00.000Z", "2026-10-16T18:41:59.000Z")
    result = run(good, "--strict")
    assert result.returncode == 0, result.stderr + result.stdout
    report = json.loads(result.stdout)
    assert report["blocks_selected"] == 2
    assert report["integrity"]["all_pass"] is True

    # Filtragem por Saved At deve ser inclusiva e excluir blocos fora do intervalo.
    result = run(good, "--since", "2026-10-16T18:41:45Z", "--until", "2026-10-16T18:42:00Z")
    report = json.loads(result.stdout)
    assert report["blocks_selected"] == 1

    # Dois END no mesmo bloco e uma leitura posterior ao Saved At devem falhar no strict.
    bad = block(9, "2026-10-16T18:41:00.000Z", "2026-10-16T18:42:00.000Z") + "=== SALVAMENTO_END ===\n"
    result = run(bad, "--strict")
    report = json.loads(result.stdout)
    assert result.returncode == 1
    assert report["double_end_markers"] > 0
    assert report["readings_after_saved_at"] == 1
    assert report["integrity"]["all_pass"] is False
    print("verify_autosave: 3 cenários passaram")

if __name__ == "__main__":
    main()
