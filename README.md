# MERIVA SMART DIAGNOSTIC

Aplicativo offline de diagnóstico automotivo para Chevrolet Meriva Maxx 1.4 8V 2011/2012.

## Simulação local

A tela **Laboratório OBD** possui um modo de simulação local explícito para testar o parser e a interface sem ELM327.

A simulação:

- usa respostas fixas e identificadas como `SIMULAÇÃO LOCAL`;
- não representa uma ECU real;
- não confirma suporte de PID na Meriva;
- não deve alimentar histórico, telemetria ou aprendizado;
- deve ser desligada antes de qualquer coleta real.

Os dados simulados incluem exemplos para temperatura, STFT, MAP, RPM, velocidade, MAF, tensão e blocos de descoberta.

## Stack

- Expo
- React Native
- TypeScript
- Expo Router
- armazenamento local e offline

## Regra de dados

Sem transporte real ou resposta válida da ECU, o aplicativo mostra `SEM DADOS`, `NÃO RESPONDEU` ou `VALOR NÃO INTERPRETADO`. Nenhum valor simulado deve ser apresentado como diagnóstico real.
