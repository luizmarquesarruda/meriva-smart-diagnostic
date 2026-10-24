# Relatório técnico — PIDs, fórmulas e evidência OBD

**Projeto:** Meriva Smart Diagnostic  
**Veículo de referência:** Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX 2011/2012  
**Atualizado:** 2026-10-24  

> **Nota de versão:** para o inventário integral e as referências externas mais recentes, consulte [Mapa de PIDs e fórmulas de 2026-10-24](PID_FORMULA_MAP_2026-10-24.md). A revisão cruzada corrigiu também a semântica do PID 0101, o rótulo do PID 0111, o nome do PID 015A e a unidade do PID 0130.

**Fontes internas:** `src/knowledge/pids.json`, `formulas.json`, `ranges.json`, `meriva_confirmed_pids.json`; `src/obd/parser.ts`, `formulaEngine.ts`, `pidDefinition.ts`; `src/meriva/autosaveIntegration.ts`.

> A avaliação de fontes oficiais do veículo está em [Auditoria documental Meriva × OBD/PIDs](MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md). O manual do proprietário não fornece uma lista de PIDs suportados; este relatório descreve padrões SAE e a evidência RAW_ECU registrada separadamente.

## 1. Resumo do inventário

- **34 PIDs** no catálogo padrão local.
- **21 definições de fórmula** no catálogo determinístico; três fórmulas genéricas não estão ligadas a um PID atual.
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
| 0101 | Monitor Status Since DTCs Cleared | 4 | dtc_count | DTC_COUNT (`A & 0x7F`; MIL/readiness separados) | 0–127 |
| 0104 | Calculated Engine Load | 1 | percent | PERCENT_255 | 0–100 |
| 0105 | Coolant Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0106 | STFT Bank 1 | 1 | percent | FUEL_TRIM | -100–99.21875 |
| 0107 | LTFT Bank 1 | 1 | percent | FUEL_TRIM | -100–99.21875 |
| 010A | Fuel Pressure | 1 | kpa | U8_X3 | 0–765 |
| 010B | MAP | 1 | kpa | U8 | 0–255 |
| 010C | Engine RPM | 2 | rpm | RPM | 0–16383.75 |
| 010D | Vehicle Speed | 1 | km/h | U8 | 0–255 |
| 010E | Timing Advance | 1 | degrees | TIMING_DEG | -64–63.5 |
| 010F | Intake Air Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0110 | MAF | 2 | grams_per_second | MAF_GS | 0–655.35 |
| 0111 | Absolute Throttle Position | 1 | percent | PERCENT_255 | 0–100 |
| 0114 | O2 Sensor 1 Voltage | 2 | volts | O2_VOLTS | 0–1.275 |
| 012C | Commanded EGR | 1 | percent | PERCENT_255 | 0–100 |
| 012D | EGR Error | 1 | percent | FUEL_TRIM | -100–99.21875 |
| 012E | Commanded Evaporative Purge | 1 | percent | PERCENT_255 | 0–100 |
| 012F | Fuel Level Input | 1 | percent | PERCENT_255 | 0–100 |
| 0130 | Warmups Since DTC Clear | 1 | warmup_cycles | U8 | 0–255 |
| 0131 | Distance Since DTC Clear | 2 | km | DISTANCE_KM | 0–65535 |
| 0133 | Barometric Pressure | 1 | kpa | U8 | 0–255 |
| 0142 | ECU Voltage | 2 | volts | VOLTS_1000 | 0–65.535 |
| 0143 | Absolute Load | 2 | percent | U16_SCALE_255 | 0–25700 |
| 0145 | Relative Throttle Position | 1 | percent | PERCENT_255 | 0–100 |
| 0146 | Ambient Air Temperature | 1 | celsius | TEMP_C | -40–215 |
| 0151 | Fuel Type | 1 | code | U8 | 0–255 |
| 0152 | Alcohol Fuel Percentage | 1 | percent | ETHANOL_PERCENT | 0–100 |
| 0159 | Fuel Rail Absolute Pressure | 2 | kpa | U16_X10 | 0–655350 |
| 015A | Relative Accelerator Pedal Position | 1 | percent | PERCENT_255 | 0–100 |
| 015C | Engine Oil Temperature | 1 | celsius | TEMP_C | -40–210 |
| 015D | Fuel Injection Timing | 2 | degrees | INJECTION_TIMING | -210–301.9921875 |
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
| 0111 | Absolute Throttle Position | CANDIDATO | CARSCANNER_SEED | PERCENT_255 | 3.53 |
| 0114 | O2 Sensor 1 Voltage | CANDIDATO | CARSCANNER_SEED | O2_VOLTS | 0.53 |
| 012F | Fuel Level Input | CANDIDATO | STANDARD_OBD | PERCENT_255 | — |

Os valores de baseline são úteis para escolher o que testar e comparar; não são leituras atuais e não devem ser importados como telemetria real. Próximos alvos de confirmação definidos no catálogo: 0105, 0106, 0107, 010A, 010B, 010D, 010E, 010F, 0110, 0111, 0114, 012C, 012D, 012E, 012F, 0133, 0142, 0143, 0145, 0146, 0159, 015A, 015C, 015D, 015E, 0161, 0162.

## 5. Estados de evidência recomendados

1. **DESCOBERTO:** PID anunciado por bitmap ou encontrado no catálogo. Não implica resposta válida.
2. **RESPONDEU:** houve resposta positiva com PID, comprimento e bytes válidos; a fórmula produziu valor finito e dentro da faixa de plausibilidade.
3. **CONFIRMADO_ELETRICAMENTE:** usar somente após evidência técnica adicional de comunicação/identificação elétrica adequada; não deve ser atribuído por contagem de respostas.
4. **VALIDADO_NO_VEICULO:** comparação documentada com instrumento de referência ou procedimento técnico independente, nas condições especificadas. Guardar método, instrumento, data, condição do motor e tolerância.
5. **NÃO RESPONDEU / VALOR NÃO INTERPRETADO:** manter como falha observada, sem preencher zero e sem inferir ausência definitiva de sensor.

A rotina de registro automático foi ajustada para salvar uma resposta válida como `RESPONDEU`. Só preserva `CONFIRMADO` quando a evidência anterior está explicitamente marcada como `USER_REAL_OBSERVATION`; registros legados gerados automaticamente a partir de consultas `REAL_OBD` não são tratados como validação manual. A classificação de um PID como padrão OBD também não equivale a validação específica da Meriva.

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


---

## 2026-10-12 — Auditoria de velocidade de aquisição, PIDs e persistência

### Comparação com projetos e aplicativos OBD

A comparação foi feita com documentação pública de projetos e fabricantes, não por benchmark físico com o mesmo carro/adaptador:

- **python-OBD** implementa um laço de atualização assíncrono com subscrições (*watch*) e devolve a última resposta conhecida sem bloquear a interface. Referência: https://python-obd.readthedocs.io/en/latest/Async%20Connections/
- **OBD Auto Doctor** declara que atualiza os sensores em ordem sequencial, tão rápido quanto veículo, adaptador e conexão permitirem; a lista de PIDs mostrada é específica do veículo. Referências: https://www.obdautodoctor.com/features/ e https://www.obdautodoctor.com/help/articles/supported-obd-parameters/
- **OBDLink** alerta que cada PID marcado para logging precisa ser monitorado continuamente, o que reduz a taxa de atualização dos outros PIDs. Referência: https://support.obdlink.com/support/solutions/articles/43000709894
- A folha de dados **ELM327L** documenta timing adaptativo baseado nos tempos de resposta medidos do próprio veículo. Isso é preferível a baixar arbitrariamente timeouts fixos; não foi alterado timeout/protocolo da Meriva sem medição de hardware. Referência: https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327L_Data_Sheet.pdf

**Conclusão:** não se deve paralelizar comandos OBD sobre o mesmo transporte RFCOMM/K-Line, porque o protocolo é request/reply serial. O ganho seguro vem de remover sondas redundantes, respeitar os bitmaps da ECU, não consultar a mesma fonte duas vezes no ciclo e tirar I/O de disco do caminho crítico de leitura.

### Correções efetuadas

- `src/obd/intelligentPidDiscovery.ts`: reutiliza a resposta `010C` já usada para validar a ECU; só consulta os outros PIDs depois de a bitmap atual anunciar suporte; informação histórica de PIDs apenas prioriza a ordem, não contorna a bitmap; percorre páginas bitmap somente quando o bit de continuação anuncia a próxima página; adiciona ao conjunto operacional somente PIDs com resposta individual válida. Uma bitmap, sozinha, não é tratada como prova de resposta funcional.
- `src/obd/bluetoothManager.ts`: encaminha a sonda de ECU já obtida para a descoberta, evitando novo round trip idêntico.
- `src/knowledge/polling_policy.json`: novo contrato versionado para frequência e prioridade. RPM/velocidade seguem no caminho principal; `015E` medido mantém a cadência principal se individualmente suportado; fallback por MAF/MAP e nível `012F` usam cadência de quatro ciclos, com fases diferentes para não concentrar as consultas lentas no mesmo ciclo. Telemetria auxiliar roda em rotação e MAP não é consultado de novo quando já foi usado no fallback do mesmo ciclo.
- `src/trip/autoTripService.ts`: amostra MAF/MAP com menor frequência; preserva a última leitura de combustível quando uma consulta do PID `012F` falha; valida a unidade `percent` retornada pelo parser (e não o símbolo `%`, que era incompatível com o catálogo); rejeita estimativa baseada em MAF zero; mantém um valor estimado no painel por até 10 segundos, mas só integra no cálculo da viagem a amostra recém-calculada. Não inventa consumo quando os dados não sustentam o cálculo.
- `app/_layout.tsx` + serviço de viagem: retiram a inicialização GPS independente no arranque; o rastreamento passa a pertencer ao serviço de viagem após ECU conectada/respondendo e é encerrado quando a ECU perde resposta/desconecta. O fechamento GPS é serializado para evitar dois `stop()` concorrentes.
- `src/database/csvLogger.ts` e `src/database/obdLogger.ts`: respostas brutas e interpretadas são enfileiradas, agrupadas até oito linhas ou um segundo, e escritas em lote. A fila é descarregada em background/inactive, ao desconectar, antes de exportar e antes de limpar logs. Falhas de leitura/escrita restauram o lote pendente para nova tentativa; a partição diária usa a data local do aparelho, enquanto timestamps permanecem ISO UTC.
- `src/meriva/autosaveIntegration.ts`: mantém cada resposta na trilha CSV, mas limita persistência repetida no banco de PIDs/perfil de aprendizado para uma amostra por PID a cada 5 segundos. Isso reduz gravações redundantes e impede que a cadência de polling seja confundida com confirmação independente.
- `src/knowledge/polling_policy.json`, `tests/knowledgeJson.test.js`, `tests/regression.test.js`, `tests/fuelConsumption.test.js`, `tests/merivaAutosave.test.js` e `tests/backgroundExecution.test.js`: contrato JSON testado, regressões para MAF zero, descoberta adaptativa, saída de PIDs sem resposta do conjunto operacional, lote CSV, throttle de aprendizado, unidade de `012F`, fases não coincidentes e lifecycle GPS.

### Impacto esperado e limites

- Menos round trips na conexão inicial quando a ECU não anuncia páginas bitmap posteriores ou quando uma sonda já foi feita.
- Menos trabalho bloqueante de disco por amostra; cada resposta bruta/interpretada entra na fila CSV e é gravada em lote normalmente, enquanto o TXT diário continua sendo resumo de sessões. Como em qualquer buffer em memória, um encerramento forçado do processo antes do flush pode perder o lote ainda pendente; o aplicativo descarrega no intervalo de 1 s, ao entrar em background/inactive, ao desconectar e antes de exportar/limpar.
- Menos consultas secundárias no ciclo principal e menos disputa entre PIDs lentos.
- A precisão e a velocidade reais dependem da latência medida da ECU, do ELM327/clone, do protocolo KWP/K-Line e da qualidade do Bluetooth. Nenhum ganho numérico de milissegundos é alegado sem benchmark no mesmo carro e adaptador.

### Validação pendente

A alteração do código/testes não é prova de compilação. A CI deve executar Expo Doctor, TypeScript, a suíte completa de regressão e Android Release APK. Também é obrigatório teste físico na Meriva com a ECU ligada/desligada, observando tempo de conexão, frequência de atualização, manutenção do histórico diário e não acúmulo de GPS sem ECU. Não alterar `ATST`, `ATAT` ou temporizações do protocolo sem registrar latências reais e comparar estabilidade antes/depois.


### Otimização adicional de conexão — 2026-10-12

`src/obd/elm327.ts`: comandos AT opcionais que retornam `UNSUPPORTED` deixam de ser repetidos três vezes durante a inicialização. Isso remove atrasos fixos para adaptadores que não implementam determinado comando, sem mudar a recuperação para timeouts/erros transitórios e sem relaxar a validação real da ECU (`010C`). A regressão em `tests/regression.test.js` exige exatamente uma tentativa de `ATI` quando a resposta é `?`. A CI #1921 passou na validação automatizada; o build APK daquela execução estava em andamento ao registrar a observação, mas o código desta otimização requer uma nova CI.


## 8. Auditoria de aquisição e política de timeout — 2026-10-13

### PIDs e JSON
- Os JSONs `pids.json`, `formulas.json`, `ranges.json`, `meriva_confirmed_pids.json` e `polling_policy.json` foram lidos e validados sintaticamente.
- O catálogo padrão não equivale a suporte confirmado na ECU: o conjunto operacional continua dependente da bitmap da sessão e de resposta individual validada. No registro atual da Meriva, `010C` permanece o único PID confirmado por evidência RAW_ECU no arquivo de referência; candidatos importados de ferramentas externas continuam explicitamente separados.
- Não foram inventados PIDs específicos de GM nem promovidos dados CarScanner a confirmação atual da ECU.
- `bluetooth_config.json` agora declara `optionalCommandTimeoutMs=2500` e `protocolSelectionTimeoutMs=15000`; ambos têm teste de contrato. A mudança de JSON é uma política de inicialização do ELM, não uma nova fórmula de PID.

### Comparação de aquisição
A pesquisa comparou `python-OBD` (aquisição assíncrona/watchers), `Free_OBD` (fila/mutex, separação AT/OBD e bitmap), `AndroidOBD` (transações RFCOMM) e `obd-scanner-android` (cadência por grupos). O ganho seguro para este projeto é reduzir round trips desnecessários e limitar esperas opcionais, sem concorrência sobre a mesma sessão serial.

### Correção de inicialização
`Elm327Session` agora limita comandos AT locais opcionais ao timeout curto configurado e não os repete em falha transitória. `ATZ` permanece obrigatório e com tentativas limitadas; `ATSP0` conserva timeout completo de negociação, porém sem repetir automaticamente toda a espera. A prova de ECU continua sendo uma resposta real e válida ao PID `010C`.

### Validação pendente
A suíte e o TypeScript foram atualizados, mas não foram executados nesta etapa para respeitar a instrução explícita de não disparar CI. Não há benchmark físico novo; a latência real depende da ECU K-Line, do adaptador e do telefone.


## 9. Auditoria cruzada com o TXT de autosaves — 2026-10-13

### Integridade do histórico

O TXT entregue para análise continha 205 blocos `SALVAMENTO_BEGIN`, mas somente 200 números distintos no intervalo 103–302. Os números 262–266 reapareciam no fim, depois do número 302. Esse padrão é compatível com gravações concorrentes usando um estado desatualizado do contador; o arquivo sozinho não permite provar qual operação causou cada repetição.

Correção no código:
- `src/meriva/autosaveHistoryTxt.ts` remove números repetidos na representação lida/exportada, preserva a última ocorrência de cada número e ordena por número.
- A operação read-modify-write agora é serializada por arquivo para evitar que autosave e exportação simultâneos gerem o mesmo número ou percam um bloco.
- O próximo append grava o histórico compactado com o limite de 200 entradas.
- Os testes cobrem números legados repetidos e seis gravações concorrentes.

A normalização é aplicada na leitura/exportação desde já. A versão física do TXT no telefone é reescrita normalizada no próximo append de autosave; esta alteração de código não modifica retroativamente o arquivo local enquanto o aplicativo não executar.

### Correção do cálculo de consumo estimado

A versão anterior usava AFR 14,7 e densidade 0,745 kg/L como defaults também quando a configuração estava em ETANOL ou FLEX. Isso gerava uma estimativa com hipótese de gasolina mesmo que o usuário tivesse selecionado outro combustível.

Valores de referência adotados para estimativa:
- Gasolina: AFR estequiométrico aproximado 14,7; densidade de referência 0,745 kg/L.
- Etanol: AFR estequiométrico aproximado 9,0; densidade de referência 0,789 kg/L.
- FLEX: interpolação de primeira ordem entre esses valores a partir de uma composição de etanol válida de 0–100% reportada por PID 0152. É uma aproximação de engenharia, não uma calibração do combustível vendido no Brasil nem validação da ECU da Meriva.

Fontes técnicas: [propriedades de gasolina e etanol (ACS/PubMed Central)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8495882/) e [tabela de propriedades do etanol](https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/ethanol-fermentation).

Regras implementadas:
1. PID 015E (taxa de combustível em L/h) continua sendo a fonte medida preferida, quando a ECU o suporta e responde validamente.
2. O caminho MAF/MAP é sempre uma estimativa.
3. Em ETANOL e GASOLINA, o estimador usa o combustível explicitamente selecionado nas configurações.
4. Em FLEX, o estimador MAF/MAP exige composição válida do PID 0152. A consulta é rara (uma vez a cada 30 ciclos, apenas quando necessária e suportada); sem esse dado não assume gasolina silenciosamente.
5. A troca de combustível nas configurações é propagada ao serviço ativo sem polling de arquivo.
6. Amostras de combustível com timestamp antigo são ignoradas sem recuar o relógio interno do integrador.

### Aquisição e persistência

- Escritas de confirmação de PIDs e perfil de aprendizado foram retiradas do caminho bloqueante de cada iteração OBD e executadas em fila serializada. Logs RAW/interpretado continuam registrando as respostas enfileiradas.
- Ambos os CSV diários, RAW e interpretado, usam a data local do aparelho para particionamento; o timestamp de cada amostra continua ISO UTC.
- O contrato de `polling_policy.json` e de `bluetooth_config.json` foi incrementado para refletir os campos/comportamentos adicionados, e a suíte verifica suas versões.
- A política de aquisição continua estritamente serial pela sessão ELM327. Não adotamos concorrência por PID nem parâmetros de timing CAN em um transporte K-Line.

### Referências comparadas

- [python-OBD Async Connections](https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md): loop assíncrono de atualização e leitura do último valor conhecido pela interface.
- [OBDLink — Get Started with Logs](https://support.obdlink.com/support/solutions/articles/43000709894): vários PIDs continuamente monitorados reduzem a taxa de atualização de cada PID; registro por PID frame segue a taxa de aquisição real.
- [Car Scanner — Optimizing connection speed](https://www.carscanner.info/optimizing-connection-speed/): a quantidade de parâmetros é um fator dominante de atualização; otimização de requisições anunciada para CAN não se aplica automaticamente a K-Line.

### Limite de evidência

O TXT traz leituras e viagens incompletas; não constitui benchmark do tempo de resposta da ECU. As alterações foram cobertas por novos testes de contrato/regressão, mas precisam da CI para verificar o commit final e de uma captura física comparável para quantificar qualquer ganho de latência. Médias de viagem abaixo do limiar de combustível válido continuam marcadas como indisponíveis, não convertidas em zero nem publicadas como consumo confiável.


### Complemento de performance — autosave das leituras

A auditoria adicional encontrou que o limite de persistência de 10 s cobria leituras idênticas, mas uma alteração constante de valor (por exemplo, RPM/velocidade) ainda fazia cada consulta disparar uma gravação completa. `pushLastReading` agora sempre atualiza a última leitura em memória, mas persiste mudanças numéricas ordinárias uma vez por PID por janela de 10 s. PIDs novos e mudanças de status/unidade/origem permanecem imediatas. Ao entrar em background, o serviço compara o fingerprint entre o estado em memória e o último snapshot gravado para salvar a leitura mais recente ainda não persistida. O CSV bruto/interpretado continua mantendo cada consulta real.

Regressão adicionada: mudar o mesmo PID dentro da janela altera o cache imediato, não regrava o JSON; o evento background salva o último valor; após vencer a janela, a próxima amostra volta a ser persistida.
