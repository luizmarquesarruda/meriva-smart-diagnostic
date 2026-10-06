# GPS: controle de deriva e distância fantasma

## Problema

O GPS do Android pode entregar pequenas mudanças de latitude/longitude mesmo com o veículo parado. Se cada mudança for somada ao odômetro, o aplicativo parece estar andando sozinho.

O código anterior aceitava segmentos de apenas 5 m, permitia velocidade derivada a partir do deslocamento e confirmava movimento depois de duas amostras. Isso é permissivo demais para um carro parado.

## Referências pesquisadas

- expo-geopulse: usa filtro de Kalman, rejeição de outliers, detecção de movimento e controle adaptativo de GPS.
- react-native-background-geolocation: usa detecção de movimento e distanceFilter, evitando tratar GPS bruto como odômetro.
- react-native-background-location: recomenda evitar inscrições duplicadas de atualizações e oferece distanceFilter.
- react-native-kalman-location: demonstra filtragem de posições do Google Play Services com Kalman.

Estas referências foram usadas como direção arquitetural. O Meriva Smart Diagnostic não copia código dessas bibliotecas.

## Regra adotada no Meriva Smart Diagnostic

1. precisão do fix deve ser aceitável, no máximo 30 m quando informada;
2. deslocamento mínimo é 8 m;
3. quando há precisão declarada, o deslocamento precisa superar 1,5x a pior precisão entre os dois fixes;
4. velocidade derivada precisa ser de pelo menos 5 km/h;
5. a velocidade informada pelo próprio Android também precisa confirmar pelo menos 5 km/h;
6. são necessários 3 segmentos consecutivos confirmando movimento, o que exige 4 posições válidas consecutivas;
7. segmentos acima de 250 m são descartados;
8. speed stale ou ausência de speed não gera distância;
9. a velocidade exibida deixa de usar max(GPS speed, velocidade derivada), evitando inflar o valor com um fix inconsistente.

## Por que não usar um Kalman agora?

Um filtro Kalman completo é útil, mas aumenta bastante a complexidade e introduz parâmetros que precisam ser calibrados para o telefone e para o uso automotivo.

Primeiro eliminamos a causa mais clara do erro: transformar jitter em distância. Depois, se os testes reais ainda mostrarem ruído, podemos adicionar um filtro adaptativo de posição e velocidade.

## Próxima evolução

Para o modo de viagem automotiva, a melhor arquitetura é combinar:

- GPS para posição e rota;
- PID OBD 010D para confirmar movimento do veículo quando disponível;
- GPS como fallback quando 010D não responder;
- persistência de pontos brutos para auditoria;
- confiança por amostra;
- filtro adaptativo somente depois de medir o comportamento real do aparelho.

O GPS não deve ser tratado como um odômetro perfeito.

## Regra de teste 2026-10-06

O primeiro fix estabelece a referência. Três segmentos consecutivos precisam confirmar movimento antes de somar distância. Portanto, o teste automatizado de movimento usa quatro posições válidas.