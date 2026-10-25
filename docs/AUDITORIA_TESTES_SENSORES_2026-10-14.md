# Auditoria técnica — catálogo e execução dos testes de sensores

> **Nota de versão:** relatório histórico. O contrato atual exige cinco tentativas e cinco respostas válidas por PID, não três. Veja [Auditoria de fontes da Meriva e compatibilidade OBD](MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md), [mapa atual de PIDs/fórmulas](PID_FORMULA_MAP_2026-10-24.md) e `src/knowledge/sensor_tests.json`.

**Data:** 2026-10-14  
**Veículo de referência:** Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX, referência 2011/2012

## Conclusões da pesquisa

1. SAE J1979 descreve serviços OBD-II e blocos bitmap de PIDs suportados. Um PID descrito no padrão não significa que toda ECU o implemente: a disponibilidade deve vir do bitmap anunciado em tempo de execução.
2. Catálogos abertos foram usados para conferir nomes, fórmulas e unidades, não para afirmar compatibilidade específica do veículo.
3. O manual do proprietário Meriva 2012 é fonte de identidade/manutenção; não enumera suporte de PIDs em tempo real.
4. A auditoria local da Bíblia da Meriva estabelece que catálogo de peças não prova PID, pinagem, valores elétricos específicos nem protocolo proprietário.
5. A fonte secundária “Sistema Econoflex 1.4 — Diagnóstico e Funcionamento” cita Multec H X14YFH e alerta para anos específicos 2007–2008. É contexto de componentes, não especificação transferível para a Meriva 2011/2012.
6. Só 010C (RPM) tem evidência RAW_ECU documentada no inventário atual. Valores CarScanner continuam sendo referência externa, não resposta atual da ECU.

## Catálogo JSON

Arquivo principal: src/knowledge/sensor_tests.json.

- 30 parâmetros padronizados no catálogo de testes: PID 010C (RPM) tem evidência RAW_ECU no inventário atual; os outros 29 parâmetros ainda não estão confirmados para esta ECU. A lista cobre velocidade reportada, carga, ECT, trims de combustível, pressões, MAP, avanço, IAT, MAF, borboleta, O2, EGR, EVAP, nível combustível, BARO, tensão do módulo, carga absoluta, pedal, temperaturas ambiente/óleo, etanol reportado, pressão rail, tempo de injeção, taxa de combustível e torque.
- Cada entrada referencia PID, fórmula/unidade de pids.json, modos, pré-requisitos, avaliador, limites heurísticos, guias da IA offline e vínculos a regras DTC/PID.
- Uma entrada só entra no plano quando o PID é anunciado pela bitmap e existe uma definição local. Os 29 parâmetros restantes não são declarados suportados/confirmados nesta ECU.
- A lista contém parâmetros calculados/comandados além de sensores físicos; a avaliação expõe essa limitação.

## Cinco leituras e contagem regressiva

- A varredura consulta serialmente os PIDs anunciados e faz cinco tentativas por PID.
- A primeira leitura de RPM verifica o modo selecionado; as cinco leituras de 010C também fazem parte do plano.
- O contador inicia ao acionar o teste, usa estimativa de duração e se recalcula pela latência observada.
- O relógio só marca conclusão (00:00) quando todas as tentativas planejadas terminam. Enquanto espera uma consulta lenta, mostra no mínimo 00:01.
- Falta de resposta fica registrada como tentativa sem valor sintético. Perda de conexão/parada gera relatório parcial e não marca a varredura como concluída.
- Cada amostra conserva PID, número, valor/unidade, parser, latência, timestamp e RX bruto.

## Regras da IA local

O motor consome os avaliadores e limites do JSON e agrega cinco amostras válidas pela média; os pré-requisitos precisam de cinco leituras válidas também.

- MAP parado: comparar as médias aritméticas de MAP/BARO calculadas a partir de cinco respostas válidas; a diferença é um gatilho heurístico.
- MAP funcionando: exige RPM/temperatura estáveis e motor aquecido; MAP elevado vira hipótese para investigar vácuo, entrada de ar e sincronismo, não prova de sensor defeituoso.
- STFT/LTFT: requer contexto aquecido/estável; o subconjunto não confirma malha fechada, portanto a conclusão é limitada.
- O2: cinco amostras estáticas não validam alternância nem aquecedor.
- Temperatura, carga, percentuais, pressão e torque ficam como plausibilidade; estar na faixa não comprova precisão.
- diagnosticEngine.ts consulta vínculos do JSON para recomendar verificações às hipóteses P0135, P0420, P0123, P0133, P0301, MAP e trims.

## Fontes externas

- SAE J1979, cópia pública de edição anterior: https://law.resource.org/pub/us/cfr/ibr/005/sae.j1979.2002.pdf
- SAE J1979_202505, página oficial: https://saemobilus.sae.org/standards/j1979_202505-e-e-diagnostic-test-modes
- SAE J1979-DA_202608, Digital Annex revisado em agosto de 2026: https://doi.org/10.4271/J1979DA
- Dashlogic, tabela OBD-II: https://www.dashlogic.com/docs/technical/obdii_pids
- OBD2 PID Knowledge: https://obd2pid.com/pids
- Manual do Proprietário Chevrolet Meriva 2012: https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2012.pdf
- Manual do Proprietário Chevrolet Meriva 2011: https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2011.pdf
- Auditoria de fontes atualizada: docs/MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md
- Documento secundário Econoflex 1.4: https://pt.scribd.com/document/556603216/ECONOFLEX-1-4
- Fontes internas: docs/AUDITORIA_BIBLIA_MERIVA.md, docs/OBD_KNOWLEDGE_AUDIT_2026-10-08.md e src/knowledge/meriva_confirmed_pids.json.

## Validação

Testes estáticos validam IDs, avaliadores, fórmulas/unidades, dependências, cinco leituras e o fato de somente 010C estar confirmado por RAW_ECU. A validação física continua pendente na Meriva real, primeiro motor desligado e depois aquecido, sempre com o veículo parado.
