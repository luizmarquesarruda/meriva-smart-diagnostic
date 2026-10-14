# Instruções para Claude Code — Auditoria técnica do Meriva Smart Diagnostic

Issue de acompanhamento: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/issues/57

## Objetivo

Auditar o repositório inteiro e entregar recomendações de correção e melhoria baseadas em evidências. **Esta etapa é somente leitura: não modifique arquivos, não crie commits ou PRs, não faça merges e não execute/dispare CI sem autorização explícita.**

## Contexto técnico

- Aplicativo Android React Native, Expo SDK 51 e TypeScript; pasta Android nativa disponível.
- Comunicação com adaptadores ELM327 via Bluetooth Classic e diagnóstico OBD-II.
- Veículo de referência: Chevrolet Meriva Maxx 1.4 Flex, anos 2010–2012.
- Protocolo a investigar: ISO 14230-4 KWP/K-Line; KWP Fast a 10400 baud quando confirmado para a ECU real.
- Requisitos de produto: priorizar PIDs realmente descobertos e validados; separar dados reais de simulações/seeds/históricos importados; histórico TXT agrupado por data, preservar múltiplas sessões e sequência de registros, suportar até 1000 snapshots; logs de testes de sensores separados; GPS vinculado ao estado de conexão da ECU; testes de sensores com modos motor desligado/ligado e pelo menos três leituras válidas por PID.

## Áreas obrigatórias

1. **Arquitetura e ciclo de vida:** mapear fluxos entre Bluetooth, transporte ELM327, sessão OBD, telemetria, PIDs, DTCs, histórico e UI. Procurar condições de corrida, listeners duplicados, vazamentos, recursos não liberados e estados inconsistentes.
2. **Bluetooth/ELM327/OBD:** verificar inicialização, handshake, seleção de protocolo, parsing, timeouts, retries, recuperação e reconexão. Confirmar serialização dos comandos por fila/mutex; diferenciar adaptador conectado de ECU respondendo, sem resposta, resposta inválida e desconexão real.
3. **PIDs, JSON e conhecimento local/IA:** auditar `src/knowledge/`, fórmulas, unidades, faixas, fontes e confiança. Não assumir suporte a PID só porque consta numa lista. Identificar dados de CarScanner, seeds e simulações que possam aparecer como dados reais. Não inventar capacidades específicas da ECU.
4. **Histórico:** revisar agrupamento diário, sequência global, múltiplas sessões no mesmo dia, datas desconhecidas, deduplicação, concorrência de gravação, migração e limite de 1000 snapshots. Verificar perdas/sobrescritas ao reiniciar sessão, fechar o app ou desconectar a ECU.
5. **GPS e viagens:** verificar início/fim do registro conforme conexão/resposta da ECU, permissões, localização indisponível, bateria, distância GPS e fórmulas de consumo. Documentar limites quando faltarem dados reais.
6. **Testes de sensores:** revisar modos motor desligado/ligado, seleção de PIDs, mínimo de três leituras, progresso/contagem regressiva, conclusão, timeout, PID não suportado, leitura inválida, desconexão e cancelamento.
7. **Interface e desempenho:** verificar legibilidade, rolagem, orientação retrato/paisagem, tamanhos de tela, tela ligada durante o uso, polling, renderizações e trabalho repetitivo. Priorizar confiabilidade e segurança.
8. **Testes, CI e documentação:** comparar testes com contratos do código; identificar lacunas em Bluetooth, parsing, concorrência, PIDs, histórico, GPS e testes de sensores. Investigar falhas recentes de CI e distinguir execuções antigas das atuais. Conferir README, documentação e diário de bordo.

## Formato do relatório

Entregar em português:

1. Resumo executivo e cinco riscos principais.
2. Achados com severidade **P0/P1/P2/P3**, caminho e linha/função, evidência, cenário de reprodução, impacto e confiança.
3. Correção recomendada, alternativas, riscos e critérios objetivos de aceite para cada achado.
4. Plano de execução priorizado, com mudanças pequenas e independentes — um defeito principal por commit.
5. Plano de testes automatizados, validação Android e testes físicos necessários com a Meriva/ELM327.
6. Lacunas que não podem ser confirmadas apenas pelo código ou CI.

## Regras de qualidade

- Inspecione o código real e cite caminhos/linhas ou funções. Não apresente suposições como fatos.
- Não declare testes executados sem executá-los; informe comandos e resultados apenas quando houver evidência.
- Não use uma execução de CI antiga como prova do estado atual.
- Não remova funcionalidades nem apague histórico para simplificar uma correção.
- Não conclua diagnóstico mecânico nem recomende troca de peças com base apenas no código do app.
- Não altere nada nesta fase. Finalize com recomendações priorizadas e aguarde autorização humana antes de implementar.
