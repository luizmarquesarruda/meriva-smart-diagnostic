# Arquitetura

## Visão geral

```
UI (Expo Router)
      |
      v
Bluetooth Manager
      |
      v
BluetoothClassicTransport
      |
      v
Elm327Session
      |
      +--> PID Discovery
      |
      +--> PID Parser
      |
      v
Raw/Interpretado
      |
      +--> Banco de PIDs
      +--> DTC
      +--> Histórico
      +--> DNA da Meriva
      +--> Autosave/Backup
```

## Camadas

### UI

`app/` contém as telas do aplicativo.

### OBD

`src/obd/` concentra transporte, sessão ELM327, parser, definições de PID e descoberta.

### Dados

`src/database/` contém persistência e aprendizado.

### Meriva

`src/meriva/` contém o estado persistido e o autosave.

### Storage

`src/storage/` controla quota, limpeza, backups, ciclos de condução e importação de dados.

### Tipos

`src/types/` contém contratos compartilhados, inclusive a tipagem local da biblioteca Bluetooth.

## Regra de confiança

O fluxo de dados deve manter a origem:

`REAL_OBD`, `SIMULACAO` ou `REFERENCIA`.

Somente dados reais podem alimentar o aprendizado real do veículo.

## Estado Bluetooth

O estado não deve ser resumido a "conectado". O diagnóstico precisa separar Bluetooth, ELM327 e ECU.

## Autosave

O autosave escreve primeiro em arquivo temporário, valida o conteúdo e só então atualiza o arquivo principal. O arquivo anterior é mantido como recuperação.

## Limite atual

A aplicação exige build nativo Android por usar Bluetooth Classic. Expo Go não é suficiente para validar esse transporte.
