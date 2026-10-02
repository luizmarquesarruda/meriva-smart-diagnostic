# Desenvolvimento

## Primeiro setup

```bash
npm install
npm run typecheck
npm test
```

## Android

```bash
npx expo prebuild
npx expo run:android
```

O adaptador ELM327 deve estar pareado nas configurações do Android antes do teste.

## Teste Bluetooth

1. Abra o aplicativo com Bluetooth desligado.
2. Verifique a solicitação de ativação.
3. Conceda acesso a dispositivos próximos.
4. Ligue o Bluetooth.
5. Liste dispositivos pareados.
6. Conecte ao ELM327.
7. Confirme a inicialização AT.
8. Execute um PID.
9. Verifique TX/RX e o status da resposta.

## Teste sem veículo

Use o transporte simulado somente para testes de software. Toda saída simulada deve permanecer marcada como simulação.

## Diagnóstico de falhas

Se Bluetooth funcionar mas o ELM não responder, o problema não deve ser apresentado como falha da ECU.

Se o ELM responder e a ECU não responder, registre a ausência de resposta.

Se a ECU responder mas o parser não reconhecer o PID, registre `VALOR NÃO INTERPRETADO`.

## CI

O GitHub Actions executa:

- instalação das dependências;
- TypeScript;
- testes automatizados.

A validação física do Bluetooth continua exigindo um Android real.
