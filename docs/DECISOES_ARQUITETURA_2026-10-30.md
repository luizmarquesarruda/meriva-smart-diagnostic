# Decisões de arquitetura — MERIVA SMART

**Data:** 2026-10-30  
**Escopo:** estabilização da PR #98 e execução das prioridades P0–P2.

## ADR-001 — Escopo atual de produto: Chevrolet Meriva

**Decisão:** manter o aplicativo focado no perfil Chevrolet Meriva Maxx 2012 nesta etapa. Não anunciar seleção multi-veículo como capacidade existente.

**Motivo:** o código atual inicializa/normaliza o perfil Meriva, usa capacidade nominal de 56 L e reserva de referência de 5 L e contém regras específicas de manutenção. Generalizar apenas a tela de veículo sem generalizar fórmulas, persistência, manutenção e evidência ECU produziria uma abstração falsa.

**Consequência:** qualquer expansão multi-veículo deverá vir como projeto próprio, incluindo seleção de perfil, migração, validação de capacidade/reserva, regras específicas e testes de regressão. O README já foi ajustado para declarar o escopo presente.

## ADR-002 — Persistência: manter JSON/TXT/CSV; não migrar para SQLite agora

**Decisão:** manter os formatos atuais no ciclo de estabilização.

- JSON: configurações, snapshots, perfis e estado estruturado pequeno.
- TXT: diário legível e registros operacionais.
- CSV: telemetria RAW/interpretada e exportação tabular.
- Backup: cópia verificada dos diretórios de dados, incluindo MANUTENCAO.

**Motivo:** ainda não há medição de volume, custo de leitura/escrita ou padrão de consultas que justifique a migração. Uma troca geral afetaria autosave, migrações, exportações, backup e integridade de dados existentes.

**Gatilhos para reavaliar SQLite:** medir crescimento diário/semanal dos CSV, latência de flush por tamanho de arquivo, tempo de leitura por período, consultas reais da UI, concorrência e custo de backup/restauração. Se o histórico exigir consultas indexadas ou transações frequentes, avaliar SQLite seletivamente para eventos/viagens; não migrar assets, configurações e exportações append-only sem necessidade.

**Risco conhecido:** a API legada do FileSystem no SDK 51 não oferece caminho de append tipado utilizado pelo projeto; o logger preserva arquivos lendo e regravando o arquivo diário. Monitorar latência e tamanho antes de escolher append nativo, segmentação CSV ou SQLite.

## ADR-003 — Modernização Expo/React Native: adiar até baseline físico

**Decisão:** não atualizar Expo SDK 51, React Native 0.74.5 ou react-native-bluetooth-classic 1.73.0-rc.17 dentro da PR de estabilização Bluetooth.

**Motivo:** transporte RFCOMM, permissões Android, localização em segundo plano, FileSystem, configuração de plugins e build nativo são acoplados. A conexão física no Galaxy A06/Android 16 ainda não foi homologada; atualizar agora removeria a referência estável necessária para distinguir regressão pré-existente de regressão de plataforma.

**Plano autorizado para uma frente futura, depois do baseline físico:**
1. guardar APK, SHA, logs de Bluetooth e resultados físicos da versão atual;
2. atualizar um SDK Expo por vez usando as versões correspondentes de cada pacote;
3. gerar prebuild/Gradle e rodar doctor, baseline, TypeScript e suíte completa;
4. migrar FileSystem legacy com leitura de dados antigos, backup anterior e restauração testada;
5. validar instalação limpa e atualização sobre instalação existente;
6. repetir matriz física Bluetooth/ELM/ECU, GPS foreground/background, autosave, exportação e restauração;
7. manter rollback para o último APK homologado.

## ADR-004 — Backup e restauração

**Decisão:** backup só é oferecido para restauração quando o manifesto e o tamanho de cada diretório conferem. A restauração cria um safety backup do estado atual, desconecta o OBD, encerra a viagem e descarrega autosave antes de substituir os diretórios presentes no snapshot. Em falha de cópia, tenta reverter os diretórios afetados.

**Limite:** diretórios ausentes em backups antigos são preservados, não apagados. Isso evita que snapshots anteriores à criação de MANUTENCAO eliminem registros atuais.

## ADR-005 — CI única por branch

**Decisão:** eventos push e pull_request do mesmo repositório/branch compartilham o mesmo grupo de concorrência. Uma execução nova cancela a anterior, evitando builds Android duplicados para o mesmo branch. A chave também diferencia PRs de forks pelo repositório de origem.

## Critério de release

Nenhuma dessas decisões substitui o gate P0: `validate` e `android-build` verdes no mesmo SHA, APK artefato associado ao SHA e teste físico separado no Galaxy A06 / SM-A065M / Android 16 com ELM327 e ECU reais.


## ADR-006 — Integridade do histórico e rotação de logs — 2026-10-31

**Decisão:** manter `VIAGENS/index.json` como fonte persistente única de viagens concluídas; manter as exportações CSV/TXT compatíveis. Os autosaves novos mantêm apenas o estado transitório e não gravam uma segunda cópia de `driveCycles`. No carregamento, os dados legados são reconciliados por ID e gravados no índice após backup validado. Duplicatas usam o snapshot válido com mais evidência de telemetria.

**Decisão de logging:** manter a API legada do FileSystem no SDK 51, rotacionando CSVs diários em partes limitadas a 512 KiB. A fila de telemetria tem watermark de 10.000 linhas; ao alcançá-lo, persiste chunks CSV independentes e verifica a leitura. O limite duro de RAM é 20.000 linhas; a tela Armazenamento expõe linhas pendentes, linhas em spool e descartes residuais.

**Motivo:** a API atualmente instalada não oferece append tipado. A rotação limita o custo de regravação por flush sem trocar a biblioteca nativa durante a homologação Bluetooth/GPS. O índice de viagens evita serializar amostras históricas grandes em cada autosave.

**SQLite:** continua como opção seletiva futura para histórico/eventos, condicionada a medições no Galaxy A06 de crescimento, latência, concorrência e consultas. Não migrar sem cópia anterior, reconciliação por ID, teste de restauração e rollback.


## ADR-007 — Versionamento e benchmark do histórico — 2026-10-31

**Decisão:** o índice JSON de viagens usa `schemaVersion: 2`; índices legados sem versão explícita são tratados como schema 1 e atualizados somente após backup verificado. Schemas futuros/desconhecidos são somente leitura para a versão atual do app e nunca são regravados por downgrade.

**Medição:** o benchmark no aparelho mede tamanho do índice, volume CSV, viagens/IDs/amostras, leitura+parse e gravação temporária+read-back. O benchmark não altera o histórico real. A comparação SQLite deve usar o mesmo snapshot congelado, a mesma carga de viagens/amostras e o mesmo aparelho.

**Critério de migração:** não migrar viagens ou amostras para SQLite até haver resultado físico comparável no Galaxy A06. Se a evidência justificar, migrar primeiro viagens e amostras em transação, manter JSON como cópia imutável até conferir IDs/contagens/checksum e validar restauração. Configurações, buffers e exportações ficam fora do escopo.
