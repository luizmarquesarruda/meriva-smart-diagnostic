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

`app/` contém rotas separadas para splash/inicialização, cockpit, Bluetooth, conectividade, Saúde/DTC, Laboratório/consulta PID, Dados/telemetria, Viagens, Mais recursos, configurações, veículo, manutenção, aprendizado, armazenamento e testes de sensores. A lista de arquivos em `app/` é a referência operacional para o inventário de telas; não agrupar rotas distintas numa contagem fixa de áreas.

O cockpit prioriza consumo e autonomia e não repete o resumo de DTC; códigos e estado diagnóstico detalhado pertencem à tela Saúde. Protocolo, respostas brutas e detalhes de engenharia pertencem ao Bluetooth/Laboratório.

A interface usa um layout responsivo comum em `src/ui/midLayout.ts`. Em retrato, as informações ficam empilhadas; em paisagem, métricas e ações ocupam a largura disponível. Dados RAW e informações de engenharia ficam escondidos em detalhes técnicos para não poluir a tela de uso diário.

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

`src/database/maintenanceStorage.ts` mantém o plano de manutenção, quilometragem e abastecimentos manuais em `MANUTENCAO/registros.json`. Esses abastecimentos são registros administrativos e não alimentam telemetria OBD, consumo integrado ou autonomia.

### Meriva

`src/meriva/` contém o estado persistido e o autosave.

`src/database/merivaManual.ts` contém somente especificações confirmadas no Manual do Proprietário 2012. Elas servem para configurar o veículo e cálculos físicos, como a capacidade de 56 L do tanque. Não criam PIDs, não substituem a ECU e não confirmam protocolo.

### Storage

`src/storage/` controla quota, limpeza, backups verificados, restauração com cópia de segurança/rollback e ciclos de condução. Backups e quebra de armazenamento incluem `MANUTENCAO`; limpeza automática continua limitada a `LOGS` e `LEITURAS`.

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


## Inicialização e splash screen nativa

A tela nativa de abertura usa `assets/splash.png`, PNG transparente versionado, explicitamente referenciado pelo plugin `expo-splash-screen` em `app.json` (largura de 280 dp, fundo `#07111f`, `resizeMode: contain`). A configuração `expo.splash` legada aponta para a mesma imagem. A splash nativa é distinta da primeira tela React Native. O gate de baseline valida caminho/configuração/assinatura PNG e a CI valida a compilação; a inicialização fria instalada em dispositivo ainda exige inspeção visual separada.


## Rede móvel e integração em nuvem — estado verificado

A aplicação usa `@react-native-community/netinfo` para apresentar conectividade e `src/weather/` para enriquecimento opcional de localização/clima. A conectividade 4G/5G não alimenta as fórmulas OBD, velocidade ou distância.

**Integração de telemetria em nuvem não está implementada nesta branch.** No inventário do repositório não existem `src/cloud/bubbleWorkflowContract.ts`, `src/cloud/bubbleWorkflowClient.ts` nem `docs/BUBBLE_WORKFLOW_PORT.md`, apesar de versões anteriores desta documentação os citarem. Não pressupor que login/sincronização Bubble, outbox ou fila persistente de uploads esteja disponível.

Qualquer integração futura precisa definir endpoint/schema versionados, autenticação de usuário por credenciais de escopo mínimo, IDs de evento idempotentes, retenção/consentimento, timeout, política de retry com backoff, fila local durável e mecanismo de descarte/retentativa. A fonte operacional continua local; indisponibilidade de rede não pode parar Bluetooth/ELM327, GPS local, diagnóstico, cálculos ou autosave.
