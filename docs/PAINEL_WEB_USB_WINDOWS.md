# Painel web local — Windows 10 + USB

Status: especificação inicial na branch feat/desktop-dashboard-usb-20261016. Não integrado à main; CI não deve ser executada nesta etapa.

## Objetivo
Disponibilizar no notebook Windows 10 um painel local para análise histórica do Meriva Smart Diagnostic: sessões ECU, séries temporais de PIDs reais, DTCs, viagens e relatórios. A aquisição OBD continua exclusivamente no Android.

## Arquitetura proposta
- Android: SQLite operacional atual continua sendo a origem dos dados. Criar uma camada explícita de exportação/sincronização; não permitir acesso arbitrário ao sandbox privado do app.
- USB/ADB: conexão autorizada pelo usuário. O serviço Windows detecta o aparelho via adb devices e configura o transporte local. ADB é uma dependência de instalação e deve ser explicado ao usuário.
- Transporte: preferir uma conexão encaminhada pelo ADB para não depender de Wi-Fi nem abrir portas no roteador. O desenho final deve escolher e testar um único sentido de conexão.
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