# MERIVA SMART DIAGNOSTIC

Aplicativo Android offline de diagnóstico OBD-II para Chevrolet Meriva Maxx 1.4L 8V ECONO.FLEX.

As especificações físicas e de manutenção do veículo são mantidas em `src/database/merivaManual.ts`, com referência ao Manual do Proprietário Chevrolet Meriva 2012.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não vira um valor inventado.

O GPS do celular inicia automaticamente ao abrir o aplicativo. Ele fornece velocidade e distância em primeiro plano, mesmo quando a ECU não oferece o PID 015E. A gravação de litros e consumo depende de taxa de combustível OBD válida. Litros consumidos só entram no cálculo quando a ECU fornece uma taxa de combustível válida pelo PID OBD 015E. O GPS sozinho não mede litros. O aplicativo não aceita litros digitados manualmente na tela principal.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

## Estrutura

```text
app/             telas e navegação
src/obd/         Bluetooth, ELM327, parser, DTC, PIDs e telemetria
src/data/        tipos e ciclos de condução
src/database/    persistência, DTC, PIDs, aprendizado e veículos
src/meriva/      autosave e estado persistido
src/gps/         rastreamento de velocidade e distância
src/storage/     quota, backup, limpeza e ciclos
src/types/       contratos compartilhados
tests/           testes automatizados
docs/            arquitetura, desenvolvimento e auditorias
.github/         CI e governança
```

## Fluxo OBD

```text
UI
 ↓
Bluetooth Manager
 ↓
BluetoothClassicTransport (eventos)
 ↓
Elm327Session (fila de comandos)
 ↓
Discovery / PID / DTC
 ↓
Parser
 ↓
RAW + interpretado
 ↓
Banco / Histórico / DNA / Autosave
```

O sistema diferencia Bluetooth, ELM327 e ECU. Estar conectado ao ELM327 não significa que a ECU respondeu.

## GPS

```text
Root Layout
 ↓
GpsTracker singleton
 ↓
watchPositionAsync
 ↓
filtro por precisão + salto + velocidade
 ↓
velocidade / distância
 ↓
cálculo km/L somente com litros válidos
```

O rastreador é criado uma vez por sessão do aplicativo para continuar ativo enquanto o usuário navega entre as telas. A coleta é de primeiro plano e requer permissão de localização.

## Regras de dados

- REAL_OBD: veio da ECU através do transporte real.
- SIMULACAO: usado apenas para testes.
- CARSCANNER_BASELINE: referência externa, não é leitura atual da ECU.
- Dados simulados ou de referência não alimentam o aprendizado REAL_OBD.
- TX/RX original deve ser preservado quando houver logging.
- Respostas sem interpretação ficam como NÃO RESPONDEU, VALOR NÃO INTERPRETADO ou SEM DADOS.
- Nunca inventar valores.

## PIDs e combustível

A base cobre PIDs padrão úteis para telemetria e diagnóstico, incluindo velocidade, RPM, temperatura, MAF, posição da borboleta, nível de combustível (PID 012F) e taxa de combustível do motor (PID 015E). O PID 012F é a fonte absoluta de nível de combustível usada para litros, reserva e autonomia quando a resposta for válida. O PID 015E representa taxa de combustível em L/h quando suportado pela ECU; o aplicativo integra essa taxa ao longo do tempo usando os intervalos entre amostras, ignorando amostras inválidas e intervalos excessivamente longos.

## Identificação de combustível

A versão de validação passou a reconhecer os PIDs padrão **0151 (Fuel Type)** e **0152 (Alcohol Fuel Percentage)**.

- **0151**: identifica o tipo de combustível declarado pela ECU. Não deve ser tratado como leitura da mistura atual do tanque.
- **0152**: quando suportado e respondido validamente, informa o percentual de álcool fornecido pela ECU.
- O aplicativo **não estima** a mistura usando STFT, LTFT, lambda, MAF ou consumo.
- Respostas TX/RX continuam sendo preservadas para conferência.
- Um valor fora da faixa de 0–100% é marcado como incoerente e não é usado.
- A Meriva real ainda precisa responder aos PIDs para que eles sejam considerados **confirmados para este veículo**.

O módulo src/obd/fuelIdentification.ts é deliberadamente conservador. Ele separa TIPO_VEICULO, COMPOSICAO_ECU, SEM_DADOS e DADO_INCOERENTE. Não altera a tela principal nem declara automaticamente o combustível até haver evidência real suficiente.

### Critério para avançar

1. Consultar 0151 e 0152 na ECU real da Meriva.
2. Registrar várias respostas reais, incluindo TX/RX e protocolo.
3. Verificar estabilidade e coerência dos valores.
4. Só depois considerar qualquer uso do resultado no diagnóstico ou na autonomia.
5. Se a ECU não suportar os PIDs, manter a funcionalidade como investigação e não substituir por uma estimativa silenciosa.

## Persistência

O aplicativo mantém CONFIG, BANCO, LEITURAS, APRENDIZADO, DTC, LOGS, VIAGENS e BACKUP.

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android. O aplicativo escolhe automaticamente os candidatos pareados: primeiro nomes compatíveis com ELM/OBD e depois outros dispositivos Classic, aceitando somente o candidato que passa pela inicialização do ELM e pelo teste real 010C. A conexão usa Bluetooth Classic/RFCOMM e preserva o prompt > para o parser do ELM.

## Testes

```bash
npm install
npm run doctor
npm run typecheck
npm test
npx expo prebuild --clean --platform android --non-interactive
npx expo run:android
```

A suíte automatizada cobre autosave, parser, DTC, descoberta de PIDs, fila de comandos, transporte Bluetooth por eventos, storage e GPS. O build nativo Android no CI usa Java 17.

## Próximos blocos técnicos

1. validar Bluetooth/ELM327, 012F e GPS em Android físico;
2. monitorar PIDs suportados em ciclo real;
3. validar a taxa do PID 015E e outros PIDs relevantes na ECU real;
4. validar o comportamento específico da ECU da Meriva com dados reais;
5. manter especificações do manual separadas das evidências atuais da ECU.

## Princípio

**Evidência antes de conclusão.**


<!-- CI validation: 2026-10-06 -->
## Engenharia ELM327

A camada Bluetooth usa o transporte nativo do react-native-bluetooth-classic com `connectionType: delimited`, **delimiter vazio** (`delimiter: ''`) e `charset: ascii`. O aplicativo mantém um buffer local e conclui a resposta no prompt `>` do ELM327; os bytes que sobrarem depois do primeiro prompt no mesmo evento são registrados como cauda obsoleta e descartados para impedir que clones contaminem o próximo comando. O TX termina em CR. O termo RAW no projeto significa preservar TX/RX recebidos, não o modo de framing do socket.

A inicialização separa Bluetooth, ELM e ECU. A sonda real de referência da ECU é `010C -> 41 0C`; `ATI` é uma consulta best-effort e não deve ser tratada como requisito universal para clones. A arquitetura de transporte está em `docs/ELM327_ENGINEERING_PLAYBOOK.md`; o inventário de fórmulas/PIDs e a auditoria de desempenho estão em `docs/RELATORIO_PIDS_E_FORMULAS.md`.

## Validação CI

Este commit é um gatilho técnico para confirmar que o workflow `.github/workflows/ci.yml` continua disparando em `push` e executando a validação e o build Android nativo.

O teste de transporte Bluetooth usa `connectionType: delimited`, `delimiter: \r` e buffering local até o prompt `>`. Esse contrato corresponde ao código atual e é protegido pela regressão automatizada.

## Execução em segundo plano

Após a ECU ser validada pelo gate real 010C -> 41 0C, o aplicativo inicia o monitoramento persistente de GPS pelo Foreground Service do Android usando expo-location. A tarefa global em expo-task-manager continua alimentando o mesmo GpsTracker, enquanto o ciclo OBD mantém as consultas e o autosave da sessão.

Com a tela apagada, o objetivo é manter OBD + histórico + GPS em execução enquanto o Foreground Service estiver ativo. Isso não cobre force-stop/encerramento explícito do app nem garante comportamento idêntico entre fabricantes que impõem políticas próprias de economia de bateria.

O Android solicita localização em segundo plano para esse modo. A notificação persistente identifica que o diagnóstico do veículo está ativo.


## Aquisição OBD e desempenho

Os comandos OBD continuam serializados pela fila da sessão ELM327; não enviamos requisições simultâneas pela mesma ligação RFCOMM/K-Line. A descoberta reaproveita a sonda `010C`, segue apenas as páginas bitmap anunciadas e só publica um PID como operacional depois de uma resposta individual válida. A política de cadência fica versionada em `src/knowledge/polling_policy.json`: leituras principais primeiro, consultas lentas distribuídas por ciclo, telemetria auxiliar rotativa e logs CSV em lote. As configurações também oferecem os perfis `STANDARD` e `COCKPIT_PRIORITY`: o segundo reduz pela metade a cadência de consultas opcionais, sem alterar a frequência dos PIDs críticos ou criar consultas paralelas.

Essa é uma redução de trabalho redundante, não um benchmark de latência. O tempo real depende da ECU, do protocolo KWP/K-Line, do adaptador e do Bluetooth; a validação física e a CI no commit final continuam obrigatórias.


## Auditoria técnica baseada no histórico real — 2026-10-13

A revisão cruzou código, catálogos JSON, testes e o TXT de autosaves fornecido. Foram corrigidos pontos que afetam aquisição, interpretação de consumo e integridade do histórico:

- O TXT analisado continha **205 blocos** com **200 números de salvamento únicos** e cinco números repetidos (262–266) fora da ordem numérica. O histórico agora serializa operações concorrentes, deduplica números repetidos na leitura/exportação e grava o conteúdo normalizado no próximo autosave.
- Os cálculos estimados por MAF/MAP deixaram de assumir silenciosamente AFR/densidade de gasolina. A configuração ETANOL usa parâmetros aproximados de etanol; FLEX requer composição válida via PID 0152 ou a taxa diretamente medida pelo PID 015E. Sem evidência, o estimador retorna indisponível em vez de apresentar número enganoso.
- O serviço de viagem recebe mudanças da preferência de combustível em tempo real, sem reabrir o arquivo de configurações a cada PID.
- A gravação do banco de aprendizado e das confirmações de PID foi colocada em uma fila serializada fora do caminho crítico de aquisição. As respostas reais continuam a ser enfileiradas para log RAW/interpretado.
- Logs RAW e interpretados passaram a usar a mesma data **local do aparelho**, mantendo timestamps em ISO UTC. Isso evita separar a mesma sessão em arquivos de dias diferentes perto da meia-noite.
- O integrador de combustível ignora amostras com timestamp antigo sem retroceder a referência temporal.
- Os contratos JSON de Bluetooth e polling foram versionados; testes de regressão cobrem os novos limites, seleção de combustível, composição FLEX, timestamps e concorrência do histórico.

### Base da pesquisa de desempenho

- [python-OBD — conexões assíncronas](https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md): mantém um loop de atualização e retorna a última resposta conhecida à interface sem bloquear a chamada de visualização.
- [OBDLink — logging e taxa de atualização](https://support.obdlink.com/support/solutions/articles/43000709894): cada PID adicionado ao logging disputa tempo de aquisição; o modo de amostragem por frame PID registra no ritmo real de atualização.
- [Car Scanner — otimização da velocidade](https://www.carscanner.info/optimizing-connection-speed/): lista extensa de sensores reduz a frequência de cada um. As otimizações de até 6× mencionadas são específicas de CAN e não foram transplantadas para a K-Line da Meriva.

**Limite da validação:** esta rodada não tem uma nova medição cronometrada no Meriva/ELM327 físico. A CI é necessária para validar TypeScript, testes e build nativo; a avaliação física deve comparar os mesmos PIDs, adaptador, motor e condição de conexão antes/depois.


### Throttle do autosave de telemetria

As últimas leituras em memória são atualizadas a cada resposta; mudanças contínuas de RPM/velocidade não regravam todo o autosave e o histórico TXT a cada ciclo. A persistência ordinária por PID fica limitada a uma vez por 10 segundos; PID novo e mudanças de status/unidade/origem são persistidos imediatamente. Ao sair para background, o app compara o fingerprint do estado para descarregar também valores em memória que ainda não venceram a janela. A fila CSV continua preservando cada amostra real.

  
## Qualidade temporal das evidências diagnósticas

O motor de diagnóstico local usa somente observações numéricas com fonte REAL_OBD e timestamp recente. Por padrão, leituras PID com mais de **10 segundos**, timestamp inválido ou timestamp mais de **1 segundo no futuro** são excluídas das hipóteses baseadas em sensores. O contador blockedStaleObservations registra quantas leituras reais foram rejeitadas e é apresentado na Central de Saúde, no Laboratório e no relatório TXT do diagnóstico Bluetooth.

Esse bloqueio é uma proteção de qualidade dos dados — não uma falha do veículo. Um PID antigo não prova que a condição continua presente. A ausência de hipótese também não certifica que o motor está saudável: a Central de Saúde mostra DADOS INSUFICIENTES quando não há grupo recente de STFT+LTFT (0106+0107) nem MAP (010B). DTCs atuais lidos da ECU seguem o fluxo próprio de status, enquanto registros históricos/inativos continuam sem gerar falha atual.

A janela está configurada em src/knowledge/diagnostic_rules.json. A decisão segue a abordagem explicável por evidências e leituras recentes documentada no [OBDvis](https://github.com/Joost-vanAndel/OBDvis). O aplicativo agora inclui monitores de prontidão pelo Mode 01 PID 01 e leitura ampliada de freeze frame pelo Mode 02, com validação do bitmap de PIDs suportados e do número do quadro. Mode 06 continua como evolução futura: só deve ser implementado com tabelas de testes e suporte da ECU comprovados.


## Prontidão, freeze frame, relatórios e consulta manual de PIDs

### Monitores de prontidão de emissões (P1)
A tela Laboratório permite ler o **Mode 01 PID 01** sob demanda. O relatório separa MIL acesa/apagada, contagem de DTCs informada pela ECU e estado dos monitores suportados: pronto, incompleto ou não suportado. Bytes C/D são interpretados considerando o tipo de ignição informado pela ECU; bits cuja interpretação varia por revisão da norma são exibidos com descrição neutra. Uma resposta ausente ou inválida é N/D, nunca “sem falhas”.

### Freeze frame ampliado (P2)
A leitura **Mode 02** é explicitamente iniciada pelo usuário, não adicionada à varredura normal de DTCs, para evitar nove consultas extras em cada varredura na K-Line. Primeiro é lido o DTC/quadro; em seguida o aplicativo solicita o bitmap de PIDs de freeze frame e só consulta parâmetros marcados como suportados. Cada resposta precisa corresponder ao mesmo número de quadro. Os parâmetros tentados incluem carga, ECT, STFT/LTFT, MAP, RPM, velocidade, IAT e posição da borboleta. Valores ausentes permanecem N/D com razão; não são transformados em zero. O snapshot completo é associado ao DTC correspondente no histórico TXT já existente, mantendo a leitura de registros legados sem o campo JSON.

### Resumo técnico por viagem (P3)
O relatório de viagens apresenta mínimo, média amostrada e máximo de velocidade/RPM, além das estatísticas de temperatura já existentes. Os valores são calculados apenas a partir de pontos temporais válidos armazenados (cadência esparsa), com contagem de amostras e indicação de cobertura. A máxima de velocidade registrada pelo recorder continua separada da máxima vista na amostragem; não se promete que uma média de pontos a cada dez segundos seja a média instantânea de todo o trajeto. Campos sem leituras ficam N/D.

### Histórico de evidências (P4)
Quando a aquisição automática tem hipóteses diagnósticas com evidências atuais, o serviço registra um histórico diário JSON e TXT em MERIVA_SMART/DIAGNOSTIC_HISTORY. A tela Central de Saúde mostra hipótese, contexto operacional, score/confiança, a sequência temporal do score (sparkline), fontes, evidências, próximos testes e primeira/última observação em horário local e UTC. Os pontos de tendência são adicionados no máximo uma vez por minuto. Repetições no mesmo contexto são agrupadas por até cinco minutos e a contagem é limitada a uma observação por minuto, para evitar que o ciclo rápido de interface infle artificialmente a persistência. O histórico registra evidências e hipóteses, não comprova falhas independentes.

### Consulta manual (catálogo de PIDs)
O campo de PID do Laboratório abre uma lista pesquisável do catálogo local. PIDs descobertos como suportados pela ECU aparecem primeiro; cada item mostra código, nome, descrição, unidade e situação de suporte conhecida. Ao escolher um item, o campo é preenchido e o botão **CONSULTAR PID** executa somente esse PID. A seleção do catálogo não garante que a ECU realmente responda: a resposta individual continua sendo validada.

**Limites:** novos PIDs, monitores e freeze frames dependem do suporte real da ECU/adaptador. As operações continuam serializadas; nenhum paralelismo foi adicionado à sessão ELM327/KWP-K-Line.
