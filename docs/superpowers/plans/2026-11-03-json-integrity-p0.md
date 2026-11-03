# Integridade JSON da fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear sobrescrita de JSON corrompido, inválido ou de schema futuro nos módulos críticos sem trocar o formato de armazenamento.

**Architecture:** Criar `src/storage/atomicJsonFile.ts` com leitura somente de cópia anterior validada e escrita serializada com temporário fixo, read-back e backup anterior. Cada módulo define um validador e reconhece schema futuro; o autosave mantém proteção específica de principal, previous e tmp.

**Tech Stack:** TypeScript, Expo SDK 51, expo-file-system 17, Node.js com mocks já usados pela suíte.

**Spec:** `docs/superpowers/specs/2026-11-03-json-integrity-design.md`

## Global Constraints

- JSON corrompido/inválido/schema futuro nunca será sobrescrito automaticamente.
- Não criar SQLite nem adicionar dependências.
- Não alterar Bluetooth, ECU, GPS, autonomia, comandos OBD ou origem dos dados.
- Não apagar, truncar ou limitar `meriva_smart_daily_obd_history.txt`.
- Manter arquivos legados sem schema version quando passarem no validador atual.
- Marcar validação física como `não validado` quando não houver ensaio real.

## Review Focus

- Principal inválido com cópia anterior válida: permitir leitura de fallback, bloquear gravação e preservar ambos.
- Cópia anterior inválida/futura com principal válido: bloquear a escrita sem alterar o principal.
- Temporário válido ou inválido deixado por interrupção: bloquear nova escrita e preservar o temporário.
- Caminho do arquivo convertido em diretório: bloquear gravação sem removê-lo.
- Primeiro uso sem principal/backup: criar documento inicial; nunca confundir ausência com falha de leitura.

## File Map

- Create `src/storage/atomicJsonFile.ts`: validação, leitura com recuperação e gravação atômica serializada.
- Create `src/storage/storageHealth.ts`: avisos de integridade em memória com assinatura para UI.
- Modify `src/database/appSettings.ts`: schema 1, leitura segura, defaults somente quando ausente e escrita atômica.
- Modify `src/database/vehicleConfig.ts`: schema 1, recuperação somente leitura e perfil de sessão em memória quando arquivo inválido.
- Modify `src/database/learningProfile.ts`: validação estrutural, schema 1 e bloqueio de inicialização vazia sobre arquivo inválido.
- Modify `src/database/maintenanceStorage.ts`: schema 1 e bloqueio de edição após leitura inválida.
- Modify `src/meriva/autosaveManager.ts`: validar principal/previous e bloquear tmp preexistente antes de gravar.
- Modify `app/saude.tsx`: exibir avisos de integridade do armazenamento.
- Modify tests: `tests/regression.test.js`, `tests/merivaAutosave.test.js`, `tests/projectBaseline.test.js`.
- Modify docs: contrato anti-regressão, plano de testes, diário de bordo e changelog.

## Task 1: Provar os caminhos atuais de sobrescrita

**Files:** tests/regression.test.js, tests/merivaAutosave.test.js.

- [x] Adicionar testes que exigem preservação byte a byte após leitura/escrita de configurações, veículo, aprendizado e manutenção corrompidos.
- [x] Estender o caso de schema futuro do autosave para exigir falha no salvamento seguinte e preservação do principal e previous.
- [ ] Confirmar CI vermelha por falha de comportamento esperada, não por erro de sintaxe.

## Task 2: Implementar o contrato JSON comum

**Files:** src/storage/atomicJsonFile.ts, src/storage/storageHealth.ts, tests/regression.test.js.

- [ ] Implementar `readJsonWithRecovery<T>(path, validate, isFutureVersion)`.
- [ ] Implementar `writeJsonAtomically<T>(path, value, validate, isFutureVersion)`, com fila por caminho, temporário fixo, leitura de retorno e backup anterior validado.
- [ ] Bloquear temporário pendente e backup temporário pendente.
- [ ] Testar criação inicial, atualização, recuperação somente leitura, corrupção, schema futuro, diretório e falha de substituição.

## Task 3: Proteger consumidores JSON

**Files:** src/database/appSettings.ts, vehicleConfig.ts, learningProfile.ts, maintenanceStorage.ts.

- [ ] Preservar defaults somente para arquivo ausente.
- [ ] Retornar dados recuperados apenas em memória e registrar aviso quando usar cópia anterior.
- [ ] Bloquear writes sobre principal/previous inválidos ou futuros.
- [ ] Validar documentos completos sem rejeitar legados válidos sem schemaVersion.
- [ ] Confirmar que aprendizado real e dados de origem não mudaram.

## Task 4: Fechar a lacuna do autosave

**Files:** src/meriva/autosaveManager.ts, tests/merivaAutosave.test.js.

- [ ] Inspecionar principal e cópia anterior antes de substituir qualquer arquivo.
- [ ] Bloquear temporário preexistente, válido ou inválido.
- [ ] Preservar todos os arquivos byte a byte no caminho de falha.
- [ ] Manter leitura do fallback apenas para hidratação em memória.

## Task 5: Tornar falhas visíveis e documentadas

**Files:** app/saude.tsx, tests/projectBaseline.test.js, docs/CONTRATO_ANTI_REGRESSAO.md, docs/TEST_PLAN.md, docs/DIARIO_DE_BORDO.md, CHANGELOG.md.

- [ ] Exibir avisos de JSON corrompido, recuperação e schema futuro na Central de Saúde.
- [ ] Fixar RG-56 e os testes correspondentes no gate de baseline.
- [ ] Registrar política, escopo, PR e estado de CI; declarar ensaio físico como não validado.

## Task 6: Verificação final da fase

- [ ] Executar `npm run doctor`, `npm run gate:baseline`, `npm run validate`.
- [ ] Confirmar CI de `validate` e `android-build` no mesmo SHA final.
- [ ] Revisar o diff e a compatibilidade de arquivos legados.
- [ ] Criar uma PR desta fase para `main`, sem merge.
