#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auditoria somente leitura do autosave TXT do Meriva Smart Diagnostic."""
import argparse, hashlib, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

BEGIN = "=== SALVAMENTO_BEGIN ==="
END = "=== SALVAMENTO_END ==="
DT = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"

def parse_dt(value):
    try:
        value = value.strip()
        if value.endswith("Z"): value = value[:-1] + "+00:00"
        out = datetime.fromisoformat(value)
        return out if out.tzinfo else out.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None

def extract_blocks(text):
    blocks, outside, incomplete, double_end = [], 0, 0, 0
    current = None  # [text, end_count, closed]
    for line in text.splitlines(keepends=True):
        token = line.strip()
        if token == BEGIN:
            if current:
                if not current[2]: incomplete += 1
                blocks.append((current[0], current[1]))
            current = [line, 0, False]
        elif token == END:
            if current is None:
                outside += 1
            else:
                current[1] += 1
                if current[1] > 1: double_end += 1
                if not current[2]:
                    current[0] += line
                    current[2] = True
        elif current and not current[2]:
            current[0] += line
        else:
            outside += 1
    if current:
        if not current[2]: incomplete += 1
        blocks.append((current[0], current[1]))
    return blocks, {"text_outside_blocks_lines": outside, "incomplete_blocks": incomplete, "double_end_markers": double_end}

def inspect(raw, ends):
    number = re.search(r"^NÚMERO:\s*(\d+)", raw, re.M | re.I)
    saved_match = re.search(r"^Saved At:\s*(.+)$", raw, re.M | re.I)
    saved = parse_dt(saved_match.group(1)) if saved_match else None
    read_times = []
    for m in re.finditer(r"fonte=[^\s]+\s+(" + DT + r")", raw, re.I):
        value = parse_dt(m.group(1))
        if value: read_times.append(value)
    later = sum(bool(saved and t > saved) for t in read_times)
    stale = 0
    fresh = set()
    if saved:
        for m in re.finditer(r"^(010C|010D|0110|010B|0105|010F|0111)\s+.*?\[(RESPONDEU|NÃO RESPONDEU|NAO RESPONDEU)\].*?\s(" + DT + r")\s*$", raw, re.M | re.I):
            ts = parse_dt(m.group(3))
            if not ts: continue
            age = (saved - ts).total_seconds()
            if m.group(2).upper() == "RESPONDEU" and age > 10: stale += 1
            if m.group(2).upper() == "RESPONDEU" and 0 <= age <= 10: fresh.add(m.group(1).upper())
    return {"number": int(number.group(1)) if number else None, "saved_at": saved,
            "sha256": hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest(),
            "ends": ends, "later_reads": later, "stale_reads": stale,
            "connected": bool(re.search(r"^Status:\s*CONECTADO", raw, re.M | re.I)),
            "fresh_rpm_speed": bool(fresh & {"010C", "010D"}), "fresh_maf": "0110" in fresh}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("file", type=Path)
    p.add_argument("--since", help="Timestamp ISO-8601 inclusivo")
    p.add_argument("--until", help="Timestamp ISO-8601 inclusivo")
    p.add_argument("--json", action="store_true")
    p.add_argument("--strict", action="store_true", help="Retorna 1 se integridade falhar")
    a = p.parse_args()
    if not a.file.is_file():
        print(f"ERRO: arquivo não encontrado: {a.file}", file=sys.stderr); return 2
    since, until = parse_dt(a.since) if a.since else None, parse_dt(a.until) if a.until else None
    if (a.since and since is None) or (a.until and until is None):
        print("ERRO: --since/--until devem ser timestamps ISO-8601 válidos", file=sys.stderr); return 2
    raw_bytes = a.file.read_bytes()
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    pairs, structure = extract_blocks(text)
    all_blocks = [inspect(raw, ends) for raw, ends in pairs]
    selected = [b for b in all_blocks if (since is None or (b["saved_at"] and b["saved_at"] >= since)) and (until is None or (b["saved_at"] and b["saved_at"] <= until))]
    gaps, reversals = [], []
    for prev, cur in zip(selected, selected[1:]):
        if prev["number"] is not None and cur["number"] is not None and cur["number"] != prev["number"] + 1:
            gaps.append({"previous": prev["number"], "current": cur["number"], "expected": prev["number"] + 1})
        if prev["saved_at"] and cur["saved_at"] and cur["saved_at"] < prev["saved_at"]:
            reversals.append({"previous": prev["saved_at"].isoformat(), "current": cur["saved_at"].isoformat()})
    hashes = [b["sha256"] for b in selected]
    duplicate_count = len(hashes) - len(set(hashes))
    double_ends = structure["double_end_markers"] + sum(max(0, b["ends"] - 1) for b in selected)
    later = sum(b["later_reads"] for b in selected)
    stale = sum(b["stale_reads"] for b in selected)
    checks = {
        "one_end_per_block": bool(selected) and double_ends == 0 and structure["incomplete_blocks"] == 0,
        "sequential_numbering": bool(selected) and not gaps,
        "saved_at_monotonic": bool(selected) and not reversals,
        "no_duplicate_blocks": bool(selected) and duplicate_count == 0,
        "no_reading_after_saved_at": bool(selected) and later == 0,
    }
    report = {
        "file": str(a.file), "bytes": len(raw_bytes), "sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "range": {"since": a.since, "until": a.until}, "blocks_parsed_total": len(all_blocks),
        "blocks_selected": len(selected), "unique_blocks_selected": len(set(hashes)),
        "duplicate_blocks_selected": duplicate_count, "numbering_breaks": len(gaps),
        "numbering_break_details": gaps[:30], "saved_at_reversals": len(reversals),
        "saved_at_reversal_details": reversals[:30], "double_end_markers": double_ends,
        "readings_after_saved_at": later, "responded_readings_older_than_10s": stale,
        "connected_blocks": sum(b["connected"] for b in selected),
        "connected_without_fresh_rpm_or_speed": sum(b["connected"] and not b["fresh_rpm_speed"] for b in selected),
        "connected_without_fresh_maf": sum(b["connected"] and not b["fresh_maf"] for b in selected),
        "structure": structure, "integrity": {**checks, "all_pass": all(checks.values())},
        "notes": ["Somente leitura; o verificador não repara o arquivo.",
                  "A janela temporal filtra por Saved At.", "Blocos sem Saved At são excluídos quando há filtro temporal."]
    }
    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Arquivo: {a.file}")
        print(f"Bytes: {report['bytes']} | SHA256: {report['sha256']}")
        print(f"Blocos parseados: {len(all_blocks)} | selecionados: {len(selected)} | únicos: {report['unique_blocks_selected']}")
        print(f"Quebras de numeração: {len(gaps)} | END duplicados: {double_ends} | Saved At retrocedendo: {len(reversals)}")
        print(f"Leituras posteriores ao Saved At: {later} | RESPONDEU >10 s: {stale}")
        print(f"Conectados sem RPM/velocidade fresca: {report['connected_without_fresh_rpm_or_speed']} | sem MAF fresco: {report['connected_without_fresh_maf']}")
        for k, v in report["integrity"].items(): print(f"Integridade {k}: {'PASSOU' if v else 'FALHOU'}")
        for k, v in structure.items(): print(f"Estrutura {k}: {v}")
    return 1 if a.strict and not report["integrity"]["all_pass"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
