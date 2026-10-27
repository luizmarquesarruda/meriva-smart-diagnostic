# GPS: controle de deriva e distância fantasma

## Problema

O GPS pode entregar mudanças de latitude/longitude mesmo com o veículo parado. Somar cada segmento bruto diretamente ao odômetro transforma deriva em distância fantasma.

O tracker do Meriva não trata o GPS como odômetro perfeito. Ele usa um watcher, valida coordenadas/timestamps/precisão, exige coerência entre velocidade derivada e velocidade informada, e só então integra os segmentos.

## Regra adotada no Meriva Smart Diagnostic

1. Coordenadas devem estar dentro das faixas geográficas e timestamp deve ser finito, positivo e estritamente crescente.
2. A amostra deve ter precisão conhecida e aceitável (até 30 m); precisão ausente/negativa não é evidência de fix preciso.
3. Uma amostra com mais de 5 s deixa de ser atual. Segmentos com lacuna acima de 5 s não sustentam movimento.
4. A velocidade derivada deve ser de pelo menos 5 km/h e até 220 km/h; quando disponível, a velocidade do veículo via OBD é a evidência preferencial.
5. A velocidade GPS informada também precisa ser compatível quando não há uma referência OBD válida.
6. São necessários ao menos três segmentos válidos consecutivos (quatro posições válidas). O primeiro fix serve apenas como referência.
7. O piso de deslocamento de cada segmento é adaptado ao tempo entre fixes: um segmento de ~2,8 m em 1 s pode corresponder a 10 km/h e não deve ser descartado apenas por ser menor que 8 m.
8. Antes de confirmar distância, a janela completa precisa ultrapassar o deslocamento líquido mínimo orientado pela precisão — no mínimo 8 m ou 1,5× a pior precisão entre os fixes, o que for maior.
9. Segmentos acima de 250 m são rejeitados e quebram a sequência; não podem entrar no acumulador pendente.
10. Fix inválido/quebra de precisão, velocidade incompatível ou lacuna zera os candidatos pendentes, mas não apaga distância previamente confirmada.
11. A velocidade mostrada não é o máximo entre speed do GPS e velocidade derivada; usa-se o speed validado do provedor (ou derivado somente quando permitido), sem inflar a leitura.

## Por que não aplicar um filtro Kalman imediatamente?

Filtros Kalman e outros filtros adaptativos podem ser úteis, mas acrescentam parâmetros que precisam ser medidos/calibrados no telefone e no uso automotivo. A primeira correção é remover o conflito lógico entre callbacks a cada segundo e exigir 8 m em cada segmento. Só adicionar outro filtro se os testes reais mostrarem deriva residual.

## GPS e rede 4G/5G

- O rastreador solicita atualizações ao provedor de localização do Android via Expo Location. O sistema combina os provedores disponíveis (por exemplo, GPS, Wi-Fi e rede celular) conforme permissões, configurações e sinal.
- 4G/5G não é uma coordenada e não garante um fix. A rede pode ajudar o provedor do sistema, mas o app não deve gerar latitude/longitude por conta própria nem trocar uma posição vencida por uma estimativa online.
- As opções `timeInterval: 1000` e `distanceInterval: 1` são pedidos ao sistema, não garantias de callback em exatamente um segundo ou a cada metro. Todo consumidor deve aplicar a regra de frescor.
- O app mantém um único proprietário do tracker. Não criar um segundo watcher na volta da rede: isso poderia duplicar callbacks e somar a mesma distância duas vezes.

## Background e bateria

- Foreground usa `watchPositionAsync`; background usa o task declarado no início do aplicativo e o serviço foreground Android quando permitido.
- Mudanças de tela não devem criar/remover watchers paralelos. A finalização consulta o estado do task nativo, não apenas um booleano JS.
- Alta precisão e callbacks frequentes são adequados a uma viagem ativa, mas têm custo de bateria. Não aumentar a cadência indiscriminadamente; validar o efeito em percurso real e em execução de fundo no Samsung.

## Regra de aceitação

- Quatro posições válidas consecutivas podem confirmar movimento após três segmentos quando a velocidade e o deslocamento líquido são coerentes.
- Movimento urbano de 10 km/h com aproximadamente 2,8 m por segmento de 1 s deve ser reconhecido quando a janela completa supera a margem de precisão.
- Uma sequência curta em zigue-zague, mesmo com speed positivo reportado, não gera distância se a posição final não confirma deslocamento líquido.
- Primeiro fix, speed ausente, baixa precisão, timestamp futuro/fora de ordem, stale >5 s, gap >5 s e salto >250 m não adicionam distância.
- CI automatizada não substitui o ensaio de percurso: instalar APK de SHA validado no Galaxy A06 e comparar distância GPS com percurso/odômetro conhecido.

## Fontes e documentação

- Android Developers — [Request location updates](https://developer.android.com/develop/sensors-and-location/location/request-updates)
- Android Developers — [Optimize location use for battery life](https://developer.android.com/develop/sensors-and-location/location/battery/optimize)
- Expo — [Location API, foreground/background and update options](https://docs.expo.dev/versions/latest/sdk/location/)
- Strava — [Registro de atividades e indicador de precisão GPS](https://support.strava.com/pt-BR/articles/15402137-como-faco-para-registrar-uma-atividade-no-strava)
- OsmAnd — [Gravação de viagem, intervalo e deslocamento mínimo](https://www.osmand.net/pt/docs/user/plugins/trip-recording/)
