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
6. Selecione o ELM327.
7. Conecte e aguarde a inicialização AT.
8. Confirme o protocolo retornado por ATDP.
9. Execute um PID.
10. Verifique TX/RX, tempo e status.
11. Teste a descoberta de PIDs.
12. Leia os DTCs atuais.

A recepção do Bluetooth deve ocorrer pelo listener de dados. O transporte não deve misturar `onDataReceived` com `available()/read()`.

## Teste GPS

1. Abra o aplicativo com a localização do Android ligada.
2. Conceda permissão de localização em primeiro plano.
3. Confirme que o cartão GPS mostra `ATIVO AUTOMÁTICO`.
4. Caminhe ou dirija em área aberta e confira velocidade, precisão e distância.
5. Desative a localização e confirme que o app informa a falha.
6. Volte de Configurações do Android para o app e confira a tentativa automática de recuperação.

O GPS mede velocidade e distância. Litros consumidos não devem ser inventados a partir de GPS.

## Teste sem veículo

Use o transporte simulado somente para testes de software. Toda saída simulada deve permanecer marcada como simulação e não alimentar aprendizado real.

## Diagnóstico de falhas

Se Bluetooth funcionar mas o ELM não responder, o problema não deve ser apresentado como falha da ECU.

Se o ELM responder e a ECU não responder, registre a ausência de resposta.

Se a ECU responder mas o parser não reconhecer o PID, registre `VALOR NÃO INTERPRETADO`.

Se um PID não estiver na resposta de descoberta, não assuma que ele é suportado pela ECU.

## Testes automatizados

`npm test` cobre autosave, parser, DTC, descoberta de PIDs, serialização ELM, transporte Bluetooth por eventos, storage e GPS.

## CI

O GitHub Actions executa instalação, Expo Doctor, TypeScript, testes e montagem de um APK debug com Java 17.

A validação física do Bluetooth e do GPS continua exigindo um Android real.
