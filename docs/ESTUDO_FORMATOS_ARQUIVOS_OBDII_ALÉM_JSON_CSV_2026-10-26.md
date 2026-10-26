# Estudo de outros formatos de arquivos em aplicativos OBD-II

**Data:** 2026-10-26  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Branch de pesquisa:** `research/obd-methods-ui-architecture-20261026`  
**Base examinada:** `main` em `02773b71ca9bd428b832d53a386655dd80acd80b`  
**Escopo:** pesquisa documental de formatos além de JSON e CSV, comparação com práticas públicas de aplicativos OBD-II e recomendações para avaliação futura.  
**Restrição:** pesquisa e documentação somente. Não foram alterados código de execução, interface, fórmulas, dependências, configuração do app, testes ou PRs.

## 1. Conclusão executiva

Não existe um único formato capaz de resolver todas as necessidades de um aplicativo OBD-II. Os produtos pesquisados separam, explícita ou implicitamente, pelo menos quatro responsabilidades:

1. **Catálogos/configuração:** descrevem PIDs, fórmulas, limites, protocolos e regras.
2. **Persistência local:** guarda viagens, amostras, histórico, perfis e preferências.
3. **Registro de diagnóstico:** preserva comandos, respostas, erros e eventos para reprodução e depuração.
4. **Intercâmbio/relatórios:** permite abrir dados em planilhas, compartilhar sessões ou alimentar ferramentas externas.

Há evidência pública concreta de formatos além de JSON/CSV:
- **SQLite** aparece em um aplicativo OBD de código aberto como armazenamento local de métricas.
- **Binários proprietários** são usados por produtos comerciais para registros de sessão: o OBDLink descreve logs binários que ocupam menos espaço que CSV, mas só são abertos pelo próprio app; o Car Scanner documenta o formato interno `.BRC`, que ele próprio lê e que não pode ser reimportado como CSV.
- **ODX/PDX e XML** têm papel no diagnóstico automotivo profissional, em descrições de serviços e capacidades de ECU; não são substitutos diretos de um catálogo de PIDs genéricos.
- **DBC** descreve mensagens e sinais de redes CAN. É útil para decodificar tráfego CAN conhecido, mas não equivale a definições de PID de OBD-II e não deve ser adotado sem documentação específica da rede/variante do veículo.
- **Logs de texto** continuam úteis para registrar diálogos ELM327/AT, respostas brutas, timeouts e falhas de conexão.

**Recomendação para o Meriva Smart:** manter os catálogos internos em JSON e exportações tabulares em CSV; considerar SQLite apenas se a necessidade de histórico local, consultas e volume de amostras justificar uma migração testada; manter logs de diagnóstico em texto estruturado; não adotar um formato binário novo, DBC ou ODX por aparência de sofisticação. Nenhuma dessas recomendações foi implementada.

## 2. Método e grau de evidência

Foram priorizadas páginas oficiais de produtos, especificações de padrões e documentação pública de projetos. As conclusões separam:
- **Confirmado:** a fonte descreve expressamente o formato e seu uso.
- **Padrão/técnica aplicável:** o formato tem definição pública e uma aplicação técnica plausível, mas a pesquisa não encontrou prova de que seja usado pelo catálogo interno dos aplicativos de consumo examinados.
- **Não comprovado:** a pesquisa não encontrou base pública suficiente para atribuir o formato a um aplicativo específico.

A ausência de uma extensão em documentação pública não prova que ela não seja usada internamente. Formatos privados e proprietários devem permanecer classificados como não documentados até haver especificação verificável.

## 3. Formatos adicionais encontrados

### 3.1 SQLite — banco local estruturado

**Evidência:** o projeto aberto [OBD Logger](https://github.com/jenavarro/obdlogger) descreve gravação local das métricas em SQLite e exportação para CSV ou para um banco temporal InfluxDB.

**Uso apropriado:** amostras de PIDs por instante, sessões de condução, histórico de falhas, viagens, perfis de veículo e consultas por intervalo de tempo. SQL permite filtrar e agregar dados sem reler um arquivo de texto inteiro.

**Vantagens:** transações, consultas, índices, integridade referencial e um arquivo de banco local. A documentação do Android recomenda Room como camada sobre SQLite para aplicações com dados estruturados; Room acrescenta verificação de consultas e suporte a migrações.

**Riscos/custos:** requer esquema, índices, política de retenção, versionamento/migração e tratamento de falhas. SQLite também pode manter arquivos auxiliares de journal/WAL durante operações; backup não deve copiar apenas o arquivo principal sem compreender o modo de operação. Migrar armazenamento já existente pode provocar regressões e não deve ser feito sem uma necessidade comprovada.

**Aplicabilidade ao Meriva Smart:** avaliar apenas se o volume de histórico, as consultas, a retenção ou o custo de leitura/escrita do mecanismo atual forem problemas demonstrados por medição. O nome de uma pasta chamada `database` não basta para concluir que já exista SQLite: no snapshot analisado, o caminho de perfil identificado em `src/database/vehicleConfig.ts` lê/grava `CONFIG/veiculo.json`. Esta análise não encontrou evidência suficiente para afirmar que o app já usa SQLite como armazenamento principal.

Fontes: [OBD Logger — README](https://github.com/jenavarro/obdlogger); [Android — Room](https://developer.android.com/training/data-storage/room); [SQLite — formato do arquivo](https://sqlite.org/fileformat.html).

### 3.2 Arquivos binários de telemetria — registro compacto

**Evidência 1 — OBDLink:** a documentação oficial distingue CSV Logging de Data Logging. O log binário pode guardar muitos pontos em arquivo menor que o CSV e ser reproduzido no próprio OBDLink, mas a documentação afirma que o arquivo binário não pode ser aberto por outros aplicativos. O app também pode exportar/converter esses dados para CSV. A página consultada não documenta publicamente um esquema binário completo nem uma extensão universal.

**Evidência 2 — Car Scanner:** a documentação oficial permite exportar gravações em CSV ou `.BRC`. A página caracteriza BRC como formato interno do aplicativo, legível pelo Car Scanner; importação de gravações aceita BRC, não CSV. A estrutura interna de BRC não é publicada na página.

**Vantagens:** potencial redução de espaço e de custo de serialização para amostras frequentes; pode preservar dados brutos ou metadados que um CSV simples não modela bem.

**Riscos:** não é automaticamente interoperável; exige decodificador, versão do formato, estratégia de compatibilidade, recuperação de arquivos truncados e ferramenta de inspeção. Um arquivo pequeno não prova maior velocidade total: é preciso medir CPU, latência de escrita, consumo de memória, tamanho e custo de exportação no dispositivo-alvo.

**Aplicabilidade ao Meriva Smart:** não criar um formato binário proprietário nesta fase. Se o histórico ficar pesado, primeiro medir tamanho/latência com sessões reais e comparar CSV, SQLite e uma eventual codificação binária num teste isolado. Manter CSV como saída de fácil análise, independentemente do formato interno.

Fontes: [OBDLink — Logs](https://support.obdlink.com/support/solutions/articles/43000709894); [Car Scanner — gravação e exportação](https://www.carscanner.info/records/).

### 3.3 TXT/LOG — rastros de comunicação e depuração

**Base técnica:** a comunicação de comando/resposta ELM327 usa caracteres ASCII, comandos terminados por carriage return e respostas textuais; o prompt `>` indica que o adaptador está pronto para o próximo comando. Por isso, um rastro textual pode representar sequência, tempo, comando enviado, resposta recebida e erro de transporte de forma inspecionável.

**Uso apropriado:** diagnóstico de Bluetooth, inicialização do adaptador, eco ligado/desligado, protocolo selecionado, respostas vazias, timeouts, respostas negativas, framing incompleto e tentativas de reconexão. O log deve separar os bytes/respostas brutas dos eventos interpretados pelo app.

**Vantagens:** fácil de inspecionar, compartilhar e comparar em testes de regressão; não precisa de decodificador binário especializado.

**Riscos:** pode crescer rapidamente; logs em excesso podem afetar I/O e revelar VIN, coordenadas, DTCs ou hábitos de uso. Texto com timestamps ambíguos, sem delimitadores ou sem identificação da sessão pode induzir a conclusões erradas.

**Aplicabilidade ao Meriva Smart:** útil como artefato de diagnóstico, sem substituir o estado estruturado da conexão. Padronizar conceitualmente campos como timestamp monotônico e de parede, session ID, direção TX/RX, protocolo, payload bruto, resultado de parsing, timeout e categoria de erro. Redigir dados sensíveis e colocar limite de tamanho/rotação. Não registrar tokens, identificadores privados ou dados pessoais desnecessários.

Fonte técnica: [ELM327L — documentação do fabricante](https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327L_Data_Sheet.pdf).

### 3.4 ODX/PDX e XML — descrições de diagnóstico automotivo

**Evidência:** a ASAM define MCD-2 D/ODX para descrever comunicação de diagnóstico, parâmetros, DTCs, capacidades da ECU, programação e codificação de variantes. Os formatos publicados são `.odx` e `.pdx`, e ODX é serializado em XML.

**O que resolve:** descrição de serviços e dados de diagnóstico específicos de ECU, com semântica e metadados de nível profissional. Esse domínio é bem mais amplo que os PIDs genéricos de emissões lidos por serviços OBD-II padronizados.

**Limites:** não é um catálogo genérico plug-and-play; dados podem ser específicos de fabricante, ECU, variante, protocolo, sessão e condições de segurança. ODX/PDX não deve ser tratado como sinônimo de JSON/XML arbitrário, nem como prova de que o app consegue executar serviços descritos no arquivo.

**Aplicabilidade ao Meriva Smart:** referência de arquitetura futura somente se houver objetivo explícito de diagnóstico avançado específico de ECU, com fonte legal e tecnicamente confiável para os dados do veículo. Não substituir `pids.json`, `formulas.json` ou o motor de fórmulas por ODX sem uma análise de escopo, suporte e compatibilidade.

Fonte: [ASAM — MCD-2 D/ODX](https://www.asam.net/standards/detail/mcd-2-d/).

### 3.5 DBC — descrição de mensagens e sinais CAN

**Base técnica:** DBC é um formato textual de base de dados usado por ferramentas de engenharia CAN para descrever mensagens, campos/sinais, posição de bits, fator, offset e unidades. Ferramentas como as documentadas pela Kvaser usam essas definições para converter valores brutos de mensagens em sinais físicos.

**Diferença essencial:** DBC descreve sinais em quadros CAN conhecidos; não é uma lista de PIDs de serviços OBD-II. Uma ECU pode responder a um PID OBD-II mesmo sem que haja um DBC público para a rede; inversamente, um DBC não garante acesso aos dados por meio de ELM327 e serviços OBD-II.

**Aplicabilidade ao Meriva Smart:** não incluir DBC como substituto do catálogo atual. Só avaliar em cenário de captura CAN bruta e com arquivo correto para a rede/variante, origem autorizada, definições de endianess/bit layout, fatores e offsets validados em dados físicos. Interpretação de mensagens CAN proprietárias sem evidência pode gerar valores convincentes, mas errados.

Fonte: [Kvaser — introdução a J1939 e DBC](https://kvaser.com/developer-blog/an-introduction-j1939-and-dbc-files/).

### 3.6 Protocolo de linha InfluxDB — ingestão temporal externa

**Evidência:** o OBD Logger declara exportação de métricas para InfluxDB além de CSV. O InfluxDB documenta um protocolo textual de linhas com medição/tabela, tags, campos e timestamp.

**Uso apropriado:** enviar muitas amostras de telemetria para um banco temporal remoto, com tags de veículo/sessão e campos numéricos.

**Limites:** o line protocol é um protocolo de ingestão de um sistema específico, não um formato universal de backup nem um substituto automático do banco local. Exige serviço externo, conectividade, política de credenciais e de privacidade, tratamento de falha de rede e definição de retenção.

**Aplicabilidade ao Meriva Smart:** não é prioridade para funcionamento offline nem para diagnóstico local. Pode ser uma integração posterior independente, desde que haja requisito explícito de telemetria remota e consentimento adequado.

Fontes: [OBD Logger — README](https://github.com/jenavarro/obdlogger); [InfluxDB — line protocol](https://docs.influxdata.com/influxdb3/core/reference/line-protocol/).

### 3.7 CBOR e outros formatos binários estruturados

**Base técnica:** CBOR (RFC 8949) é um formato padronizado de serialização binária de dados estruturados, com objetivo de permitir representações compactas e decodificadores pequenos. Ele não é o formato de arquivo de log confirmado nos aplicativos citados nesta pesquisa.

**Possível uso:** transporte de amostras estruturadas quando tamanho e custo de serialização forem restrições medidas, mantendo uma estrutura bem definida.

**Riscos:** menor legibilidade manual, necessidade de ferramentas de inspeção e testes de conversão/compatibilidade. O ganho real depende dos campos, frequências e implementação; não se deve presumir ganho relevante apenas pelo fato de ser binário.

**Aplicabilidade ao Meriva Smart:** não adotar agora. CBOR/MessagePack/Protocol Buffers só devem entrar numa comparação experimental se houver evidência de gargalo de tamanho, custo de CPU ou taxa de escrita. Para os catálogos relativamente pequenos de configuração, a legibilidade e o diff de JSON têm valor operacional claro.

Fonte: [RFC 8949 — CBOR](https://www.rfc-editor.org/rfc/rfc8949.html).

## 4. Formatos considerados, mas não comprovados como catálogo principal dos apps analisados

| Formato | Aplicação típica | Evidência nesta pesquisa | Decisão inicial |
|---|---|---|---|
| XML genérico | Dados hierárquicos, recursos Android, integrações que exigem XML | Confirmado para serialização ODX; não comprovado como catálogo principal dos apps de consumo pesquisados | Não migrar JSON sem requisito de interoperabilidade |
| YAML/TOML/INI/Properties | Configuração legível de serviços e ferramentas | Não foi encontrada evidência pública suficiente de uso como catálogo de PIDs principal dos aplicativos OBD-II avaliados | Não introduzir nova sintaxe de configuração no app |
| ZIP/arquivo compactado | Agrupar sessões, manifesto, logs e exportações | Utilidade genérica de empacotamento; uso como pacote de backup do app não foi verificado nas fontes examinadas | Considerar apenas com requisito de backup/compartilhamento |
| PDF/HTML | Relatório legível por pessoas, impressão e compartilhamento | Não confirmado como formato de log primário nas fontes consultadas | Tratar como formatos de apresentação/exportação, não como armazenamento de telemetria |
| GPX/GeoJSON | Compartilhar trilhas/coordenadas | Não confirmado como exportação pelos apps examinados nesta verificação | Não adicionar sem requisito de exportação de rota |
| Parquet | Análise de grandes séries em lote | Não encontrado como formato de gravação de apps móveis OBD-II na pesquisa | Não é prioridade de armazenamento embarcado |
| Protocol Buffers/MessagePack | Serialização estruturada binária | Opções técnicas existentes, mas uso nos apps específicos pesquisados não foi demonstrado | Somente comparar em benchmark se houver gargalo medido |

Essa tabela não afirma que tais formatos nunca são usados por aplicativos comerciais; registra apenas que não há evidência pública suficiente, nesta verificação, para atribuir-lhes o papel descrito nos apps estudados.

## 5. Matriz de decisão para o Meriva Smart

| Necessidade | Candidato prioritário | Motivo | Condição antes de adoção |
|---|---|---|---|
| Catálogo de PIDs, fórmulas, limites e regras | JSON existente | Estrutura legível e revisável por diff; já integrado ao código atual | Validar esquema e semântica, não apenas sintaxe |
| Exportar série tabular de PIDs | CSV | Abre em planilhas e ferramentas comuns | Definir cabeçalho, unidades, timezone, separador, campos ausentes e escape |
| Estado persistente com consulta por tempo e relação entre entidades | SQLite | Consultas e transações podem servir a histórico mais volumoso | Medir carga atual e desenhar migração/backup antes |
| Depurar conexão ELM327/ECU | TXT/LOG estruturado | Inspecionável, adequado para evidência de falhas | Redação de dados sensíveis, rotação e testes de parsing |
| Registro de alta frequência compacto | CSV/SQLite como baseline; binário só como experimento | Evita formato proprietário prematuro | Benchmark em sessão real e testes de corrupção/recuperação |
| Diagnóstico ECU específico e avançado | ODX/PDX, se disponível e aplicável | Padrão profissional para descrição diagnóstica | Fonte autorizada, veículo/ECU corretos, protocolo e serviços compatíveis |
| Decodificar CAN bruto proprietário | DBC, se houver fonte válida | Descreve campos de quadros CAN | Arquivo exato para a rede, fator/offset/endianess validados |
| Telemetria remota temporal | InfluxDB line protocol ou API compatível | Ingestão de amostras e timestamps | Consentimento, autenticação, modo offline e retenção |

## 6. Requisitos mínimos de segurança e confiabilidade para qualquer formato novo

Antes de qualquer adoção futura, exigir:

1. **Versão de esquema/formato:** informar versão e estratégia de leitura de versões antigas; recusar versões incompatíveis de forma explícita.
2. **Validação semântica:** PID/modo/bytes/fórmula/unidade/limites coerentes; timestamps válidos; não converter dado ausente em zero sem regra explícita.
3. **Integridade:** detectar arquivo truncado, dados inválidos e gravações parciais; não aceitar arquivo malformado como dado confiável.
4. **Limites operacionais:** tamanho máximo, rotação/retention, memória, CPU e frequência de escrita medidos no Android alvo.
5. **Interoperabilidade:** teste de exportar e reimportar, ou teste documentado de que o formato é somente saída; nenhuma promessa de importação cruzada sem suporte.
6. **Privacidade:** remover/redigir VIN, coordenadas GPS e informações de uso quando não forem necessárias; deixar claro o conteúdo compartilhado.
7. **Regressão:** fixtures reais anonimizadas, dados de referência, arquivos corrompidos, amostras ausentes/duplicadas, relógio alterado, interrupção do app e recuperação após falha.
8. **Evidência física:** nenhuma mudança de transporte, protocolo, PID, fórmula ou interpretação de ECU deve ser validada apenas com arquivos sintéticos; os testes físicos devem identificar adaptador, veículo, protocolo efetivamente negociado e condições de aquisição.

## 7. Parecer

A variedade de formatos reflete responsabilidades diferentes, não uma corrida para substituir JSON. Para este projeto, a decisão mais segura no momento é manter JSON para catálogos de conhecimento, CSV como saída analítica e rastros de texto estruturados para conexão/depuração. SQLite é o candidato mais plausível caso haja uma necessidade medida de persistência de telemetria em escala maior. Formatos proprietários binários, CBOR e integração InfluxDB exigem justificativa por benchmark ou requisito de produto; DBC e ODX/PDX pertencem a escopos de diagnóstico mais específicos e não devem ser confundidos com formatos genéricos de PIDs.

**Status:** pesquisa documental concluída nesta branch. Nenhuma alteração de implementação foi realizada. Nenhuma PR foi criada ou mesclada.

## Referências principais

- Car Scanner — gravação, exportação CSV/BRC e importação: https://www.carscanner.info/records/
- OBDLink — logs CSV e binários: https://support.obdlink.com/support/solutions/articles/43000709894
- Torque — formato CSV de PIDs estendidos: https://wiki.torque-bhp.com/view/PIDs
- OBD Logger — SQLite, CSV e InfluxDB: https://github.com/jenavarro/obdlogger
- Android Developers — armazenamento de dados: https://developer.android.com/training/data-storage
- Android Developers — Room sobre SQLite: https://developer.android.com/training/data-storage/room
- SQLite — formato em disco: https://sqlite.org/fileformat.html
- ELM Electronics — datasheet ELM327L: https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327L_Data_Sheet.pdf
- ASAM — MCD-2 D/ODX: https://www.asam.net/standards/detail/mcd-2-d/
- Kvaser — introdução a J1939 e DBC: https://kvaser.com/developer-blog/an-introduction-j1939-and-dbc-files/
- InfluxDB — line protocol: https://docs.influxdata.com/influxdb3/core/reference/line-protocol/
- IETF — RFC 8949/CBOR: https://www.rfc-editor.org/rfc/rfc8949.html
