# Estudo comparativo OBD-II e arquitetura proposta do Meriva Smart

**Data:** 2026-10-26  
**Base analisada:** main em 02773b71ca9bd428b832d53a386655dd80acd80b.  
**Escopo:** pesquisa e especificação documental. Nenhuma implementação do aplicativo foi autorizada ou realizada nesta branch.  
**Branch isolada:** research/obd-methods-ui-architecture-20261026.

## 1. Objetivo e critérios de evidência

Este estudo cruza documentação pública de aplicativos OBD-II, implementações abertas e a arquitetura atual do Meriva Smart para planejar cockpit, páginas secundárias, conexão, monitoramento, fórmulas e validação.

A análise separa: **documentação oficial do produto**, **código-fonte público**, **padrão técnico** e **hipótese para a ECU da Meriva**. A documentação de uma função não revela necessariamente como ela foi implementada internamente. O código de um projeto aberto demonstra apenas o método daquela implementação; não comprova que um produto comercial use o mesmo algoritmo. Fórmulas proprietárias não foram inferidas quando não foram divulgadas.

**Regra de escopo:** não alterar lógica do app, telas, cálculos executáveis, cadência, catálogo de PIDs, dependências, contratos anti-regressão ou PR de implementação. O resultado é uma especificação isolada para decisão posterior.

## 2. Conclusões principais

1. **Car Scanner:** documenta que a quantidade de PIDs consultados limita diretamente a frequência de atualização. A otimização de requisições anunciada como até 6× é para CAN 11-bit/29-bit. Não deve ser copiada para K-Line/KWP sem benchmark físico.
2. **Torque Pro:** documenta um editor de equações de PIDs com filtros e acumuladores temporais como EWMAF, TAVG, RAVG, AVG, TDLY/RDLY e TOT. É uma referência de recursos para suavização/tendência, não uma razão para abandonar o motor determinístico do Meriva Smart.
3. **OBD Fusion:** publica suporte a PIDs configuráveis, dashboards, freeze frame, relatórios, gráficos e CSV. Não localizei documentação pública suficiente para reproduzir como fato suas fórmulas proprietárias de consumo.
4. **OBDLink:** documenta escolha automática do cálculo de combustível a partir dos PIDs: taxa direta, MAF ou MAP. No método MAP, combustível, cilindrada e eficiência volumétrica (VE) afetam a estimativa. Os parâmetros de veículo influenciam o resultado.
5. **OBD Auto Doctor:** é uma referência funcional para DTC, freeze frame, readiness, sensores, logs e exportação. As fontes públicas consultadas não permitem atribuir com segurança uma fórmula proprietária específica de consumo.
6. **ScanMyOpel / ScanMyOpelCAN:** o fornecedor distingue suporte não-CAN, que inclui Meriva A, e CAN, que inclui Meriva B. A seleção precisa corresponder à geração e ECU reais. A documentação interna do Meriva Smart observa K-Line/KWP Fast; por isso não se deve assumir que uma abordagem CAN seja automaticamente compatível.
7. **python-OBD:** demonstra um ciclo de aquisição assíncrono com comandos observados, loop de atualização e retorno imediato da última amostra, sem bloquear a interface.
8. **OBDvis:** projeto aberto com scheduler que pondera idade e prioridade por PID, limites de frescor por sinal e regras diagnósticas em janelas de tempo com evidência, confiança e limitações explícitas.
9. **OBD Metrics:** mostra registro de PIDs orientado a dados, decodificadores, parâmetros externos e prioridades. Lotes e otimizações dependem de adaptador/protocolo; não provam que vários PIDs possam ser lidos em uma única requisição na K-Line da Meriva.
10. **OBD-Droid:** permite estudar transporte Android e parser de fórmulas. Sua fonte inclui uma estimativa heurística RPM/carga com mínimo de combustível forçado. Não deve ser adotada como verdade física nem fabricar consumo positivo quando os dados não o sustentam.
11. **Meriva Smart:** o catálogo local define decodificação, não comprova suporte físico. O relatório de PIDs da branch main analisada registra apenas PID 010C com resposta RAW_ECU específica para a Meriva. A PR #92 possui mudanças propostas para cockpit/autonomia; este estudo não altera nem aprova esses diffs.

## 3. Matriz comparativa dos aplicativos e repositórios

| Produto / fonte | O que a documentação ou código comprova | Conexão e monitoramento conhecidos | Fórmulas conhecidas publicamente | Limite para o Meriva Smart |
|---|---|---|---|---|
| Car Scanner ELM OBD2 | Sensores, dashboards, PIDs configuráveis, DTC e logs; documenta efeito da lista de PIDs e ATST na velocidade/estabilidade | Consultas de parâmetros e otimização ELM; otimização de pedidos para CAN 11/29-bit | Fórmulas de PIDs padrão; a lógica proprietária completa de consumo não está publicada nas fontes consultadas | Não transplantar ganho CAN nem temporização para K-Line |
| Torque Pro | Equações configuráveis, CSV de PIDs estendidos e filtros/acumuladores | Leitura de PIDs e sensores configurados via adaptador OBD | DSL documentada, com médias, atraso temporal, totalizador, inteiros signed e lookup | Aproveitar conceitos de filtro; manter catálogo declarativo e motor determinístico |
| OBD Fusion | PIDs personalizados, dashboards, freeze frame, relatórios, gráficos e CSV | Adaptador configurável, leituras e gravação de logs | Fórmula proprietária de combustível não verificada publicamente | Não fingir conhecer algoritmo interno; usar como referência funcional |
| OBDLink | Escolhe o método de economia de combustível a partir de PIDs suportados; parâmetros de veículo afetam estimativas | Produto integrado com adaptadores da linha OBDLink, gauges e viagens | Taxa direta, MAF ou MAP; implementação interna detalhada não totalmente publicada | Adotar hierarquia conceitual, não dependência de hardware proprietário |
| OBD Auto Doctor | DTC, freeze frame, readiness, sensores, logs e exportação | Adaptador compatível e serviços OBD suportados | Fórmula proprietária não confirmada nas fontes consultadas | Referência de inspeção e relatório |
| ScanMyOpel | Acesso específico a ECUs Opel/Vauxhall, dados vivos, códigos, identificação, gráficos e alguns testes de atuadores | Protocolos e adaptadores específicos; não é apenas scanner genérico | Diferencial é acesso a módulos do fabricante, não fórmula genérica | Confirmar geração, ECU e protocolo da Meriva |
| python-OBD | API de conexão, suporte a comandos, comandos customizados e loop assíncrono | Auto-detecção de porta/protocolo, atualização em segundo plano e callbacks | Decoders explicitamente associados a comandos | Referência de arquitetura, não implementação pronta para React Native |
| OBDvis (código aberto) | Scheduler, estados de conexão, gráficos, CSV, DTC e diagnósticos explicáveis | BluetoothSocket/RFCOMM, framing pelo prompt ELM, inicialização AT e bitmap | Fórmulas padrão e regras diagnósticas determinísticas no código | Referência forte para scheduler e UX de evidência; não copiar seus thresholds sem calibração |
| OBD Metrics (biblioteca) | Registry de PID, codecs, fórmula externa, métricas por sessão e grupos prioritários | Abstração request/response e publicação não bloqueante | Fórmulas declarativas/dinâmicas, signed data e decodificadores múltiplos | Batch depende de adaptador/protocolo; não pressupor ganho em K-Line |
| OBD-Droid (código aberto) | Transporte Java, PIDs customizados, logging e calculadora de consumo | BluetoothSocket, threads, limpeza de conexão e cancelamento da descoberta | MAP speed-density e heurística RPM/carga disponíveis no código | Usar criticamente: heurística e clamps precisam de validação independente |

## 4. Métodos de conexão e monitoramento

### 4.1 Bluetooth Classic, RFCOMM e SPP

A documentação Android caracteriza RFCOMM como transporte orientado a conexão e baseado em fluxo, também chamado Serial Port Profile. Um evento de recepção não é necessariamente uma mensagem ELM completa: a aplicação acumula o stream e enquadra a resposta segundo o dispositivo.

O OBDvis usa InputStream/OutputStream de BluetoothSocket em contexto de I/O e encerra a resposta no prompt ELM. O OBD-Droid cancela descoberta Bluetooth antes da conexão, protege mudanças de estado, gerencia threads e limpa recursos após falhas.

**Diretriz para a arquitetura futura:** um único dono do socket, um leitor, um buffer de stream e uma sessão de comandos serializada. Não criar outro leitor nem outra sessão OBD por página. Eventos fragmentados precisam montar uma só resposta; bytes excedentes ou respostas tardias não podem contaminar o comando seguinte.

### 4.2 Inicialização ELM327 e temporização

O datasheet ELM327 documenta comandos AT para seleção de protocolo, timeouts e timing adaptativo. O OBDvis usa ATZ, ATE0, ATL0, ATS0, ATAL, ATAT1 e ATSP0 antes de consultar suporte de PIDs. O Meriva Smart tem uma sequência diferente documentada no próprio playbook, incluindo ATI como melhor esforço, não como requisito universal.

Isso demonstra que não é seguro adicionar automaticamente todos os comandos de outro aplicativo. Clones variam: falha em ATI não prova que o adaptador não responda a consultas OBD. O timeout do app, o temporizador ELM e uma resposta NO DATA são eventos diferentes.

**Regra:** não copiar ATST/ATAT ou ajustes de protocolo de um concorrente sem teste físico de taxa, perda, estabilidade e recuperação na K-Line da Meriva.

### 4.3 Descoberta de PIDs

Implementações abertas e o Meriva Smart consultam os bitmaps de suporte Mode 01: 0100, 0120, 0140 e blocos subsequentes quando o bit de continuação indica outro grupo. O mapa é uma declaração da ECU, não valida a leitura de cada sensor.

Fluxo recomendado:

1. Validar que o adaptador responde.
2. Confirmar uma resposta válida da ECU.
3. Consultar o bitmap da sessão atual.
4. Testar individualmente apenas os PIDs anunciados e catalogados, com exceção explicitamente documentada do gate de conexão.
5. Validar serviço positivo, PID, comprimento, bytes, fórmula e faixa.
6. Registrar resposta bruta, timestamp, latência e estado.
7. Só então permitir que a leitura alimente telemetria, estimativa, autonomia ou aprendizado.

O cache anterior pode ordenar a investigação, não substituir o mapa e a resposta atuais. PID não respondido não vira zero.

### 4.4 Cadência e prioridade

**Car Scanner** alerta que cada PID adicional disputa tempo de aquisição. Seu material afirma que ATST menor pode acelerar respostas e reduzir estabilidade, provocar perdas ou impedir conexão. O ganho de até 6× é referido a CAN 11/29-bit.

**python-OBD** separa query bloqueante de consulta assíncrona: subscreve comandos, inicia um loop de atualização em segundo plano e retorna a última resposta disponível. Isso desacopla UI e aquisição; não autoriza comandos paralelos no mesmo ELM.

**OBDvis** usa pontuação da forma idade × peso: prioridade alta 4, média 2 e baixa 1. O código separa frescor por sinal: RPM/velocidade têm janela curta, enquanto parâmetros de mudança lenta têm janela maior. Esses valores são do projeto de referência, não constantes universais da Meriva.

**Recomendação:** manter uma única política de polling por protocolo/veículo. Velocidade, RPM e sinais essenciais aos cálculos válidos recebem prioridade; leituras lentas entram em rotação auxiliar. Calibrar somente com medição K-Line física. Páginas não podem disparar consultas fora do scheduler.

### 4.5 Buffers de propósitos diferentes

| Buffer | Propósito | Invariante |
|---|---|---|
| RX/framing ELM | Montar resposta completa do stream | Limite de tamanho, framing correto e nenhuma cauda misturada com próximo comando |
| Descoberta de PIDs | Evidência temporária da sessão | Isolado por sessão/ECU, limitado e não reaproveitado como prova de conexão nova |
| Janela de autonomia/consumo | Exigir amostras recentes e mitigar ruído | Apenas dados reais, válidos e monotônicos; lacunas relevantes invalidam a janela |
| Séries de telemetria | Gráficos/tendências | Limite de amostras/séries, timestamp válido e amostras vencidas excluídas de diagnósticos |
| Fila CSV/persistência | Agrupar gravações e recuperar falhas de I/O | Backpressure, métricas de saturação e erros visíveis |

Não misturar a janela do cálculo com a série histórica. Um buffer de suavização não pode atrasar alerta crítico de temperatura/tensão. Não somar de novo uma amostra cacheada como se fosse amostra nova.

## 5. Fórmulas publicamente verificáveis

As expressões abaixo são referências Mode 01 padrão, cruzadas com documentação técnica e repositórios de referência. A fonte executável continua sendo o catálogo versionado do Meriva Smart; definição cadastrada não implica suporte no carro.

| PID | Sinal | Fórmula | Unidade | Observação |
|---|---|---|---|---|
| 0104 | Carga calculada | A × 100 / 255 | % | Não confundir com carga absoluta |
| 0105 | Temperatura do líquido | A − 40 | °C | Faixa matemática não indica avaria |
| 0106 / 0107 | STFT / LTFT | (A − 128) × 100 / 128 | % | Interpretar com condição operacional |
| 010A | Pressão de combustível gauge | A × 3 | kPa | Confirmar semântica no protocolo/alvo |
| 010B | MAP | A | kPa absolutos | Valor plausível não confirma sensor |
| 010C | RPM | (256 × A + B) / 4 | rpm | Dois bytes obrigatórios |
| 010D | Velocidade OBD | A | km/h | Separar de velocidade GPS |
| 010E | Avanço de ignição | A / 2 − 64 | graus | Contexto de carga importa |
| 010F | Temperatura de admissão | A − 40 | °C | Não copiar calibração de outro veículo |
| 0110 | MAF | (256 × A + B) / 100 | g/s | Fonte possível de estimativa |
| 0111 | Posição da borboleta relativa | A × 100 / 255 | % | Não confundir com pedal/posição absoluta |
| 0114 | Tensão O2 B1S1 | A / 200 | V | Byte B carrega trim associado conforme PID; não confundir com tensão |
| 012F | Nível de combustível | A × 100 / 255 | % | Percentual não garante conversão linear em litros |
| 0131 | Distância desde limpeza DTC | 256 × A + B | km | Não é odômetro total |
| 0142 | Tensão do módulo | (256 × A + B) / 1000 | V | Comparar com instrumento externo para calibrar |
| 0143 | Carga absoluta | (256 × A + B) × 100 / 255 | % escalado | Valor matemático pode exceder 100%; não significa carga normal |
| 0151 | Tipo de combustível | Enum de A | código | Não é medida da mistura atual |
| 0152 | Percentual de álcool reportado | A × 100 / 255 | % | Só usar se ECU suportar e resposta for válida |
| 015E | Taxa de combustível | (256 × A + B) / 20 | L/h | Preferida sobre estimadores quando validada |

As fórmulas precisam continuar ligadas ao catálogo único, com comprimento esperado, unidade, id da fórmula e faixa de decodificação. Faixa matemática não é limite OEM nem diagnóstico.

## 6. Três métodos de cálculo de combustível

O OBDLink documenta publicamente três famílias: taxa direta, MAF e MAP. A fórmula interna integral dos produtos comerciais não é necessariamente pública. As expressões seguintes são a referência física aproximada usada para análise, não uma alegação de reproduzir exatamente seus aplicativos.

### 6.1 Taxa direta pela ECU (preferida se validada)

PID 015E fornece L/h. A integração aproximada por trapézio é:

Litros consumidos = ((taxa anterior + taxa atual) / 2) × (intervalo entre timestamps em ms / 3.600.000).

Requisitos:
- taxas finitas e não negativas;
- timestamps monotônicos, sem repetição/regressão;
- intervalo máximo definido e testado;
- amostra cacheada nunca integrada duas vezes;
- 0 válido é diferente de ausência;
- nenhuma quantidade de litros é fabricada para preencher a lacuna.

### 6.2 Estimativa baseada em MAF

Fluxo de combustível em kg/s ≈ MAF em g/s / 1000 / AFR.

Fluxo volumétrico em L/h ≈ fluxo de combustível em kg/s × 3600 / densidade do combustível em kg/L.

A estimativa exige AFR e densidade coerentes com combustível explicitamente selecionado. Valores típicos de gasolina e etanol são aproximações, não calibração da Meriva. Para FLEX, composição desconhecida invalida o estimador; não presumir gasolina silenciosamente.

### 6.3 Estimativa MAP / speed-density

MAP e temperatura aproximam densidade do ar; RPM, cilindrada e eficiência volumétrica aproximam vazão. A vazão de ar é convertida em fluxo de combustível com AFR e densidade:

- T(K) = IAT(°C) + 273,15
- Densidade do ar (kg/m³) ≈ pressão absoluta (Pa) / (287,05 × T(K))
- Vazão do motor (L/s) ≈ cilindrada em L × RPM / 120 × VE
- MAF estimado ≈ densidade numérica equivalente em g/L × vazão em L/s
- Taxa de combustível (L/h) ≈ MAF estimado em g/s / 1000 / AFR × 3600 / densidade em kg/L

VE e composição são fontes significativas de incerteza. É estimativa, não medição de fluxo. O MAF direto não deve ser combinado com MAP como se ambos fossem duas medições independentes de uma taxa.

### 6.4 Heurística RPM/carga: por que não copiar

O código aberto do OBD-Droid contém uma estimativa por RPM, carga, velocidade e fator de cilindrada, com ajuste cidade/rodovia e mínimo de fluxo forçado. Os números de precisão descritos pelo repositório não foram validados independentemente nesta pesquisa.

Não adotar como fonte de autonomia: a heurística não equivale a uma medição de vazão e o mínimo positivo pode fabricar consumo durante desaceleração/fluxo muito baixo. Retornar indisponível é mais honesto que produzir número liso sem base.

### 6.5 Consumo e autonomia

Quando fluxo L/h e velocidade km/h estão válidos e positivos:

- L/100 km = taxa L/h / velocidade km/h × 100.
- km/L = velocidade km/h / taxa L/h.

Não calcular razões quando o denominador é zero, negativo, ausente ou vencido. Velocidade zero impede consumo por distância, mas a taxa L/h ainda pode ser válida.

Autonomia (km) = litros utilizáveis estimados × rendimento esperado em km/L.

O sistema precisa registrar a fonte do volume restante e do rendimento. PID 012F é um percentual, não uma medição volumétrica linear comprovada. Converter para litros exige evidência do veículo. Balanço desde o último tanque completo depende de registros completos, abastecimentos válidos, distância confiável e ausência de lacunas incoerentes.

Estados de apresentação recomendados:
- **Calculada por dados medidos:** fonte direta validada e janela íntegra.
- **Estimativa:** fórmula derivada ou balanço com incerteza explícita.
- **Buffer temporário:** amostras reais recentes suficientes, com idade e expiração.
- **Indisponível:** falta de fonte, amostras vencidas, combustível desconhecido quando necessário ou histórico inconsistente.

Uma leitura antiga nunca deve aparentar ser atual.

## 7. Auditoria arquitetural do Meriva Smart

### 7.1 Elementos já presentes no snapshot main

| Arquivo/área | Responsabilidade documentada | Invariante a preservar |
|---|---|---|
| src/obd/bluetoothClassicTransport.ts | Bluetooth Classic, RX buffer, framing e diagnóstico | Um leitor/socket; limites de buffer e cleanup serial |
| src/obd/elm327.ts | Sessão, fila, inicialização, timeout e status | Uma solicitação por vez; distinguir timeout, NO DATA, unsupported, erro e desconexão |
| src/obd/intelligentPidDiscovery.ts | Bitmap, sondagem individual, status e evidência | Anúncio do bitmap não substitui resposta individual válida |
| src/obd/parser.ts | Enquadramento, extração de bytes e validação | Validar serviço, PID, tamanho, envelope/checksum quando aplicável |
| src/knowledge/pids.json | PID, comprimento, unidade e id da fórmula | Catálogo não prova suporte real |
| src/knowledge/formulas.json e src/obd/formulaEngine.ts | Fórmulas determinísticas e validação de bytes | Uma fonte de cálculo; não permitir expressão arbitrária por eval |
| src/knowledge/ranges.json | Faixas de plausibilidade | Faixa matemática não é limite OEM de defeito |
| src/knowledge/polling_policy.json | Prioridade, fases e cadência de polling | Política única e sem consultas duplicadas no ciclo |
| src/obd/fuelConsumption.ts | Integração de taxa direta e estimadores MAF/MAP | 015E tem precedência; FLEX exige composição válida para estimar |
| src/obd/liveTelemetry.ts | Séries, tendências e contexto | Só dados reais com timestamps válidos; stale excluído |
| src/gps/ | Velocidade/distância GPS e filtros | GPS fica separado de velocidade OBD |
| src/meriva/ e src/storage/ | Autosave, históricos, quota e backup | Persistência resiliente, sem promover referência externa a telemetria real |

O estudo não propõe duplicar essas camadas. A oportunidade principal é melhorar hierarquia visual, transparência de estado, critérios probatórios e teste físico comparável.

### 7.2 Verificações necessárias em futura revisão autorizada

1. **PID 0114:** a tensão usa A/200 V e B contém trim associado. Confirmar que o parser registra o sinal secundário separadamente sem misturá-lo à tensão.
2. **Estados de evidência:** distinguir cadastrado, bitmap anunciou, respondeu validamente e validado por comparação independente no veículo.
3. **Frescor:** cada PID tem dinâmica e critério próprios; stale deve virar N/D ou estimativa identificada, não valor atual.
4. **Estimativa MAP:** cilindrada, VE, IAT e combustível são entradas explícitas e fontes de incerteza; o valor não é “consumo medido”.
5. **Capacidade e nível:** manual pode fornecer capacidade nominal, mas não prova linearidade do PID 012F em litros para essa ECU.
6. **Contexto operacional:** frio/quente, marcha lenta, aceleração/desaceleração e cruzeiro exigem sinais frescos e coerentes.
7. **K-Line versus CAN:** toda comparação de desempenho deve declarar protocolo e adaptador. Não transportar otimizações de CAN para K-Line sem medição.
8. **PR #92:** a branch de integração contém uma página app/autonomia.tsx e mudanças propostas que não existem no snapshot main analisado. Esta pesquisa não altera nem aprova esses diffs.

## 8. Matriz proposta para o cockpit

O cockpit é para uso operacional, não para apresentar todos os dados técnicos simultaneamente. Detalhes e inspeção ficam em páginas secundárias.

| Zona | Conteúdo | Fonte | Estados/limitações obrigatórios |
|---|---|---|---|
| Identidade/status | Veículo e estado resumido da sessão | Perfil local + conexão | Bluetooth, ELM, ECU e protocolo separados |
| Autonomia principal | Km estimados, método, idade e confiança | Nível e rendimento/balanço válido | Calculada, estimativa, buffer ou indisponível |
| Movimento | Velocidade e RPM | PID 010D/010C; GPS em item separado | Origem e frescor por fonte; não trocar ausência por zero |
| Fluxo/consumo | L/h, L/100 km, km/L, litros integrados da viagem | 015E ou estimador identificado | Medido/estimado/indisponível; bloquear divisão por zero |
| Combustível restante | Nível %, litros somente se conversão justificada | PID 012F ou balanço elegível | Percentual não deve parecer litro medido |
| Térmica/elétrica | ECT e tensão com alerta | PIDs atuais válidos | Normal/atenção/crítico/sem dados; sem suavizar alerta crítico |
| Diagnóstico rápido | Contagem DTC, MIL e readiness resumido | Respostas diagnósticas válidas | Falha de consulta não significa ausência de códigos |
| Contexto de condução | Distância, duração e estado provável | GPS + telemetria válida | Contexto desconhecido quando dados insuficientes |
| Transparência | Última atualização e razão de indisponibilidade | Timestamp e status por fonte | Mostrar stale, não suportado e não interpretado |

### Hierarquia de leitura proposta

1. Cabeçalho discreto com veículo e sessão.
2. Autonomia com origem/validade.
3. Velocidade e RPM, sem animações que ocultem atualização real.
4. Fluxo/consumo, temperatura e tensão.
5. Resumo de falhas e contexto da viagem.
6. Atalhos para Diagnóstico, Viagens, Autonomia/Combustível e Mais recursos.

A matriz não fixa cor, DP, componentes ou detalhes de implementação. A navegação retrato/paisagem existente precisa continuar respeitada.

## 9. Matriz de páginas secundárias

A regra principal é que as páginas consomem serviços e snapshots compartilhados. Nenhuma delas cria uma sessão OBD paralela nem implementa uma fórmula alternativa.

| Rota atual/proposta | Responsabilidade | Conteúdo recomendado | Limite de responsabilidade |
|---|---|---|---|
| bluetooth.tsx | Configurar/operar conexão | Dispositivos pareados, conectar/desconectar, selecionar adaptador e reconectar | Ações de conexão; não duplicar o log completo |
| conectividade.tsx | Explicar saúde da comunicação | Estados Bluetooth/ELM/ECU/protocolo, timeline, latência, timeout e causas | Não abrir socket próprio |
| saude.tsx | Resultado legível do diagnóstico | DTC atual/histórico separado, MIL, readiness, achados e evidência | Não transformar heurística em defeito confirmado |
| testes-sensores.tsx | Testes de sensores suportados | Pré-condições, amostras, janela, resultado e não executável | “Não avaliado” não é “aprovado” |
| laboratorio.tsx | Inspeção técnica/matemática | Bytes, resposta decodificada, fórmula, unidade e fronteiras | Fixtures sempre sintéticas e rotuladas; motor único |
| aprendizado.tsx | Histórico de evidência e regras | Amostras válidas, contexto, origem e estatísticas | Só dados reais; hipótese não vira fato |
| viagens.tsx | Histórico operacional | Viagens, distância GPS, consumo, lacunas, métricas e exportação | Marcar balanço não confiável após lacunas relevantes |
| autonomia.tsx (presente na branch de integração #92, não em main) | Explicar o cálculo atual de autonomia | Fonte do nível, amostras, rendimento, buffer e expiração | Compartilhar o mesmo estado de domínio; não integrar cache duas vezes |
| veiculo.tsx | Perfil e especificações | Ano/motor, cilindrada, combustível, capacidade nominal e proveniência | Manual/usuário/ECU em campos distintos |
| manutencao.tsx | Histórico e lembretes | Odômetro, serviço, intervalos e datas | Registros manuais fora de telemetria e cálculo automático |
| dados.tsx | Visualizar/exportar registros | Sessões, leituras, origem, RAW/interpretado, CSV/TXT | Exportação não altera evidência original |
| armazenamento.tsx | Integridade local | Quota, tamanho, fila, perdas, backups, restauração e erros | Falha ao ler storage nunca vira zero uso |
| configuracoes.tsx | Preferências | Unidades, conexão automática, retenção e privacidade | Não expor controles arbitrários para quebrar protocolo |
| mais.tsx | Hub de recursos | Atalhos agrupados por operação, diagnóstico e engenharia | Evitar páginas/atalhos duplicados |

### Regras de navegação

- Cockpit = operação; Saúde/Testes = interpretação; Laboratório = engenharia.
- Bluetooth = configurar/agir; Conectividade = diagnosticar/explicar eventos. Se a implementação atual não sustentar essa diferença, consolidar em vez de manter duas páginas concorrentes.
- Dados = visualização/exportação; Armazenamento = quota/backup/recuperação. Cada métrica/ação tem um único dono.
- Viagens = registros concluídos/ativos; Autonomia = explicação do cálculo corrente, se mantida após revisão da PR #92.
- Laboratório não é área para comandos que alterem comportamento do veículo sem política independente de segurança.

## 10. Arquitetura de dados proposta

Fluxo conceitual:

Bluetooth Manager → transporte de stream → sessão ELM serializada → descoberta/consulta → parser/validação → catálogo de fórmulas → amostra com proveniência → snapshot de domínio → cockpit/páginas → persistência/log/exportação.

### Contrato mínimo da amostra

Cada leitura usada por UI ou cálculo deve possuir:

- PID normalizado e versão da definição.
- Bytes brutos/resposta recebida quando logging está habilitado.
- Valor e unidade, se interpretável.
- Estado: respondeu, não respondeu, não suportado/anunciado, não interpretado, inválido ou vencido.
- Origem: ECU real, simulação de teste, baseline externo ou valor derivado.
- Timestamp de aquisição e timestamp de registro.
- Latência, protocolo e identificação da sessão.
- Id da fórmula e motivo de invalidação, quando aplicável.

A UI consome snapshots e serviços de domínio. Uma tela não deve disparar comando direto ao ELM, recalcular fórmula central nem declarar confirmação. Valor derivado deve registrar inputs, idades e fonte usada pela hierarquia.

### Achado diagnóstico explicável

Cada achado deve conter id da regra, severidade, confiança, sinais usados, janela temporal, mínimo de amostras, contexto, critérios de elegibilidade, razões de exclusão e limitações. Se as pré-condições não foram satisfeitas, apresentar “não avaliado/dados insuficientes”, não “saudável”.

### Limites operacionais

- Sessão serializada; sem sobreposição de comandos.
- Último valor válido é diferente de valor atual.
- Cache pode servir à apresentação por janela limitada, não ser reintegrado como nova amostra.
- Polling central com prioridade, cadência, prazo e status de timeout.
- Persistência e aprendizado não bloqueiam aquisição.
- Todos os buffers/filas têm limite, métricas e erro observável.

## 11. Matriz de validação

| Cenário | Teste automatizado | Teste físico | Critério |
|---|---|---|---|
| Framing ELM | Chunks divididos, prompt ausente, bytes após prompt e overflow | Capturar RX em adaptadores reais | Sem misturar resposta; falha explícita |
| Conexão | Mock de rádio, permissões, socket e ECU sem resposta | Galaxy A06/Android 16 + ELM327 + Meriva | Estados por camada corretos |
| Descoberta | Bitmap com continuação, PID anunciado sem payload | Captura da ECU alvo | Somente PIDs comprovados entram em polling |
| Parser | Resposta válida, curta, negativa, checksum ruim, PID divergente, múltiplas ECUs | TX/RX real comparado | Sem aceitar bytes ou checksum inválidos |
| Polling | Timeout, fila cheia, atraso e cancelamento | Medir ciclos por PID em K-Line | Sem sobreposição; latência/perdas documentadas |
| Combustível direto | Taxa zero válida, timestamp repetido, regressivo, gap e NaN | PID 015E se suportado | Sem dupla contagem ou preencher lacunas |
| MAF/MAP | Valores-limite, FLEX sem composição, VE/cilindrada inválidas | Comparar com fluxo direto/abastecimento | Estimativa identificada e sem premissa silenciosa |
| Autonomia | Nível vencido, tanque cheio, histórico incompleto, zero speed e gaps | Odômetro e abastecimento controlado | Indisponível se base inválida; erro quantificado |
| Cockpit stale | Timestamps antigos/futuros e fonte que parou | Desconectar ECU durante a sessão | Valor vencido não parece atual |
| Diagnóstico por janelas | Amostras insuficientes, contexto inaplicável e ruído | Reproduzir logs reais | Evidência, contexto e limitação visíveis |
| GPS/OBD | GPS impreciso, timestamp fora de ordem, velocidade divergente | Rota conhecida/odômetro independente | Origem explícita e tolerância definida |
| Export/backup | Falha de escrita, restore parcial, CSV com caracteres especiais | Restaurar no Android | Sem corrupção silenciosa |

CI, testes de unidade, build nativo e teste físico são evidências diferentes; nenhum substitui os outros.

## 12. Riscos principais

| Risco | Por que importa | Guarda documental/arquitetural |
|---|---|---|
| Fórmula do veículo errado | PID estendido e calibração variam por ECU | Guardar modelo/protocolo/origem e evidência por veículo |
| Otimização CAN aplicada à K-Line | Cadência e framing diferem | Sem implantação sem benchmark K-Line |
| Estimativa parecer medição | Contamina consumo/autonomia | Proveniência explícita e hierarquia 015E → MAF → MAP quando válida |
| Preencher lacunas com valor anterior | Soma combustível durante desconexão | Expirar/inutilizar janela após gap |
| Taxa mínima forçada | Fabrica litros em fluxo baixo/desaceleração | Não impor mínimo positivo sem evidência |
| Média esconder alerta | Pode suprimir pico crítico | Alertas usam amostra atual válida; tendência separada |
| Catálogo confundido com suporte | Nome e fórmula não provam ECU | Estados separados: catálogo, bitmap, resposta, validação independente |
| Copiar código externo | Risco de licença e incompatibilidade | Nesta etapa usar conceitos; auditar licença antes de portar código |
| Páginas duplicam serviços | Estados divergem e consultas dobram | Serviço único por responsabilidade; UI como consumidora |
| Conflito com PR #92 | Cockpit/autonomia em fluxo de integração ativo | Pesquisa fica isolada; integrar/revisar só com autorização e CI no SHA exato |

## 13. Plano de documentação

| Documento | Responsabilidade exclusiva |
|---|---|
| docs/ARCHITECTURE.md | Camadas e fluxo de dados |
| docs/ELM327_ENGINEERING_PLAYBOOK.md | Inicialização, protocolo, framing, timeout e recuperação |
| docs/RELATORIO_PIDS_E_FORMULAS.md | Fórmulas, bytes, unidades, plausibilidade e evidência da Meriva |
| docs/MAPEAMENTO_COMPLETO_PIDS_2026-10-24.md | Inventário e estado probatório por PID |
| docs/TEST_PLAN.md | Cenários de CI, Android nativo e teste físico |
| docs/CONTRATO_ANTI_REGRESSAO.md | Invariantes que bloqueiam regressões |
| docs/DIARIO_DE_BORDO.md | Mudanças reais, causa, arquivos, validação e estado da CI |
| docs/ESTUDO_COMPARATIVO_OBDII_E_ARQUITETURA_2026-10-26.md | Pesquisa externa, métodos públicos, matriz de concorrentes e proposta de UI |

Não duplicar a implementação das fórmulas nos documentos de comparação. O catálogo do aplicativo continua como fonte executável. A pesquisa é referência para decisão; o diário deve registrar apenas o que efetivamente acontecer.

## 14. Referências públicas

### Produtos e documentação oficial

- Car Scanner — otimização de velocidade/polling/ATST: https://www.carscanner.info/optimizing-connection-speed/
- Car Scanner — site e guias: https://www.carscanner.info/
- Torque Wiki — PIDs personalizados: https://wiki.torque-bhp.com/view/PIDs
- Torque Wiki — equações, filtros e totalizadores: https://wiki.torque-bhp.com/view/Equations
- OBD Fusion — dashboards, PIDs, diagnóstico e logs: https://www.obdsoftware.net/software/obdfusion
- OBDLink — métodos de cálculo/configuração de combustível: https://support.obdlink.com/support/solutions/articles/43000682239-edit-your-vehicle-settings
- OBDLink — gauges e fuel economy: https://support.obdlink.com/support/solutions/articles/43000678883
- OBDLink — viagens e registro de métricas: https://support.obdlink.com/support/solutions/articles/43000741182-get-started-with-trips
- ScanMyOpel / ScanMyOpelCAN — modelos não-CAN/CAN: https://scanmyopel.com/
- ELM Electronics — datasheet ELM327, AT commands e adaptive timing: https://www.elmelectronics.com/wp-content/uploads/2017/01/ELM327DS.pdf
- Android AOSP — BluetoothSocket/RFCOMM stream: https://android.googlesource.com/platform/frameworks/base/+/be0a453/core/java/android/bluetooth/BluetoothSocket.java

### Repositórios de engenharia

- python-OBD — conexões assíncronas: https://github.com/brendan-w/python-OBD/blob/master/docs/Async%20Connections.md
- python-OBD — conexão, protocolo e modo rápido: https://github.com/brendan-w/python-OBD/blob/master/docs/Connections.md
- python-OBD — decoders e comandos customizados: https://github.com/brendan-w/python-OBD/blob/master/docs/Custom%20Commands.md
- OBDvis — código Android e README: https://github.com/Joost-vanAndel/OBDvis
- OBDvis — scheduler: https://github.com/Joost-vanAndel/OBDvis/blob/main/android/app/src/main/java/com/obdvis/android/domain/polling/PriorityPollScheduler.kt
- OBDvis — pesos e frescor: https://github.com/Joost-vanAndel/OBDvis/blob/main/android/app/src/main/java/com/obdvis/android/domain/polling/PidPriority.kt
- OBDvis — inicialização e bitmap: https://github.com/Joost-vanAndel/OBDvis/blob/main/android/app/src/main/java/com/obdvis/android/data/obd/ElmInitializer.kt
- OBD Metrics — fórmulas, registry e prioridades: https://github.com/tzebrowski/ObdMetrics
- OBD-Droid — calculadora de consumo: https://github.com/Wal33D/OBD-Droid/blob/main/app/src/java/com/obddroid/features/fueleconomy/data/FuelEconomyCalculator.java
- OBD-Droid — parser de fórmulas: https://github.com/Wal33D/OBD-Droid/blob/main/app/src/java/com/obddroid/custompid/PidFormulaParser.java
- preOBD — referência de fórmulas padrão: https://github.com/preobd/preOBD/blob/main/docs/reference/OBD2_PID_REFERENCE.md
- OBDLink PID reference — repositório comunitário, não oficial: https://github.com/lazniak/OBDLink_MX-documentation/blob/main/en/technical-reference.md

### Fontes internas

- Arquitetura: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/docs/ARCHITECTURE.md
- Playbook ELM327: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/docs/ELM327_ENGINEERING_PLAYBOOK.md
- Relatório de PIDs/fórmulas: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/docs/RELATORIO_PIDS_E_FORMULAS.md
- Política de polling: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/polling_policy.json
- Catálogo de fórmulas: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/formulas.json
- Integração/estimativa de combustível: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/fuelConsumption.ts
- Descoberta de PIDs: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/intelligentPidDiscovery.ts

## 15. Estado de conclusão

**Concluído:** pesquisa documental e em repositórios públicos; comparação dos métodos declarados; fórmulas padrão publicamente verificáveis; proposta para cockpit, páginas secundárias, estado de amostra e testes.

**Não executado:** alterações de lógica, layout, fórmula executável, conexão Bluetooth, polling, diagnósticos, dependências, testes executáveis, changelog funcional ou PR de implementação. O documento permanece isolado numa branch de pesquisa e só deve ser integrado após autorização e reconciliação com a PR de integração ativa.
