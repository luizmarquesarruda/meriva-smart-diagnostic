# Desenvolvimento

## Primeiro setup

```bash
npm install
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
13. Consulte o PID `012F` para nível de combustível e o PID `015E` repetidamente para confirmar a taxa em `L/h` quando suportado.
14. Confirme que o 012F alimenta litros/reserva/autonomia somente quando válido e que o acumulado de consumo do 015E só aumenta com amostras válidas e intervalos aceitáveis.
15. Se a ECU não suportar `015E`, mantenha o consumo como indisponível, sem estimativa.

A recepção do Bluetooth deve ocorrer pelo listener de dados. O transporte não deve misturar `onDataReceived` com `available()/read()`.

## Teste GPS

1. Abra o aplicativo com a localização do Android ligada.
2. Conceda permissão de localização em primeiro plano.
3. Confirme que o cartão GPS mostra `ATIVO AUTOMÁTICO`.
4. Caminhe ou dirija em área aberta e confira velocidade, precisão e distância.
5. Desative a localização e confirme que o app informa a falha.
6. Volte de Configurações do Android para o app e confira a tentativa automática de recuperação.

O GPS mede velocidade e distância. O consumo deve vir do OBD/ECU. Para combustível, teste o PID `015E`: uma resposta válida é interpretada em `L/h` e integrada ao longo de amostras consecutivas. Não digite litros manualmente para substituir uma leitura ausente.

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
