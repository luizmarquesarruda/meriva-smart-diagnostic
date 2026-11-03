# Auditoria geral do Diário de Bordo e Pull Requests

**Data da consulta:** 2026-11-03  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Branch integrada consultada:** `main` — `a741112b70b04d22a31b5512b92b1c60dfe61e22`

## Escopo e método

Foram consultados o índice e os cabeçalhos de todas as entradas DB da `main`, os metadados de todas as Pull Requests retornadas pelo GitHub, os diffs/arquivos e discussões das quatro PRs abertas, os checks dos HEADs disponíveis e a execução CI mais recente da `main`.

A auditoria diferencia:
- **Merged:** mudança integrada; a validação atual da `main` é a referência do estado executável.
- **Closed sem merge:** proposta encerrada; não presumir que seu conteúdo entrou no produto.
- **Open:** proposta ainda não integrada; validar o HEAD e conflitos antes de qualquer merge.

A classificação cobre as 108 PRs existentes no GitHub. Isso não equivale a reexecutar individualmente os builds históricos de cada uma das 71 branches já encerradas sem merge. Nenhuma delas foi reaberta nem reaplicada automaticamente.

## Resultado da CI integrada

- SHA da `main`: `a741112b70b04d22a31b5512b92b1c60dfe61e22`.
- Run #4682: [resultado no GitHub](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/41384372064).
- `validate`: sucesso.
- `android-build`: sucesso.
- Artefato: `meriva-smart-diagnostic-standalone-apk`, 29.771.179 bytes, ID `13115116365`, digest SHA-256 `237b9c3bb52cfa0b12afc5f5e73912b7bc864fc93f192974283247c131ea0b04`, disponível no run #4682 até 2026-11-16.
- O repositório está público. A política integrada pela PR #108 ainda limita o upload do APK a push em `main`; a ampliação para PRs/branches está somente na PR #111.

## Auditoria de DB

### Estado na main

- 195 cabeçalhos DB e 195 itens no índice.
- IDs contínuos e sem duplicidade: DB-001 a DB-195.
- Foram encontrados 10 títulos divergentes entre cabeçalho e índice:
  - DB-001 e DB-003: separador de data diferente.
  - DB-133, DB-143, DB-149 e DB-163: título do índice desatualizado.
  - DB-185 e DB-186: título do índice não correspondia ao histórico; DB-185 é uma decisão histórica de bloqueio e não altera a decisão posterior do usuário de manter o repositório público.
  - DB-187 e DB-188: pontuação excedente no índice.
- Esta branch padroniza o separador de DB-001/003, sincroniza os dez itens com seus cabeçalhos e amplia `tests/projectBaseline.test.js` para falhar se os títulos divergirem novamente.

### Colisão de IDs entre branches abertas

As branches paralelas partiram de um diário anterior à sequência mais recente e reutilizaram IDs:

| Referência | Entradas locais relevantes |
|---|---|
| `main` | DB-195 — Divergência visual do APK instalado e rastreabilidade da publicação |
| PR #109 | DB-195 a DB-207 — benchmark, migrações, integridade, CSV, fallback ELM e retry de viagem |
| PR #110 | DB-195 e DB-196 — integridade JSON/backup/benchmark e ajustes de regressão |
| PR #111 | DB-196 a DB-198 — paleta, cockpit e gate de artefato |

Esses IDs não têm o mesmo significado entre branches. A colisão é real, não apenas diferença de formatação. O merge precisa escolher a ordem das contribuições, incorporar o Diário da base atual e renumerar os registros de forma contínua. Nenhuma nova entrada DB foi criada nesta auditoria para não introduzir um quinto ramo de numeração concorrente.

## Inventário completo das Pull Requests

O inventário inicial retornou 108 PRs; esta auditoria abriu a PR #112 para versionar os resultados. O total atual passou a **109 PRs**:

- **33 merged:** #2, #3, #4, #5, #9, #13, #19, #24, #26, #31, #35, #36, #37, #49, #50, #51, #52, #58, #76, #77, #78, #79, #80, #84, #89, #96, #98, #100, #101, #104, #105, #106 e #108.
- **71 closed sem merge:** #1, #6, #7, #8, #10, #11, #12, #14, #15, #16, #17, #18, #20, #21, #22, #25, #27, #28, #29, #30, #32, #33, #34, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47, #48, #53, #54, #55, #56, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #81, #82, #83, #85, #86, #87, #90, #91, #92, #93, #94, #95, #97, #99, #102 e #103.
- **5 abertas:** #107, #109, #110, #111 e #112.
- Os números #23, #57 e #88 não apareceram na listagem de PRs retornada pelo GitHub; não foram inferidos como PRs existentes.

### PR #107 — documentação GPS

- Branch `docs/audit-consistency-gps-20261031`, HEAD `13da5c77ac2eef09c51ff5ede66296201b9fc616`.
- Dois arquivos: README e plano de testes.
- Corrige a referência de velocidade para PID 010D e remove duplicidade de `PERM-GPS-01`.
- `validate` e `android-build` passaram nesse HEAD. PR segue aberta; não foi mesclada.

### PR #109 — armazenamento, histórico e telemetria

- Branch `fix/storage-and-history-integrity-20261031`, HEAD atual consultado: `ce818544e3872fa2cad8147dfa9397eb1a36cc2c`.
- 48 arquivos alterados e 121 commits no metadado consultado.
- **Conflito de integração:** `mergeable=false`; base anterior à main atual.
- Revisão P1 identificou que `buildDriveCycle()` era chamado novamente em cada retry, gerando novo ID pelo horário de finalização. Corrigido com cache do ciclo associado à identidade do gravador; teste verifica que o mesmo objeto/ID é reutilizado e que outro gravador recebe ID novo.
- Revisão P1 sobre spool CSV: o caminho atual usa arquivo temporário, read-back, validação e move para nome canônico apenas após validação. Foi acrescentado teste com falha simulada no read-back, ausência de temporário/segmento parcial e retry que grava exatamente uma linha.
- O workflow não precisava de um job `baseline-gate` separado: o baseline já é um passo do job `validate`; o contrato existente foi preservado.
- As duas discussões P1 da revisão foram resolvidas após conferência do código e dos testes. Foi acrescentada proteção para bloquear gravação quando `.previous.json` ou sua cópia temporária está corrompida ou em schema futuro; testes verificam que main e backup permanecem intactos. A consulta de workflows não retornou execução associada ao HEAD atual `ce81854`; CI desse SHA permanece pendente de confirmação.

### PR #110 — integridade JSON, backup e benchmark

- Branch `improve/phase1-storage-integrity-20261101`, HEAD atual consultado: `f5e75296015522b25febd0c623e8795d390e6c91`.
- 22 arquivos alterados e 62 commits.
- **Conflito de integração:** `mergeable=false`; mesma base antiga da #109.
- Revisados `atomicJsonFile.ts`, migrações de índice, armazenamento de viagens, backup e testes. Os testes verificam bloqueio de escrita sobre JSON corrompido/schema futuro, preservação da cópia anterior válida e rollback.
- Correção implementada no HEAD atual: novos manifestos schema 2 registram SHA-256 por arquivo e validam caminho, quantidade, tamanho e hash na listagem, staging, restauração e rollback. Manifestos schema 1 continuam aceitos para backups legados. Foi acrescentado teste que altera conteúdo sem alterar tamanho e exige bloqueio da restauração. CI #4609 pertence ao HEAD antigo `1b063df`; não foi localizada execução associada ao HEAD `f5e7529`, portanto a correção permanece **não validada por CI**.

### PR #111 — layout, paleta e artefato APK

- Branch `fix/layout-palette-contrast-20261102`, HEAD atual `4101342a27c3543afedd79637ba6d2276dab977c`.
- 23 arquivos alterados e 13 commits; base é a main atual e o GitHub marcou mergeável.
- CI #4702 falhou no Android build: Metro não encontrou dimensões válidas em `assets/meriva-smart-vehicle-banner.jpg`.
- O JPEG inválido foi substituído por banner JPEG 480×270 válido no commit acima. No run #4734 (HEAD `4101342`), `validate` e `android-build` concluíram com sucesso. Artefato `meriva-smart-diagnostic-standalone-apk`, ID `13210041138`, 29.786.659 bytes, digest do ZIP SHA-256 `b49c31f9c6a161f238db3cb3b5497b958cfdac7353b29d3fdcea2e3d374ba78a`, disponível até 2026-11-17.
- A alteração de workflow está ativa na branch da #111 e gerou o artefato acima; ainda não está integrada à `main`.


### PR #112 — auditoria transversal e documentação GPS

- Branch `docs/audit-db-pr-integrity-20261103`, HEAD atual antes desta atualização: `70497787551521caf23696d7e137eff2111b1699`, base na main atual.
- Consolida o relatório desta auditoria, correção dos dez títulos divergentes do Diário, asserção de igualdade de títulos no baseline e as correções de GPS/documentação que já estavam propostas na #107.
- A #107 permanece aberta como proposta original; não integrar ambas para evitar aplicar o mesmo diff documental duas vezes.
- CI #4743 do HEAD `7049778`: `validate` concluiu com sucesso (doctor, baseline, TypeScript e testes); `android-build` estava em execução na última consulta. Sem artefato ainda.

## Correções aplicadas nesta rodada

1. Sincronização dos títulos das 195 entradas do Diário com os títulos do índice na branch desta auditoria.
2. Gate de baseline ampliado para comparar títulos além dos IDs, impedindo retorno da divergência.
3. PR #109: ID de ciclo de viagem estável entre retries.
4. PR #109: teste explícito de falha no read-back do spool CSV, limpeza do temporário e retry sem duplicação.
5. PR #109: bloqueio de sobrescrita de backup JSON corrompido/schema futuro.
6. PR #110: manifesto schema 2 com SHA-256 por arquivo e teste de corrupção de mesmo tamanho.
7. PR #111: substituição do asset JPEG inválido; CI #4734 e APK confirmados.
8. Relatório desta auditoria adicionado ao repositório.

## Não fazer merge ainda

- #109 e #110 precisam de uma única estratégia de integração para os 19 arquivos em comum; preservar a implementação mais completa sem sobrescrever correções recentes da main.
- Reconciliar as entradas DB após determinar a ordem de integração; hoje os IDs DB-195/196/198 colidem em conteúdos diferentes.
- Confirmar CI dos HEADs atuais #109 e #110; #111 está verde no HEAD `4101342` com APK publicado; #112 tem `validate` verde e `android-build` em execução no run #4743.
- PR #107 pode ser revisada separadamente, mas continua sem merge.
- Inspeção física no Galaxy A06/Android 16 e sessão real ELM327/ECU continuam **não validadas**.
- SQLite permanece fora do escopo sem medição real no aparelho e aprovação específica.

