# Auditoria específica do histórico e da telemetria

**Data:** 2026-10-26  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Branch de pesquisa:** `research/obd-methods-ui-architecture-20261026`  
**Snapshot de implementação inspecionado:** `main` em `02773b71ca9bd428b832d53a386655dd80acd80b`  
**Escopo:** rastreamento de persistência, viagens, amostras, logs CSV, histórico TXT, exportações, DTC, retenção, backup e cobertura de testes.  
**Restrição cumprida:** somente leitura e documentação. Não foram alterados arquivos de implementação, telas, fórmulas, configuração, dependências ou testes. Nenhuma PR foi criada ou mesclada; nenhum teste/CI foi executado nesta auditoria.

## 1. Resumo executivo

O código tem proteções relevantes já implementadas: autosave JSON com validação e cópia anterior, limitação do TXT de autosave a 200 snapshots, deduplicação de IDs antigos, fila de escrita para o índice de viagens, verificação do snapshot temporário de viagens, gravação CSV em lote, fila limitada com contador de perdas e limpezas limitadas a logs/leituras descartáveis.

A auditoria identificou, no entanto, pontos de integridade e crescimento que devem ser resolvidos ou quantificados antes de decidir pela adoção de SQLite:

1. **Exportação CSV pode divergir da tela quanto à confiabilidade de consumo.** A tela mostra `N/D` para viagens sem evidência suficiente; o exportador escreve o número armazenado, inclusive `0`, e omite o indicador `fuelDataValid`. Isso é uma inconsistência comprovada no código.
2. **O histórico de viagens não tem limite explícito por número de ciclos, tamanho ou idade.** O índice JSON, a cópia anterior, o autosave e backups conservam dados sobrepostos. A política de cota não remove viagens nem exportações para recuperar espaço.
3. **O CSV diário tem custo crescente de gravação.** Cada flush de arquivo existente lê e reescreve o conteúdo completo por limitações da API atualmente instalada. É dívida técnica já documentada no DB-130; a tentativa anterior de usar uma opção `append` não compatível com a versão instalada foi revertida.
4. **Há leituras antigas no snapshot operacional exportado sem estado explícito de obsolescência.** O timestamp permanece visível, mas um consumidor pode interpretar a seção `LAST READINGS` como atual sem calcular a idade.
5. **Dois caminhos de leitura de DTC divergem ao confirmar ausência de códigos.** A varredura completa reconcilia códigos antigos para `INACTIVE` somente quando a resposta do serviço 03 é válida; a rotina `readCurrentDtcs`, diante de uma resposta válida sem códigos, preserva a lista anterior sem marcar os códigos como inativos.
6. **Um artefato de autosave fornecido para análise não corresponde à forma compacta esperada do código atual.** Ele tem 516 blocos e IDs repetidos, mas a implementação atual deduplica e limita a saída a 200, coberta por testes. O artefato deve ser tratado como legado ou cópia não normalizada até ser comparado ao arquivo bruto atual do aparelho.

**Parecer sobre armazenamento:** ainda não há benchmark que justifique migrar para SQLite. O primeiro passo é corrigir a consistência das exportações, definir política explícita para retenção/arquivamento, verificar frescor de dados e medir tamanho e latência no Galaxy A06. SQLite é candidato para o histórico estruturado se as medições confirmarem necessidade; não deve ser introduzido por presunção.

## 2. Fontes e limites da evidência

Foram inspecionados os arquivos do repositório e o diário de bordo, além do artefato da Biblioteca `meriva_smart_autosave_history(9).txt`, com data informada de 2026-10-24 e tamanho de 2.725.564 bytes.

O artefato é uma exportação textual; não é prova isolada do conteúdo atualmente persistido no aparelho. Ele contém 77 marcadores `[VIN REDIGIDO]` inseridos em linhas com números de combustível. Esses valores alterados são considerados **inutilizáveis para cálculo quantitativo** nesta auditoria. Os contadores de blocos, a numeração dos salvamentos, as datas e os marcadores estruturais foram analisados separadamente.

Nenhum APK foi instalado, nenhuma sessão OBD foi capturada nesta tarefa e nenhum arquivo real do armazenamento do Galaxy A06 foi lido diretamente. As conclusões sobre a implementação são baseadas no código versionado; as conclusões sobre conteúdo de histórico são limitadas ao artefato fornecido.

## 3. Mapa atual de persistência

| Dado | Caminho/função | Papel atual | Risco observado |
|---|---|---|---|
| Estado operacional/autosave | `CONFIG/autosave.json` e `autosave.previous.json`; `autosaveManager.ts` | Fonte principal para restaurar o estado persistido; envelope JSON validado | Estado inteiro é serializado novamente e inclui ciclos de viagem |
| Histórico legível de snapshots | `CONFIG/meriva_smart_autosave_history.txt`; `autosaveHistoryTxt.ts` | Anel dos 200 salvamentos mais recentes, em texto | Repete um resumo das até 10 viagens recentes em cada snapshot; não é lista de viagens |
| Índice de viagens | `VIAGENS/index.json` e `index.previous.json`; `driveCycleStorage.ts` | Fonte principal para ciclos, com validação, cópia anterior e fila de escrita | Sem limite explícito de ciclos ou tamanho; cada ciclo pode carregar até 720 amostras |
| Resumo diário de sessões ECU | `VIAGENS/meriva_smart_daily_obd_history.txt`; `dailyObdHistory.ts` | Eventos de início/fim/recuperação e snapshots de contexto por data | Limite de 365 datas, sem limite de eventos por data; o arquivo completo é reescrito em cada evento |
| Logs brutos e interpretados | `LOGS/obd_raw_YYYY-MM-DD.csv`, `obd_interpreted_YYYY-MM-DD.csv`; `obdLogger.ts` / `csvLogger.ts` | Uma linha por consulta, TX/RX, PID, latência, protocolo, origem e interpretação | Flush reescreve arquivo completo; fila pode descartar novas linhas se saturada |
| Resumo tabular de viagem | `VIAGENS/viagens_YYYY-MM-DD.csv` | Registro tabular por ciclo finalizado | Valores de consumo inválido não são exportados de forma coerente com a tela |
| Exportações manuais | `BACKUP/EXPORTS/diagnostic_*.json`, `drive_cycles_*.csv` | Compartilhar diagnóstico/viagens | Não foi encontrada política explícita de retenção desses arquivos |
| DTC persistidos | `DTC/dtc_records.txt` | Registro delimitado por `|`, um registro atual por código | Consistência de estado depende do caminho de varredura e reconciliação |
| Backups completos | `BACKUP/meriva_smart_<timestamp>/` | Cópias verificadas dos diretórios de dados; até cinco cópias completas | Multiplica o espaço usado; não substitui teste de restauração física |

Referências de implementação: [autosaveManager.ts](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/meriva/autosaveManager.ts), [autosaveHistoryTxt.ts](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/meriva/autosaveHistoryTxt.ts), [driveCycleStorage.ts](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/storage/driveCycleStorage.ts), [csvLogger.ts](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/database/csvLogger.ts), [exportDiagnostics.ts](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/storage/exportDiagnostics.ts).

## 4. Achados

### HIST-01 — CSV de viagens exporta consumo sem a mesma validação da tela

**Prioridade sugerida: P1 para integridade do dado exportado; não corrigido nesta tarefa.**

Em `app/armazenamento.tsx`, a tela mostra consumo somente se:
- `fuelDataValid !== false`;
- `fuelUsedL >= 0.05`;
- `avgFuelConsumptionKml > 0);
- os números forem finitos.

O formatador TXT aplica uma regra equivalente e apresenta `N/D` quando o consumo não é confiável. Entretanto, `exportDriveCyclesCsv()` em `src/storage/exportDiagnostics.ts` serializa sempre `cycle.avgFuelConsumptionKml`, sem respeitar `fuelDataValid`, o limiar de combustível ou o valor ausente; também não exporta uma coluna de validade/confiança. O gravador da viagem define `avgFuelConsumptionKml = 0` quando o combustível não sustenta uma média válida.

**Efeito:** uma viagem corretamente rotulada como sem consumo confiável na interface pode ser exportada para planilha com `0` ou com uma média sem indicação suficiente de qualidade. O consumidor do CSV não consegue distinguir com segurança “consumo não medido” de um valor numérico gravado.

**Requisito para correção futura:** a exportação precisa compartilhar a mesma regra semântica da tela/TXT e transportar explicitamente um campo de validade e a origem do combustível; valores não confiáveis devem ser campos vazios/indisponíveis, não zero. Adicionar testes comportamentais com ciclo válido, combustível abaixo de 0,05 L, `fuelDataValid=false`, valor não finito e registro legado sem o campo opcional. Não foi aplicado patch.

### HIST-02 — Histórico de viagens sem limite explícito e estado duplicado entre arquivos

**Prioridade sugerida: P2 — risco de crescimento e custo de I/O.**

`VIAGENS/index.json` armazena todos os ciclos lidos e não declara limite por quantidade, idade ou tamanho total. O gravador de viagem mantém uma cópia `.previous.json` e substitui o índice completo. Cada viagem pode incluir até 720 amostras esparsas (uma a cada dez segundos, com limite de 720 por ciclo).

Quando uma viagem é finalizada, `autoTripService.finalizeRecorder()` lê todos os ciclos e os copia para `state.driveCycles` no autosave. Assim, a lista completa existe pelo menos no índice de viagens e no envelope de autosave; as cópias anteriores e os backups completos sobrepõem dados novamente. O autosave grava um envelope JSON inteiro, valida o temporário, conserva o estado anterior e substitui o principal.

O gerenciador de cota usa limite padrão de 2.048 MiB, mas a limpeza automática remove somente arquivos dos diretórios `LOGS` e `LEITURAS`; não remove histórico de viagem, autosave, backups nem exportações. Os backups completos mantêm até cinco cópias. Não foi encontrada uma regra de retenção de `BACKUP/EXPORTS/diagnostic_*.json` e `drive_cycles_*.csv` no caminho de limpeza inspecionado.

**Efeito:** conforme o histórico aumenta, cada gravação de estado pode carregar e serializar mais dados do que a alteração que a motivou. Se a cota for atingida por viagens/autosaves/exportações, a limpeza automática pode não ter candidatos para remover, intencionalmente preservando o histórico.

**Requisito para decisão futura:** medir tamanho de cada diretório, bytes por ciclo, número/amostras por ciclo e latência de leitura/escrita. Em seguida, definir política explícita e auditável de retenção/arquivamento, regras de exportações e uma única fonte de verdade para ciclos. Não apagar nem truncar viagens existentes automaticamente sem backup verificado e critério de retenção aprovado. SQLite pode ser avaliado depois de quantificar o custo e o escopo da migração.

### HIST-03 — Custo de gravação CSV cresce com o arquivo diário

**Prioridade sugerida: P2 — desempenho de armazenamento.**

`csvLogger.ts` agrega linhas até oito registros ou aproximadamente um segundo e usa filas por arquivo. Ao escrever em arquivo existente, lê todo o CSV atual e grava o conteúdo anterior acrescido das novas linhas; migração de cabeçalho também lê/parsa/regrava o arquivo completo. O custo de cada flush, portanto, aumenta com o tamanho do CSV e acumula trabalho ao longo do dia.

O buffer em memória tem teto de 10.000 registros. Ao atingir o teto, as novas linhas são descartadas e um contador `droppedRows` é incrementado, com aviso no log e contador exposto na tela de armazenamento. Falhas de escrita restauram o lote pendente para retry, mas uma morte abrupta do processo antes de flush pode perder registros ainda somente em memória.

O diário DB-130 já registra que uma tentativa de usar `append: true` não era aceita pelo tipo `WritingOptions` da versão instalada do Expo SDK 51 / `expo-file-system` 17 e foi revertida. Logo, não é seguro repetir essa alteração ou mascarar erro de tipagem sem upgrade/API nativa compatível e testes.

**Requisito para decisão futura:** comparar em aparelho real a latência p50/p95 de flush, tamanho do CSV, volume de linhas, tempo de exportação e contagem de descartes numa sessão representativa. Alternativas a avaliar em branch e com teste: upgrade validado do SDK/API de append, segmentação de logs por blocos ou armazenamento local estruturado. Não foi alterada a implementação.

### HIST-04 — Histórico de snapshots não deve ser contado como histórico de viagem

**Prioridade sugerida: P2 — interpretabilidade do dado.**

O arquivo fornecido `meriva_smart_autosave_history(9).txt` tem 2.725.564 bytes e 516 blocos delimitados por `SALVAMENTO_BEGIN/END`, apesar de declarar limite 200. Há 402 IDs distintos, com 109 IDs repetidos, e o intervalo de numeração vai de 243 a 1212. A sequência parece composta por 200 snapshots compactos recentes (IDs 1013–1212, em 2026-10-24) e blocos antigos/duplicados anexados antes deles. Os marcadores de redação em valores numéricos impedem a reconstrução confiável de parte dos dados históricos.

Nos 200 blocos mais recentes existem 2.000 aparições de linhas de resumo de viagem, mas apenas 30 linhas distintas. Isso ocorre porque cada snapshot repete as dez viagens reais recentes. Não representa 2.000 viagens distintas.

O código atual em `autosaveHistoryTxt.ts`:
- remove duplicatas usando o número do salvamento e mantém a ocorrência mais recente;
- ordena a numeração e limita a saída lida/exportada a 200 snapshots;
- ao salvar, usa `historyLimit: 10` para o resumo de viagens;
- mantém uma fila por caminho para serializar as operações de leitura/modificação/escrita.

O teste `merivaAutosave.test.js` contém um teste que cria 205 salvamentos e exige exatamente 200 entradas, e outro que exercita deduplicação/concorrência. Portanto, **o artefato de 516 blocos não prova que a lógica atual esteja violando o limite**. Ele sugere um arquivo legado/não normalizado ou uma exportação de versão anterior. A leitura/exportação normalizada não demonstra, por si só, que o arquivo físico no aparelho já foi compactado.

**Decisão:** preservar o artefato como evidência histórica; não usar TXT de snapshots como fonte estatística de viagens e não truncar arquivos do usuário sem backup verificado. Uma eventual normalização física deve ocorrer apenas em tarefa autorizada, com cópia de segurança e validação do número/IDs dos snapshots antes e depois.

### HIST-05 — Amostras antigas aparecem em `LAST READINGS` sem um estado explícito de obsolescência

**Prioridade sugerida: P2 — clareza operacional.**

O snapshot de 2026-10-24 contém uma leitura `0101` com status `VALOR NÃO INTERPRETADO` e timestamp `2026-10-08T18:51:06.236Z`, cerca de 15,9 dias antes do snapshot. O timestamp está impresso, portanto a idade não é escondida, mas a seção `LAST READINGS` não acrescenta rótulo visual/textual de “antigo”/“obsoleto” nem informa a idade.

O autosave conserva até 50 últimas leituras e atualiza a memória em cada resposta; sua política de gravação limitada por PID reduz escrita redundante, mas não transforma uma leitura persistida em leitura atual. Outras partes do aplicativo já têm regras de frescor para telemetria ao vivo e nível de combustível; o relatório de snapshots deveria deixar explícita a diferença entre “último valor conhecido” e “valor atual”.

**Requisito para correção futura:** definir TTL por tipo de dado e, na exportação, mostrar timestamp, idade calculada e estado de frescor, sem apagar a evidência histórica. Não usar a leitura do autosave como confirmação de suporte ou como valor atual da ECU.

### HIST-06 — Dois fluxos de DTC têm semântica diferente quando o serviço 03 responde sem códigos

**Prioridade sugerida: P2 — consistência de diagnóstico.**

A varredura completa `readAllDtcs()` valida disponibilidade de cada serviço. Quando o serviço 03 está disponível e completo, códigos armazenados anteriores `CURRENT/CONFIRMED` que não aparecem na resposta podem passar para `INACTIVE`. Serviço indisponível, `NO DATA` ou resposta truncada não deve limpar evidência anterior, o que é confirmado pelos testes de scanner.

A rotina `readCurrentDtcs()` também valida a resposta do serviço 03, mas, quando a resposta válida não contém códigos, mantém os registros persistidos existentes em vez de marcá-los como inativos: `state.dtcs = records.length ? records : existing`. Isso significa que o rótulo/status no estado persistido pode continuar sendo antigo mesmo depois de uma resposta válida “sem códigos”, se esse caminho de leitura for usado. É um comportamento diferente da varredura completa.

O artefato analisado exibe `P0135` e `P0420` como `CURRENT` em um snapshot de 2026-10-24, mas com `lastSeen` de 2026-10-14. Isso não prova que o defeito ainda estava ativo em 24 de outubro; indica que a tela/relatório precisa tratar separadamente status recebido e data da última confirmação. A ausência de DTC só pode ser declarada após resposta válida do serviço correspondente.

**Requisito para correção futura:** unificar a reconciliação semântica entre leitura simples e varredura completa, preservar falha/indisponibilidade como `N/D`, manter histórico de ocorrência e expor “última confirmação” com horário. Para serviços 07/0A, a transição deve respeitar especificamente qual serviço respondeu; não limpar um estado por ausência em um serviço diferente. Nenhuma mudança foi feita.

### HIST-07 — Cobertura de teste não fecha todos os riscos identificados

**Prioridade sugerida: P2 — cobertura preventiva.**

Cobertura já identificada:
- `tests/merivaAutosave.test.js`: restauração de autosave, throttle de leitura, deduplicação/serialização de salvamentos e limite de 200 snapshots.
- `tests/tripRecorder.test.js`: limiar mínimo de combustível, viagem sem combustível confiável, timestamps duplicados/fora de ordem, distância GPS e amostras esparsas.
- `tests/dtcScanner.test.js`: respostas DTC completas, ausência válida de códigos e serviço indisponível/inválido.
- `tests/regression.test.js` e `tests/projectBaseline.test.js`: contratos de índice/filas e proteção estática do armazenamento.

Lacunas de comportamento que a auditoria não localizou cobertas diretamente:
1. Exportação CSV deve apresentar consumo indisponível quando `fuelDataValid=false`, combustível insuficiente ou média inválida e deve exportar a flag de validade.
2. Limite/política de retenção de ciclos e exportações, com preservação/restore após falha.
3. Indicação de frescor para amostras persistidas antigas.
4. Mesmo cenário de resposta válida sem DTC exercitado em `readCurrentDtcs()` e em `readAllDtcs()`, garantindo semântica igual.
5. Interrupção real durante regravação de CSV/index/autosave e recuperação do arquivo completo em Android, fora do filesystem em memória usado pelos testes.

Esta é uma revisão estática do código e das suítes consultadas. Os testes não foram executados nesta auditoria.

## 5. Decisão sobre SQLite e outros formatos

**Não migrar para SQLite nesta etapa.** Há motivos plausíveis para avaliar o banco — histórico sem limite definido, ciclos com amostras, duplicação entre arquivos e consultas completas — mas falta o dado decisivo: um benchmark real comparando tempo, tamanho e custo de I/O.

Ordem recomendada para uma tarefa futura autorizada:

1. Corrigir a semântica do CSV de viagens e fechar os testes de validade/frescor/DTC.
2. Instrumentar tamanho e latência do autosave, índice de ciclos, CSV diário e exportação num Android-alvo, sem adicionar carga de polling OBD.
3. Definir qual arquivo é fonte de verdade para viagens; manter exportação CSV como formato interoperável, sem usar o TXT de snapshots como tabela de viagens.
4. Definir retenção/arquivamento e a política para `BACKUP/EXPORTS`, preservando backups e não removendo dados reais automaticamente sem regra aprovada.
5. Comparar JSON atual, arquivo segmentado e SQLite com uma fixture real anonimizada e uma sessão representativa. Medir bytes gravados, p50/p95 de leitura/escrita, pico de memória, tempo de abrir histórico, tempo de exportar e recuperação após interrupção.
6. Se SQLite for escolhido, especificar migração versionada, importação idempotente, verificação de contagem e hashes/valores críticos, restauração, rollback e testes de compatibilidade com o histórico existente antes de mudar o app.

JSON continua adequado para envelope de estado e configuração versionada de tamanho moderado. CSV é útil para intercâmbio, mas precisa carregar semântica de validade e frescor. TXT serve para leitura humana e depuração; não deve ser a fonte de verdade quantitativa. Formato binário não resolve inconsistência semântica e não é recomendado sem medição.

## 6. Plano de validação futuro

| ID | Cenário | Evidência de aceitação |
|---|---|---|
| HIST-T01 | Exportar viagem com combustível válido e inválido | CSV distingue dado válido de `N/D`; não apresenta zero como consumo real indisponível |
| HIST-T02 | 1.000+ ciclos sintéticos com séries esparsas | Tempo/tamanho medidos, nenhum ciclo perdido, leitura limitada por paginação/retention explicitamente definida |
| HIST-T03 | Autosave e índice com interrupção durante escrita | Recuperação a partir do último arquivo validado, sem começar silenciosamente com histórico vazio |
| HIST-T04 | Resposta 03 válida sem DTC vs timeout/NO DATA | Só a resposta completa e válida pode reconciliar ausência; timeout preserva evidência anterior |
| HIST-T05 | Leitura antiga no autosave | Export mostra timestamp e frescor; dado antigo nunca rotulado como atual |
| HIST-T06 | Saturação da fila CSV | Contador de descartes verificável, sem perda silenciosa; retry após falha e comportamento em background testados |
| HIST-T07 | Cota acima de 2.048 MiB por viagens/exportações | Política explica o que pode ser arquivado/removido; não apaga autosave/viagens automaticamente sem autorização |
| HIST-T08 | Restauração de backup completo | Contagens de viagens, DTC e arquivos essenciais coincidem; histórico e configurações podem ser lidos no Android físico |

Teste sintético, TypeScript ou CI não substituem validação com arquivo legado real, falta de espaço, encerramento forçado e dispositivo Android. Qualquer futura mudança de código precisará de aprovação explícita do usuário, execução da suíte completa/gate, build Android e documentação com SHA/CI reais.

## 7. Estado final desta auditoria

- Auditoria de código e do artefato de autosave concluída documentalmente.
- Achados registrados como riscos/defeitos; nenhum foi corrigido no aplicativo.
- Nenhum teste ou CI foi executado; nenhum resultado de aprovação é alegado.
- Nenhuma PR foi criada, fechada ou mesclada.
- O estudo não confirma uma necessidade de SQLite sem benchmark.
- O artefato de autosave deve continuar classificado como evidência histórica não normalizada até comparação com arquivo físico atual do dispositivo.

## Referências do repositório

- [Diário de bordo](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/docs/DIARIO_DE_BORDO.md)
- [Autosave Manager](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/meriva/autosaveManager.ts)
- [Histórico TXT de autosave](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/meriva/autosaveHistoryTxt.ts)
- [Histórico diário de sessões ECU](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/meriva/dailyObdHistory.ts)
- [Armazenamento de viagens](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/storage/driveCycleStorage.ts)
- [Gravador CSV](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/database/csvLogger.ts)
- [Exportação JSON/CSV](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/storage/exportDiagnostics.ts)
- [Gravador de viagem e limites de confiabilidade](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/src/trip/tripRecorder.ts)
- [Testes de autosave](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/tests/merivaAutosave.test.js)
- [Testes de viagens](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/tests/tripRecorder.test.js)
- [Testes de DTC](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/02773b71ca9bd428b832d53a386655dd80acd80b/tests/dtcScanner.test.js)
