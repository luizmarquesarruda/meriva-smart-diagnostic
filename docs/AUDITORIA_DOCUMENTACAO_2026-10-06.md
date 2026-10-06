# Auditoria da documentação e correção da CI

Data: 2026-10-06

## CI 648

A CI 648 falhou em tests/gps.test.js:110. Expo Doctor 17/17 passou, TypeScript passou, os 12 testes de autosave passaram e as 17 regressões passaram. A falha ficou isolada no teste GPS.

O teste fornecia três posições, mas o algoritmo atual precisa de três segmentos consecutivos para confirmar movimento. O primeiro fix só cria a referência. O teste foi corrigido para usar quatro posições válidas e timestamps monotônicos nas verificações de deriva.

## Auditoria documental

1. Bluetooth: seleção automática de candidatos pareados, sem exigir MAC ou seleção manual. O candidato só é aceito após ELM e 010C válidos.
2. Framing Bluetooth: contrato atual documentado como delimited + CR real + ascii.
3. GPS: três segmentos consecutivos, equivalentes a quatro posições válidas.
4. Combustível: 012F é a fonte absoluta de nível, litros, reserva e autonomia quando válido. 015E continua sendo taxa de combustível em L/h para integração do consumo. A boia física não é entrada do diagnóstico.
5. CI: APK release standalone, pois o workflow usa assembleRelease.
6. ELM327: default de conexão de 2 tentativas. O valor 0 continua disponível para modo infinito quando explicitamente configurado.
7. Documentos históricos foram corrigidos ou complementados quando contradiziam o estado atual.

## Referências externas conferidas

- Expo Location: watchPositionAsync opera em foreground; background requer mecanismo separado.
- react-native-bluetooth-classic: 1.73.0-rc.17 é a versão publicada como latest e suporta a série React Native 0.73.x ou superior na linha 1.70.x.
- AndrOBD: mantém separação entre conexão Bluetooth e estado OBD e registra casos de clones baratos com problemas no ATZ.
- python-OBD: usa o prompt > como fronteira de resposta e termina comandos com CR.

## Regra de manutenção

Todo documento operacional deve ser conferido contra código, package.json, workflow CI, teste automatizado e documentação externa da biblioteca nativa usada.

## Estado

Código, testes e documentação passam a usar a mesma definição para Bluetooth, GPS, combustível e CI. A validação física ainda é obrigatória para provar Android, ELM327 real e ECU da Meriva.