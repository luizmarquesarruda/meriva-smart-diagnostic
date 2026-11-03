# Proteção contra sobrescrita de autosave corrompido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que o autosave substitua um JSON principal ou uma cópia anterior corrompida, inválida ou criada por schema futuro, e impedir que um temporário pendente seja descartado.

**Architecture:** Manter a leitura tolerante para recuperar o último envelope válido, mas exigir que todos os arquivos de destino que podem ser substituídos sejam inspecionados e validados antes de iniciar a gravação. A persistência falha de forma fechada, mantendo intactos o principal, a cópia anterior e qualquer temporário recuperável.

**Tech Stack:** React Native, Expo SDK 51, TypeScript, Node.js tests, Expo FileSystem mock.

**Spec:** `docs/CONTRATO_ANTI_REGRESSAO.md`, `docs/TEST_PLAN.md`, estado vigente de `docs/DIARIO_DE_BORDO.md`.

## Global Constraints

- JSON corrompido ou de schema futuro nunca deve ser sobrescrito.
- Manter escrita temporária, read-back, validação e cópia anterior.
- Não alterar Bluetooth, ECU, GPS, cálculo de autonomia ou comandos OBD.
- Não alterar nem limitar `meriva_smart_daily_obd_history.txt`.
- Não introduzir SQLite ou dependências.
- Não declarar ensaio físico no Galaxy A06/ELM327 sem evidência.

## Review Focus

- Principal corrompido com cópia anterior válida: permitir leitura de fallback, mas bloquear nova gravação e preservar ambos.
- Principal com schema futuro e cópia anterior válida: bloquear gravação sem degradar o arquivo futuro.
- Principal válido com cópia anterior corrompida: bloquear gravação para não substituir a única cópia anterior preservada.
- Principal válido com cópia anterior em schema futuro: bloquear gravação e preservar ambos.
- Qualquer temporário preexistente, mesmo que JSON válido, pode ser a cópia mais recente de uma gravação interrompida; bloquear e preservar até recuperação explícita.
- JSON estruturalmente inválido ou diretório no caminho do arquivo: falhar de forma fechada.

---

### Task 1: Fix de proteção do autosave

**Files:**
- Modify: `src/meriva/autosaveManager.ts`
- Test: `tests/merivaAutosave.test.js`

**Interfaces:**
- Consome: `isValidEnvelope`, `migrateEnvelope`, `validatePayload`, Expo FileSystem.
- Produz: `assertAutosaveFileReplaceable(path)` para principal/cópia anterior e `assertAutosaveTemporaryAbsent(path)` para impedir sobrescrita de temporário pendente.

**Steps:**
- [ ] Adicionar testes para principal corrompido/schema futuro e cópia anterior/temporário corrompidos ou de schema futuro.
- [ ] Confirmar que `saveNow` retorna `false` e que bytes do principal, da cópia anterior e do temporário não mudam.
- [ ] Validar formato, versão e payload de cada arquivo existente antes de iniciar a gravação.
- [ ] Bloquear a gravação com erro explícito quando qualquer alvo não puder ser comprovado íntegro.
- [ ] Executar a suíte completa, TypeScript, baseline e build Android na CI do SHA final.

### Task 2: Rastreabilidade

**Files:**
- Modify: `CHANGELOG.md`
- Create: este plano em `docs/superpowers/plans/`

**Steps:**
- [ ] Registrar o comportamento de falha fechada e os testes acrescentados.
- [ ] Não criar novo DB-NNN até reconciliar as colisões documentais entre branches abertas.
- [ ] Revisar o diff final contra `main`; manter a PR aberta sem merge.

## Fora do escopo desta fase

- Consolidar spool CSV e idempotência de viagens da PR #109.
- Migrar todo o armazenamento/backup para a abstração de `atomicJsonFile.ts` da PR #110.
- Alterar layouts, Bluetooth/ELM327, GPS, telemetria ou dependências.
- Integrar PRs existentes automaticamente.
