# Auditoria profunda de PIDs e IA local — MERIVA SMART

**Data:** 2026-10-28  
**Frente única:** PR #96 — `ui/cockpit-instant-consumption-20261027`  
**Escopo:** integridade do catálogo/formulário/faixas, parser, PID composto 0101, amostras de testes de sensores, provenance/frescor do motor de diagnóstico, score/linguagem da IA e relatório TXT.

## Resultado executivo

A revisão estática encontrou consistência estrutural entre o catálogo de PIDs, as fórmulas e as faixas; não encontrou PID duplicado nem referência ausente. Foram, porém, encontradas falhas de semântica e confiança: a triagem da IA aceitava observações sem validar a idade dentro do motor; fontes inesperadas podiam ser tratadas de modo permissivo por mapeamentos do tipo “não é simulação”; e a tela podia mostrar uma confirmação muito forte quando a única evidência era a ausência de hipóteses. Além disso, PID 0101 tem quatro bytes com bits de estado e prontidão, mas a camada de armazenamento guardava somente o valor U32 e descartava a interpretação do parser.

As correções desta rodada são preventivas e verificáveis. Não comprovam que qualquer sensor da Meriva está funcionando corretamente, não descobrem suporte físico de novos PIDs e não substituem validação com ELM327/ECU reais.

## Inventário estático confirmado

| Componente | Quantidade / estado | Observação |
|---|---:|---|
| PIDs Mode 01 no catálogo | 34 | Nenhum duplicado |
| Fórmulas | 20 | Todos os PIDs referenciam fórmula existente |
| Faixas | 34 | Mesmo conjunto de IDs do catálogo |
| Avaliações no catálogo de teste de sensor | 30 | Sem referências a PIDs ausentes |
| PIDs sem teste dedicado | 4 | `0101`, `0130`, `0131`, `0151` |
| PIDs com evidência específica RAW_ECU para a Meriva | 1 | `010C`, resposta `41 0C 1A F8`, 1726 rpm no registro consultado |
| PIDs candidatos | 10 | `0105`, `0106`, `0107`, `010B`, `010E`, `010F`, `0110`, `0111`, `0114`, `012F` |

A distinção não é cosmética: “padrão no SAE”, “anunciado na bitmap”, “respondeu na sessão atual”, “RAW_ECU registrado para esse veículo” e “sensor fisicamente validado” são estados diferentes. Uma resposta positiva prova que houve resposta interpretável; não prova a precisão física do sensor.

## Documentação técnica cruzada

1. **SAE J1979 / J1979-DA.** A SAE J1979 define serviços de diagnóstico e a Digital Annex é a referência de parâmetros e PIDs. A revisão pública consultada da Digital Annex é **J1979DA_202608, revisada em 6 de agosto de 2026**. Link: https://saemobilus-test.cld.sae.org/standards/j1979da_202608-j1979-da-digital-annex-e-e-diagnostic-test-modes
2. **ISO 15031-5:2015.** A página oficial confirma que esta edição continua atual após revisão em 2026. Especifica mensagens, tempos, formato de pedido/resposta e comportamento quando dados não estão disponíveis; a própria ISO alerta que a aplicabilidade deve ser verificada para cada veículo/ano/motor/região. Link: https://www.iso.org/standard/66368.html
3. **Decodificação/transportes.** A documentação do python-OBD demonstra que cada comando declara bytes de resposta e uma função de decodificação própria, mantendo os bytes de serviço/PID fora do valor final e tratando a não disponibilidade como um estado diferente de uma leitura escalada. Fonte comparativa: https://python-obd.readthedocs.io/en/latest/Custom%20Commands/
4. **PID 0101.** A tabela técnica de bits consultada separa os monitores comuns dos específicos de ignição por centelha (SI) e ignição por compressão (CI), e exige combinar o bit de suporte com o bit de prontidão. Fonte secundária consultada em 2026: https://obd2pid.com/pids/01-01
5. **Rastreabilidade de IA.** O NIST AI RMF orienta considerar validade, confiabilidade, transparência, explicabilidade e avaliação durante desenvolvimento e uso. Este motor permanece um sistema de regras heurísticas; não é modelo estatístico calibrado. Link: https://www.nist.gov/itl/ai-risk-management-framework e https://www.nist.gov/itl/ai-risk-management-framework/ai-risk-management-framework-faqs

A documentação normativa integral da SAE é comercial. As páginas públicas e as bibliotecas abertas foram usadas para confirmar definições e comportamento, não para afirmar homologação OEM da Meriva.

## Correções implementadas

### 1. Barreira de evidência da IA — contrato v2

- O motor local agora recebe um instante de referência testável e um limite configurável de idade, padrão de **45 segundos**.
- Só aceita observações com origem explicitamente reconhecida como `REAL` (contrato atual de `LastPidReading`) ou `REAL_OBD`; origem desconhecida vira `IMPORTADO`, nunca “real” por padrão.
- Exclui valor nulo/não finito, timestamp inválido/futuro/antigo, valor fora da faixa catalogada e observação marcada como derivada.
- Normaliza PID antes da validação de faixa para que `01 0B` e `010B` não divergirem; espaços não podem contornar limites.
- Expõe contadores para amostras aceitas e bloqueadas (simulação, origem não ao vivo, idade e valor inválido), permitindo explicar por que uma evidência não entrou na hipótese.
- Ignora DTC marcado como histórico mesmo que um registro legado diga `CONFIRMED`, e bloqueia DTCs cuja origem/status não correspondem a evidência atual.
- Deduplifica a mesma evidência para que cópias de um DTC/PID não elevem a pontuação artificialmente.
- Incrementa o contrato do resultado para **v2**.

### 2. A interface deixou de prometer uma certeza que não possui

- A tela Saúde lê o estado vivo de ECU pelo serviço compartilhado, e não se baseia somente no campo persistido da conexão.
- A ausência de hipóteses só é apresentada como ausência de alertas nas leituras atuais quando há ECU respondendo na sessão atual e dados OBD recentes utilizáveis; caso contrário, mostra **DADOS INSUFICIENTES**.
- O texto deixa claro que ausência de hipótese não certifica a saúde geral do veículo.
- Laboratório e TXT chamam a pontuação de **pontuação heurística** e o nível LOW/MEDIUM/HIGH de nível qualitativo, explicitando que não são probabilidades estatísticas.
- O relatório TXT detalha quantas observações foram aceitas ou bloqueadas e a razão principal de bloqueio.

### 3. PID 0101 — bitmask em vez de “medição” escalar

A resposta Mode 01 PID 0101 contém quatro bytes de dados com estado da MIL, contador de DTCs e monitores de prontidão. Não deve ser apresentada ao motorista como um número U32 gigante.

- A interpretação agora verifica bit de suporte e bit de incompletude dos monitores comuns.
- A interpretação de bytes C/D diferencia ciclo Otto/ignição por centelha e diesel/ignição por compressão; não rotula EVAP ou catalisador aquecido como monitores de diesel quando esses bits têm outra semântica.
- O valor bruto numérico permanece para compatibilidade e rastreabilidade, mas a tela Dados apresenta “STATUS OBD-II” e a interpretação legível.
- `LastPidReading` pode preservar `interpretation` no autosave, validação do schema e exportação TXT.

### 4. Teste de sensor — integridade da sequência

- A avaliação descarta timestamps inválidos/futuros.
- Números de tentativa repetidos não contam duas vezes para completar cinco tentativas.
- Mantém o requisito existente: cinco tentativas distintas e cinco respostas válidas. Timeout/erro não se torna zero e nunca conta como aprovação.
- Não se adicionou filtro de idade de 45 segundos ao teste de sensor: esse processo é uma série deliberada de amostras e pode durar mais do que uma janela da IA. O contrato aqui é sequência válida e timestamps coerentes; o limite de 45 s vale para uma hipótese operacional atual, não para invalidar retroativamente uma série de teste corretamente coletada.

## Fórmulas e faixas — parecer

As fórmulas existentes foram cruzadas com as definições de Mode 01 consultadas. Exemplos confirmados e cobertos por vetores de teste: RPM `((A×256)+B)/4`, MAF `((A×256)+B)/100`, temperatura `A−40`, trim `(A×100/128)−100`, tensão de ECU `U16/1000`, taxa de combustível `U16/20`, torque `A−125`, temporização de injeção `(U16−26880)/128`. A decodificação de `0114` mantém a tensão baseada no byte A e trata o byte B=FF como não usado, sem fabricar +99,22% de trim.

As faixas de `ranges.json` são limites largos de codificação/plausibilidade, não limites de operação saudável OEM. Por exemplo, o máximo matemático do PID `0143` é 25.700% devido à escala de um U16; isso não significa que uma carga real de motor de 25.700% seja normal. Essa camada serve para rejeitar entradas impossíveis ou sinalizar revisão, não para julgar a saúde de um sensor. Limiar operacional precisa ficar separado por contexto de uso e, para a Meriva, deve ser sustentado pelo manual/dados de fábrica ou evidência em veículo.

Não alterei fórmulas matemáticas padronizadas nesta rodada por ausência de evidência de que estejam erradas. A correção do PID 0101 foi de interpretação semântica e apresentação; as novas validações reforçam a camada de entrada e a rastreabilidade.

## Regras do motor local hoje — e limites que permanecem

O motor heurístico atual relaciona DTCs específicos (incluindo P0135, P0420, P0301, P0123 e P0133) e sinais simples, como trim combinado de STFT/LTFT com contexto de marcha lenta aquecida/cruzeiro e MAP elevado em marcha lenta aquecida. Isso é triagem explicável, não diagnóstico OEM completo. O mapa ainda é pequeno, não está calibrado contra uma base rotulada de falhas reais e não estima probabilidades estatísticas.

Próxima evolução recomendada, após CI e ensaio físico: aumentar a corroborabilidade de cada regra (DTC + PIDs independentes + contexto + sequência temporal), armazenar versões das regras usadas em cada relatório, introduzir limites operacionais específicos para a aplicação somente com fonte confiável, avaliar falsos positivos/falsos negativos em dados rotulados e ampliar catálogo em lotes com orçamento de polling testado. Não introduzir modelos ou “IA na nuvem” como substituto do diagnóstico local e do controle de origem.

### Cobertura não ampliada nesta PR

Os PIDs `0101`, `0130`, `0131` e `0151` não têm um teste dedicado de sensor no catálogo atual. Isso não justifica criar quatro testes físicos artificiais: 0101 é bitmap de estado; 0130 é contador de ciclos; 0131 é contador de distância desde limpeza de DTC; 0151 é enumeração de tipo de combustível. As próximas regras devem ser de consistência/interpretação adequada, e não limiares de um sensor analógico inventado.

Não foi expandido indiscriminadamente o catálogo para centenas de PIDs padronizados. O scanner percorre os IDs catalogados em uma fila serial e a aplicação precisa sustentar K-Line e adaptadores lentos. Uma expansão exige prioridade, timeout/cadência, parser, byte lengths, fórmula, unidades, faixa, testes e evidência da ECU, não só uma linha JSON.

## Testes adicionados/alterados nesta rodada

- `tests/diagnosticEngine.test.js`: fonte desconhecida, seed, velho/futuro, valor inválido, PID com espaços, telemetria derivada, DTC histórico e duplicado, versão v2 e natureza heurística do score.
- `tests/pidParserIntegrity.test.js`: estado de PID 0101 para SI/CI, monitor não suportado e decodificação existente de fórmulas/payloads.
- `tests/sensorTestEngine.test.js`: número de tentativa duplicado e timestamp futuro.
- `tests/merivaAutosave.test.js`: interpretação do PID 0101 persiste e entra no TXT.
- A suíte segue conectada ao comando `npm test`; nenhuma regra do gate anti-regressão foi removida.

## Fontes internas

- `docs/MAPEAMENTO_COMPLETO_PIDS_2026-10-24.md` — inventário base, evidência específica da Meriva e candidatos.
- `docs/RELATORIO_PIDS_E_FORMULAS.md` — catálogo/fórmulas e históricos de auditoria.
- `docs/CONTRATO_ANTI_REGRESSAO.md` — RG-40/RG-41 e critérios de aceitação.
- `docs/TEST_PLAN.md` — PID-AI-01.
- `src/knowledge/pids.json`, `formulas.json`, `ranges.json`, `sensor_tests.json`, `diagnostic_rules.json`, `polling_policy.json`.

## Aceitação pendente

Esta é uma auditoria estática de código e documentação. A mudança só pode ser considerada entregue após o gate anti-regressão, TypeScript, todas as suítes e `android-build` passarem **no mesmo SHA final**; depois disso, inspecionar o APK no Galaxy A06/Android 16 e comparar respostas RAW do ELM327/ECU. A confirmação física de PID continua pendente; esta documentação não prova suporte para novos PIDs nem funcionamento mecânico/elétrico de sensores.
