# Relatório técnico — PIDs, fórmulas e evidência OBD

**Projeto:** Meriva Smart Diagnostic  
**Veículo de referência:** Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX 2011/2012  
**Atualizado:** 2026-10-10  
**Fontes internas:** `src/knowledge/pids.json`, `formulas.json`, `ranges.json`, `meriva_confirmed_pids.json`; `src/obd/parser.ts`, `formulaEngine.ts`, `pidDefinition.ts`; `src/meriva/autosaveIntegration.ts`.

## 1. Resumo do inventário

- **34 PIDs** no catálogo padrão local.
- **20 fórmulas/operações nomeadas** no motor determinístico.
- **1 PID** com evidência RAW_ECU no arquivo de referência da Meriva: `010C` (RPM).
- **10 candidatos** no arquivo de referência; a maior parte veio de um baseline do Car Scanner e não comprova suporte na ECU.
- **27 alvos** listados para futura confirmação real.
- Protocolo observado no baseline do projeto: **ISO 14230-4 KWP Fast Init, K-Line, 10400 baud**, endereço ECU `0x11`. Validar novamente no veículo antes de tratar como universal para toda Meriva.

**Distinção essencial:** o catálogo informa como interpretar um PID padrão; não prova que a ECU específica o suporte. Um PID anunciado pela bitmap é *descoberto*. Uma resposta positiva bem formada indica *respondeu*. Isso ainda não comprova a exatidão do sensor/valor contra instrumento independente.

## 2. Fórmulas implementadas

Na notação abaixo, A, B, C e D são os bytes de dados da resposta positiva, após remover cabeçalho, serviço de resposta e identificador do PID. O parser deve validar o PID e a quantidade de bytes antes da fórmula. O motor rejeita valores não finitos e valores fora das faixas cadastradas.

| ID | Operação interna | Fórmula/resultado |
|---|---|---|
| U8 | `u8` | A |
| U16 | `u16` | A × 256 + B |
| RPM | `u16_div` | (A × 256 + B) / 4 |
| TEMP_C | `u8_offset` | A − 40 °C |
| PERCENT_255 | `u8_scale` | A × 100 / 255 % |
| FUEL_TRIM | `u8_offset_scale` | (A − 128) × 100 / 128 % |
| MAF_GS | `u16_div` | (A × 256 + B) / 100 g/s |
| TIMING_DEG | `u8_scale_offset` | A × 0,5 − 64° |
| VOLTS_1000 | `u16_div` | (A × 256 + B) / 1000 V |
| O2_VOLTS | `u8_div` | A / 200 V (B não entra na tensão) |
| DISTANCE_KM | `u16` | A × 256 + B km |
| FUEL_RATE_LH | `u16_div` | (A × 256 + B) / 20 L/h |
| ETHANOL_PERCENT | `u8_scale` | A × 100 / 255 % |
| U8_X3 | `u8_scale` | A × 3 kPa |
| U16_SCALE_255 | `u16_scale_div` | (A × 256 + B) × 100 / 255 % |
| U16_X10 | `u16_scale` | (A × 256 + B) × 10 kPa |
| INJECTION_TIMING | `u16_offset_scale` | ((A × 256 + B) − 26880) / 128 ° |
| TORQUE_PERCENT | `u8_offset` | A − 125 % |
| U16_DIV_32768 | `u16_div` | (A × 256 + B) / 32768 |
| U32 | `u32` | A × 16,777,216 + B × 65,536 + C × 256 + D |

### Exemplo reproduzível: RPM (PID 010C)

Resposta positiva: `41 0C 1A F8`. Os bytes de dados são A=`0x1A` (26) e B=`0xF8` (248).

`(26 × 256 + 248) / 4 = 1726 rpm`

O catálogo associa `010C` à fórmula `RPM`; `formulaEngine.ts` executa a operação sem `eval`, e `parser.ts` rejeita payload incompleto ou valor fora da plausibilidade configurada.

## 3. Catálogo PID → bytes, unidade, fórmula e plausibilidade

As faixas são verificações de plausibilidade do software, não limites de defeito mecânico. Valores fora da faixa devem ser tratados como dado inválido para exibição/diagnóstico até revisão.

| PID | Parâmetro | Bytes de dados | Unidade | Fórmula | Faixa local |
|---|---|---:|---|---|---|
| 0101 | Monitor Status Since DTCs Cleared | 4 | status | U32 | 0–4294967295 |
| 0104 | Calculated Engine Load | 1 | percent | PERCENT_255 | 0–100 |
| 0105 | Coolant Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0106 | STFT Bank 1 | 1 | percent | FUEL_TRIM | -100–99.2 |
| 0107 | LTFT Bank 1 | 1 | percent | FUEL_TRIM | -100–99.2 |
| 010A | Fuel Pressure | 1 | kpa | U8_X3 | 0–765 |
| 010B | MAP | 1 | kpa | U8 | 0–255 |
| 010C | Engine RPM | 2 | rpm | RPM | 0–16383.75 |
| 010D | Vehicle Speed | 1 | km/h | U8 | 0–255 |
| 010E | Timing Advance | 1 | degrees | TIMING_DEG | -64–63.5 |
| 010F | Intake Air Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0110 | MAF | 2 | grams_per_second | MAF_GS | 0–655.35 |
| 0111 | Throttle Position | 1 | percent | PERCENT_255 | 0–100 |
| 0114 | O2 Sensor 1 Voltage | 2 | volts | O2_VOLTS | 0–1.275 |
| 012C | Commanded EGR | 1 | percent | PERCENT_255 | 0–100 |
| 012D | EGR Error | 1 | percent | FUEL_TRIM | -100–99.2 |
| 012E | Commanded Evaporative Purge | 1 | percent | PERCENT_255 | 0–100 |
| 012F | Fuel Level Input | 1 | percent | PERCENT_255 | 0–100 |
| 0130 | Warmups Since DTC Clear | 1 | code | U8 | 0–255 |
| 0131 | Distance Since DTC Clear | 2 | km | DISTANCE_KM | 0–65535 |
| 0133 | Barometric Pressure | 1 | kpa | U8 | 0–255 |
| 0142 | ECU Voltage | 2 | volts | VOLTS_1000 | 0–65.535 |
| 0143 | Absolute Load | 2 | percent | U16_SCALE_255 | 0–25700 |
| 0145 | Relative Throttle Position | 1 | percent | PERCENT_255 | 0–100 |
| 0146 | Ambient Air Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0151 | Fuel Type | 1 | code | U8 | 0–255 |
| 0152 | Alcohol Fuel Percentage | 1 | percent | ETHANOL_PERCENT | 0–100 |
| 0159 | Fuel Rail Absolute Pressure | 2 | kpa | U16_X10 | 0–655350 |
| 015A | Accelerator Pedal Position | 1 | percent | PERCENT_255 | 0–100 |
| 015C | Engine Oil Temperature | 1 | celsius | TEMP_C | -40–210 |
| 015D | Fuel Injection Timing | 2 | degrees | INJECTION_TIMING | -210–301.99 |
| 015E | Engine Fuel Rate | 2 | L/h | FUEL_RATE_LH | 0–3276.75 |
| 0161 | Driver Demand Engine Torque | 1 | percent | TORQUE_PERCENT | -125–130 |
| 0162 | Actual Engine Torque | 1 | percent | TORQUE_PERCENT | -125–130 |

## 4. Evidência específica da Meriva

### Único PID com evidência RAW_ECU no arquivo de referência

| PID | Parâmetro | Estado registrado | Evidência | Resposta bruta | Valor calculado |
|---|---|---|---|---|---|
| 010C | Engine RPM | CONFIRMADO | RAW_ECU | `41 0C 1A F8` | 1726 rpm |

### Candidatos — não tratar como confirmados

| PID | Parâmetro | Estado | Origem | Fórmula | Valor de baseline |
|---|---|---|---|---|---:|
| 0105 | Coolant Temperature | CANDIDATO | CARSCANNER_SEED | TEMP_C | 81 |
| 0106 | STFT Bank 1 | CANDIDATO | CARSCANNER_SEED | FUEL_TRIM | -8.59 |
| 0107 | LTFT Bank 1 | CANDIDATO | CARSCANNER_SEED | FUEL_TRIM | 10.94 |
| 010B | MAP | CANDIDATO | CARSCANNER_SEED | U8 | 39.02 |
| 010E | Timing Advance | CANDIDATO | CARSCANNER_SEED | TIMING_DEG | 8 |
| 010F | Intake Air Temperature | CANDIDATO | CARSCANNER_SEED | TEMP_C | 33 |
| 0110 | MAF | CANDIDATO | CARSCANNER_SEED | MAF_GS | 2.48 |
| 0111 | Throttle Position | CANDIDATO | CARSCANNER_SEED | PERCENT_255 | 3.53 |
| 0114 | O2 Sensor 1 Voltage | CANDIDATO | CARSCANNER_SEED | O2_VOLTS | 0.53 |
| 012F | Fuel Level Input | CANDIDATO | STANDARD_OBD | PERCENT_255 | — |

Os valores de baseline são úteis para escolher o que testar e comparar; não são leituras atuais e não devem ser importados como telemetria real. Próximos alvos de confirmação definidos no catálogo: 0105, 0106, 0107, 010A, 010B, 010D, 010E, 010F, 0110, 0111, 0114, 012C, 012D, 012E, 012F, 0133, 0142, 0143, 0145, 0146, 0159, 015A, 015C, 015D, 015E, 0161, 0162.

## 5. Estados de evidência recomendados

1. **DESCOBERTO:** PID anunciado por bitmap ou encontrado no catálogo. Não implica resposta válida.
2. **RESPONDEU:** houve resposta positiva com PID, comprimento e bytes válidos; a fórmula produziu valor finito e dentro da faixa de plausibilidade.
3. **CONFIRMADO_ELETRICAMENTE:** usar somente após evidência técnica adicional de comunicação/identificação elétrica adequada; não deve ser atribuído por contagem de respostas.
4. **VALIDADO_NO_VEICULO:** comparação documentada com instrumento de referência ou procedimento técnico independente, nas condições especificadas. Guardar método, instrumento, data, condição do motor e tolerância.
5. **NÃO RESPONDEU / VALOR NÃO INTERPRETADO:** manter como falha observada, sem preencher zero e sem inferir ausência definitiva de sensor.

A rotina de registro automático foi ajustada para salvar uma resposta válida como `RESPONDEU`, preservando um estado `CONFIRMADO` preexistente, em vez de promover toda leitura automaticamente. A classificação de um PID como padrão OBD também não equivale a validação específica da Meriva.

## 6. Correção de plausibilidade incluída nesta rodada

O PID `0143` (Absolute Load) usa `U16_SCALE_255`:

`((A × 256 + B) × 100) / 255`

Como a entrada é um inteiro de 16 bits, a faixa matemática da fórmula pode chegar a **25700%**. A faixa local anterior, de 0 a 100%, rejeitava resultados possíveis pela fórmula padronizada. O máximo foi ajustado para 25700 e foi adicionada uma regressão com A=B=`0xFF`, que deve resultar em 25700 e ser aceita. Isso é faixa de decodificação/plausibilidade, não afirma que o motor opere normalmente nesse valor.

## 7. Regras de consumo e aquisição

- Preferir `015E` (taxa de combustível em L/h) somente se suportado e com resposta válida.
- `0110` (MAF) ou método MAP devem ser rotulados como **estimativa** quando usados para estimar combustível; não chamar isso de medição direta.
- MAP exige parâmetros adequados, como cilindrada e hipótese de eficiência volumétrica; não usar estimativa sem base explícita.
- Se a fonte não for confiável, mostrar `N/D`; não converter sentinela `0` em consumo real.
- Manter resposta bruta, bytes, fórmula, unidade, timestamp, latência, protocolo e origem para cada amostra.
- Em K-Line, limitar PIDs consultados sequencialmente e medir a latência real; não importar pressupostos de throughput CAN.
- Separar log por amostra (CSV) do TXT diário de fronteiras de sessão. O TXT não promete ser uma série temporal completa.

## 8. Validação e próximos passos

- [ ] Capturar resposta bruta da ECU para cada PID alvo na Meriva.
- [ ] Conferir fórmula, unidade e plausibilidade contra documentação normativa e a resposta real.
- [ ] Para temperatura `0105`, acompanhar partida fria até aquecimento e comparar com instrumento de referência; não inferir suporte pelo valor do Car Scanner.
- [ ] Verificar latência por PID e ajustar rotação de consulta para não degradar RPM/velocidade/temperatura.
- [ ] Guardar resultados negativos, timeouts e payloads malformados sem apagá-los do relatório.
- [ ] Só marcar `VALIDADO_NO_VEICULO` com evidência independente registrada.
- [ ] Confirmar CI no head final da PR; depois, validar no aparelho com o ELM327 físico.

**Limitação atual:** este documento é uma auditoria do catálogo e do código versionados. Não representa uma sessão nova de aquisição com a ECU da Meriva nem uma validação elétrica do sensor.
