# Painel web local — Windows 10 + USB

Status: especificação inicial na branch feat/desktop-dashboard-usb-20261016. Não integrado à main; CI não deve ser executada nesta etapa.

## Objetivo
Disponibilizar no notebook Windows 10 um painel local para análise histórica do Meriva Smart Diagnostic: sessões ECU, séries temporais de PIDs reais, DTCs, viagens e relatórios. A aquisição OBD continua exclusivamente no Android.

## Arquitetura proposta
- Android: SQLite operacional atual continua sendo a origem dos dados. Criar uma camada explícita de exportação/sincronização; não permitir acesso arbitrário ao sandbox privado do app.
- USB/ADB: conexão autorizada pelo usuário. O serviço Windows detecta o aparelho via adb devices e configura o transporte local. ADB é uma dependência de instalação e deve ser explicado ao usuário.
- Transporte implementado: `adb reverse tcp:8765 tcp:8765`; o app Android acessa `http://localhost:8765` e envia lotes para o serviço Windows. Isso evita depender de Wi-Fi ou abrir portas no roteador. A transferência ainda precisa ser validada em aparelho físico.
- Serviço Windows: processo local autenticado que recebe lotes versionados, valida o schema, aplica UPSERT/idempotência e grava uma base SQLite própria do painel.
- Web UI: navegador acessa apenas loopback, por exemplo http://127.0.0.1:8765; gráficos e filtros leem a base local através de API HTTP.
- Exportações: manter TXT diário e JSON do aplicativo. O painel não apaga nem modifica os originais.

## Requisitos de segurança e integridade
1. Exigir autorização USB do Android e nunca tentar contornar o sandbox do aplicativo.
2. Não escutar em interfaces públicas; serviço limitado a loopback.
3. Autenticar o canal local e validar o tamanho/formato de cada lote.
4. Identificar cada registro com chave estável; reimportar o mesmo lote não pode duplicar dados.
5. Guardar source e timestamps originais. Apenas REAL_OBD alimenta conclusões de diagnóstico.
6. Distinguir dado ausente, inválido, simulado e leitura real.
7. Sincronização não deve apagar dados no celular. Falha de conexão deve permitir retomada incremental.
8. O banco do notebook é uma réplica de análise; o banco do Android continua sendo a origem operacional.

## Etapas
1. Auditar o esquema e funções públicas de consulta/exportação do SQLite Android.
2. Definir contrato versionado para sessões, amostras PID, DTCs, testes, viagens e PIDs aprendidos.
3. Implementar exportação por lotes no Android e confirmação por cursor/checkpoint.
4. Implementar serviço Windows, detecção ADB, importação idempotente e base local.
5. Construir painel: resumo, filtros por dia/sessão, gráficos temporais, DTCs, PIDs aprendidos e relatórios.
6. Adicionar inicialização simplificada do serviço e abertura do navegador.
7. Validar cópias repetidas, grandes históricos, desconexão USB, permissões, horários e comparação com TXT/SQLite de origem.

## Critério de aceite
Conectar o telefone por USB, autorizar uma vez, iniciar o serviço local e sincronizar automaticamente sem copiar pastas manualmente. Repetir a sincronização não cria duplicatas; desligar o notebook não afeta os dados do celular; a página continua exibindo tudo o que já foi importado.

## Validação
Nenhum teste de runtime, instalação Windows ou teste físico USB foi executado ainda. A CI foi intencionalmente evitada nesta etapa.

## Implementação inicial — 16/10/2026

A branch agora contém uma primeira versão executável do serviço e da interface:

- `desktop-dashboard/server.mjs`: API local em `127.0.0.1:8765`, base SQLite independente e rotas de resumo, sessões, leituras por PID, DTCs, PIDs aprendidos, viagens, testes e achados.
- `desktop-dashboard/index.html`: painel que consulta a API e desenha um gráfico SVG a partir de amostras realmente importadas.
- `desktop-dashboard/start-dashboard.bat` e `watch-usb.ps1`: inicializam o serviço/navegador e reaplicam `adb reverse` quando o Android autorizado é conectado ou reconectado.
- `src/storage/merivaDatabase.ts`: leitura paginada das amostras SQLite reais e exportação estável das entidades para sincronização.
- `src/storage/desktopSync.ts`: cliente que verifica o serviço, envia lotes, salva o cursor localmente após confirmação e retoma por ID da amostra.
- `plugins/withLoopbackDashboardNetwork.js` + `app.json`: política de rede Android que permite HTTP em loopback e mantém tráfego claro desabilitado para outros domínios.
- `desktop-dashboard/server.test.mjs`: teste de API para importação idempotente e filtro de origem simulada.
- `.gitignore`: impede versionar a base local de histórico do notebook.

### Pré-requisitos e execução

1. Instalar Node.js 22.x (mínimo 22.5, por usar `node:sqlite`) e Android Platform Tools/ADB no Windows.
2. No Android, habilitar opções do desenvolvedor e depuração USB; conectar por cabo de dados e aceitar a autorização do computador.
3. Executar `desktop-dashboard/start-dashboard.bat`. Manter aberta a janela de monitoramento USB.
4. O navegador abre em `http://127.0.0.1:8765`. A base do notebook é criada em `desktop-dashboard/data/meriva-dashboard.db` e fica fora do Git.
5. Para executar o teste local da API, abrir um terminal na pasta `desktop-dashboard` e executar `npm test` com Node 22.5+.

### Limites atuais — não confundir código criado com validação concluída

- A API e o cliente Android foram adicionados, mas **não foram executados neste ambiente**. Não foi possível confirmar build Android, runtime Node/SQLite, autorização ADB nem transferência com telefone físico.
- A exportação envia sessões e entidades de apoio junto com páginas de até 500 amostras PID. O cursor só avança após uma resposta HTTP de sucesso; os IDs das amostras tornam reimportações idempotentes.
- O cliente sincroniza enquanto o aplicativo Android está em primeiro plano. Não há promessa de transferência com o app encerrado ou em background.
- O serviço requer Node 22.x e ADB configurado no PATH; ainda não é um instalador autossuficiente.
- O teste automatizado foi criado, mas não executado. A CI não foi disparada nesta etapa, conforme a restrição do projeto.
- Antes de considerar pronto: executar `npm test` na pasta do painel, `npm run validate`, Expo prebuild/build, testar USB real, desconexão/reconexão, lotes grandes e comparar contagens com a base SQLite/TXT do celular.

### Segurança e integridade

O serviço escuta somente em loopback e o banco do notebook é separado da base Android. A política de rede Android foi limitada ao loopback. A depuração USB continua exigindo autorização explícita no próprio telefone. A importação filtra leituras, DTCs, testes, viagens e achados por origem `REAL_OBD`; linhas com outra origem não podem alimentar o painel diagnóstico. A base local do notebook deve ser tratada como dado pessoal do veículo e não compartilhada sem intenção.


### Revisão estática complementar

- As IDs importadas agora recebem namespace persistente do app Android, evitando colisão com IDs de uma nova instalação/banco recriado. O cursor de amostras permanece separado do identificador da origem.
- As colunas JSON são preservadas como JSON válido em vez de serem serializadas novamente como strings.
- A tabela de lotes do serviço é limitada aos 1.000 recebimentos mais recentes; a base de histórico não é apagada por essa limpeza.
- **Autenticação de aplicação ainda pendente:** a API não usa token por lote. A mitigação atual é escutar exclusivamente em `127.0.0.1`, não abrir porta na LAN e exigir depuração USB autorizada. Não mudar o bind para `0.0.0.0` nem expor a porta por firewall/roteador. Antes de distribuir para terceiros, adicionar autenticação pareada e teste de segurança.
