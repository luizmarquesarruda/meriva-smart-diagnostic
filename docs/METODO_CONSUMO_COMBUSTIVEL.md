# Método de cálculo de consumo — Meriva Smart Diagnostic

Data da pesquisa: 18/10/2026. Parâmetros, limites, combustível de referência e fontes estão em `src/knowledge/fuel_consumption_model.json`; descobertas e pendências estão em `src/knowledge/fuel_consumption_findings.json`.

## 1. Hierarquia operacional

1. **PID 015E — taxa de combustível reportada pela ECU:** preferencial quando suportado, respondido e plausível. Conversão padrão: `fuelRateLph = (A * 256 + B) / 20`.
2. **PID 0110 — MAF:** fallback de fluxo calculado a partir da massa de ar.
3. **PIDs 010B + 010F + 010C — MAP + IAT + RPM:** segunda alternativa, estimando o fluxo de ar por densidade e eficiência volumétrica.
4. **Sem amostras válidas:** apresentar N/D; não inferir fluxo pela velocidade, rotação, abertura da borboleta ou nível do tanque.

A prioridade identifica a fonte mais direta, não garante que a ECU de uma Meriva específica suporte todos os PIDs. No registro local atual, apenas 010C foi confirmado por resposta RAW_ECU.

## 2. Fórmulas

### MAF

`fuelRateLph = MAF_g_s * 3.6 / (AFR * fuelDensity_kg_L)`

AFR e densidade devem corresponder ao combustível selecionado ou à composição conhecida. A estimativa atual assume lambda aproximadamente igual a 1; enriquecimento de partida a frio, carga alta ou transientes pode alterar o resultado. Correção por lambda/razão de equivalência só deve ser ativada quando houver PID suportado e semântica confirmada.

### MAP / speed-density

`T_K = IAT_C + 273.15`

`airDensity_kg_m3 = MAP_kPa * 1000 / (R_air * T_K)`

`MAF_g_s = airDensity_kg_m3 * displacement_L * RPM / 120 * VE`

`fuelRateLph = MAF_g_s * 3.6 / (AFR * fuelDensity_kg_L)`

O cálculo considera motor de quatro tempos. VE=0,80 é apenas o ponto inicial configurável, não uma calibração específica da Meriva.

### Indicadores

`instantaneousKmPerL = speedKmPerH / fuelRateLph`

O indicador instantâneo só é válido com velocidade e taxa positivas. Valores acima de 30 km/L são descartados como não plausíveis para a finalidade deste painel. A média da viagem precisa ser `distância válida / litros integrados`, e não a média aritmética dos instantâneos. A integração usa regra trapezoidal entre duas amostras válidas e não integra intervalos fora do limite temporal.

## 3. Parâmetros brasileiros

- **GASOLINA:** referência aproximada de gasolina C comum E32 em vigor na data da pesquisa, calculada a partir de propriedades de referência de gasolina A e etanol anidro. A ANP informou que o E32 era temporário por 180 dias a partir de 01/08/2026; rever o JSON até 27/01/2027.
- **ETANOL:** referência de etanol hidratado aproximada por dados publicados para 95% vol. etanol + 5% água. Não representa a análise de uma amostra do posto.
- **FLEX sem composição:** referência E50, apenas para permitir estimativa rotulada quando não há leitura válida do PID 0152. Não presume que o tanque esteja realmente em E50.
- **PID 0152:** deve ser confirmado em resposta RAW_ECU e sua semântica precisa ser confrontada com a mistura brasileira antes de usar a composição como medição de precisão.

## 4. Calibração proposta por abastecimento cheio-a-cheio

A calibração efetiva depende de dados reais de abastecimento; não deve ser inferida de um único instante nem de histórico importado.

1. Encher o tanque até um ponto repetível e registrar o hodômetro.
2. Durante o intervalo, integrar apenas taxas recém-calculadas e válidas para obter litros estimados.
3. No abastecimento seguinte, voltar ao mesmo ponto de enchimento e registrar os litros efetivamente adicionados.
4. Calcular `factorObservado = litrosAbastecidos / litrosEstimados`.
5. Reunir ao menos três intervalos válidos, exigir fator entre 0,70 e 1,30 e aplicar suavização `factorNovo = factorAnterior + 0.25 * (factorObservado - factorAnterior)`.
6. Guardar cada intervalo, a fonte de consumo, o combustível selecionado, distância, litros estimados/medidos e fator. Separar calibrações por tipo de combustível.
7. Nunca recalcular viagens antigas sem as amostras de origem disponíveis.

**Estado desta etapa:** os parâmetros e a regra de calibração estão versionados em JSON, mas a interface para registrar abastecimentos e persistir uma calibração aprendida ainda não está conectada. Até isso existir, o fator utilizado é 1,0.

## 5. Fontes pesquisadas

- [obd2-dash — manual e método de consumo](https://github.com/trepidity/obd2-dash/blob/master/MANUAL.md)
- [obdgpslogger — cálculo MAF e método MAP/IAT/RPM com VE](https://github.com/oesmith/obdgpslogger/blob/master/doc/mpg-calculation)
- [Referência de PIDs OBD-II — PID 015E e PID 0152](https://github.com/evrenonur/obd2-elm327-pid-reference/blob/master/OBD2_Complete_PID_Reference_EN.md)
- [Estimativa de consumo a partir de dados OBD-II — artigo científico](https://doi.org/10.1177/09544070231185609)
- [ANP — gasolina C E32 temporária a partir de 01/08/2026](https://www.gov.br/anp/pt-br/canais_atendimento/imprensa/noticias-comunicados/e32-gasolina-com-32-de-etanol-passa-a-valer-temporariamente-a-partir-de-amanha-1-8)
- [Propriedades de misturas de etanol hidratado e razão ar/combustível](https://pmc.ncbi.nlm.nih.gov/articles/PMC8495882/)
