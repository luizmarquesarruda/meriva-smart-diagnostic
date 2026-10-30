# MERIVA SMART

Repositório e linha de desenvolvimento: MERIVA SMART. O rótulo do aplicativo Expo permanece `Smart OBD Diagnostic`, genérico para permitir configurar diferentes veículos; o perfil Chevrolet Meriva é o foco de validação atual, não uma restrição do motor OBD.

As especificações físicas e de manutenção do perfil operacional atual são mantidas em `src/database/merivaManual.ts`, com referência ao Manual do Proprietário Chevrolet Meriva 2012. A seleção e o gerenciamento de múltiplos veículos ainda não estão implementados; o fluxo atual normaliza o perfil para Meriva Maxx.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não vira um valor inventado. No cockpit, a cidade e o bairro alternam em intervalos de 10 s quando os dois rótulos estão disponíveis; anomalia de temperatura mantém o indicador térmico em destaque.

O GPS do celular tenta iniciar ao abrir o aplicativo quando autorizado. Negar localização limita clima, velocidade/distância GPS e gravação de percurso, mas não deve impedir a conexão Bluetooth/ECU nem a consulta manual OBD. Ele fornece velocidade e distância em primeiro plano, mesmo quando a ECU não oferece o PID 015E. A gravação de litros e consumo depende de taxa de combustível OBD válida. Litros consumidos só entram no cálculo quando a ECU fornece uma taxa de combustível válida pelo PID OBD 015E. O GPS sozinho não mede litros. O aplicativo não aceita litros digitados manualmente na tela principal.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

### Inicialização e splash screen

A rota operacional `app/splash.tsx` é a entrada inicial: tenta conectar ao ELM327 pareado, valida uma resposta real da ECU e executa a descoberta determinística por bitmap na fila serial compartilhada. O cache de uma sessão anterior só prioriza os candidatos; a ECU atual anuncia suporte e precisa devolver resposta individual válida para cada PID operacional. A splash abre o cockpit após a descoberta, sem repetir cinco leituras de cada PID; as cinco amostras sequenciais permanecem no teste de sensores. A duração total, latência, status e resposta bruta dos comandos de descoberta ficam no diagnóstico Bluetooth (`PID_DISCOVERY_COMMAND_RESULT`/`PID_DISCOVERY_SUMMARY`). Em caso de falha de conexão, continua tentando com espera progressiva e, após tentativas repetidas, permite abrir o painel para configurar a conexão manualmente. Quando `autoConnectObd` está desativado nas configurações, pula as tentativas automáticas.

A splash nativa usa o asset transparente `assets/splash.png` e o plugin `expo-splash-screen` configurado explicitamente em `app.json` com fundo `#07111f`, largura de 280 dp e `resizeMode: contain`. A configuração legada `expo.splash` aponta para o mesmo PNG. O baseline confirma o caminho e a assinatura do arquivo; antes de publicar, ainda é obrigatório instalar um APK de release e validar a inicialização fria em Android real. O contrato é protegido por `tests/projectBaseline.test.js` e RG-18 em `docs/CONTRATO_ANTI_REGRESSAO.md`.

## Manutenção e abastecimento

A página **Mais recursos → Manutenção e abastecimento** registra a quilometragem do painel, histórico de óleo/filtro, revisão, fluido de arrefecimento, fluido de freio e rodízio dos pneus, com lembretes por km ou calendário. O modo de uso severo adota os intervalos de referência do manual do Meriva 2012. Abastecimentos manuais são guardados em arquivo local separado e não são tratados como telemetria real nem entram no cálculo de consumo OBD. Os prazos são lembretes e devem ser confirmados no manual aplicável ao veículo.

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

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação. Backups manuais em Configurações incluem BANCO, APRENDIZADO, DTC, CONFIG, LEITURAS, LOGS, VIAGENS e MANUTENCAO. A lista de restauração exibe somente snapshots com manifesto/tamanhos íntegros; restaurar desconecta a ECU, cria antes uma cópia do estado atual e substitui somente os diretórios presentes no snapshot.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android. O aplicativo escolhe automaticamente os candidatos pareados: primeiro nomes compatíveis com ELM/OBD e depois outros dispositivos Classic, aceitando somente o candidato que passa pela inicialização do ELM e pelo teste real 010C. A conexão usa Bluetooth Classic/RFCOMM e preserva o prompt > para o parser do ELM. O estado do rádio é revalidado antes de cada socket; se estiver desligado ou não puder ser confirmado, o fallback e os retries são interrompidos com erro explícito, sem iniciar outra conexão concorrente. Reative o Bluetooth no Android e tente novamente pelo painel.

## Build Android e distribuição

O fluxo de build usa Expo prebuild + Gradle na GitHub Actions e gera um APK standalone. Após `validate` e `android-build` passarem em um push para `main`, a CI publica automaticamente uma GitHub Release com o APK. O link estável para a versão mais recente é [Baixar Meriva Smart APK](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/releases/latest/download/meriva-smart-diagnostic.apk). Builds de PR continuam como artefatos temporários da CI e não são publicados como versão estável. EAS Build e atualização OTA não fazem parte do fluxo atual. No Android, o download pode ser iniciado pelo link; a instalação/atualização exige confirmação do usuário.

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run gate:baseline
npm run validate
npx expo prebuild --clean --platform android --non-interactive
cd android && ./gradlew :app:assembleRelease --no-daemon
```

O APK esperado é `android/app/build/outputs/apk/release/app-release.apk`. A CI deve concluir `validate` e `android-build` no mesmo SHA. APK compilado não substitui teste físico de Bluetooth/ELM327/ECU.

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


## Engenharia ELM327

A camada Bluetooth usa o transporte nativo do react-native-bluetooth-classic com `connectionType: delimited`, **delimiter vazio** (`delimiter: ''`) e `charset: ascii`. O aplicativo mantém um buffer local e conclui a resposta no prompt `>` do ELM327; os bytes que sobrarem depois do primeiro prompt no mesmo evento são registrados como cauda obsoleta e descartados para impedir que clones contaminem o próximo comando. O TX termina em CR. O termo RAW no projeto significa preservar TX/RX recebidos, não o modo de framing do socket.

A inicialização separa Bluetooth, ELM e ECU. A sonda real de referência da ECU é `010C -> 41 0C`; `ATI` é uma consulta best-effort e não deve ser tratada como requisito universal para clones. A arquitetura de transporte está em `docs/ELM327_ENGINEERING_PLAYBOOK.md`; o inventário de fórmulas/PIDs e a auditoria de desempenho estão em `docs/RELATORIO_PIDS_E_FORMULAS.md`.


## Execução em segundo plano

Após a ECU ser validada pelo gate real 010C -> 41 0C, o aplicativo inicia o monitoramento persistente de GPS pelo Foreground Service do Android usando expo-location. A tarefa global em expo-task-manager continua alimentando o mesmo GpsTracker, enquanto o ciclo OBD mantém as consultas e o autosave da sessão.

Com a tela apagada, o objetivo é manter OBD + histórico + GPS em execução enquanto o Foreground Service estiver ativo. Isso não cobre force-stop/encerramento explícito do app nem garante comportamento idêntico entre fabricantes que impõem políticas próprias de economia de bateria.

O Android solicita localização em segundo plano para esse modo. A notificação persistente identifica que o diagnóstico do veículo está ativo.


## Aquisição OBD e desempenho

Os comandos OBD continuam serializados pela fila da sessão ELM327; não enviamos requisições simultâneas pela mesma ligação RFCOMM/K-Line. A descoberta reaproveita a sonda `010C`, segue apenas as páginas bitmap anunciadas e só publica um PID como operacional depois de uma resposta individual válida. A política de cadência fica versionada em `src/knowledge/polling_policy.json`: leituras principais primeiro, consultas lentas distribuídas por ciclo, telemetria auxiliar rotativa e logs CSV em lote.

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
