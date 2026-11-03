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
- Artefato: `meriva-smart-diagnostic-standalone-apk`, 29.771.179 bytes, disponível no run #4682; expiração indicada pelo GitHub: 2026-11-16.
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

- Branch `fix/storage-and-history-integrity-20261031`, HEAD auditado após as correções: `41912b2dc899d2b81dc111999a494eaa5e4af9f9`.
- 48 arquivos alterados e 121 commits no metadado consultado.
- **Conflito de integração:** `mergeable=false`; base anterior à main atual.
- Revisão P1 identificou que `buildDriveCycle()` era chamado novamente em cada retry, gerando novo ID pelo horário de finalização. Corrigido com cache do ciclo associado à identidade do gravador; teste verifica que o mesmo objeto/ID é reutilizado e que outro gravador recebe ID novo.
- Revisão P1 sobre spool CSV: o caminho atual usa arquivo temporário, read-back, validação e move para nome canônico apenas após validação. Foi acrescentado teste com falha simulada no read-back, ausência de temporário/segmento parcial e retry que grava exatamente uma linha.
- O workflow não precisava de um job `baseline-gate` separado: o baseline já é um passo do job `validate`; o contrato existente foi preservado.
- CI #4712 foi disparada para o HEAD corrigido e estava em execução na última consulta.

### PR #110 — integridade JSON, backup e benchmark

- Branch `improve/phase1-storage-integrity-20261101`, HEAD `1b063df25bd84bf31d88a0d8424cee3f0bca59dd`.
- 22 arquivos alterados e 62 commits.
- **Conflito de integração:** `mergeable=false`; mesma base antiga da #109.
- Revisados `atomicJsonFile.ts`, migrações de índice, armazenamento de viagens, backup e testes. Os testes verificam bloqueio de escrita sobre JSON corrompido/schema futuro, preservação da cópia anterior válida e rollback.
- O manifesto do backup compara tamanho por diretório e total, não hashes por arquivo. Isso verifica tamanho, mas não garante integridade byte a byte se uma alteração/corrupção preservar o comprimento. Risco residual P2; não foi introduzida dependência criptográfica nova nesta rodada.
- CI #4609 passou em HEAD antigo, mas não valida a resolução dos conflitos com a main atual.

### PR #111 — layout, paleta e artefato APK

- Branch `fix/layout-palette-contrast-20261102`, HEAD corrigido `a040221cd438aefc7d063171e6557360a06a2355`.
- 23 arquivos alterados e 13 commits; base é a main atual e o GitHub marcou mergeável.
- CI #4702 falhou no Android build: Metro não encontrou dimensões válidas em `assets/meriva-smart-vehicle-banner.jpg`.
- O JPEG inválido foi substituído por banner JPEG 480×270 válido no commit acima. No run #4704, `validate` passou; `android-build` ainda estava em andamento na última consulta.
- A alteração de workflow para artefato em PR/branch continua não integrada até a PR ser mesclada e validada.


### PR #112 — auditoria transversal e documentação GPS

- Branch `docs/audit-db-pr-integrity-20261103`, HEAD `f11591d29b27a3ebec35be1a8779de39c448bd22`, base na main atual.
- Consolida o relatório desta auditoria, correção dos dez títulos divergentes do Diário, asserção de igualdade de títulos no baseline e as correções de GPS/documentação que já estavam propostas na #107.
- A #107 permanece aberta como proposta original; não integrar ambas para evitar aplicar o mesmo diff documental duas vezes.
- CI do HEAD mais recente precisa concluir antes de aceitar esta PR.

## Correções aplicadas nesta rodada

1. Sincronização dos títulos das 195 entradas do Diário com os títulos do índice na branch desta auditoria.
2. Gate de baseline ampliado para comparar títulos além dos IDs, impedindo retorno da divergência.
3. PR #109: ID de ciclo de viagem estável entre retries.
4. PR #109: teste explícito de falha no read-back do spool CSV, limpeza do temporário e retry sem duplicação.
5. PR #111: substituição do asset JPEG inválido que bloqueava o build Android.
6. Relatório desta auditoria adicionado ao repositório.

## Não fazer merge ainda

- #109 e #110 precisam de uma única estratégia de integração para os 19 arquivos em comum; preservar a implementação mais completa sem sobrescrever correções recentes da main.
- Reconciliar as entradas DB após determinar a ordem de integração; hoje os IDs DB-195/196/198 colidem em conteúdos diferentes.
- Confirmar CI dos HEADs novos #109 e #111, incluindo `android-build` e artefato no run da #111.
- PR #107 pode ser revisada separadamente, mas continua sem merge.
- Inspeção física no Galaxy A06/Android 16 e sessão real ELM327/ECU continuam **não validadas**.
- SQLite permanece fora do escopo sem medição real no aparelho e aprovação específica.

