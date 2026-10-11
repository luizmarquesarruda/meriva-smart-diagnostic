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

`app/` reúne as principais áreas de uso do aplicativo, incluindo:

1. **Início**: autonomia estimada, estado OBD/GPS, consumo, falhas e viagem atual.
2. **Diagnóstico OBD**: conexão ELM327, consulta de PID, DTC e detalhes técnicos.
3. **Histórico e dados**: espaço usado, limpeza e manutenção dos dados.
4. **Viagens**: histórico e resumo apenas dos ciclos `REAL_OBD`.
5. **Configurações e armazenamento**: preferências, manutenção, backup e exportação de dados.

A interface usa um layout responsivo comum em `src/ui/midLayout.ts`. Em retrato, as informações ficam empilhadas; em paisagem, métricas e ações ocupam a largura disponível. Dados RAW e informações de engenharia ficam escondidos em detalhes técnicos para não poluir a tela de uso diário.

### GPS

`src/gps/` concentra o `GpsTracker`, permissões, filtragem, cálculo de distância e conversão de velocidade. O singleton serve tanto o watcher foreground quanto a tarefa global `expo-task-manager`; quando o monitoramento persistente inicia, o watcher foreground é encerrado para evitar callbacks e distâncias duplicados.

A distância só acumula posições com precisão declarada de até 30 m, segmentos plausíveis e evidência de velocidade reportada pelo GPS ou pelo PID OBD 010D. A diferença de coordenadas sozinha não confirma movimento. O serviço tenta iniciar o Foreground Service após validar a ECU, mas a continuidade com tela apagada depende de permissões, build nativa e políticas de bateria Android; não há garantia após force-stop.

### Combustível OBD

`src/obd/fuelConsumption.ts` integra uma taxa válida em L/h entre amostras com intervalo positivo de até 30 segundos. O serviço prefere a taxa medida pelo PID 015E. Se indisponível, tenta uma estimativa pelo MAF (0110) e depois por MAP + RPM + IAT (010B + 010C + 010F). A estimativa MAP usa a cilindrada do perfil do veículo ou o dado de referência da Meriva (`MERIVA_MANUAL.engine.displacementCm3`, 1389 cm³), com hipóteses de AFR, densidade de combustível e eficiência volumétrica. A fonte é preservada como `MEASURED_015E`, `ESTIMATED_MAF`, `ESTIMATED_MAP` ou `MIXED`. Estimativa não equivale a medição; combustível flex e hipóteses fixas podem causar viés. Sem taxa válida medida ou estimada, o combustível consumido permanece zero e o consumo da viagem deve aparecer como N/D.

### OBD

`src/obd/` concentra transporte Bluetooth Classic, sessão ELM327, parser, definições de PID e descoberta.

A recepção Bluetooth usa o listener de dados como fonte única. A `Elm327Session` serializa comandos para evitar interleaving de respostas.

### Dados

`src/database/` contém persistência, DTC, banco de PIDs, aprendizado e configuração do veículo.

### Meriva

`src/meriva/` contém o estado persistido e o autosave.

`src/database/merivaManual.ts` contém somente especificações confirmadas no Manual do Proprietário 2012. Elas servem para configurar o veículo e cálculos físicos, como a capacidade de 56 L do tanque. Não criam PIDs, não substituem a ECU e não confirmam protocolo.

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
