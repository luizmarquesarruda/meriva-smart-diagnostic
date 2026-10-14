# Auditoria de continuidade — 2026-10-14

## Resumo executivo

Esta rodada prioriza integridade do estado, menor escrita de disco e correção de interpretação OBD-II. As mudanças mantêm `CONFIG/autosave.json` como fonte completa do estado persistido e tratam o TXT histórico como resumo legível, limitado a 1.000 snapshots.

## Persistência e desempenho

- Criado `src/knowledge/autosave_policy.json` para centralizar debounce, checkpoint, limite das leituras recentes, cadência de gravação numérica, limite de snapshots e tamanhos dos resumos TXT.
- `autosave.json` agora usa serialização JSON compacta. O fluxo de gravação continua escrevendo primeiro em arquivo temporário, relendo/validando o envelope, guardando o arquivo anterior e só então promovendo o novo estado.
- O estado JSON continua sendo salvo conforme a cadência operacional. O histórico TXT só é refeito quando passa o intervalo mínimo de 30 s ou quando ocorre um motivo forçado (evento crítico, manual, background e fronteiras/recuperação de sessão).
- A cadência de snapshots não descarta atualizações do estado JSON. O teste de regressão protege esse contrato.
- O limite de histórico permanece configurável em 1.000 snapshots. As linhas TXT usam um único separador em branco entre blocos para reduzir espaços desnecessários.

## Auditoria de fórmulas OBD-II

Valores abaixo descrevem fórmulas padronizadas de referência; não afirmam que a ECU específica da Meriva oferece cada PID. A disponibilidade deve vir do bitmap atual e a decodificação depende de resposta positiva válida com comprimento correto.

| PID | Parâmetro | Fórmula padrão revisada | Observação |
|---|---|---|---|
| `0105` | Temperatura do líquido de arrefecimento | `A - 40` °C | Decodificação padrão |
| `010C` | Rotação | `(256 × A + B) / 4` rpm | Gate de resposta real da ECU |
| `010D` | Velocidade informada pela ECU | `A` km/h | Não substitui a distância GPS |
| `010F` | Temperatura do ar de admissão | `A - 40` °C | Só consultar se suportado |
| `0111` | Posição relativa da borboleta | `A × 100 / 255` % | Interpretar em contexto |
| `0114` | Sonda O₂ B1S1 convencional | Tensão `A / 200` V; STFT `(B × 100 / 128) - 100` % | Dois bytes de dados |
| `0152` | Percentual de etanol | `A × 100 / 255` % | Não presumir que a ECU da Meriva o suporte |
| `015E` | Taxa de combustível | `(256 × A + B) / 20` L/h | Medição ECU preferida, se respondida |

### Correção aplicada ao PID 0114

Foi removida uma interpretação não respaldada pela fórmula padrão: tratar o byte B `0xFF` como sentinela universal de ausência. A referência consultada descreve o campo STFT com o intervalo completo do byte, de `-100%` até `99,2%`; portanto, `0xFF` produz `99,21875%` (exibido como `99,22%`). O byte B não altera a tensão derivada do byte A. A cobertura de regressão foi atualizada.

## Pesquisa de documentação e projetos

- Referência OBD-II com bytes, unidades e fórmulas: https://github.com/evrenonur/obd2-elm327-pid-reference/blob/master/OBD2_Complete_PID_Reference_EN.md
- Implementação aberta com tabela de comandos e separação de estado do adaptador/veículo: https://python-obd.readthedocs.io/en/latest/Command%20Tables/ e https://python-obd.readthedocs.io/en/latest/Connections/
- Referência Expo FileSystem para escrita/leitura e operação de arquivos: https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/

O repositório de referência OBD-II é uma implementação comunitária que afirma cruzar dados de SAE J1979/ISO 15031-5; não substitui a norma paga, documentação OEM ou validação na ECU da Meriva.

## Validação e limites

- Adicionados testes para política JSON, gravação compacta e desacoplamento da atualização TXT em relação ao salvamento do estado.
- Adicionada regressão para o PID 0114 com byte B `0xFF`, além de exemplos para os cálculos de `0152` e `015E`.
- Esta documentação registra mudanças no código; não declara a CI aprovada nem teste físico executado. O teste automatizado/TypeScript/build deve ser confirmado pela CI mais recente. Compatibilidade com o ELM327 real, suporte dos PIDs e acurácia física dos sensores exigem teste separado na Meriva.

## Continuação — Atualidade dos relatórios e custo do motor de regras

Os TXT históricos de outubro mostram DTCs `P0135/P0420` com status persistido `CURRENT` mas última observação datada de dias antes da sessão. O motor de diagnóstico já bloqueia evidências com mais de 120 s; a apresentação do TXT não era igualmente explícita. Por isso:

- Criado `src/knowledge/diagnostic_policy.json` com janela de evidência de 120 s, tolerância futura de 5 s e status DTC que podem ser considerados ativos.
- O motor de diagnóstico indexa a leitura mais recente por PID e o DTC mais recente por código em uma única passagem por diagnóstico.
- O diário de sessões limita as leituras apresentadas ao intervalo temporal configurado e mostra no máximo uma linha atual por PID; os registros antigos continuam no autosave JSON e no histórico bruto.
- Os DTCs preservam seu status original, mas o TXT marca evidências antigas como `HISTÓRICO/SEM_REVALIDAÇÃO` em vez de apresentá-las como se tivessem sido reconsultadas agora.
- Testes automatizados protegem a janela temporal, a escolha da amostra mais recente e a rotulagem de DTCs antigos.

Os TXT também continham viagens curtas, algumas com `amostras=0`, e consumos acima de 30 km/L. A implementação atual do `RealTripRecorder` adiciona amostras de telemetria quando inicia uma viagem; os registros antigos sem amostras são tratados como legados. Consumo insuficiente/implausível continua representado como `N/D`, mantendo a distância e a viagem preservadas.

