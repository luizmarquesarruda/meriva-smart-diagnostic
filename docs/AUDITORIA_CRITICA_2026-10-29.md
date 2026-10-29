# Auditoria crítica de integração — MERIVA SMART

**Data:** 2026-10-29  
**Repositório:** [luizmarquesarruda/meriva-smart-diagnostic](https://github.com/luizmarquesarruda/meriva-smart-diagnostic)  
**Branch auditada:** `fix/p0-telemetry-autonomy-diagnostics-20261029`  
**HEAD base da auditoria:** `13afa812a147f63d14edab8ca2fb8757d8a35f49`  
**Natureza desta revisão:** análise estática e de metadados de GitHub/CI; nenhum teste foi executado localmente ou em hardware físico durante esta revisão. Nenhum código funcional foi alterado neste registro.

## Estado de validação verificado

- A CI [40813285631](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40813285631) passou em `validate` e `android-build` no SHA `13afa812a147f63d14edab8ca2fb8757d8a35f49`.
- A PR [#96](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/96) tem CI verde em seu HEAD `b21b574dbac25b8b417eb2540716e0c2503eb6eb`, mas o escopo é amplo: 50 arquivos e 129 commits à frente de `main`. Sua própria descrição mantém pendente a inspeção em Android real.
- A última CI consultada de `main`, [40448217481](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40448217481), falhou no gate anti-regressão e pulou o build Android. Não considerar `main` validada por uma CI verde executada em outro SHA.
- As PRs [#92](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/92), [#93](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/93), [#94](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/94) e [#95](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/95) estão fechadas sem merge. As execuções consultadas nos seus HEADs passaram, mas isso não incorpora seus arquivos em `main`.
- A branch de interface da PR #96 e a branch P0 não são equivalentes: o compare entre ambas reporta divergência de oito commits da P0 em relação à branch de interface. Não fazer merge automático ou presumir que uma contém a outra.

## Achados priorizados

### AUD-01 — P1: amostras antigas permanecem no buffer de combustível

**Evidência estática:** `src/trip/fuelLevel.ts` limita o buffer a dez leituras e valida timestamps, mas `getSnapshot()` não remove amostras antigas pela idade. A apresentação verifica que a última amostra tenha até 60 segundos; isso não garante que todas as dez amostras usadas na média pertençam à mesma janela temporal.

**Risco:** quando o ciclo de consultas é lento ou irregular, a estimativa pode combinar uma leitura recente com leituras antigas e representar um nível de combustível que já não corresponde à situação atual.

**Correção proposta:** filtrar por idade dentro de `getSnapshot(nowMs)` ou exigir que as dez leituras estejam dentro de uma janela máxima definida. Manter `N/D` quando não houver amostras suficientes depois do filtro.

**Teste de regressão necessário:** dez amostras distribuídas por período maior que 60 s, com a última recente; o snapshot não deve habilitar fallback com leituras expiradas.

### AUD-02 — P1: média aritmética versus requisito de mediana

**Evidência estática:** `FuelLevelBuffer.getSnapshot()` calcula média aritmética. Os testes atuais afirmam esse comportamento. Porém, o escopo documentado na PR #92 descreve buffer de combustível com “mediana contra picos”.

**Risco:** uma leitura plausível, porém anômala, pode deslocar a média e distorcer a autonomia por até a expiração do buffer.

**Correção proposta:** decidir explicitamente se o requisito vigente é média ou mediana; se o objetivo continuar sendo reduzir picos, implementar mediana e ajustar testes/documentação de forma conjunta. Não mudar somente a expectativa do teste sem mudar o contrato e o cálculo.

### AUD-03 — P2: estatística de aprendizado mistura média ponderada e atualização não ponderada

**Evidência estática:** em `src/database/learningProfile.ts`, a primeira observação real em uma estatística com seed mistura a média usando `seedWeight`, mas define `samples = seedSamples + 1`. Nas observações seguintes, a atualização utiliza esse contador em uma fórmula incremental do tipo Welford, enquanto a média anterior foi ponderada de modo diferente de uma média de amostras de mesmo peso.

**Risco:** média e desvio padrão podem deixar de representar uma definição estatística consistente após a segunda ou subsequente observação real. O valor de confiança por contagem real é separado, mas a estimativa estatística merece validação.

**Correção proposta:** definir uma única política estatística: manter estatísticas reais separadas do seed e combiná-las só na inferência, ou implementar média/variância online ponderadas com peso total explícito. Adicionar testes numéricos para seed + 1, 2 e várias observações reais, comparados com cálculo de referência independente.

### AUD-04 — P1: correções de GPS e persistência estão em branches fechadas sem merge

**Evidência dos metadados:** a PR #95 contém alterações em `src/gps/gpsTracker.ts` e reacquisição de localização; a PR #93 contém migração do histórico de viagens para SQLite e testes de recuperação. Ambas estão fechadas sem merge. A branch P0 atual não altera `src/gps/gpsTracker.ts` nem contém a migração de SQLite.

**Risco:** CI verde nessas branches demonstra validação dos respectivos SHAs, mas não comprova que a versão principal atual tenha recebido as correções. A migração SQLite e a correção GPS continuam separadas do P0 atual.

**Próxima ação:** comparar os diffs dessas branches com o estado atual e portar apenas as alterações ainda necessárias para uma única integração controlada. Antes de integrar SQLite, preservar os requisitos de migração idempotente, backup/restauração e compatibilidade com dados legados.

### AUD-05 — P1: PR #96 exige revisão de escopo integrado

**Evidência dos metadados:** a PR #96 descreve alterações de cockpit/DTC/MAP, mas modifica 50 arquivos e está 129 commits à frente de `main`. A sua CI exata está verde, entretanto o diff inclui mudanças em telas secundárias, conectividade, diagnóstico, parser, documentação e testes.

**Risco:** o título e a descrição não explicam claramente todo o escopo integrado. O estado `mergeable=clean` indica ausência de conflito automático reportado pelo GitHub, não correção funcional nem segurança contra regressões.

**Próxima ação:** revisar o diff agregado por domínio, reconciliar mudanças com a branch P0 e provar que o SHA combinado é o testado. Manter bloqueio de integração até teste físico do cockpit no Android.

### AUD-06 — P0: teste real Bluetooth/ECU permanece bloqueador

**Evidência disponível:** testes automatizados exercitam framing, serialização de conexões, buffer RX e reconhecimento de respostas. O relatório de diagnóstico fornecido anteriormente mostrava falha real na resposta ECU a `010C`, com timeout.

**Limite:** nenhum teste automatizado confirma que o Galaxy A06 / SM-A065M com Android 16 recebe resposta `41 0C` válida do ELM327 e da ECU reais.

**Critério de aceitação física:** ativar Bluetooth; conectar automaticamente a um dispositivo pareado; confirmar inicialização ELM; receber resposta válida ao `010C`; manter estado de ECU separado de estado Bluetooth; registrar TX/RX/framing real; repetir após desconectar/reconectar. Depois validar os PIDs suportados e comparar autonomia com percurso/abastecimento medidos.

## Sequência recomendada

1. Corrigir ou resolver AUD-01 e AUD-02 em conjunto, com testes de fronteira e atualização do contrato anti-regressão.
2. Validar a atualização estatística descrita em AUD-03 com casos de referência determinísticos.
3. Auditar o diff da PR #95 (GPS) e #93 (SQLite) contra `main`; portar somente mudanças necessárias e não duplicadas.
4. Reconciliar isso com PR #96 em uma única linha de integração, sem merge automático de branches divergentes.
5. Exigir `validate`, gate anti-regressão, suíte completa e `android-build` verdes no mesmo SHA final.
6. Manter como bloqueador separado a validação física no Galaxy A06 com ELM327 e ECU reais.

## Fora do escopo/limitações desta revisão

- Não foi possível inspecionar uma aplicação MERIVA SMART no Replit: a conta conectada não retornou apps editáveis correspondentes.
- O protótipo MagicPath é uma simulação de interface e não estabelece comunicação física Bluetooth/ECU.
- Nenhuma alteração funcional ou merge foi feito nesta revisão; este documento registra achados estáticos para guiar a correção e a integração.


### AUD-07 — P0: CI verde não demonstra correção do timeout `010C`

**Evidência estática:** a diferença da branch P0 atual em relação a `main` modifica o transporte Bluetooth para limitar o registro de diagnóstico, mas não altera `src/obd/elm327.ts`, `src/obd/elm327Compatibility.ts` nem `src/obd/bluetoothManager.ts`. O relatório mais recente de hardware fornecido anteriormente indicava que o adaptador era encontrado, mas a ECU não respondia a `010C`.

**Risco:** a branch P0 está validada por CI para suas mudanças, mas não contém uma correção demonstrável do caminho central de inicialização/protocolo/sondagem da ECU. Os testes automatizados de framing e mocks não provam que a ECU real responderá.

**Próxima ação:** tratar a causa do timeout `010C` como investigação P0 independente e rastreável: TX exato, resposta RX bruta, prompt ELM, tempo de espera, protocolo negociado e tentativa no próximo candidato pareado. Não declarar a conexão corrigida até validar a resposta real da ECU no Galaxy A06/Android 16.

### AUD-08 — P1: fórmula de autonomia no protótipo MagicPath usa divisão por km/L

**Evidência estática:** no componente MagicPath “Meriva Smart — Autonomia estimada pelo buffer” (`componentId=465468332217372672`), a fórmula divide o combustível calculado por `selected.consumption`, embora a interface rotule o consumo como `km/L`.

**Risco:** a dimensão resultante não é quilômetro. Com tanque nominal de 56 L, nível de 42% e consumo de 8,4 km/L, a fórmula correta daria `(0,42 × 56 L) × 8,4 km/L ≈ 197,6 km`; a fórmula do protótipo dá 280, o que superestima a autonomia nesse exemplo.

**Correção proposta:** usar `litrosDisponiveis × kmPorLitro` e testar os casos de 0%, 42%, 100%, consumo ausente/inválido e rótulo da fonte LIVE/BUFFER/UNAVAILABLE. Esse achado diz respeito ao protótipo MagicPath; não prova que a mesma fórmula esteja no código Android, cuja função `estimateRangeFromFuelLevel()` nesta branch usa multiplicação e tem teste numérico correspondente.
