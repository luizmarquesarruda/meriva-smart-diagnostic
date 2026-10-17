# SQLite local e gráficos de viagens — 17/10/2026

## Objetivo e prioridade

A persistência estruturada é a primeira lacuna funcional adicionada. O SQLite permite consultar históricos por PID e data com índices, manter registros de DTC, preservar viagens reais e catalogar testes de sensores sem transformar arquivos longos em bancos improvisados.

## Dependências

Compatibilidade declarada para a base atual do aplicativo:
- Expo SDK `~51.0.39` + `expo-sqlite@~14.0.6`;
- `expo-linear-gradient@~13.0.2`, `react-native-svg@15.2.0` e `react-native-gifted-charts@1.4.47` para visualização opcional de dados.

A seleção usa versões compatíveis com a linha SDK 51, não os últimos majors do Expo. A árvore deve continuar reprodutível por `npm ci`.

## Banco e versionamento

Arquivo privado do aplicativo: `meriva-smart-diagnostic.db`. O módulo `src/database/diagnosticDatabase.ts` mantém uma única promessa de inicialização e uma migração versionada (`schema_migrations`, versão 1).

Tabelas criadas nas migrações v1/v2:
- `pid_samples`: amostras numéricas válidas e amostradas, com unidade, status de parser, origem explícita, RX bruto, hora UTC e hora local; índices por PID/data e origem/data;
- `telemetry_samples`: consultas completas de protocolo, inclusive falhas, com valor NULL quando ausente, status do comando, protocolo, latência e TX/RX; índices por PID/data e data;
- `dtc_records`: estado, origem, primeiras/últimas ocorrências e metadados;
- `trips` e `trip_telemetry`: viagens e amostras esparsas;
- `sensor_test_runs` e `sensor_test_results`: sessões de teste, tentativas por PID e avaliação;
- `diagnostic_runs`: espaço de armazenamento para resultados e contadores de bloqueios;
- `schema_migrations`: versão aplicada.

Consultas usam parâmetros SQL; campos de origem têm restrições CHECK; valores ausentes permanecem NULL e são apresentados como N/D na interface, nunca convertidos em zero artificialmente.

## Integração gradual e recuperação

A adoção é aditiva, não uma substituição abrupta:
1. Autosave JSON, arquivos CSV e relatórios TXT existentes continuam preservados como fonte de restauração/exportação.
2. O app tenta inicializar o SQLite em paralelo no layout raiz. Erro é registrado no log e não bloqueia Bluetooth/ECU nem o autosave antigo.
3. Cada consulta OBD (inclusive timeout/NO DATA) é enfileirada de forma assíncrona em `telemetry_samples`, mantendo status, protocolo, latência e TX/RX. A fila secundária tem limite de 500 gravações pendentes e só descarta amostras do índice SQLite quando saturada; CSV/TXT permanecem independentes. Uma amostra numérica RESPONDEU por PID/origem a cada 5 s é adicionalmente registrada em `pid_samples`. A fila SQL não segura o próximo comando serial do ELM327.
4. O autosave espelha DTCs após gravação JSON; viagens só são indexadas quando `source === REAL_OBD`.
5. Depois de gerar o TXT dos testes de sensores, o app grava o conjunto estruturado quando a ECU real foi validada no início. Se SQLite falhar, o TXT continua salvo e a interface informa o problema.
6. A base existente ainda precisa de uma etapa posterior de importação idempotente de históricos JSON/CSV antigos. Nenhuma migração destrutiva é executada nesta fase.

## Proveniência e segurança diagnóstica

As fontes permanecem separadas: `REAL_OBD`, `SIMULACAO`, `CARSCANNER_BASELINE`, `USER_REAL_OBSERVATION` e `IMPORTADO`. Uma resposta válida de PID comprova resposta do protocolo, não a precisão física do sensor. Nenhum PID candidato é promovido a confirmado. Nenhum comando de atuação/escrita na ECU foi introduzido.

## Gráficos

A tela de viagens ganhou:
- barras de distância das últimas sete viagens reais;
- linha de consumo por viagem apenas quando a cobertura de combustível é válida;
- exclusão explícita de amostras inválidas, combustível abaixo de 0,05 L e valores acima de 30 km/L.

A filtragem foi isolada em `src/trip/tripChartData.ts` com testes de proveniência e limites. Os gráficos não ficam no cockpit de direção e não consultam a ECU.

## Validação e limitações

A suíte adiciona testes de contrato para schema/migração SQLite v1→v2, captura de resposta OBD sem sucesso, origem dos dados, consultas parametrizadas, exclusão de viagens seed, armazenamento de relatório e política de gráficos. O teste da API Expo SQLite usa mock Node: demonstra contratos da camada JS, não é teste de um arquivo SQLite nativo real. O build Android da CI verifica a integração nativa; somente o APK instalado e uma sessão física podem comprovar comportamento no dispositivo e com a Meriva/ELM327.

Próximos passos após CI: corrigir os erros observados; confirmar o APK standalone; instalar no Samsung Android de teste; verificar criação/reabertura do banco, persistência após encerrar o app, espaço de armazenamento e sessão real. A migração histórica deve ser separada e idempotente antes de mudar qualquer caminho de leitura principal.
