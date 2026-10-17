# Modelo de dados — Meriva Smart Diagnostic

Versão do documento: 1.0  
Estado em 2026-10-16: **especificação parcial; SQLite ainda NÃO é a fonte única da verdade**.

## Regras de integridade

- Só uma resposta de ECU com origem REAL e status RESPONDEU pode produzir evidência OBD atual.
- Histórico importado, simulado ou replay não pode ser promovido a REAL.
- Leituras e DTCs carregam timestamp, origem e qualidade. Ausência de dado é null/N/D, nunca zero sintético.
- TXT/JSON/CSV são exportações; não devem ser tratados como banco primário.
- Exportação compartilhável redige VIN, endereço/MAC do adaptador, nome do adaptador e identificação da ECU.
- Migrações são versionadas e não descartam o arquivo anterior antes de verificar a escrita nova.

## Esquema SQLite pretendido

| Tabela | Chave/colunas principais | Estado |
|---|---|---|
| app_build | id, git_sha, branch, version_code, build_date, device_model, android_version | Metadados de build já aparecem em exports; tabela ainda não implementada |
| vehicle_profile | vehicle_id, make, model, engine, year, year_confirmed, fuel, tank_capacity_l, injection_type | Perfil JSON sincronizado com autosave; tabela ainda não implementada |
| adapter | adapter_id, name_hash, mac_hash, elm_version, protocol_baseline | Pendente |
| session | session_id, started_at, ended_at, end_reason, protocol, data_source | Sessões existentes em TXT/JSON; tabela ainda não implementada |
| link_event | id, session_id, timestamp, state, cause, consecutive_failures, latency_ms, adapter_voltage_v | Pendente |
| app_event | id, session_id, timestamp, event_type, detail_json | Pendente |
| ecu_capability | vehicle_id, pid, supported, response_rate, latency_p50_ms, latency_p95_ms, last_raw_response | Descoberta de PID existente parcialmente; tabela ainda não implementada |
| sample | id, session_id, pid, raw_value, value, unit, timestamp, monotonic_ms, age_ms, quality, data_source | Campos de qualidade/export parcialmente implementados; tabela ainda não implementada |
| trip | trip_id, started_at, ended_at, dist_obd_km, dist_gps_km, dist_final_km, dist_source, fuel_l, fuel_method, fuel_coverage_pct, fuel_uncertainty_pct, trip_quality | JSON de viagens ampliado; tabela ainda não implementada |
| gps_fix | id, session_id, timestamp, latitude, longitude, accuracy_m, accepted, reject_reason | Rastreador GPS existente; tabela ainda não implementada |
| dtc_state | dtc, status, validity, first_seen, last_seen, occurrences, session_id | TXT/arquivo de DTC ampliado em PR de DTC; tabela ainda não implementada |
| dtc_observation | id, dtc, timestamp, service_mode, session_id, observed | Pendente |
| freeze_frame | id, dtc, frame_number, captured_at, pids_json, raw_responses_json | JSON/TXT com dono do frame; tabela ainda não implementada |
| autosave_snapshot | id, created_at, reason, layer, bytes, sha256, block_number | Pendente |
| export_file | id, created_at, format, schema_version, export_version, bytes, sha256, redacted | Metadados parciais; tabela ainda não implementada |
| schema_migrations | version, applied_at, checksum | Pendente |

## Migração obrigatória antes de declarar SQLite como fonte de verdade

1. Adicionar e travar a versão compatível de expo-sqlite para Expo SDK 51; atualizar lockfile com instalação real.
2. Criar schema_migrations e aplicar migrações transacionais idempotentes.
3. Importar JSON/TXT existentes sem apagar a origem; contar registros e comparar hashes.
4. Fazer escrita dupla temporária, comparar leituras e exports, e só então mudar o caminho de leitura primário.
5. Preservar exportações TXT diárias e gerar um pacote de diagnóstico compartilhável.
6. Adicionar testes de migração, interrupção de escrita e recuperação.

## Limitações conhecidas

Não declarar que SQLite, WAL, migrações ou transações estão implementados até que a dependência esteja instalada, o código esteja integrado e os testes sejam executados.
