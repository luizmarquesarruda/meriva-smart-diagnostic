# Inventário completo de PIDs — Meriva Smart Diagnostic

**Data:** 2026-10-24  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Escopo:** inventário estático do catálogo de Mode 01, fórmulas, faixas de plausibilidade, catálogo de testes e evidência específica da Meriva.  
**Importante:** este documento não afirma que todos os PIDs são suportados pela ECU instalada. Suporte precisa ser descoberto em tempo de execução por bitmap e validado com resposta individual.

## Resumo da auditoria estática

- **35 PIDs** cadastrados em `src/knowledge/pids.json`.
- **21 fórmulas** em `src/knowledge/formulas.json`.
- **35 faixas** em `src/knowledge/ranges.json`.
- **30 testes/avaliações** em `src/knowledge/sensor_tests.json`.
- **1 PID confirmado por evidência RAW_ECU** no inventário específico: `010C` (RPM).
- **10 PIDs candidatos** registrados a partir de baseline/seed; não são confirmações da ECU.
- Todos os 35 PIDs têm fórmula referenciada existente e faixa cadastrada.
- Cinco PIDs do catálogo não possuem teste no catálogo de sensores: `0101`, `0130`, `0131`, `0144`, `0151`.
- Nenhum teste do catálogo de sensores referencia PID ausente de `pids.json`.

## Status e critérios

- **CONFIRMADO RAW_ECU:** existe resposta bruta real documentada para aquele PID na ECU alvo.
- **CANDIDATO:** existe registro de referência/baseline, mas falta resposta bruta da ECU para confirmar.
- **CATÁLOGO / NÃO CONFIRMADO:** PID padronizado implementado no aplicativo; não há evidência RAW_ECU específica registrada.
- **Teste cadastrado** significa que há uma regra de triagem local; não significa que o teste foi executado no veículo ou que o sensor foi aprovado.

## Inventário por PID

| PID Mode 01 | Parâmetro | Bytes | Unidade | Fórmula | Teste local | Evidência Meriva |
|---|---|---:|---|---|---|---|
| 0101 | Contagem de DTCs e estado MIL/readiness | 4 | dtc_count | DTC_COUNT | Não | Catálogo / não confirmado |
| 0104 | Carga calculada do motor | 1 | % | PERCENT_255 | Sim | Catálogo / não confirmado |
| 0105 | Temperatura do líquido de arrefecimento (ECT) | 1 | °C | TEMP_C | Sim | Candidato |
| 0106 | Correção de combustível de curto prazo (STFT B1) | 1 | % | FUEL_TRIM | Sim | Candidato |
| 0107 | Correção de combustível de longo prazo (LTFT B1) | 1 | % | FUEL_TRIM | Sim | Candidato |
| 010A | Pressão de combustível (gauge) | 1 | kPa | U8_X3 | Sim | Catálogo / não confirmado |
| 010B | Pressão absoluta do coletor (MAP) | 1 | kPa | U8 | Sim | Candidato |
| 010C | Rotação do motor (RPM) | 2 | rpm | RPM | Sim | **Confirmado RAW_ECU** |
| 010D | Velocidade do veículo | 1 | km/h | U8 | Sim | Catálogo / não confirmado |
| 010E | Avanço de ignição | 1 | graus | TIMING_DEG | Sim | Candidato |
| 010F | Temperatura do ar de admissão (IAT) | 1 | °C | TEMP_C | Sim | Candidato |
| 0110 | Fluxo de ar (MAF) | 2 | g/s | MAF_GS | Sim | Candidato |
| 0111 | Posição absoluta da borboleta | 1 | % | PERCENT_255 | Sim | Candidato |
| 0114 | Tensão do O2 B1S1 e dado adicional de ajuste | 2 | V (byte A) | O2_VOLTS | Sim | Candidato |
| 012C | EGR comandada | 1 | % | PERCENT_255 | Sim | Catálogo / não confirmado |
| 012D | Erro EGR | 1 | % | FUEL_TRIM | Sim | Catálogo / não confirmado |
| 012E | Purga EVAP comandada | 1 | % | PERCENT_255 | Sim | Catálogo / não confirmado |
| 012F | Nível de combustível informado pela ECU | 1 | % | PERCENT_255 | Sim | Candidato |
| 0130 | Ciclos de aquecimento desde limpeza de DTCs | 1 | ciclos | U8 | Não | Catálogo / não confirmado |
| 0131 | Distância desde limpeza de DTCs | 2 | km | DISTANCE_KM | Não | Catálogo / não confirmado |
| 0133 | Pressão barométrica (BARO) | 1 | kPa | U8 | Sim | Catálogo / não confirmado |
| 0142 | Tensão informada pela ECU | 2 | V | VOLTS_1000 | Sim | Catálogo / não confirmado |
| 0143 | Carga absoluta calculada do motor | 2 | % escalado | U16_SCALE_255 | Sim | Catálogo / não confirmado |
| 0144 | Razão de equivalência comandada | 2 | razão | U16_DIV_32768 | Não | Alvo de confirmação; não confirmado |
| 0145 | Posição relativa da borboleta | 1 | % | PERCENT_255 | Sim | Catálogo / não confirmado |
| 0146 | Temperatura do ar ambiente | 1 | °C | TEMP_C | Sim | Catálogo / não confirmado |
| 0151 | Tipo de combustível (enumeração) | 1 | código | U8 | Não | Catálogo / não confirmado |
| 0152 | Percentual de álcool reportado pela ECU | 1 | % | ETHANOL_PERCENT | Sim | Catálogo / não confirmado |
| 0159 | Pressão absoluta do rail de combustível | 2 | kPa | U16_X10 | Sim | Catálogo / não confirmado |
| 015A | Posição relativa do pedal do acelerador | 1 | % | PERCENT_255 | Sim | Catálogo / não confirmado |
| 015C | Temperatura do óleo do motor | 1 | °C | TEMP_C | Sim | Catálogo / não confirmado |
| 015D | Temporização da injeção | 2 | graus | INJECTION_TIMING | Sim | Catálogo / não confirmado |
| 015E | Taxa de combustível calculada | 2 | L/h | FUEL_RATE_LH | Sim | Catálogo / não confirmado |
| 0161 | Torque solicitado pelo motorista | 1 | % | TORQUE_PERCENT | Sim | Catálogo / não confirmado |
| 0162 | Torque efetivo reportado pela ECU | 1 | % | TORQUE_PERCENT | Sim | Catálogo / não confirmado |

## Candidatos atualmente registrados

O arquivo `src/knowledge/meriva_confirmed_pids.json` registra como candidatos: `0105`, `0106`, `0107`, `010B`, `010E`, `010F`, `0110`, `0111`, `0114` e `012F`. O PID `0144` é um alvo de confirmação separado, sem resposta RAW_ECU e sem status de candidato com baseline.

Os valores de baseline associados a esses candidatos servem para comparação inicial, não como prova de resposta atual da ECU. Somente `010C` possui atualmente resposta bruta documentada (`41 0C 1A F8`, valor calculado de 1726 rpm).

## Arquivos e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `src/knowledge/pids.json` | Identificador, nome, comprimento da resposta, unidade e fórmula de cada PID cadastrado |
| `src/knowledge/formulas.json` | Operações determinísticas de conversão |
| `src/knowledge/ranges.json` | Faixas amplas de plausibilidade; não são limites OEM de aprovação |
| `src/knowledge/sensor_tests.json` | Catálogo de avaliações, pré-requisitos, gatilhos heurísticos e orientação |
| `src/knowledge/meriva_confirmed_pids.json` | Separação entre confirmação RAW_ECU e candidatos |
| `src/obd/pidDefinition.ts` | Montagem do catálogo executável e ligação entre PID e fórmula |
| `src/diagnostics/sensorTestEngine.ts` | Avaliação determinística de amostras e geração de estados de triagem |

## Fluxo correto de descoberta e avaliação

1. Consultar os bitmaps de suporte apropriados (por exemplo, Mode 01 PID `00`, `20`, `40` e blocos subsequentes conforme a resposta).
2. Considerar “descoberto/suportado” somente o PID anunciado pela bitmap da ECU na sessão atual.
3. Consultar o PID individualmente e preservar o RX bruto, timestamp, latência e protocolo.
4. Validar cabeçalho/resposta, comprimento de payload e parser antes de aplicar fórmula.
5. Validar a fórmula e a unidade; classificar valores fora de plausibilidade como evidência para revisão.
6. Para análise de sensor, exigir contexto operacional e amostragem suficiente; cruzar parâmetros relacionados.
7. Manter ausência de resposta, valor não interpretado, valor implausível e hipótese de defeito como estados diferentes.
8. Não recomendar troca de componente com base em um PID isolado. Confirmar com DTCs atuais, testes elétricos/mecânicos ou instrumento independente quando aplicável.

## Pontos de atenção para a próxima etapa

- Executar testes automatizados de integridade entre `pids.json`, `formulas.json`, `ranges.json` e `sensor_tests.json`.
- Revisar semântica/unidades de PIDs que são valores calculados, comandados ou enumerações, e não sensores físicos independentes.
- Confirmar por captura real da ECU os candidatos, começando pelos parâmetros de maior valor diagnóstico e menor risco de interpretação.
- Não promover todos os PIDs padronizados a “suportados pela Meriva”; o inventário de definições OBD é maior que a evidência específica disponível.
- A auditoria é estática do repositório. Não foi feita uma sessão física com o veículo/ELM327 neste trabalho, nem esta documentação por si só valida leituras reais.

## Referências internas

- `docs/OBD_KNOWLEDGE_AUDIT_2026-10-08.md`
- `docs/AUDITORIA_TESTES_SENSORES_2026-10-14.md`
- `docs/FORMULA_ENGINE.md`
- `src/knowledge/meriva_confirmed_pids.json`
