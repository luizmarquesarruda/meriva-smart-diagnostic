# Arquitetura

## Visão geral

```
                    +------------------+
                    |    Root Layout   |
                    | Bluetooth + GPS  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
      Bluetooth Manager                 GpsTracker
              |                             |
              v                             v
   BluetoothClassicTransport          GPS celular
              |
              v
        Elm327Session
          |       |
          v       v
    PID Discovery DTC
          \       /
           v     v
             Parser
                |
        RAW + Interpretado
                |
      +---------+---------+
      |         |         |
      v         v         v
     PID       DTC      Histórico
      |         |         |
      +---------+---------+
                |
          Autosave/Backup
```

## Camadas

### UI

`app/` contém as telas do aplicativo.

### GPS

`src/gps/` concentra o rastreador em primeiro plano, permissões, filtragem de precisão, cálculo de distância e conversão de velocidade.

O `GpsTracker` é singleton no runtime para não parar ao navegar entre telas. O cálculo de consumo recebe quilômetros do GPS e litros integrados a partir de uma taxa OBD válida. O PID 015E fornece L/h quando suportado; a integração usa o intervalo entre amostras e rejeita dados inválidos ou intervalos longos.

### Combustível OBD

`src/obd/fuelConsumption.ts` integra a taxa do PID 015E em litros consumidos. O integrador não fabrica combustível: sem amostras válidas, o acumulado permanece inalterado.

### OBD

`src/obd/` concentra transporte Bluetooth Classic, sessão ELM327, parser, definições de PID e descoberta.

A recepção Bluetooth usa o listener de dados como fonte única. A `Elm327Session` serializa comandos para evitar interleaving de respostas.

### Dados

`src/database/` contém persistência, DTC, banco de PIDs, aprendizado e configuração do veículo.

### Meriva

`src/meriva/` contém o estado persistido e o autosave.

### Storage

`src/storage/` controla quota, limpeza, backups e ciclos de condução.

### Tipos

`src/types/` contém contratos compartilhados. `DtcRecord` é definido uma única vez em `sourceTypes.ts`.

## Regra de confiança

O fluxo de dados mantém a origem explícita:

`REAL_OBD`, `SIMULACAO`, `CARSCANNER_BASELINE` e outros tipos definidos em `sourceTypes.ts`.

Somente dados reais podem alimentar o aprendizado real do veículo.

## Estado Bluetooth

O estado não deve ser resumido a "conectado". O diagnóstico precisa separar Bluetooth, ELM327 e ECU.

## Autosave

O autosave escreve primeiro em arquivo temporário, valida o conteúdo e só então atualiza o arquivo principal. O arquivo anterior é mantido como recuperação.

## Limite atual

A aplicação exige build nativo Android por usar Bluetooth Classic. Expo Go não é suficiente para validar o transporte.

A disponibilidade dos PIDs, a qualidade do GPS e a comunicação com a ECU da Meriva dependem do hardware físico e devem ser confirmadas no veículo.
