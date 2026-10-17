# SQLite de telemetria — Meriva Smart Diagnostic

## Objetivo

O banco `meriva_diagnostics.db` é um índice local consultável para leituras OBD. Nesta etapa ele é **aditivo**: não substitui os TXT diários, CSV bruto, CSV interpretado nem o envelope JSON do autosave. Não importa nem apaga histórico legado automaticamente.

## Compatibilidade

- Aplicação: Expo SDK 51 / React Native 0.74.5.
- Dependência: `expo-sqlite ~14.0.6`, versão indicada na documentação oficial do SDK 51.
- Abrir a base com APIs assíncronas; não usar APIs síncronas no ciclo de polling.
- `PRAGMA journal_mode = WAL`, chaves estrangeiras habilitadas e consultas parametrizadas.
- Migrações versionadas com `schema_migrations`; a versão futura da base é rejeitada em vez de rebaixada silenciosamente.

Referências oficiais:
- Expo SQLite SDK 51: https://docs.expo.dev/versions/v51.0.0/sdk/sqlite/
- Expo config plugins / Continuous Native Generation: https://docs.expo.dev/config-plugins/introduction/
- Android SQLiteOpenHelper e gestão de versões nativa: https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper

## Esquema inicial — versão 1

### `schema_migrations`

| Campo | Significado |
|---|---|
| `version` | Versão aplicada, chave primária |
| `applied_at` | Timestamp ISO-8601 da migração |

### `telemetry_samples`

| Campo | Significado |
|---|---|
| `id` | Identificador incremental |
| `timestamp` | Hora ISO-8601 da consulta |
| `pid`, `name` | PID e nome fornecidos pelo parser |
| `value`, `unit` | Valor numérico finito ou nulo, e unidade |
| `status` | Estado de parsing, incluindo falha |
| `source` | `REAL_OBD` ou `SIMULACAO` |
| `command_status` | Estado do comando ELM327 |
| `protocol`, `elapsed_ms` | Protocolo reportado e latência observada |
| `tx`, `rx` | Strings TX/RX preservadas sem normalização pelo store |
| `session_id` | Melhor identificador disponível da sessão ECU; pode ser nulo |

Índices em `timestamp` e `(pid, timestamp)` suportam consultas recentes sem varrer a tabela inteira.

## Regras de integridade

1. `REAL_OBD` identifica a origem de aquisição; **não** confirma a exatidão física do sensor.
2. Para uma leitura entrar em hipótese diagnóstica, os consumidores ainda devem validar fonte, estado `RESPONDEU`, valor numérico finito e atualidade.
3. Respostas falhas são preservadas para investigação de enlace, com valor não finito convertido para `NULL`; não viram leituras reais válidas.
4. Simulação fica em uma origem separada.
5. O insert é enfileirado e não é aguardado pela solicitação serial do ELM327. Se SQLite falhar, TXT/JSON/CSV continuam independentes.
6. Nesta versão não há limpeza por retenção, importação de CarScanner ou migração destrutiva.

## Código

- Política: `src/knowledge/sqlite_policy.json`
- Store e migrações: `src/database/sqliteTelemetryStore.ts`
- Integração: `src/meriva/autosaveIntegration.ts`
- Teste de contrato: `tests/sqliteTelemetryStore.test.js`

APIs expostas pelo store:
- `recordSqliteTelemetrySample(...)`
- `getRecentSqliteTelemetrySamples(limit)`
- `getSqliteDiagnosticsHealth()`
- `flushSqliteTelemetryWrites()` — apenas para testes/fechamento controlado.

## Validação pendente

Comandos para ambiente local de desenvolvimento (não foram executados nesta etapa):
```bash
npm ci
npm run typecheck
node tests/sqliteTelemetryStore.test.js
npm test
npx expo prebuild --platform android
```

O prebuild e o build Android precisam ser validados em uma branch de trabalho, mantendo `android/` gerado fora da versionagem conforme a política CNG do repositório. O teste de store mockado valida o contrato JavaScript/SQL, não prova que o SQLite nativo funciona no aparelho. O teste físico precisa confirmar que a base persiste após reinício, armazena TX/RX real e não degrada o polling KWP.
