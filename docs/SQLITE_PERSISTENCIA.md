# Persistência SQLite — Meriva Smart Diagnostic

## Objetivo e formatos

O app passa a usar três camadas distintas, cada uma com uma função explícita:

- **SQLite privado (MERIVA_SMART/BANCO/meriva-smart-diagnostic.db)**: histórico operacional consultável e relacional — sessões ECU, amostras reais de PID, eventos DTC, resultados da Central de Testes, viagens reais e PIDs aprendidos. O arquivo fica dentro da árvore examinada pela Central de Armazenamento.
- **JSON interno (CONFIG/autosave.json)**: snapshot completo para reabrir o aplicativo, com arquivo temporário, leitura de validação e cópia anterior. Continua sendo a recuperação principal; SQLite não substitui o envelope de autosave.
- **TXT**: único formato de relatório apresentado/exportado ao usuário. O histórico diário ECU continua em páginas lógicas por data e os testes continuam gerando arquivos separados em MERIVA_SMART/RELATORIOS/TESTES.

Não criar relatórios JSON ou CSV visíveis ao usuário. Catálogos e configuração JSON internos permanecem válidos.

## Compatibilidade

O projeto permanece em Expo SDK 51 / React Native 0.74.5. A dependência expo-sqlite ~14.0.6 usa a linha do módulo compatível com esse SDK e a API assíncrona openDatabaseAsync. Referência: [documentação SQLite do Expo SDK 51](https://docs.expo.dev/versions/v51.0.0/sdk/sqlite/).

## Esquema e migrações

A versão é controlada por PRAGMA user_version e também registrada em schema_migrations.

### Migração 1 — dados operacionais básicos

- obd_sessions: início, fim, adaptador, protocolo, endereço/identificação da ECU, motivo de fechamento e recuperação após encerramento inesperado.
- pid_readings: séries temporais vinculadas à sessão, com PID, nome, valor, unidade, estado, fonte e horário.
- dtc_events: eventos de falha observados de fonte real, mantendo status, ocorrências e horários.
- learned_pids: primeiro/último uso, quantidade de leituras válidas e último valor de cada PID real.
- Índices por sessão/horário, PID/horário e código DTC.

### Migração 2 — diagnóstico e viagens

- sensor_tests e sensor_test_readings: cabeçalho, modo de teste, situação completa/parcial, protocolo, caminho do TXT, avaliação resumida e cada tentativa, incluindo ausência de resposta e RX bruto.
- trip_records: viagens de origem REAL_OBD, com distância, combustível, consumo, velocidades e evidência original serializada.
- diagnostic_findings: estrutura preparada para achados determinísticos ligados à evidência e à sessão.
- `diagnostic_findings`: achados determinísticos gerados pela Central de Saúde, com score/confiança, evidências e próximos testes. IDs derivados de sessão + evidência evitam duplicar o mesmo achado em cada render; uma evidência diferente pode gerar novo registro histórico.
- A Central de Relatórios exibe versão do esquema, sessões abertas, amostras PID, DTCs, testes, viagens, achados diagnósticos e PIDs aprendidos, sem precisar abrir um relatório TXT.
- Uma versão de app que encontre banco com `user_version` maior do que sua versão conhecida recusa alterações no esquema, em vez de tentar operar silenciosamente em estrutura desconhecida.
- Índices de data/horário para consultas rápidas.

O banco usa WAL e chaves estrangeiras. Operações relacionadas a um relatório de teste são executadas em transação; o identificador estável do teste evita duplicar amostras quando o mesmo resultado é salvo novamente.

## Regras de qualidade e desempenho

1. **Telemetria persistida**: somente fonte REAL, estado RESPONDEU, valor numérico finito e uma sessão ECU ativa. A tabela normaliza a fonte para REAL_OBD.
2. **Amostragem limitada**: no máximo uma amostra detalhada de cada PID a cada 2 segundos. O painel pode atualizar mais rápido em memória; nem todo ciclo de 500 ms vira gravação em disco.
3. **UPSERTs de snapshot limitados**: fingerprints em memória evitam regravar DTCs/viagens inalterados a cada autosave; em falha de transação, os fingerprints são descartados para forçar ressincronização na próxima tentativa.
3. **Testes de sensores**: guardam todas as tentativas da varredura (inclusive resposta ausente), porque elas são evidência diagnóstica; o relatório TXT é gravado primeiro e continua utilizável se o registro SQLite falhar.
4. **DTCs e viagens**: apenas origem REAL_OBD; seed CarScanner, simulação e importações não alimentam o banco de evidência real. A gravação de viagens é idempotente pela ID.
5. **Retomada**: na abertura do banco, sessões que ficaram OPEN no processo anterior são marcadas RECOVERED; não são tratadas como uma conexão ECU viva.
6. **Migração sem perda**: os DTCs reais e viagens reais do snapshot JSON são importados com operações idempotentes. O arquivo JSON não é apagado nem reescrito pela migração do banco. Leituras antigas isoladas não são inventadas como série temporal retroativa.
7. **Falha degradada**: se o SQLite falhar, o autosave JSON e a exportação TXT continuam como caminhos independentes; o erro é registrado no log de desenvolvimento.

## Testes e limites desta etapa

O teste tests/sqlitePersistenceContract.test.js valida os contratos do esquema, as versões, a dependência/lockfile, os filtros de fonte, a amostragem, a integração com autosave e a continuidade TXT.

**Não declarar validação de runtime ainda**: a suíte npm run validate, Expo Doctor, prebuild/build Android e teste físico com ELM327/ECU não foram executados nesta etapa, para respeitar a solicitação de não disparar a CI. A execução desses testes deve anteceder a integração em main.
