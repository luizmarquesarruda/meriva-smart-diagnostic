# Mapa integral de PIDs e fórmulas — Meriva Smart Diagnostic

**Data:** 24 de outubro de 2026  
**Fontes internas:** `pids.json`, `formulas.json`, `ranges.json`, `units.json`, `fuel_types.json`, `polling_policy.json` e `meriva_confirmed_pids.json`.

## 1. Escopo

O catálogo implementado define **34 PIDs Mode 01** com bytes, unidade, fórmula e faixa de plausibilidade. Não é a lista completa de PIDs padronizados nem prova de suporte da ECU específica.

Na ficha da Meriva, `010C` (RPM) é o único PID marcado como **CONFIRMADO / RAW_ECU**: `41 0C 1A F8` = 1726 rpm. Há 10 candidatos, não confirmados. Bitmap positiva, seed do CarScanner e presença no catálogo não substituem resposta individual válida na sessão.

Perfil registrado: Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX 2011/2012; KWP Fast Init / K-Line anotado no repositório. Protocolo e PIDs devem ser validados na sessão real.

## 2. Todos os PIDs catalogados

| PID | Nome | Bytes | Fórmula | Expressão matemática | Unidade | Faixa | Evidência específica da Meriva |
|---|---|---:|---|---|---|---|---|
| `0101` | Monitor Status Since DTCs Cleared | 4 | `DTC_COUNT` | A & 0x7F | `DTC` | 0…127 | Sem evidência RAW específica |
| `0104` | Calculated Engine Load | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `0105` | Coolant Temperature | 1 | `TEMP_C` | A − 40 | `°C` | -40…215 | CANDIDATO; não confirmação |
| `0106` | STFT Bank 1 | 1 | `FUEL_TRIM` | (A − 128) × 100 / 128 | `%` | -100…99.21875 | CANDIDATO; não confirmação |
| `0107` | LTFT Bank 1 | 1 | `FUEL_TRIM` | (A − 128) × 100 / 128 | `%` | -100…99.21875 | CANDIDATO; não confirmação |
| `010A` | Fuel Pressure | 1 | `U8_X3` | A × 3 | `kPa` | 0…765 | Sem evidência RAW específica |
| `010B` | MAP | 1 | `U8` | A | `kPa` | 0…255 | CANDIDATO; não confirmação |
| `010C` | Engine RPM | 2 | `RPM` | (256 × A + B) / 4 | `rpm` | 0…16383.75 | CONFIRMADO por RAW_ECU |
| `010D` | Vehicle Speed | 1 | `U8` | A | `km/h` | 0…255 | Sem evidência RAW específica |
| `010E` | Timing Advance | 1 | `TIMING_DEG` | A × 0,5 − 64 | `°` | -64…63.5 | CANDIDATO; não confirmação |
| `010F` | Intake Air Temperature | 1 | `TEMP_C` | A − 40 | `°C` | -40…215 | CANDIDATO; não confirmação |
| `0110` | MAF | 2 | `MAF_GS` | (256 × A + B) / 100 | `g/s` | 0…655.35 | CANDIDATO; não confirmação |
| `0111` | Absolute Throttle Position | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | CANDIDATO; não confirmação |
| `0114` | O2 Sensor 1 Voltage | 2 | `O2_VOLTS` | A / 200; B é STFT separado | `V` | 0…1.275 | CANDIDATO; não confirmação |
| `012C` | Commanded EGR | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `012D` | EGR Error | 1 | `FUEL_TRIM` | (A − 128) × 100 / 128 | `%` | -100…99.21875 | Sem evidência RAW específica |
| `012E` | Commanded Evaporative Purge | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `012F` | Fuel Level Input | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | CANDIDATO; não confirmação |
| `0130` | Warmups Since DTC Clear | 1 | `U8` | A | `ciclos` | 0…255 | Sem evidência RAW específica |
| `0131` | Distance Since DTC Clear | 2 | `DISTANCE_KM` | 256 × A + B | `km` | 0…65535 | Sem evidência RAW específica |
| `0133` | Barometric Pressure | 1 | `U8` | A | `kPa` | 0…255 | Sem evidência RAW específica |
| `0142` | ECU Voltage | 2 | `VOLTS_1000` | (256 × A + B) / 1000 | `V` | 0…65.535 | Sem evidência RAW específica |
| `0143` | Absolute Load | 2 | `U16_SCALE_255` | (256 × A + B) × 100 / 255 | `%` | 0…25700 | Sem evidência RAW específica |
| `0145` | Relative Throttle Position | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `0146` | Ambient Air Temperature | 1 | `TEMP_C` | A − 40 | `°C` | -40…215 | Sem evidência RAW específica |
| `0151` | Fuel Type | 1 | `U8` | A | `código` | 0…255 | Sem evidência RAW específica |
| `0152` | Alcohol Fuel Percentage | 1 | `ETHANOL_PERCENT` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `0159` | Fuel Rail Absolute Pressure | 2 | `U16_X10` | (256 × A + B) × 10 | `kPa` | 0…655350 | Sem evidência RAW específica |
| `015A` | Relative Accelerator Pedal Position | 1 | `PERCENT_255` | A × 100 / 255 | `%` | 0…100 | Sem evidência RAW específica |
| `015C` | Engine Oil Temperature | 1 | `TEMP_C` | A − 40 | `°C` | -40…210 | Sem evidência RAW específica |
| `015D` | Fuel Injection Timing | 2 | `INJECTION_TIMING` | ((256 × A + B) − 26880) / 128 | `°` | -210…301.9921875 | Sem evidência RAW específica |
| `015E` | Engine Fuel Rate | 2 | `FUEL_RATE_LH` | (256 × A + B) / 20 | `L/h` | 0…3276.75 | Sem evidência RAW específica |
| `0161` | Driver Demand Engine Torque | 1 | `TORQUE_PERCENT` | A − 125 | `%` | -125…130 | Sem evidência RAW específica |
| `0162` | Actual Engine Torque | 1 | `TORQUE_PERCENT` | A − 125 | `%` | -125…130 | Sem evidência RAW específica |

### Notas de semântica

- **0101:** valor principal = contagem DTC (`A6..A0`); `A7` é MIL. A interpretação decodifica readiness. Bytes C/D diferem entre ciclo Otto (SI) e ignição por compressão (CI/diesel).
- **010A versus 010B:** 010A é pressão manométrica de combustível (`A×3 kPa`); 010B é MAP, pressão absoluta do coletor (`A kPa`).
- **0111 versus 0145:** `0111` é a posição absoluta da borboleta; `0145` é a posição relativa. Não comparar os dois como se fossem o mesmo parâmetro.
- **015A:** é posição relativa do pedal do acelerador, não uma posição absoluta.
- **0130:** é contagem de ciclos de aquecimento desde a limpeza dos DTCs; a unidade é ciclos, não código enumerado.
- **0114:** byte A gera tensão O₂ (`A/200 V`); byte B é STFT. `B=FF` significa que o trim não é usado.
- **012F:** autonomia atual exige ECU/sessão ativa e leitura válida/recente. A presença no catálogo não prova suporte da ECU.
- **0151:** enum de tipo de combustível; código não listado fica `VALOR NÃO INTERPRETADO`. `0152` é percentual de etanol, não o mesmo dado.
- **0143:** carga absoluta pode matematicamente superar 100%; difere da carga calculada `0104`.
- `ranges.json` representa plausibilidade, não limites universais de diagnóstico ou prova de sensor bom.

## 3. Todas as fórmulas definidas

A = primeiro byte após `41 PID`; B = segundo; C = terceiro; D = quarto. Os bytes devem ser inteiros entre 0 e 255.

| formulaId | Operação | Expressão | PIDs ligados | Nota |
|---|---|---|---|---|
| `U8` | `u8` | A | `010B`, `010D`, `0130`, `0133`, `0151` | Byte único, sem escala. |
| `U16` | `u16` | 256 × A + B | Nenhum PID atual | Inteiro big-endian de 16 bits. |
| `RPM` | `u16_div` | (256 × A + B) / 4 | `010C` | RPM, resolução 0,25. |
| `TEMP_C` | `u8_offset` | A − 40 | `0105`, `010F`, `0146`, `015C` | Temperatura °C. |
| `PERCENT_255` | `u8_scale` | A × 100 / 255 | `0104`, `0111`, `012C`, `012E`, `012F`, `0145`, `015A` | Escala 0–255 para 0–100%. |
| `FUEL_TRIM` | `u8_offset_scale` | (A − 128) × 100 / 128 | `0106`, `0107`, `012D` | Trim de combustível; A=128 equivale a 0%. |
| `MAF_GS` | `u16_div` | (256 × A + B) / 100 | `0110` | Fluxo de ar em g/s. |
| `TIMING_DEG` | `u8_scale_offset` | A × 0,5 − 64 | `010E` | Avanço de ignição em graus. |
| `VOLTS_1000` | `u16_div` | (256 × A + B) / 1000 | `0142` | Tensão em volts, resolução 0,001 V. |
| `O2_VOLTS` | `u8_div` | A / 200; B é STFT separado | `0114` | Valor principal: tensão; B é STFT separada; B=FF significa não utilizado. |
| `DISTANCE_KM` | `u16` | 256 × A + B | `0131` | Distância em km. |
| `FUEL_RATE_LH` | `u16_div` | (256 × A + B) / 20 | `015E` | Taxa de combustível L/h, resolução 0,05. |
| `ETHANOL_PERCENT` | `u8_scale` | A × 100 / 255 | `0152` | Percentual de etanol; não é enum do PID 0151. |
| `U8_X3` | `u8_scale` | A × 3 | `010A` | Pressão gauge de combustível, A×3 kPa. |
| `U16_SCALE_255` | `u16_scale_div` | (256 × A + B) × 100 / 255 | `0143` | Carga absoluta pode exceder 100%; difere de carga calculada 0104. |
| `U16_X10` | `u16_scale` | (256 × A + B) × 10 | `0159` | Pressão absoluta do rail, resolução 10 kPa. |
| `INJECTION_TIMING` | `u16_offset_scale` | ((256 × A + B) − 26880) / 128 | `015D` | Temporização da injeção em graus. |
| `TORQUE_PERCENT` | `u8_offset` | A − 125 | `0161`, `0162` | Torque relativo A−125. |
| `U16_DIV_32768` | `u16_div` | (256 × A + B) / 32768 | Nenhum PID atual | Fórmula definida sem PID ligado atualmente. |
| `U32` | `u32` | 16 777 216 × A + 65 536 × B + 256 × C + D | Nenhum PID atual | Inteiro big-endian de 32 bits; sem PID atual no catálogo. |
| `DTC_COUNT` | `u8_mask` | A & 0x7F | `0101` | PID 0101: A6..A0 = quantidade; A7/MIL é interpretado separadamente. |

Fórmulas definidas sem PID ligado atualmente: `U16`, `U16_DIV_32768`, `U32`. Operação genérica no motor não significa PID suportado.

## 4. Aquisição e prioridade

- PIDs principais: `010D`, `010C`.
- Taxa medida: `015E`, a cada 1 ciclo(s), se suportada/respondendo.
- Fallback estimado: MAF `0110`; alternativa MAP `010B` + temperatura de admissão `010F`. É estimativa, não taxa medida.
- Nível de combustível `012F` a cada 4 ciclos; composição de etanol `0152` a cada 30 ciclos quando necessária.
- PIDs rotativos auxiliares: `0105`, `0142`, `0111`, `0104`, `0106`, `0107`, `010B`, `010F`, `0110`, `0114`, `0133`, `0143`, `0146`, `015A`, `015C`. O conjunto operacional requer bitmap anunciada e resposta individual válida.

## 5. Invariantes de teste

- IDs únicos; fórmula, unidade e faixa cruzadas; `ranges.json` cobre exatamente o catálogo.
- `0101`: contagem de 0 a 127 e readiness de SI/CI, sem converter o bloco em número bruto.
- `0114`: tensão e STFT separadas; `B=FF` não vira trim numérico.
- `0151`: enum válido recebe rótulo; código não catalogado não é interpretado.
- Limites exatos de `0106`, `0107`, `012D` e `015D` precisam continuar aceitos.

Rodar `npm run gate:baseline` e `npm run validate`. CI valida o código daquele SHA; suporte real exige resposta RAW da ECU.

## 6. Referências públicas cruzadas

- [PID 0101 — MIL, contagem DTC e readiness](https://obd2pid.com/pids/01-01), revisado publicamente em 31/08/2026.
- [PID 0114 — tensão O₂ e STFT](https://obd2pid.com/pids/01-14), revisado publicamente em 31/08/2026.
- [Referência pública de fórmulas OBD-II](https://imatrixsys.com/tutorials/pages/OBD-01-fundamentals.html). SAE J1979 / ISO 15031-5 é a referência normativa; páginas abertas são cruzamento secundário.
- [SAE J1979_202505 — E/E Diagnostic Test Modes](https://saemobilus.sae.org/standards/j1979_202505-e-e-diagnostic-test-modes): página oficial da edição consultada para serviços OBD genéricos.
- [SAE J1979-DA_202608 — Digital Annex](https://doi.org/10.4271/J1979DA): registro de identificadores de dados revisado em agosto de 2026. Os metadados públicos não equivalem ao texto normativo integral.
- [OBD Auto Doctor — parâmetros suportados](https://www.obdautodoctor.com/help/articles/supported-obd-parameters/): identifica `0111` como posição absoluta, `0145` como relativa e `015A` como posição relativa do pedal.
- [Manual do Proprietário Chevrolet Meriva 2012 — fonte oficial](https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2012.pdf) e [manual 2011](https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2011.pdf): contexto e configuração do veículo; não documentam quais PIDs a ECU específica responde.
- [Dashlogic — referência J1979](https://www.dashlogic.com/docs/technical/obdii_pids) e [mapa de bits do PID 0101](https://obd2pid.com/pids/01-01): no ciclo Otto, `C4` significa disponibilidade do monitor do filtro de partículas de gasolina; o byte D usa a mesma posição para indicar incompletude. Não existe monitor de refrigerante do ar-condicionado nesse bit.

## 7. Limitações

- O catálogo tem 34 definições; não inclui todos os PIDs padronizados Mode 01.
- `010C` é o único PID confirmado por RAW_ECU na ficha específica da Meriva.
- O manual do proprietário Chevrolet Meriva 2011/2012 descreve o funcionamento do motor, a luz de anomalia e a manutenção, mas não contém um inventário de PIDs OBD nem uma bitmap da ECU. Consulte [`docs/MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md`](MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md) para os limites das fontes.
- `0114` transporta dois resultados sob o mesmo PID; tensão permanece o valor numérico principal e STFT é interpretação adicional.
- Fórmulas não calibram sensores e não substituem teste físico no veículo.
