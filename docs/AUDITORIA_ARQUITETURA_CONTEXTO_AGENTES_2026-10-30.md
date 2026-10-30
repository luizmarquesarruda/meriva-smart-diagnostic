# Auditoria de arquitetura, contexto e agentes — MERIVA SMART

**Data:** 2026-10-30  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Branch examinada:** `fix/elm-buffered-prompt-20261030`  
**SHA examinado:** `1feb108867d085b5c2bfe5cb1bf9d2fe7532c4bd`  
**PR:** [#98 — Remove OTA e endurece Bluetooth ELM327 e autonomia](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/98)  
**Método:** inventário recursivo do repositório, leitura dos módulos centrais e cruzamento de implementação, contratos, testes, documentação e CI. Esta é uma auditoria estática; não equivale a execução local nem a ensaio físico.

## 1. Resultado executivo

A arquitetura está organizada por domínios e possui contratos úteis para evitar mistura de responsabilidades: transporte Bluetooth, sessão ELM327, descoberta de PIDs, parser, telemetria, viagem/autonomia, GPS, persistência, diagnóstico e apresentação. O estado de conexão separa Bluetooth, ELM e ECU; a origem dos dados também é preservada.

Não foi encontrado agente de IA generativa ou agente remoto autônomo dentro do aplicativo. O que o projeto chama de inteligência é um conjunto de motores locais determinísticos: descoberta adaptativa de PIDs, regras diagnósticas, classificação de condições, perfil estatístico de aprendizado e testes de sensores. Isso é positivo para rastreabilidade, mas a interface e a documentação não devem sugerir que existe um agente LLM capaz de raciocínio aberto ou execução remota.

### Estado de validação no SHA examinado

- PR #98 aberta e mergeável, não mesclada.
- Workflow CI run `41073088871`.
- Job `validate`: **success**.
- Job `android-build`: **in_progress** no momento da consulta.
- O endpoint de status de commit não retornou status checks individuais.
- Nenhum APK foi considerado validado até o job de build concluir e o artefato ser associado ao mesmo SHA.
- Teste físico Galaxy A06 / SM-A065M / Android 16 + ELM327 real continua pendente.

## 2. Arquitetura e fluxo de controle

Fluxo principal observado:

```text
app/_layout.tsx
  ├─ permissões e ciclo de vida
  ├─ autoTripService (singleton)
  └─ rotas Expo Router
       └─ app/splash.tsx
            └─ sharedConnection
                 └─ bluetoothManager
                      └─ BluetoothClassicTransport
                           └─ Elm327Session (fila serial)
                                ├─ inicialização ELM
                                ├─ gate ECU 010C
                                ├─ bitmap / PID discovery
                                ├─ parser / DTC
                                └─ respostas RAW e interpretadas
                                     ├─ autoTripService
                                     ├─ liveTelemetry
                                     ├─ autosaveIntegration
                                     ├─ learningProfile / pidBank
                                     └─ CSV / histórico / backup
```

O fluxo de GPS é paralelo: `GpsTracker` singleton recebe posições em primeiro plano ou por `TaskManager`, filtra precisão, salto, timestamp e movimento, e publica distância/velocidade. O serviço de viagem combina distância GPS com combustível integrado a partir de OBD válido.

**Avaliação:** separação de camadas boa para o estágio atual. O ponto central de coordenação é `sharedConnection`; a sessão ELM serializa comandos e o serviço de viagem consome essa sessão, evitando múltiplos sockets ou consultas concorrentes no mesmo RFCOMM.

## 3. Contexto, estado e confiança dos dados

| Contexto | Fonte da verdade | Ciclo de vida | Avaliação |
|---|---|---|---|
| Estado Bluetooth/ECU | `sharedConnection` + `bluetoothState` | Memória da sessão | Separa link Bluetooth de resposta ECU; correto |
| Sessão ELM | `Elm327Session` | Conexão atual | Fila serial, timeout adaptativo e recuperação |
| PIDs suportados | Bitmap atual + resposta individual | Sessão/ECU | Cache só prioriza; não substitui confirmação atual |
| Telemetria ao vivo | `liveTelemetry` | RAM da sessão | Origem REAL_OBD e reset na troca de conexão |
| Nível de combustível | PID 012F | Atual até 30 s | Prioridade sobre fallback |
| Buffer de autonomia | Dez leituras válidas do PID 012F | Volátil, expira em 60 s | Relógio monotônico, reset na troca/perda da ECU; não persiste como leitura atual |
| Consumo | PID 015E integrado | Viagem | Só integra amostras válidas e intervalos aceitos |
| GPS | Expo Location | Runtime e serviço de localização | Fixes filtrados; não é substituto de litros ou ECU |
| Aprendizado | `learningProfile` | Arquivo local | Amostras reais separadas de seed e simulação |
| Diagnóstico | Regras + evidência atual | Cálculo local | Rejeita origem não real, amostras vencidas e inválidas |
| Autosave | Envelope JSON + temporário + cópia anterior | Persistente local | Validação e migração; não é banco relacional |
| Logs | CSV em fila | Persistente local | RAW e interpretado preservados |
| Rede/clima | NetInfo + provedor de condições | Opcional | Não interfere no caminho OBD |

A política de confiança é coerente: REAL_OBD, SIMULACAO, CARSCANNER_BASELINE e IMPORTADO não devem ser intercambiáveis. A ausência de dado não deve ser convertida em valor estimado sem rótulo explícito.

## 4. Agentes, serviços e controladores

| Componente | Papel real | Tipo | Parecer |
|---|---|---|---|
| `sharedConnection` | Coordena conexão, estado ECU, ciclo de vida e listeners | Orquestrador | Autoridade central adequada; evitar criar outro gerenciador paralelo |
| `BluetoothClassicTransport` | Socket RFCOMM, framing por prompt, limpeza e diagnóstico | Adaptador de infraestrutura | Camada crítica; timeouts nativos não cancelam Promises nativas, por isso o bloqueio de socket é necessário |
| `Elm327Session` | Inicializa ELM e serializa comandos | Controlador de protocolo | Responsabilidade bem definida |
| `discoverIntelligentPids` | Bitmap e confirmação individual de PID | Motor determinístico | Não é IA generativa; evidência e buffer limitados à execução |
| `autoTripService` | Polling OBD, GPS, combustível, viagem e autonomia | Serviço de domínio | É o principal orquestrador de dados em tempo real; preservar sua fila e geração de sessão |
| `GpsTracker` | Filtra posição, distância e velocidade | Serviço singleton | Separação de origem GPS/OBD correta |
| `autosaveIntegration` | Ponte OBD → logs → telemetria → aprendizado | Serviço de aplicação | Escritas de aprendizado são serializadas fora do caminho crítico |
| `autosaveManager` | Persistência, checkpoint e recuperação | Serviço de persistência | Mantém estado local; atenção a volume e migrações |
| `diagnosticEngine` | Avalia regras sobre evidência recente | Motor determinístico | Não diagnostica além dos dados que recebe |
| `sensorTestEngine` | Avalia amostras e faixas heurísticas | Motor determinístico | Resultado não certifica integridade física |
| `conditionsRefresh` | Atualiza clima/localidade com rede | Serviço opcional | Deve continuar isolado da aquisição OBD |
| Telas `app/*` | Apresentação e comandos do usuário | UI | Algumas telas fazem polling de estado por intervalo; manter cálculo fora da UI |

**Duplicidade de agentes:** não foi observada uma segunda sessão OBD deliberada no fluxo principal. A UI de Laboratório ainda pode criar sessão de simulação e manipular conexão compartilhada; esse caminho precisa continuar isolado por modo e coberto por testes para não concorrer com a sessão real.

## 5. Auditoria por módulo

### 5.1 Inicialização, navegação e layout
- Rotas encontradas: splash, cockpit, Bluetooth, conectividade, Saúde, Laboratório, Dados, Viagens, Mais, Configurações, Veículo, Manutenção, Aprendizado, Armazenamento e Testes de Sensores.
- `_layout` prepara permissões e inicia o serviço de viagem; a splash é responsável pelo início da conexão automática.
- GPS é opcional para o início OBD; negar localização não deve bloquear Bluetooth.
- Responsividade e tema compartilhado estão centralizados em `midLayout` e `theme`.
- **Risco:** evitar que telas criem timers, sessões ou cópias de regras de negócio próprias. O polling visual de 1 s deve permanecer apenas para atualização de apresentação.

### 5.2 Bluetooth Classic / RFCOMM
- Transporte usa stream sem delimitador artificial, ASCII, TX com CR e conclusão de RX pelo prompt real `>`.
- Há limite de buffer RX, descarte de cauda após o primeiro prompt e bloqueio após stream dessincronizado.
- Estado nativo indeterminado, timeout de escrita e desconexão pendente mantêm trava por endereço normalizado.
- Seleção automática de pareados e validação real 010C evitam aceitar qualquer dispositivo como ECU.
- **Pendente P0 de validação física:** Galaxy A06, Android 16, adaptador ELM327 real, RFCOMM, ATZ, protocolo e resposta 41 0C. A CI não valida rádio nem adaptador.

### 5.3 ELM327, parser, PIDs e DTC
- A sessão serializa comandos; ATZ é obrigatório, ATI é best-effort.
- A sonda 010C é o gate de resposta ECU.
- Descoberta consulta bitmaps em cadeia e confirma PIDs individualmente.
- Buffer de descoberta é limitado e local à execução.
- Parser preserva status e resposta; PIDs não interpretados não devem virar valores válidos.
- DTC tem parser, scanner e catálogo separados.
- **Risco residual:** clones ELM327 têm implementações diferentes; manter compatibilidade orientada por evidência e relatório RAW.

### 5.4 Telemetria e cockpit
- `liveTelemetry` aceita apenas REAL e timestamp válido, mantém séries limitadas por PID e é resetado na troca de sessão.
- Cockpit apresenta PIDs de acordo com a política JSON e idade máxima; DTC detalhado está na Central de Saúde.
- **Risco:** confirmar no aparelho legibilidade, clipping, rotação e atualização com dados reais; teste estático de layout não substitui inspeção visual.

### 5.5 GPS e execução em segundo plano
- `GpsTracker` é singleton e recebe posições de foreground/background.
- Filtros incluem coordenadas válidas, timestamp monotônico, precisão máxima de 30 m, segmento máximo, velocidade plausível e watchdog de fix vencido.
- Movimento exige três segmentos consecutivos, equivalentes a quatro posições válidas; o limite por segmento é escalado pelo tempo e a janela exige deslocamento líquido coerente.
- A velocidade OBD pode confirmar movimento, mas a origem exibida continua distinguível.
- **Pendente:** percurso real com comparação de distância GPS e odômetro conhecido, incluindo baixa velocidade, parada, retomada e tela apagada.

### 5.6 Rede móvel, provedores e clima
- NetInfo informa tipo de rede, geração celular e alcançabilidade; não fornece coordenada GPS.
- Expo Location pode usar provedores GPS/rede do Android; o app não deve converter sinal 4G/5G em coordenada, velocidade ou distância.
- Clima/localidade é enriquecimento opcional com intervalo e cooldown próprios.
- **Parecer:** não misturar rede móvel com cálculo OBD ou autonomia. A posição só é válida quando entregue pelo provedor de localização e aprovada pelos filtros.

### 5.7 Combustível, consumo, viagem e autonomia
- PID 015E é a taxa medida em L/h e alimenta integração temporal.
- MAF/MAP são fallback estimado, com restrições para FLEX e composição de combustível; não substituem silenciosamente o 015E.
- PID 012F é fonte absoluta de nível quando válido; leitura viva prevalece e o buffer temporário só entra após dez amostras reais.
- Buffer expira após 60 s, usa relógio monotônico e é apagado na troca/perda de sessão ECU.
- **Achado A-01 — P2: escopo de veículo inconsistente.** `vehicleConfig.ensureMerivaVehicleProfile()` normaliza/sobrescreve o perfil para Meriva Maxx, enquanto o texto anterior do README afirmava que o app permitia configurar diferentes veículos. Além disso, `fuelLevel.ts` fixa tanque em 56 L e reserva em 5 L. Isso é coerente com a referência do manual Meriva, mas não constitui arquitetura multi-veículo. A documentação foi ajustada para não prometer seleção de veículos ainda inexistente. Uma futura expansão exige usar a capacidade/reserva do perfil validado em todos os cálculos e criar migração/testes.
- **Pendente físico:** validar 012F e 015E na ECU real da Meriva, comparar litros/autonomia com abastecimento e consumo observados. O PID 012F pode ter quantização e resposta específica da ECU.

### 5.8 Persistência, histórico, backup e armazenamento
- Apesar do diretório `src/database/`, a persistência atual é baseada em arquivos locais JSON/TXT/CSV; não foi encontrada implementação SQLite.
- Autosave usa envelope versionado, arquivo temporário, validação, cópia anterior, migração e fila de escrita.
- CSV agrupa gravações; aprendizado e confirmações são serializados fora do ciclo crítico.
- Backup inclui diretórios de dados, verifica tamanhos e retém até cinco cópias.
- Limpeza automática se limita a LOGS e LEITURAS; CONFIG, VIAGENS, APRENDIZADO e BACKUP não são alvos automáticos.
- **Achado A-02 — P2: avaliar SQLite por evidência, não por moda.** JSON/TXT é simples e funciona para snapshots/configuração; CSV é adequado para exportação e logs append-only. Histórico crescente, consultas por período, concorrência e migrações podem justificar SQLite para eventos/viagens, mas não há motivo para migrar todo o armazenamento em bloco sem medir volume, latência e risco de migração. Preservar exportações e backups compatíveis.
- Testar restauração real de backup continua tão importante quanto criação.

### 5.9 Diagnóstico, aprendizado e testes de sensores
- Diagnóstico local usa regras JSON e exige evidência recente, real, válida e não derivada; DTCs históricos ou vencidos não devem acionar hipótese atual.
- Testes de sensores usam mínimo de amostras e faixas de plausibilidade explicitamente heurísticas.
- Perfil de aprendizado mantém estatísticas por condição e separa seed/REAL_OBD/SIMULACAO.
- **Parecer:** são motores determinísticos auditáveis, não agentes de IA autônomos. Não atribuir certeza OEM ou causalidade a uma hipótese estatística.

### 5.10 Permissões e Android
- Bluetooth Connect/Scan são solicitadas separadamente da localização; armazenamento privado não pede permissão ampla.
- Localização foreground é opcional para OBD; background é solicitada para monitoramento persistente.
- **Pendente:** validar fluxo de permissões em instalação limpa no Android 16, incluindo negar localização, negar background e Bluetooth bloqueado.

### 5.11 Configuração, catálogos e design system
- Catálogos de PIDs, DTC, fórmulas, unidades, faixas, testes de sensores, política de polling e Bluetooth ficam em JSON.
- Contratos JSON são verificados por testes.
- Tema, ícones e layout responsivo estão em `src/ui/`.
- **Risco:** validar schema e referências cruzadas de cada catálogo; uma chave válida isoladamente pode ainda apontar para PID/fórmula inexistente.

### 5.12 Build, CI e dependências
- CI executa npm ci, Expo Doctor, baseline, TypeScript, suíte e build Android standalone com Gradle/JDK 17.
- PR #98 remove EAS/OTA do fluxo operacional e mantém APK como artefato de CI.
- **Achado A-03 — P1: build final ainda pendente no SHA auditado.** `validate` passou, mas `android-build` estava em andamento. A validação só se fecha com os dois jobs verdes no mesmo SHA e APK disponível.
- **Achado A-04 — P2: dívida de plataforma.** Expo SDK 51, React Native 0.74.5 e `react-native-bluetooth-classic 1.73.0-rc.17` permanecem antigos/RC. Não atualizar durante esta correção Bluetooth sem baseline físico, matriz de compatibilidade e plano incremental.
- As APIs FileSystem atuais usam a superfície legada de Expo SDK 51. Migrar junto de atualização controlada do SDK, com teste de autosave, backup, restauração, CSV/TXT e dados já existentes.

## 6. Itens obsoletos e inconsistências

1. PR #98 remove `eas.json`, scripts EAS e configuração OTA; a branch também remove dependências relacionadas. O README foi atualizado nesta auditoria para descrever o fluxo real por APK/Gradle e para não prometer multi-veículo.
2. O slug Expo `smart-obd-diagnostic` foi preservado; não é obsoleto.
3. `plugins/withBluetoothLegacyPermissionLimits.js` permanece referenciado por `app.json`; não remover.
4. Backup, testes de sensores, catálogos JSON e módulos de GPS/OBD têm consumidores identificados; não foram removidos por nome ou aparência.
5. Não há cliente de telemetria em nuvem, fila de upload ou agente remoto nesta branch; não criar fila offline-first sem endpoint, autenticação, consentimento e contrato versionado.
6. Não há SQLite nesta árvore; o termo `database` identifica módulos de persistência, não um banco SQL.

## 7. Plano de correção e aceite

### P0 — antes de merge/distribuição
- Aguardar `android-build` no SHA final da PR #98.
- Conferir que o APK artefato foi produzido no mesmo SHA e instalar esse arquivo.
- Testar no Galaxy A06 / SM-A065M / Android 16: pareamento, seleção automática, RFCOMM, ATZ, ATDP, 010C → 41 0C, leitura 012F, leitura 015E e desconexão/reconexão.
- Repetir teste de GPS em percurso real e validar autonomia com abastecimento real.
- Não mesclar se CI falhar ou o diff não estiver reconciliado com main.

### P1 — robustez operacional
- Exercitar instalação limpa e permissões Android 12+.
- Validar tela apagada/background, retomada, perda de rede, perda de GPS e ECU sem resposta.
- Validar backup e restauração, integridade de CSV/TXT e migração de autosave.

### P2 — evolução arquitetural separada
- Decidir explicitamente se o produto será multi-veículo; se sim, remover a normalização forçada para Meriva e derivar tanque/reserva do perfil.
- Medir crescimento e consultas do histórico antes de escolher SQLite para viagens/eventos.
- Planejar atualização Expo/RN e biblioteca Bluetooth em etapas independentes, sem misturar com correção de conectividade.
- Adicionar validação de schema/referências cruzadas para catálogos JSON.

## 8. Conclusão

A estrutura atual é coerente para um aplicativo Android OBD com foco operacional no Chevrolet Meriva, com bom isolamento do transporte, sessão serial, parser, dados reais, GPS e persistência local. O principal risco imediato não é uma ausência de camadas, mas a validação ainda incompleta do hardware real e do APK no SHA final.

As correções da PR #98 não devem ser consideradas aceitas apenas porque `validate` passou. O build Android, o APK e o teste físico continuam gates independentes. As dívidas multi-veículo, SQLite e atualização de SDK devem ser tratadas como frentes planejadas e não misturadas à estabilização Bluetooth.
