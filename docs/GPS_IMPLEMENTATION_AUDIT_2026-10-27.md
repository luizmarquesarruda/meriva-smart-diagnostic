# Auditoria técnica do GPS — 2026-10-27

## Escopo e decisão

Revisão direcionada do GPS, cálculo de velocidade, distância de viagem, ciclo de vida foreground/background e interação com conectividade. A análise parte do Diário de Bordo até DB-171 e dos módulos `src/gps/gpsTracker.ts`, `src/gps/backgroundLocationTask.ts`, `src/gps/backgroundMonitoring.ts`, `src/trip/autoTripService.ts`, `src/trip/tripRecorder.ts`, `tests/gps.test.js` e `tests/backgroundExecution.test.js`.

A arquitetura continua sendo local-first: Android/Expo fornece os fixes; o app valida os fixes antes de calcular velocidade/distância. 4G/5G não é uma coordenada e não substitui o provedor de localização do Android. A disponibilidade de rede móvel/Wi-Fi pode fazer parte dos provedores combinados pelo sistema, mas o app nunca pode inventar localização quando não há fix atual.

## O que a documentação de outros apps faz

| Referência | Uso documentado | O que aproveitamos no Meriva Smart |
|---|---|---|
| Android Fused Location Provider | Entrega posições, velocidade, direção e outros atributos a partir dos provedores de localização disponíveis. Precisão e frequência variam conforme providers, permissões e parâmetros do pedido. A API recomenda acompanhar o ciclo de vida e remover updates quando deixam de ser necessários. | Continuar usando o watcher nativo/Expo como fonte única, validar precisão e timestamps, manter velocidade OBD como evidência de veículo quando disponível e impedir inscrições duplicadas. |
| Expo Location | `watchPositionAsync` fornece callbacks em foreground; localização de fundo usa `startLocationUpdatesAsync`/TaskManager e é sujeita a limites do sistema. `timeInterval` e `distanceInterval` são condições de pedido, não promessa de callback exato a cada segundo. | Manter um único dono do tracker, janela de frescor explícita, foreground service no Android para captura de fundo e tratamento de lacunas sem interpolar distância. |
| Strava — gravação e pausa automática | Usa GPS (e, em certos fluxos, acelerômetro) para decidir pausa/retomada. A documentação alerta que precisão GPS ruim pode disparar pausas/retomadas falsas; o usuário pode consultar o indicador de precisão e controlar a pausa. | Não converter um único valor de speed em movimento confirmado. Usar sequência de fixes, precisão e consistência do deslocamento; sinal fraco/ambíguo não soma distância. |
| OsmAnd — gravação de trilha | Expõe intervalo de log por perfil; a documentação em português informa padrão de 5 s e filtro de deslocamento mínimo. Intervalos curtos aumentam detalhe e consumo de bateria; longos reduzem consumo, mas perdem precisão da trilha. A gravação pode continuar em segundo plano. | Preservar filtro de deslocamento mínimo, frequência adequada ao uso automotivo, política explícita de segundo plano e testes de distância fantasma. Não aumentar frequência nem criar segundo watcher sem medir bateria/resultado. |
| Waze — resolução de falhas de GPS | Recomenda revisar permissão de localização e a precisão de localização do Android; alguns passos variam por versão/dispositivo. | Mostrar erro de permissão/serviço como estado explícito e orientar a configuração do sistema; não apresentar uma localização antiga como se estivesse atual. |

## Constatações no código

1. O tracker pede `Accuracy.BestForNavigation`, intervalo de 1.000 ms e distância de 1 m, e usa os mesmos critérios gerais para a captura foreground e o foreground service/background task. Estes valores são pedidos ao sistema, não garantias de cadência.
2. A política já exige precisão informada de até 30 m, timestamps estritamente crescentes, amostra fresca por 5 s e três segmentos consecutivos (quatro posições) para confirmar movimento. Esses guardrails devem continuar obrigatórios.
3. Encontrada uma incompatibilidade entre a cadência pedida e o limiar de movimento: o código exigia 8 m em cada segmento individual. A 10 km/h, um callback de 1 s representa cerca de 2,8 m, então o próprio critério descartava movimento urbano válido antes de acumular três segmentos.
4. A soma de distância e a confirmação de movimento precisavam separar duas perguntas: cada segmento é plausível para o intervalo observado? E a janela completa percorreu deslocamento líquido acima do limite de precisão? Usar só o comprimento individual ou só a soma da trilha pode respectivamente rejeitar baixa velocidade ou somar zigue-zague.
5. `autoTripService` já verifica a frescura da velocidade GPS antes de usá-la como fallback, e prioriza velocidade OBD válida quando disponível. A distância segue sendo produzida pelo tracker; o gravador de viagem rejeita amostras com timestamp repetido/fora de ordem.
6. O estado de rede não deve ser usado como fonte de coordenadas. Não se deve disparar polling de localização agressivo em cada alternância 4G/5G: as atualizações devem permanecer sob o provedor do Android, e a amostra deve ser considerada N/D quando não fresca.

## Alteração aplicada nesta branch (GPS-172)

- Substituído o requisito de 8 m **por segmento** por um piso de deslocamento adaptado ao intervalo, sem dispensar velocidade derivada válida e confirmação de speed do provedor/OBD.
- Movimento só se torna confirmado depois de ao menos três segmentos válidos (quatro posições) e de deslocamento líquido da janela acima da margem orientada pela precisão.
- Rejeitados explicitamente segmentos acima de 250 m; deixam de contribuir para o contador de movimento ou para distância.
- Fix inválido/sem precisão aceitável quebra a sequência de segmentos, zerando candidatos pendentes sem apagar a distância já confirmada.
- `src/trip/autoTripService.ts` observa mudanças do NetInfo, incluindo `cellularGeneration`. Se a rede retorna/muda e o último fix já venceu, pede um fix pontual ao provedor Android/Expo. O pedido tem timeout de 8 s e cooldown de 30 s; não inicia um segundo watcher. `handleLocation` descarta timestamp futuro, e um retorno antigo não pode ser promovido a posição atual.
- Testes novos cobrem movimento de 10 km/h em callbacks de 1 s e fixes com speed positivo em zigue-zague curto, que não podem gerar distância.

## Testes de aceitação

- Primeiro fix só cria referência; não soma distância.
- Três segmentos consecutivos com precisão aceitável e velocidade compatível (quatro posições válidas) podem confirmar movimento real em baixa velocidade quando o deslocamento líquido supera a margem de precisão.
- Zigue-zague curto, GPS jitter, speed ausente, precisão desconhecida/inaceitável, coordenada inválida, timestamp futuro ou fora de ordem e lacunas acima de 5 s não adicionam distância.
- Segmento acima de 250 m é rejeitado e reinicia a sequência de movimento.
- Uma amostra de velocidade GPS fica obsoleta após 5 s sem novo fix; não pode alimentar painel/viagem como velocidade atual.
- Após transição de rede/geração celular, a consulta pontual só ocorre se o fix venceu; fix fresco, retorno antigo, falha e cooldown não podem acrescentar distância nem disparar consulta duplicada.
- Sem permissão, serviço de localização ou fix confiável, o app mantém OBD local disponível e mostra indisponibilidade GPS; não simula localização nem depende de internet para diagnóstico.
- Background Task/Foreground Service tem um único proprietário e não deve duplicar callbacks ou somar a mesma distância duas vezes.
- Executar `npm run gate:baseline`, `npm run typecheck`, `npm test` e build Android no mesmo SHA. O teste físico no Galaxy A06 ainda deve comparar distância GPS com um percurso/odômetro conhecido.

## Referências consultadas

- Android Developers — Request location updates: https://developer.android.com/develop/sensors-and-location/location/request-updates
- Android Developers — Optimize location use for battery life: https://developer.android.com/develop/sensors-and-location/location/battery/optimize
- Android Developers — Optimize location use for real-world scenarios: https://developer.android.com/develop/sensors-and-location/location/battery/scenarios
- Expo — Location API / foreground and background updates: https://docs.expo.dev/versions/latest/sdk/location/
- Strava Help Center — Como registrar uma atividade e interpretar a precisão GPS: https://support.strava.com/pt-BR/articles/15402137-como-faco-para-registrar-uma-atividade-no-strava
- Strava Help Center — Problemas de pausa automática: https://support.strava.com/pt/articles/15401874-como-posso-resolver-os-problemas-relacionados-com-a-pausa-automatica
- OsmAnd — Gravação de Viagem: https://www.osmand.net/pt/docs/user/plugins/trip-recording/
- Waze Help — Permitir uso do GPS e precisão de localização no Android: https://support.google.com/waze/answer/6083679?hl=pt-br

## Limites da evidência

Esta revisão aplica os comportamentos documentados como princípios de desenho; não copia código proprietário dos apps citados nem afirma conhecimento de algoritmos internos não publicados. O código e os mocks conseguem demonstrar o comportamento de lógica, mas só um percurso real confirma a precisão de GPS, o impacto da economia de bateria do Samsung e a qualidade de posição do aparelho.
