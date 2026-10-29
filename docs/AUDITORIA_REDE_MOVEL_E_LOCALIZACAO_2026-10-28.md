# Auditoria — aproveitamento da rede móvel e localização Android

**Data:** 2026-10-28  
**Branch de trabalho:** `ui/cockpit-instant-consumption-20261027` (PR #96)  
**Escopo:** identificar dados de rede realmente disponíveis ao app e aproveitar a camada de localização sem contaminar distância, velocidade ou autonomia.

## Resumo direto

O app já lê o tipo de transporte de rede, a geração móvel informada pelo sistema (2G/3G/4G/5G), a disponibilidade estimada de internet e a indicação de conexão tarifada usando `@react-native-community/netinfo`. Também já atualiza o enriquecimento de cidade/clima quando a conexão volta e a cada 15 minutos, com cooldown e bloqueio de consultas sobrepostas.

O que faltava era tornar visível o estado dos provedores nativos de localização. A tela Conectividade agora consulta `expo-location` para apresentar separadamente: serviços de localização ligados/desligados, provedor GPS/GNSS e provedor de localização pela rede. A consulta é somente diagnóstica; não pede nova permissão nem muda o rastreador de viagens.

## O que a rede móvel pode fazer por nós

| Informação / sinal | Uso legítimo no Meriva Smart | Limite |
|---|---|---|
| Transporte ativo e geração móvel (4G/5G) | Mostrar conectividade real reportada pelo Android; decidir quando tentar novamente serviços online opcionais; registrar diagnóstico de conectividade. | Não revela latitude/longitude e não mede movimento do veículo. |
| Conectividade recuperada | Acionar a atualização online que já existe para cidade/clima; no futuro, pode disparar uma tentativa limitada de obter uma posição mais recente, sem criar um segundo watcher. | Não reiniciar Bluetooth, ELM327, fila serial, polling de PIDs nem sessão de viagem. |
| Provedor de localização pela rede disponível | Diagnosticar se o Android disponibiliza a fonte de localização baseada em rede. Pode ajudar na obtenção de uma posição aproximada e no primeiro posicionamento, conforme os serviços do sistema. | Disponibilidade não prova que uma amostra foi gerada por essa fonte, nem atesta sua precisão. |
| Provedor GPS/GNSS disponível | Mostrar se o sistema informa GPS disponível para solicitações de alta precisão. | Disponibilidade não garante fix válido; cada amostra continua passando pelos filtros atuais de precisão, tempo e movimento. |
| Sinal Wi-Fi quando fornecido pelo sistema | Apresentar o valor informado pelo NetInfo e tratar ausência como desconhecida. | Não inventar barras ou valores de sinal celular; a interface atual não recebe RSSI celular pelo NetInfo. |
| Dados de torres/células (CellInfo, ID de célula, dBm) | Possível investigação nativa Android separada se houver necessidade concreta de diagnóstico de rádio e uma análise de permissão/privacidade. | Não implementar por padrão: requer API nativa/permissões compatíveis, pode retornar dados em cache ou vazios e não substitui posicionamento validado. |

## Regras obrigatórias para GPS, velocidade e autonomia

1. **Não converter 4G/5G, potência de sinal ou identificador de torre em coordenada ou velocidade.** Esses dados não formam uma trilha de movimento confiável para cálculo de quilometragem.
2. **Manter o GPS de navegação como fonte de posição da viagem.** O rastreador existente usa `Accuracy.BestForNavigation`, rejeita precisão ausente/desconhecida ou acima do limite atual de 30 m, timestamps não válidos ou fora de ordem e deriva, e exige amostras consecutivas para confirmar movimento.
3. **Não fazer média/interpolação de localização aproximada para completar distância.** Quando não houver amostra válida, preservar a distância acumulada e indicar estado degradado/N/D; não fabricar distância para alimentar consumo em km/L.
4. **Usar a rede como gatilho, não como dado veicular.** Reconexão pode atualizar clima/localidade e, numa etapa futura, permitir uma única tentativa limitada de reacquirir a posição se o fix estiver velho. Qualquer nova tentativa deve compartilhar o rastreador existente, respeitar cooldown e evitar callbacks duplicados entre foreground e background.
5. **Sem permissões novas nesta mudança.** A tela consulta somente o estado dos provedores nativos e trata erros como não informado. A leitura de identificadores de célula fica fora do escopo.
6. **Offline-first.** Falha de dados móveis, mudança de 5G para 4G ou ausência de internet não pode interromper Bluetooth Classic/ELM327, a fila serial, o parser, o cálculo local ou a persistência.

## Correção aplicada nesta rodada

- Criado `src/network/locationProviders.ts` para normalizar os estados de serviços, GPS e localização pela rede. Booleanos ausentes ou malformados permanecem como “NÃO INFORMADO”, sem inferências.
- A tela `app/conectividade.tsx` passa a apresentar esses três estados e explica que disponibilidade do provedor não é prova de precisão nem de fonte da amostra.
- Criado `tests/locationProviders.test.js` cobrindo disponibilidade, provedor GPS sem rede, serviços desligados e dados desconhecidos.
- Incluída a nova suíte em `npm test`.
- Não alterados algoritmo de distância/autonomia, fluxo Bluetooth, permissões, dependências, versão Expo ou ciclo de amostragem de viagem.

## Estado de validação

A alteração está na branch da PR #96. A CI deve executar novamente no SHA resultante: gate anti-regressão, TypeScript, suíte completa e build APK Android. Não considerar concluído até esses jobs passarem no mesmo SHA. A consulta a provedores deve ser inspecionada em um APK instalado no Galaxy A06/Android 16; a CI sozinha não comprova a disponibilidade real dos provedores do aparelho.

## Estado real de telemetria em nuvem — revisão 2026-10-29

A árvore atual da branch não contém cliente de upload/sincronização de telemetria nem fila outbox persistente. Os nomes Bubble citados em versões anteriores de `docs/ARCHITECTURE.md` e `docs/BUBBLE_WORKFLOW_PORT.md` não apontam para arquivos existentes nesta branch. O cliente implementado de rede é usado para status NetInfo e consulta opcional de clima.

Consequência: o comportamento offline do diagnóstico local existe, mas não é correto dizer que leituras OBD/GPS/viagens são sincronizadas ou ficam enfileiradas para upload. Não foi criada uma fila sem consumidor/endpoints. Para implementá-la corretamente, primeiro definir o contrato do backend, modelo de autenticação, IDs idempotentes, política de expurgo e consentimento, e então testar persistência/replay sem acoplar falha da rede ao loop OBD.

## Documentação oficial consultada

- Android — leitura orientada a eventos do estado da rede: https://developer.android.com/develop/connectivity/network-ops/reading-network-state
- Expo — NetInfo, tipo de conexão, geração móvel e disponibilidade de internet: https://docs.expo.dev/versions/latest/sdk/netinfo/
- Expo — `getProviderStatusAsync()` e `LocationProviderStatus`, incluindo `gpsAvailable` e `networkAvailable`: https://docs.expo.dev/versions/latest/sdk/location/
- Android — permissões de localização aproximada/exata e controle do usuário: https://developer.android.com/develop/sensors-and-location/location/permissions?hl=pt-br
- Android — `TelephonyManager.getAllCellInfo()`: https://developer.android.com/reference/android/telephony/TelephonyManager#getAllCellInfo()

**Conclusão:** aproveitar 4G/5G para manter os recursos online atualizados e ajudar a diagnosticar a camada de localização do Android é válido. Usar intensidade da rede ou dados de torre para produzir quilômetros, velocidade ou autonomia seria tecnicamente incorreto.