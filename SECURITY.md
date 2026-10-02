# Segurança

## Relato de vulnerabilidades

Não publique tokens, chaves, credenciais, dumps com dados pessoais ou informações sensíveis em issues.

Para vulnerabilidades de segurança, abra um contato privado com o mantenedor do repositório antes de publicar detalhes técnicos.

## Regras do projeto

- O aplicativo não deve fabricar dados OBD.
- Respostas RAW devem ser preservadas quando uma leitura for registrada.
- Dados simulados devem ser identificados como simulação.
- Dados simulados não podem alimentar o aprendizado real do veículo.
- Credenciais e segredos nunca devem ser gravados no código-fonte.

## Bluetooth e OBD

O aplicativo usa Bluetooth Classic para comunicação com adaptadores ELM327. Uma conexão Bluetooth não significa que a ECU respondeu. O fluxo deve distinguir:

1. Bluetooth disponível;
2. Bluetooth ligado;
3. dispositivo conectado;
4. ELM327 respondendo;
5. ECU respondendo;
6. protocolo identificado;
7. PID interpretado.

Essa separação é obrigatória para evitar diagnósticos baseados em ausência de dados.
