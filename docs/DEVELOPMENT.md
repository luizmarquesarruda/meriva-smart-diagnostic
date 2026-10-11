# Desenvolvimento

## Primeiro setup

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run typecheck
npm test
```

## Android

```bash
npx expo prebuild --clean --platform android --non-interactive
npx expo run:android
```

O adaptador ELM327 deve estar pareado nas configurações do Android antes do teste.

## Teste Bluetooth

1. Abra o aplicativo com Bluetooth desligado.
2. Verifique a solicitação de ativação.
3. Conceda acesso a dispositivos próximos.
4. Ligue o Bluetooth.
5. Liste dispositivos pareados.
6. Confirme que o ELM327 aparece entre os dispositivos pareados.
7. Deixe o aplicativo escolher automaticamente o candidato e aguarde a inicialização AT.
8. Confirme o protocolo retornado por ATDP.
9. Execute um PID.
10. Verifique TX/RX, tempo e status.
11. Teste a descoberta de PIDs.
12. Leia os DTCs atuais.
13. Consulte o PID `012F` para nível de combustível e o PID `015E` repetidamente para confirmar a taxa medida em `L/h`, se suportado.
14. Confirme que o 012F só alimenta nível, reserva e autonomia quando a resposta é válida; a capacidade do tanque é dado de configuração/manual, não uma resposta do PID.
15. Confirme que a taxa 015E medida tem prioridade e que a integração rejeita dados inválidos e intervalos superiores a 30 s.
16. Quando 015E estiver ausente, verifique o fallback pelo MAF (`0110`) e, quando ele não permitir estimativa, MAP + RPM + IAT (`010B`, `010C`, `010F`). A origem estimada deve continuar distinguida da medição.
17. Trate o fallback como aproximação: AFR, densidade do combustível e eficiência volumétrica padrão não representam necessariamente gasolina/etanol na mistura real. Se os dados necessários forem inválidos, exiba N/D em vez de inventar consumo.

A recepção do Bluetooth deve ocorrer pelo listener de dados. O transporte não deve misturar `onDataReceived` com `available()/read()`.

## Teste GPS

1. Abra o aplicativo com a localização do Android ligada.
2. Conceda permissão de localização em primeiro plano.
3. Confirme que o cartão GPS mostra `ATIVO AUTOMÁTICO`.
4. Caminhe ou dirija em área aberta e confira velocidade, precisão e distância.
5. Desative a localização e confirme que o app informa a falha.
6. Volte de Configurações do Android para o app e confira a tentativa automática de recuperação.

O GPS fornece velocidade e distância filtrada, não litros. O consumo resulta da distância GPS dividida pelo combustível integrado; a taxa prioriza 015E medido e pode usar MAF/MAP estimado com rótulo explícito. Não digite litros manualmente para substituir uma leitura ausente.

### Teste do GPS em segundo plano

7. Depois de validar a ECU, confirme se o app solicita a permissão de localização em segundo plano e se a notificação persistente do Foreground Service aparece.
8. Apague a tela durante um percurso curto de teste e confira se o serviço continua recebendo posições, sem duplicar distância ao alternar entre foreground e background.
9. Negue a permissão em segundo plano ou simule falha na inicialização: o aplicativo deve informar que o monitoramento persistente não iniciou. Não trate esse cenário como GPS em segundo plano validado.
10. Faça um teste com o app encerrado/force-stop separadamente. A continuidade após force-stop não é garantida pelo Android e não deve ser critério de aceite obrigatório.

## Teste sem veículo

Use o transporte simulado somente para testes de software. Toda saída simulada deve permanecer marcada como simulação e não alimentar aprendizado real.

## Diagnóstico de falhas

Se Bluetooth funcionar mas o ELM não responder, o problema não deve ser apresentado como falha da ECU.

Se o ELM responder e a ECU não responder, registre a ausência de resposta.

Se a ECU responder mas o parser não reconhecer o PID, registre `VALOR NÃO INTERPRETADO`.

Se um PID não estiver na resposta de descoberta, não assuma que ele é suportado pela ECU.

## Testes automatizados

`npm test` cobre autosave, parser, DTC, descoberta de PIDs, serialização ELM, transporte Bluetooth por eventos, storage, GPS e integração da taxa de combustível OBD.

## CI

O GitHub Actions executa instalação, Expo Doctor, TypeScript, testes e montagem de um APK release standalone com Java 17.

A validação física do Bluetooth e do GPS continua exigindo um Android real.

Commits com `[skip ci]` não contam como CI executada. Registre separadamente testes adicionados, testes executados localmente, resultados de CI e ensaio físico. Não declarar sucesso de etapas que não foram executadas.
