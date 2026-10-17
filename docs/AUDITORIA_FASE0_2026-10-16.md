# Auditoria técnica Fase 0 — 2026-10-16

## Escopo e limitações
Auditoria somente leitura do branch `main`, feita por inspeção do código remoto. O clone local não estava disponível para executar TypeScript/Node; portanto nenhum teste de app foi declarado executado. A árvore consultada não contém `android/app/src/main/java`; não foi possível auditar módulo Java nativo nem confirmar serviço Android próprio de Bluetooth. A PR #49 está fechada e mesclada; a PR #59 está aberta em rascunho.

## Mapa arquivo → responsabilidade

| Arquivo | Responsabilidade observada |
|---|---|
| `app/index.tsx` | Tela principal, inicia o fluxo de conexão e integra estado do veículo/aprendizado. |
| `app/saude.tsx`, `app/laboratorio.tsx` | Interface de diagnóstico local e apresentação de hipóteses. |
| `app/viagens.tsx` | Interface de viagens e indicadores de consumo/distância. |
| `src/obd/bluetoothClassicTransport.ts` | Socket Bluetooth Classic, timeouts de conexão, listeners de dados/desconexão e diagnóstico de transporte. |
| `src/obd/bluetoothManager.ts` | Descoberta de dispositivos, inicialização de sessão e descoberta inicial de PIDs. |
| `src/obd/sharedConnection.ts` | Dono da conexão compartilhada, estado do enlace, monitor/keep-alive, recuperação e persistência ao desconectar. |
| `src/obd/elm327.ts` | Inicialização ELM327, fila serial de comandos, consulta PID, keep-alive e fechamento da sessão. |
| `src/obd/parser.ts`, `src/obd/pidDefinition.ts` | Parser de respostas e catálogo de definições de PIDs. |
| `src/obd/pidScanner.ts` | Descoberta por bitmask em 0100/0120/0140/0160. |
| `src/obd/dtcScanner.ts`, `src/obd/dtcParser.ts` | Leitura de DTC e tentativa de coleta do freeze frame. |
| `src/obd/liveTelemetry.ts` | Fluxo de telemetria e leituras ao vivo. |
| `src/obd/fuelConsumption.ts` | Integração de fluxo de combustível com delta de tempo e estimativas MAF/MAP. |
| `src/gps/gpsTracker.ts`, `src/gps/backgroundMonitoring.ts`, `src/gps/backgroundLocationTask.ts` | Coleta GPS, filtragem de precisão e tarefa de localização em segundo plano. |
| `src/meriva/autosaveManager.ts` | Persistência JSON, debounce/checkpoint, recuperação de envelope e ciclo de autosave. |
| `src/meriva/autosaveHistoryTxt.ts` | Histórico TXT de snapshots, deduplicação, limite de 200 e remoção de viagens CarScanner antigas na leitura. |
| `src/meriva/dailyObdHistory.ts` | Histórico diário de eventos/sessões OBD. |
| `src/meriva/autosaveTxtFormatter.ts` | Formatação de snapshot TXT, DTC, freeze frame e viagens. |
| `src/meriva/autosaveState.ts`, `autosaveTypes.ts`, `autosaveValidation.ts`, `autosaveMigrations.ts` | Estado persistido, contratos, validação e migrações JSON. |
| `src/database/learningProfile.ts` | Estatísticas de aprendizado local. Não é um modelo generativo. |
| `src/database/obdLogger.ts`, `csvLogger.ts`, `dtcManager.ts`, `pidBank.ts` | Registro OBD, CSV, DTC e catálogo/perfil de PIDs. |
| `tests/*.test.js` | Testes de regressão Node para telemetria, Bluetooth, autosave, GPS, viagens, combustível, DTC e motor de regras. |
| `.github/workflows/ci.yml` | Typecheck/testes e build APK em GitHub Actions. |

## H1–H9 — veredito por evidência

| Hipótese | Veredito | Evidência e conclusão |
|---|---|---|
| H1 — I/O de salvamento/GPS bloqueia leitura e KWP expira | **INCONCLUSIVA** | `src/obd/sharedConnection.ts:153-222` executa monitor/keep-alive e recuperação em callback assíncrono; `src/meriva/autosaveManager.ts:148-166` escreve, relê e copia o JSON em sequência. Não há medição de latência compartilhada nem teste físico que prove o bloqueio do laço ou expiração P3. O caminho de leitura e o de persistência precisam de instrumentação antes de atribuir causalidade. |
| H2 — socket cai, recuperação lenta ou reconexões/listeners concorrentes | **PARCIALMENTE CONFIRMADA** | `src/obd/bluetoothClassicTransport.ts:129-200` faz tentativas RFCOMM segura/insegura com timeout e trata sucesso nativo atrasado; `src/obd/sharedConnection.ts:94-222` protege a recuperação com flags e executa reconexão/backoff. Há mitigação explícita contra concorrência, mas não há evidência suficiente de que todas as corridas/listeners duplicados estejam eliminados. |
| H3 — timers JS param em background enquanto GPS continua, sem serviço foreground | **PARCIALMENTE REFUTADA** | `src/gps/gpsTracker.ts:126-187` e `src/gps/backgroundMonitoring.ts` usam tarefa de localização em segundo plano com notificação foreground do Expo Location. Não foi encontrado serviço Java próprio de Bluetooth no branch consultado. A coleta GPS tem suporte de background; a continuidade de polling OBD em segundo plano não está comprovada. |
| H4 — autosave TXT regravado sem truncamento e caminhos compartilhados | **PARCIALMENTE REFUTADA** | `src/meriva/autosaveManager.ts:62-66,148-166` grava JSON em `CONFIG/autosave.json.tmp`, valida o conteúdo e copia para `CONFIG/autosave.json`; `src/meriva/autosaveHistoryTxt.ts:17,115` e `src/meriva/dailyObdHistory.ts:26,135` usam caminhos separados para TXT de snapshots e histórico diário. Isso refuta que o autosave JSON e os dois históricos usem deliberadamente o mesmo caminho. A cópia não é rename atômico/fsync, e a integridade do arquivo histórico real ainda precisa do verificador. |
| H5 — combustível usa poucas amostras MAF e distância de outra fonte | **INCONCLUSIVA** | `src/obd/fuelConsumption.ts:27-32` integra taxa com delta de tempo e descarta intervalos acima de 30 s; `src/meriva/dailyObdHistory.ts:67` pode exportar combustível inválido como N/D. O log antigo contém combustível muito baixo e viagens sem consumo válido, mas a causalidade entre cobertura MAF e distância não foi provada por execução/replay do log de 16/10. |
| H6 — GPS sem filtro de salto ou velocidade congelada | **PARCIALMENTE REFUTADA** | `src/gps/gpsTracker.ts:78-80,309-366` tem filtro de precisão e compara amostras consecutivas; entretanto `accuracyM == null` é aceito como preciso e o comportamento de primeiro fix/saltos precisa ser confirmado por testes de replay. |
| H7 — timer ~15 s abre/fecha viagens e queda fecha viagem | **INCONCLUSIVA** | A auditoria localiza telemetria, GPS e histórico de viagens, mas não há evidência suficiente no código consultado para afirmar que um timer específico de 15 s causa todos os fechamentos. O caso exige busca completa do fluxo de segmentação e reprodução com relógio falso antes de editar. |
| H8 — DTC não relido por sessão e freeze frame vazio vira valores padrão | **PARCIALMENTE REFUTADA** | `src/obd/dtcScanner.ts:109-148` representa RPM/temperatura como `number | null` e mantém respostas brutas, em vez de exigir zero como fallback. A leitura de DTC no início de cada sessão e a associação do frame ao DTC precisam ser verificadas no fluxo integrador; o parser atual usa `020200`, `020C00` e `020500`. |
| H9 — 0101 não decodificado e polling fixo em sete PIDs | **PARCIALMENTE REFUTADA** | `src/obd/parser.ts:117+` contém interpretação específica do PID 0101 e `src/obd/pidScanner.ts:5,55-95` descobre bitmasks 0100/0120/0140/0160. Porém o catálogo `src/obd/pidDefinition.ts` precisa ser conferido com `src/knowledge/pids.json`; a presença da lógica especial não garante que o 0101 chegue ao decoder. O ritmo efetivo de polling não foi provado como dinâmico. |

## Verificador e divergência de evidência

Foi localizado no Library um arquivo de autosave de 2.725.564 bytes, nome `meriva_smart_autosave_history(8).txt`. A inspeção do conteúdo confirma timestamps de 11/10/2026 e não contém nenhum registro de 16/10/2026. Portanto, ele **não** é a fixture descrita no roteiro de 11–16/10 e não permite reproduzir a janela `2026-10-16T18:41` a `2026-10-16T19:04`. O verificador não deve produzir métricas fingindo que essa janela existe.

Com o arquivo disponível, uma análise preliminar independente encontrou 401 marcadores BEGIN, 404 END, 205 hashes de bloco únicos entre os 401 blocos parseáveis, 3 quebras de numeração e 3 retrocessos de Saved At; a versão revisada do verificador deverá reproduzir esses números antes de serem tratados como baseline formal. Esses valores são da cópia de 11/10–12/10 disponível, não do log declarado de 11–16/10.

## CI/build e repositório

- PR #49: fechada e mesclada; título “fix: preserve daily ECU sessions and keep screen awake”.
- PR #59: aberta em rascunho, branch `fix/ai-live-evidence-only-20261016`; não mesclada.
- Branch `main`: package declara Expo SDK 51 / React Native 0.74.5 e `npm run validate` executa TypeScript e testes Node.
- CI/build: **NÃO EXECUTADOS nesta auditoria**. A consulta remota de status do commit da PR #59 retornou lista vazia; não foi disparado workflow.
- Diretório Java Android: não aparece na árvore Git consultada; módulo nativo/foreground service Bluetooth: **NÃO AUDITÁVEL no estado atual do repositório**.

## Próximos passos por PR

1. PR de observabilidade/autosave: verificador, fixture real correta, metadados de build, integridade e fonte de dados.
2. PR de enlace/background: estados, fila de comandos, eventos de queda, serviço foreground nativo e teste de concorrência.
3. PR de viagens/combustível: replay da fixture, distância com fonte/cobertura, viagens imutáveis e consumo nulo quando indisponível.
4. PR de DTC/PIDs: revalidação por sessão, freeze frame válido, 0101 e polling baseado em bitmask.
5. PR de perfil/UX: build info, perfil Meriva, qualidade/frescor e layout automotivo.
