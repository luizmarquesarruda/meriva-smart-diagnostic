import importlib.util
import unittest
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "verify_autosave.py"
SPEC = importlib.util.spec_from_file_location("verify_autosave", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

AUTOSAVE = """MERIVA SMART DIAGNOSTIC
SAVE EXPORT
========================
Schema: 1
App Version: 1.0.1
Exported At: 2026-10-16T18:00:00.000Z
Saved At: 2026-10-16T17:59:59.000Z

[VEHICLE]
Marca: Chevrolet
Modelo: Meriva Maxx
Motor: 1.4 Flex
Ano: 2011
VIN: N/D

[OBD]
Status: CONECTADO
Adaptador: OBDII
Protocolo: ISO 14230-4 (KWP FAST)
Último protocolo conhecido: N/D
ECU: N/D
Identificação ECU: N/D
Nome ECU: N/D
ECU validada em: 2026-10-16T17:59:00.000Z
Fonte da validação ECU: OBD_RESPONSE
Validações: 010C

[LAST READINGS]
010C RPM: 850 rpm [RESPONDEU] fonte=REAL 2026-10-16T17:59:50.000Z

[DTC]
P0135 status=ATIVO validade=EVIDÊNCIA_RECENTE ocorrencias=2 fonte=REAL_OBD primeira=2026-10-16T17:00:00.000Z ultima=2026-10-16T17:59:00.000Z descricao=O2

[HISTORY]
2026-10-16T17:50:00.000Z -> 2026-10-16T17:58:00.000Z | 5 km | 0.5 L | 10 km/L | fonte=REAL_OBD | combustivel=REAL_OBD

[LEARNING]
Status: LEARNING_ACTIVE

[SETTINGS]
N/D
"""

DAILY = """MERIVA SMART DIAGNOSTIC
HISTÓRICO TXT POR DIA — CADA DATA É UMA PÁGINA LÓGICA.
========== DIA: 2026-10-16 ==========
--- EVENTO: SESSION_START | UTC=2026-10-16T17:59:00.000Z ---
HORA LOCAL: 2026-10-16 14:59:00 -03:00
[PIDs REAIS MAIS RECENTES]
010C RPM: 850 rpm | RESPONDEU | 2026-10-16T17:59:00.000Z

[CÓDIGOS DE FALHA REGISTRADOS]
P0135 | status=ATIVO | fonte=REAL_OBD

[VIAGENS REAIS RECENTES]
2026-10-16T17:50:00.000Z -> 2026-10-16T17:58:00.000Z | 5 km | 0.5 L | 10 km/L | fonte=REAL_OBD
--- FIM DO EVENTO ---
--- REGISTRO GPS LOCAL ---
ARQUIVOS: VIAGENS/GPS/gps_2026-10-16_NNNN.jsonl
========== FIM DO DIA ==========
"""


class VerifyAutosaveTests(unittest.TestCase):
    def test_app_autosave_export_shape_is_accepted(self):
        report = MODULE.validate_autosave(AUTOSAVE)
        self.assertTrue(report.ok, report.errors)
        self.assertIn("readings=1", report.facts)
        self.assertIn("trips=1", report.facts)

    def test_car_scanner_seed_trip_is_rejected(self):
        contaminated = AUTOSAVE.replace(
            "[LEARNING]", "2026-10-16T17:50:00.000Z -> 2026-10-16T17:58:00.000Z | 999 km | 1 L | 999 km/L | fonte=CARSCANNER_SEED\n\n[LEARNING]"
        )
        report = MODULE.validate_autosave(contaminated)
        self.assertFalse(report.ok)
        self.assertTrue(any("CARSCANNER_SEED" in error for error in report.errors))

    def test_implausible_consumption_is_rejected(self):
        report = MODULE.validate_autosave(AUTOSAVE.replace("10 km/L", "31 km/L"))
        self.assertFalse(report.ok)
        self.assertTrue(any("implausível" in error for error in report.errors))

    def test_daily_session_format_is_recognized(self):
        report = MODULE.validate_daily_history(DAILY)
        self.assertTrue(report.ok, report.errors)
        self.assertIn("session_events=1", report.facts)
        self.assertIn("gps_index=yes", report.facts)

    def test_empty_file_fails(self):
        self.assertFalse(MODULE.validate_autosave("").ok)
        self.assertFalse(MODULE.validate_daily_history("").ok)

    def test_invalid_trip_order_fails(self):
        broken = AUTOSAVE.replace(
            "2026-10-16T17:50:00.000Z -> 2026-10-16T17:58:00.000Z",
            "2026-10-16T17:58:00.000Z -> 2026-10-16T17:50:00.000Z",
        )
        report = MODULE.validate_autosave(broken)
        self.assertFalse(report.ok)
        self.assertTrue(any("início posterior ao fim" in error for error in report.errors))


if __name__ == "__main__":
    unittest.main()
