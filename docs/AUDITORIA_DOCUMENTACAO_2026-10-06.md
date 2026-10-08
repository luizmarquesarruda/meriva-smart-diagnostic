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

## Atualização 2026-10-06 - Bluetooth Classic físico

O teste físico de 2026-10-06 revelou uma falha de concorrência no RFCOMM: o bloqueio de conexão existia apenas na instância do transporte, enquanto novas tentativas criavam novas instâncias. A documentação técnica foi atualizada no diário de bordo e o transporte passou a serializar tentativas nativas por endereço MAC.

Também foi removida a inicialização redundante do Bluetooth durante a descoberta de dispositivos pareados. O trace anterior mostrava duas chamadas `BLUETOOTH_READY_START` na mesma operação.

A regressão foi adicionada ao `tests/regression.test.js` para impedir duas tentativas nativas simultâneas para o mesmo endereço.


## Atualização 2026-10-06 - Framing ELM327 por stream

O framing Bluetooth foi revisado após o relatório físico das 13:33:45Z. O transporte deixou de usar CR como delimiter nativo e passou a usar delimiter vazio no modo `delimited` da `react-native-bluetooth-classic`.

A decisão segue a documentação da biblioteca: delimiter vazio permite entregar o conteúdo recebido sem segmentação por delimitador. O projeto então faz o próprio enquadramento usando o prompt `>` do ELM327.

O teste automatizado foi atualizado para impedir regressão para delimiter `\\r`. O trace também registra `RX_CHUNK` e hexadecimal dos bytes ASCII para observar exatamente como o ELM327 chega pelo RFCOMM.

A validação física continua pendente. O critério é observar uma resposta real `41 0C XX XX` para o comando `010C`.


## Atualização 2026-10-08 - retry Bluetooth finito e configurável

A implementação atual não usa mais o modo infinito exposto pela configuração antiga. O valor padrão passou a ser **20 tentativas**, com fallback seguro para 20 quando um estado legado armazenado contiver 0. A interface oferece limites finitos de 3, 10 ou 20 tentativas.

O `bluetooth_config.json` continua sendo a fonte da política-base de 20 tentativas e 8 segundos entre falhas. O `maxConnectionAttempts` efetivo pode reduzir esse limite por configuração, mas nunca reabre uma rodada externa indefinida.

A documentação anterior que registrava default 2 e modo infinito permanece como registro histórico de 2026-10-06; esta seção define o comportamento atual de 2026-10-08.
