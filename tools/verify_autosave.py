#!/usr/bin/env python3
"""Validador offline dos TXT exportados pelo Meriva Smart Diagnostic.

Uso:
  python3 tools/verify_autosave.py caminho/meriva_smart_autosave.txt
  python3 tools/verify_autosave.py caminho/meriva_smart_daily_obd_history.txt
  python3 tools/verify_autosave.py arquivo.txt --format autosave|daily|auto

O validador lê arquivos exportados; não acessa o aparelho, não altera arquivos e
não prova que o hardware OBD/GPS estava funcional. Ausências legítimas do app
(N/D, sem leituras ou ECU desconectada) são reportadas como avisos, não corrupção.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REQUIRED_AUTOSAVE_SECTIONS = (
    "[VEHICLE]", "[OBD]", "[LAST READINGS]", "[DTC]",
    "[HISTORY]", "[LEARNING]", "[SETTINGS]",
)
ISO_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)
READING_LINE = re.compile(
    r"^(?P<pid>[0-9A-Fa-f]{2,4})\s+.+?:\s+"
    r"(?P<value>N/D|[-+]?\d+(?:\.\d+)?)"
    r"(?:\s+(?P<unit>.*?))?\s+\[(?P<status>[^\]]+)\]\s+"
    r"fonte=(?P<source>\S+)\s+(?P<timestamp>\S+)\s*$"
)
DTC_LINE = re.compile(
    r"^(?P<code>P[0-9A-Fa-f]{4}|[BCUP][0-9A-Fa-f]{4})\s+"
    r"status=(?P<status>\S+)\s+validade=(?P<validity>\S+)\s+"
    r"ocorrencias=(?P<count>\d+)\s+fonte=(?P<source>\S+)\s+"
    r"primeira=(?P<first>\S+)\s+ultima=(?P<last>\S+)"
)
TRIP_LINE = re.compile(
    r"^(?P<start>\S+)\s+->\s+(?P<end>\S+)\s+\|\s+"
    r"(?P<distance>N/D|[-+]?\d+(?:\.\d+)?)\s+km\s+\|\s+"
    r"(?P<fuel>[^|]+)\|\s+(?P<consumption>[^|]+)\|\s+"
    r"fonte=(?P<source>\S+)"
)
DAY_MARKER = re.compile(r"^========== DIA: (\d{4}-\d{2}-\d{2}) ==========$")
EVENT_MARKER = re.compile(
    r"^--- EVENTO: (SESSION_START|SESSION_END|SESSION_RECOVERED) \| UTC=(\S+) ---$"
)
GPS_MARKER = "--- REGISTRO GPS LOCAL ---"


@dataclass
class Report:
    file: str
    format: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def parse_timestamp(value: str) -> datetime | None:
    raw = value.strip()
    if not ISO_TIMESTAMP.fullmatch(raw):
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _lines(text: str) -> list[str]:
    return [line.strip() for line in text.replace("\ufeff", "").splitlines()]


def validate_autosave(text: str, filename: str = "<memory>",
                      known_pids: set[str] | None = None) -> Report:
    lines = _lines(text)
    report = Report(filename, "autosave")
    if not text.strip():
        report.errors.append("arquivo vazio")
        return report

    if not lines or lines[0] != "MERIVA SMART DIAGNOSTIC":
        report.errors.append("cabeçalho 'MERIVA SMART DIAGNOSTIC' ausente")
    if "SAVE EXPORT" not in lines[:5]:
        report.errors.append("marcador 'SAVE EXPORT' ausente")

    for section in REQUIRED_AUTOSAVE_SECTIONS:
        if section not in lines:
            report.errors.append("seção obrigatória ausente: " + section)

    schema = next((re.match(r"Schema:\s*(\d+)$", line) for line in lines
                   if line.startswith("Schema:")), None)
    if not schema:
        report.errors.append("versão Schema ausente ou inválida")
    else:
        report.facts.append("schema=" + schema.group(1))

    app_version = next((line.split(":", 1)[1].strip() for line in lines
                        if line.startswith("App Version:")), "")
    if not app_version or app_version == "N/D":
        report.warnings.append("versão do aplicativo não identificada")
    else:
        report.facts.append("app_version=" + app_version)

    export_line = next((line for line in lines if line.startswith("Exported At:")), "")
    export_raw = export_line.split(":", 1)[1].strip() if ":" in export_line else ""
    export_time = parse_timestamp(export_raw)
    if export_time is None:
        report.errors.append("Exported At ausente ou fora do formato ISO 8601 com fuso")
    else:
        report.facts.append("exported_at=" + export_raw)

    obd_index = lines.index("[OBD]") if "[OBD]" in lines else -1
    obd_status = ""
    if obd_index >= 0:
        obd_status = next((line.split(":", 1)[1].strip() for line in lines[obd_index + 1:]
                           if line.startswith("Status:")), "")
    if obd_status == "DESCONECTADO":
        report.warnings.append("exportação feita com OBD desconectado; isso não prova falha do arquivo")
    elif obd_status != "CONECTADO":
        report.warnings.append("estado OBD não reconhecido ou ausente")

    section = ""
    reading_count = 0
    real_reading_count = 0
    stale_reading_count = 0
    dtc_count = 0
    real_dtc_count = 0
    trip_count = 0
    seed_trip_count = 0
    for line in lines:
        if line.startswith("[") and line.endswith("]"):
            section = line
            continue

        if section == "[LAST READINGS]" and line and line != "N/D" and not line.startswith("Exibindo"):
            match = READING_LINE.match(line)
            if not match:
                if "leituras mais recentes" not in line and "autosave JSON" not in line:
                    report.warnings.append("linha de leitura não reconhecida: " + line[:100])
                continue
            reading_count += 1
            pid = match.group("pid").upper().zfill(4)
            source = match.group("source").upper()
            timestamp = parse_timestamp(match.group("timestamp"))
            if source in {"REAL", "REAL_OBD", "ECU"}:
                real_reading_count += 1
            if known_pids is not None and pid not in known_pids and pid[-2:] not in known_pids:
                report.warnings.append("PID fora da lista conhecida fornecida: " + pid)
            if timestamp is None:
                report.warnings.append("PID " + pid + ": timestamp inválido (" + match.group("timestamp") + ")")
            elif export_time is not None:
                age_seconds = (export_time - timestamp).total_seconds()
                if age_seconds < -300:
                    report.warnings.append("PID " + pid + ": horário posterior à exportação")
                elif age_seconds > 300:
                    stale_reading_count += 1

        elif section == "[DTC]" and line and line != "N/D" and not line.startswith("Exibindo"):
            match = DTC_LINE.match(line)
            if not match:
                continue
            dtc_count += 1
            if match.group("source").upper() == "REAL_OBD":
                real_dtc_count += 1
            first = parse_timestamp(match.group("first"))
            last = parse_timestamp(match.group("last"))
            if first is None or last is None:
                report.warnings.append("DTC " + match.group("code") + ": timestamp inválido")
            elif first > last:
                report.errors.append("DTC " + match.group("code") + ": primeira ocorrência posterior à última")
            if match.group("validity") != "EVIDÊNCIA_RECENTE":
                report.warnings.append("DTC " + match.group("code") + ": histórico sem revalidação recente")

        elif section == "[HISTORY]" and line and line != "N/D" and not line.startswith("Exibindo"):
            if "fonte=CARSCANNER_SEED" in line or "seed_cycle_" in line.lower():
                seed_trip_count += 1
                report.errors.append("viagem CARSCANNER_SEED presente em [HISTORY]")
            match = TRIP_LINE.match(line)
            if match:
                trip_count += 1
                start = parse_timestamp(match.group("start"))
                end = parse_timestamp(match.group("end"))
                if start is None or end is None:
                    report.warnings.append("viagem com horário inválido")
                elif start > end:
                    report.errors.append("viagem com início posterior ao fim")
                consumption = match.group("consumption").strip()
                number = re.search(r"([-+]?\d+(?:\.\d+)?)\s*km/L", consumption)
                if number and (float(number.group(1)) <= 0 or float(number.group(1)) > 30):
                    report.errors.append("consumo de viagem implausível: " + number.group(1) + " km/L")

    if reading_count == 0:
        report.warnings.append("nenhuma leitura PID reconhecida; pode ser legítimo se a ECU não respondeu")
    if real_reading_count == 0:
        report.warnings.append("nenhuma leitura marcada como real")
    if stale_reading_count:
        report.warnings.append(str(stale_reading_count) + " leitura(s) têm mais de 300 s em relação à exportação")
    if dtc_count and real_dtc_count == 0:
        report.warnings.append("DTCs listados sem fonte REAL_OBD")
    report.facts.extend([
        "readings=" + str(reading_count),
        "real_readings=" + str(real_reading_count),
        "dtcs=" + str(dtc_count),
        "real_dtcs=" + str(real_dtc_count),
        "trips=" + str(trip_count),
        "car_scanner_seed_trips=" + str(seed_trip_count),
    ])
    return report


def validate_daily_history(text: str, filename: str = "<memory>") -> Report:
    lines = _lines(text)
    report = Report(filename, "daily-history")
    if not text.strip():
        report.errors.append("arquivo vazio")
        return report
    if not any("HISTÓRICO TXT POR DIA" in line for line in lines):
        report.warnings.append("cabeçalho esperado do diário diário não encontrado")

    day_keys: list[str] = []
    event_count = 0
    real_reading_count = 0
    trip_count = 0
    for index, line in enumerate(lines):
        day = DAY_MARKER.match(line)
        if day:
            try:
                datetime.strptime(day.group(1), "%Y-%m-%d")
            except ValueError:
                report.errors.append("data de página inválida: " + day.group(1))
            day_keys.append(day.group(1))
            continue
        event = EVENT_MARKER.match(line)
        if event:
            event_count += 1
            if parse_timestamp(event.group(2)) is None:
                report.errors.append("timestamp UTC inválido no evento: " + line)
            continue
        if line.startswith("========== FIM DO DIA") and not day_keys:
            report.errors.append("marcador de fim do dia sem página DIA correspondente")
        if line.startswith("[PIDs REAIS MAIS RECENTES]"):
            for candidate in lines[index + 1:]:
                if candidate.startswith("[") or candidate.startswith("--- FIM DO EVENTO"):
                    break
                if re.match(r"^[0-9A-Fa-f]{2,4}\s+", candidate) and parse_timestamp(candidate.split()[-1]) is not None:
                    real_reading_count += 1
        if " -> " in line and "fonte=REAL_OBD" in line:
            trip_count += 1
            value = re.search(r"\|\s*([-+]?\d+(?:\.\d+)?)\s*km/L", line)
            if value and (float(value.group(1)) <= 0 or float(value.group(1)) > 30):
                report.errors.append("consumo de viagem implausível no diário: " + value.group(1) + " km/L")
        if "fonte=CARSCANNER_SEED" in line or "seed_cycle_" in line.lower():
            report.warnings.append("referência histórica a seed CarScanner encontrada; revisar se é um registro legado")

    if not day_keys:
        report.errors.append("nenhum marcador de data '========== DIA: YYYY-MM-DD ==========' encontrado")
    if event_count == 0:
        report.warnings.append("nenhum evento de sessão ECU encontrado")
    report.facts.extend([
        "day_pages=" + str(len(day_keys)),
        "session_events=" + str(event_count),
        "real_readings=" + str(real_reading_count),
        "trips=" + str(trip_count),
        "gps_index=" + ("yes" if GPS_MARKER in text else "no"),
    ])
    return report


def load_known_pids(path: str | None) -> set[str] | None:
    if not path:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, list):
        values: Iterable[object] = data
    elif isinstance(data, dict):
        values = data.get("pids", data.get("supportedPids", data.keys()))
    else:
        raise ValueError("arquivo de PIDs deve conter objeto ou lista JSON")
    normalized = set()
    for value in values:
        if isinstance(value, str):
            normalized.add(re.sub(r"\s+", "", value).upper().removeprefix("0X"))
    return normalized


def render(report: Report) -> str:
    out = ["Arquivo: " + report.file, "Formato: " + report.format,
           "Resultado estrutural: " + ("OK" if report.ok else "FALHA")]
    out.extend("ERRO: " + item for item in report.errors)
    out.extend("AVISO: " + item for item in report.warnings)
    out.extend("FATO: " + item for item in report.facts)
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="caminho do TXT exportado pelo aplicativo")
    parser.add_argument("--format", choices=("auto", "autosave", "daily"), default="auto",
                        help="tipo do TXT; auto detecta pelo conteúdo")
    parser.add_argument("--known-pids", help="JSON opcional com PIDs conhecidos para comparação")
    parser.add_argument("--json", action="store_true", help="imprime relatório em JSON")
    args = parser.parse_args(argv)

    path = Path(args.file)
    try:
        content = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError) as exc:
        print("ERRO: não foi possível ler " + str(path) + ": " + str(exc), file=sys.stderr)
        return 2
    try:
        known_pids = load_known_pids(args.known_pids)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print("ERRO: lista de PIDs inválida: " + str(exc), file=sys.stderr)
        return 2

    selected = args.format
    if selected == "auto":
        selected = "daily" if "HISTÓRICO TXT POR DIA" in content or "--- EVENTO: SESSION_" in content else "autosave"
    report = validate_daily_history(content, str(path)) if selected == "daily" else validate_autosave(content, str(path), known_pids)
    if args.json:
        print(json.dumps({
            "file": report.file, "format": report.format, "ok": report.ok,
            "errors": report.errors, "warnings": report.warnings, "facts": report.facts,
        }, ensure_ascii=False, indent=2))
    else:
        print(render(report))
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
