# Investigação de JSON e formatos de dados em aplicativos OBD-II

**Data:** 2026-10-26  
**Snapshot do Meriva Smart:** `main` em `02773b71ca9bd428b832d53a386655dd80acd80b`  
**Branch:** `research/obd-methods-ui-architecture-20261026`  
**Escopo:** análise documental e de código público; nenhuma alteração de implementação.

## 1. Conclusão executiva

Não existe um formato JSON universal de aplicativos OBD-II. O JSON, quando utilizado, é um formato interno do aplicativo para descrever PIDs, fórmulas, políticas e perfis; não é o protocolo que trafega entre o carro e o adaptador. Na conexão OBD, a ECU devolve respostas em bytes que o aplicativo precisa enquadrar, validar e decodificar.

A pesquisa encontrou práticas diferentes:

- **OBD Metrics:** exemplo mais claro de catálogo OBD externo em JSON; agrupa comandos por finalidade e inclui modo/PID, comprimento, unidades, fórmula, limites, prioridade e codecs.
- **Torque Pro:** documentação pública mostra arquivos CSV para PIDs estendidos, não JSON.
- **OBD-Droid:** usa CSV para definições de PIDs e SQLite para PIDs personalizados salvos pelo usuário; os JSON localizados no repositório são recursos de animação Lottie, não o catálogo OBD.
- **OBDvis:** o repositório público analisado não tem arquivos `.json`; definições de PIDs e fórmulas aparecem no código Kotlin e preferências em SharedPreferences.
- **python-OBD:** define comandos como objetos Python (`OBDCommand`) e decoders, não por catálogo JSON.
- **Car Scanner, OBDLink, OBD Auto Doctor, OBD Fusion e ScanMyOpel:** as fontes públicas examinadas documentam configurações pela interface, fórmulas, logs ou exportação em outros formatos, mas não publicam um esquema JSON interno completo para a configuração de PIDs. Não é válido inventar seus formatos internos.

## 2. O que cada aplicativo usa — com limites da evidência

| Aplicativo / projeto | Formato documentado ou observado | Como é usado | O que não foi possível comprovar |
|---|---|---|---|
| **Car Scanner ELM OBD2** | PIDs personalizados definidos pela interface; logs exportáveis em CSV ou BRC. A documentação descreve o BRC como formato interno legível/importável pelo Car Scanner. | A definição do PID informa comando (modo + PID), cabeçalho de destino quando necessário e equação para decodificar bytes A, B, C etc. CSV é útil para analisar séries; BRC pode ser importado pelo próprio aplicativo. | O esquema JSON interno de perfis/catálogos da versão Android não está documentado nas fontes públicas consultadas. BRC não deve ser chamado de JSON sem análise de formato. |
| **Torque Pro** | CSV para definições de PIDs estendidos. | O arquivo colocado em `.torque/extendedpids` declara colunas como `Name`, `ShortName`, `ModeAndPID`, `Equation`, mínimo, máximo, unidade e cabeçalho OBD. O app carrega as definições pelo menu de PIDs estendidos. | Não foi encontrada especificação pública equivalente em JSON para esse fluxo. Preferências internas são outra questão e não devem ser presumidas a partir do CSV. |
| **OBDLink** | Logs CSV e arquivo binário proprietário. | CSV guarda os valores em texto; log binário armazena grandes quantidades de amostras em arquivo menor e pode ser reproduzido no app ou convertido para CSV. As opções permitem selecionar PIDs e cadência de gravação. | Não foi publicado um esquema JSON para as configurações internas do veículo/adaptador ou para o formato binário. |
| **OBD Auto Doctor** | Log e exportação de sensores em CSV; diagnóstico pode exportar informações/logs para suporte. | O log permite analisar o que ocorreu na sessão; o app oferece seleção automática e opção de protocolo manual para troubleshooting. | Não foi encontrado um catálogo JSON público para PIDs, configuração do veículo ou preferências. |
| **OBD Fusion (mobile)** | Criação de PIDs e painéis pela interface; logs CSV documentados. | Usuário cria PIDs, configura adaptador/veículo e escolhe os parâmetros mostrados; logs podem ser analisados em gráficos e exportados. | A documentação mobile consultada não define esquema JSON de PIDs/dashboards. O OBDwiz para desktop é um produto relacionado; suas funções de importar/exportar banco de veículos/PIDs não provam que o mobile use o mesmo formato. |
| **ScanMyOpel / ScanMyOpelCAN** | Catálogo específico de veículo mantido pelo fornecedor; sem formato público de arquivo de definição de PID identificado. | A app segmenta cobertura por gerações/módulos Opel/Vauxhall. A configuração seleciona suporte compatível com modelo/ECU, em vez de presumir que todo PID genérico funciona. | Não há código-fonte público nem esquema JSON interno comprovado nas fontes consultadas. |
| **python-OBD** | Definições em código Python por objetos `OBDCommand`. | Cada comando pode fornecer nome, descrição, bytes do pedido, bytes esperados, decoder, ECU, opção de resposta rápida e cabeçalho. O decoder é uma função que transforma a mensagem em valor/unidade. | Não foi identificado catálogo JSON como mecanismo principal de definição de comandos. |
| **OBDvis** | Definições de PID e fórmulas em Kotlin; preferências via Android SharedPreferences; logs CSV. | `PidRegistry.kt` contém objetos `PidDefinition` com HEX, nome, unidade, faixa e função de fórmula. `AppSettings.kt` lê/grava preferências de app. O código de diagnóstico consome amostras e janelas temporais. | Na árvore pública `main` consultada não havia arquivos `.json`. Isso descreve o repositório público analisado; não é uma afirmação sobre todo formato interno possível de builds ou dados privados. |
| **OBD Metrics** | Arquivos JSON externos de recursos, por exemplo `mode01.json`, `extra.json`, `alfa.json` e `giulia_2.0_gme.json`. | O loader lê um ou mais arquivos de recursos e combina grupos de definições: capacidades, leitura/limpeza de DTC, metadados, live data e rotinas. Os campos descrevem serviço/mode, PID, comprimento, fórmula, unidade, limites, prioridade e opções de codec/cabeçalho. | O JSON do OBD Metrics é esquema daquele framework, não um padrão universal nem um arquivo que qualquer app OBD aceite. |
| **OBD-Droid** | CSV para dados de definição e SQLite para PIDs customizados. Também há JSON de animação na árvore pública. | Os CSV de PIDs carregam campos como serviço, PID, offset, comprimento, bits, máscara, fórmula/conversão, formato, limites, período de atualização, mnemonic, rótulo e descrição. A base `custom_pids.db` armazena PIDs inseridos/alterados no app. Os arquivos JSON localizados em `res/raw` são animações Lottie, não catálogo de PIDs. | Não foi identificado JSON como formato principal da base de definições OBD. |
 
## 3. Detalhes do modelo JSON do OBD Metrics

Este é o exemplo público mais útil para entender como JSON pode descrever OBD de forma estruturada.

### Grupos de nível superior

- `capabilities`: pedidos para consultar quais PIDs a ECU declara suportar.
- `dtcRead` e `dtcClear`: leitura e limpeza de códigos de falha, com códigos de sucesso esperados e tipos de comando.
- `metadata`: identificação da ECU/veículo e informações lidas geralmente uma vez por sessão.
- `livedata`: parâmetros consultados com frequência.
- `routine`: ações sob demanda que podem alterar o comportamento de um componente e exigem controle específico.

### Campos típicos de um PID

| Campo | Função observada |
|---|---|
| `id` | Identificador interno único do comando/definição. |
| `mode`, `pid` | Serviço/modo e identificador enviados ao adaptador/ECU. |
| `length` | Quantidade de bytes de dados esperada. |
| `description`, `units` | Nome/descrição e unidade exibida. |
| `formula` | Expressão para converter bytes A, B, C etc. em valor de engenharia. |
| `min`, `max` | Limites descritivos/de plausibilidade. |
| `priority` | Peso relativo de frequência no scheduler. |
| `signed`, `type` | Interpretação numérica e tipo do valor, quando aplicável. |
| `codecClass` / tipo de comando | Delegação de casos complexos a um decoder específico. |
| `overrides` | Ajustes de cabeçalho/canal e desativação de batch para certas definições. |
| `alert`, `cacheable`, parâmetros externos | Metadados de alerta, cache e variáveis como capacidade do tanque. |

O framework aceita diversos arquivos de fabricante junto aos recursos genéricos. Também oferece testes de codec com pares de entrada/resultado esperado, e estatísticas da sessão. Isso favorece extensibilidade sem exigir que todo PID seja escrito no código principal.

### Cuidado que não deve ser copiado às cegas

O campo `formula` do OBD Metrics aceita expressões JavaScript. Isso é flexível, mas é diferente do motor do Meriva Smart, que usa operações declarativas permitidas e não executa expressão arbitrária por `eval`. Não se deve importar uma equação como texto executável de origem não confiável. A flexibilidade de catálogo pode ser aproveitada sem replicar essa superfície de execução.

## 4. O padrão que o Meriva Smart já utiliza

No snapshot `main`, há 17 arquivos com extensão `.json` no repositório: 12 catálogos em `src/knowledge/` e 5 arquivos gerais/build (`app.json`, `eas.json`, `package.json`, `package-lock.json`, `tsconfig.json`). Os JSON de build não fazem parte do catálogo OBD. Além deles, o app cria/consome um perfil JSON no armazenamento local do aparelho.

### 4.1 Catálogos carregados pelo código de execução

| Arquivo | Como é consumido no código |
|---|---|
| `src/knowledge/pids.json` | Registro padrão de PIDs com identificador, nome, número de bytes, unidade, ID de fórmula, classificação e descrição. É importado por `pidDefinition.ts` e usado também em descoberta/telemetria. A presença no catálogo não comprova suporte real da ECU. |
| `src/knowledge/formulas.json` | Mapeia IDs de fórmula para operações declarativas (`u8`, `u16`, divisores, escalas e offsets). Consumido pelo motor central `formulaEngine.ts`. |
| `src/knowledge/ranges.json` | Faixas por PID. O motor central usa o catálogo para validar plausibilidade, não para afirmar que um valor fora da faixa condena a peça. |
| `src/knowledge/polling_policy.json` | Define grupos/cadências, fases, prioridade e expiração de dados; usado por telemetria do cockpit, serviço de viagem e integração de autosave. A fila de comandos permanece serial. |
| `src/knowledge/bluetooth_config.json` | Define o perfil de adaptador, transporte, tentativas/intervalos, resposta que valida ECU e timeouts de inicialização; importado por `bluetoothManager.ts`. |
| `src/knowledge/dtc_catalog.json` | Catálogo de descrições e causas prováveis de códigos padronizados; `dtcDefinition.ts` resolve códigos para descrição. Não substitui a leitura OBD do DTC nem diagnostica a causa sozinho. |
| `src/knowledge/diagnostic_rules.json` | Define gatilhos e hipóteses diagnósticas, scores-base e testes seguintes; consumido por `diagnosticEngine.ts`. |
| `src/knowledge/sensor_tests.json` | Catálogo de avaliações, PIDs/pré-requisitos, modos de teste, limites heurísticos, leituras mínimas, fontes e orientação; consumido por `sensorTestEngine.ts` e usado pelo motor diagnóstico para relacionar recomendações. |
| `src/knowledge/fuel_types.json` | Enumera códigos do PID 0151 para rótulos do tipo de combustível; consumido por `fuelIdentification.ts`. Código enumerado não é por si só medição da porcentagem de etanol no tanque. |

### 4.2 Arquivos JSON que, no snapshot consultado, não aparecem como fonte de execução direta

| Arquivo | Uso comprovado no repositório observado | Consequência prática |
|---|---|---|
| `src/knowledge/meriva_confirmed_pids.json` | É consultado por documentação/testes e funciona como inventário de evidência/candidatos. Não foi encontrado import dele no código de execução pesquisado. | Alterar o JSON, sozinho, não deve ser tratado como alteração da lógica operacional de descoberta. A validação atual continua baseada em bitmap da sessão, catálogo padrão e resposta individual válida. |
| `src/knowledge/meriva_protocols.json` | É validado por teste e descrito na documentação; não foi encontrado import em código de execução no snapshot pesquisado. `bluetoothManager.ts` contém sua própria lista de fallback `['5','3','4','6','7','8','9']`. | Há duas representações da ordem de protocolo (catálogo documental e lista do runtime). Elas podem divergir se uma for atualizada sem a outra. Este achado é para revisão futura autorizada; nenhuma correção foi aplicada. |
| `src/knowledge/units.json` | Usado por `knowledgeJson.test.js` para validar as chaves de unidade referenciadas em `pids.json`; não foi encontrado import em código de execução no snapshot pesquisado. | Atua como contrato de validação, não necessariamente como fonte dos rótulos de unidade em runtime. Não presumir que alterar o arquivo sozinho muda o que a tela mostra. |

O teste `tests/knowledgeJson.test.js` carrega e verifica a estrutura/consistência de vários catálogos. Isso é útil, mas **validar que um arquivo existe e é JSON válido não prova que o runtime o consome**. Para dizer que um JSON controla um comportamento, é necessário confirmar o import/loader e o caminho de execução correspondente.

### 4.3 Perfil JSON persistido no aparelho

`src/database/vehicleConfig.ts` grava e lê `CONFIG/veiculo.json` no armazenamento local do aplicativo. Esse arquivo representa um perfil de veículo (por exemplo marca/modelo/motor, cilindrada, cilindros, combustível, capacidade do tanque, fonte do manual, data de criação/modificação e protocolo-base). O código valida campos mínimos antes de aceitar o objeto. Esse JSON persistido é distinto dos catálogos estáticos dentro de `src/knowledge/`.

Outros dados persistidos não são todos JSON: o código consultado registra ocorrências de DTC em `DTC/dtc_records.txt` com campos separados por `|`; os logs também podem usar CSV/TXT. Portanto, não se deve afirmar que o app guarda todo o histórico em JSON.

## 5. Comparação de arquitetura: o que é transferível

O que vale aprender do OBD Metrics é a separação de definições em dados externos, com campos de modo/PID, comprimento, unidade, faixa, prioridade e decoder. Parte dessa disciplina já existe no Meriva Smart — distribuída por vários arquivos especializados.

O Meriva Smart usa uma separação mais restrita para fórmulas: `pids.json` aponta para `formulaId`; `formulas.json` aponta para uma operação permitida; `formulaEngine.ts` executa essa operação. Isso reduz a flexibilidade comparada a uma expressão livre, mas melhora a previsibilidade, torna a regra mais fácil de testar e evita `eval` arbitrário.

A recomendação de pesquisa é **não fundir todos os JSON num arquivo único nem copiar as fórmulas dos concorrentes sem revisão**. A separação atual pode ser útil se cada arquivo tiver um proprietário claro, um consumidor de runtime identificado, uma versão de contrato e testes que validem ligações cruzadas. Para os três arquivos da seção 4.2, uma futura revisão deve primeiro decidir se são apenas referências documentais/teste ou se devem se tornar autoritativos; não os alterei.

## 6. Fontes públicas consultadas

### Aplicativos e documentação
- Car Scanner — sensores/PIDs personalizados: https://www.carscanner.info/2019/07/ (arquivo do artigo “Custom sensors (PIDs)”)
- Car Scanner — gravação e exportação CSV/BRC: https://www.carscanner.info/records/
- Torque Pro — esquema CSV para PIDs estendidos: https://wiki.torque-bhp.com/view/PIDs
- OBDLink — configuração de logs CSV/binários e seleção de PIDs: https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs
- OBD Auto Doctor — troubleshooting e exportação de log: https://www.obdautodoctor.com/help/articles/troubleshoot-connectivity-issues/
- OBD Fusion — PIDs customizados, painéis e CSV: https://www.obdsoftware.net/software/obdfusion
- OBDwiz Desktop — notas de versões sobre import/export de veículo e PIDs: https://www.obdsoftware.net/downloads/obdwiz/current/releasenotes
- ScanMyOpel / ScanMyOpelCAN: https://scanmyopel.com/

### Repositórios de código público
- OBD Metrics README e esquema JSON: https://github.com/tzebrowski/ObdMetrics
- OBD Metrics — `mode01.json`: https://github.com/tzebrowski/ObdMetrics/blob/main/src/main/resources/mode01.json
- OBD Metrics — definição de grupos: https://github.com/tzebrowski/ObdMetrics/blob/main/src/main/java/org/obd/metrics/pid/PIDsGroupFile.java
- OBDvis — registro de PIDs em Kotlin: https://github.com/Joost-vanAndel/OBDvis/blob/main/android/app/src/main/java/com/obdvis/android/domain/PidRegistry.kt
- OBDvis — preferências de aplicativo: https://github.com/Joost-vanAndel/OBDvis/blob/main/android/app/src/main/java/com/obdvis/android/AppSettings.kt
- OBD-Droid — parser CSV: https://github.com/Wal33D/OBD-Droid/blob/main/app/src/java/com/obddroid/ecu/PidDefinitionCsvParser.java
- OBD-Droid — base SQLite de PIDs customizados: https://github.com/Wal33D/OBD-Droid/blob/main/app/src/java/com/obddroid/custompid/CustomPidDatabase.java
- python-OBD — comandos customizados: https://python-obd.readthedocs.io/en/latest/Custom%20Commands/

### Referências do Meriva Smart analisadas
- `pids.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/pids.json
- `formulas.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/formulas.json
- `ranges.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/ranges.json
- `polling_policy.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/polling_policy.json
- `bluetooth_config.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/bluetooth_config.json
- `meriva_protocols.json`: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/meriva_protocols.json
- Teste de contratos JSON: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/tests/knowledgeJson.test.js

## 7. Estado do trabalho

**Realizado:** pesquisa de documentação pública e de código aberto; inventário dos JSON no snapshot do Meriva Smart; comparação dos formatos e dos mecanismos de consumo.

**Não realizado:** mudança em código, tela, catálogo, fórmula executável, política de polling, configuração, dependência, teste ou PR. Não foram modificados JSON do aplicativo. A documentação foi registrada isoladamente na branch de pesquisa; isso não autoriza integrar nem implementar as observações.
