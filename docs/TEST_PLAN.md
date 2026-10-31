# Plano de testes críticos — Meriva Smart Diagnostic

## Objetivo e limites

Este documento define os critérios de aceitação para mudanças no cockpit, navegação, estado da ECU, telemetria e diagnóstico. Ele distingue **testes automatizados**, **CI/build nativo** e **validação física**. Não declarar um nível de validação com base em evidência de outro nível.

## Estado verificado na branch de trabalho

A branch mantém o fluxo OBD/ELM327 existente e inclui testes automatizados para navegação do cockpit, estado de conectividade, apresentação da autonomia, temperatura e DTC. O relatório de funcionalidades é uma proposta, não prova de que cada recurso está implementado. Antes de criar novos módulos, verificar a tela/serviço existente e ampliar o contrato atual.

## SEC-CI-01 — Distribuição privada do APK

- Em repositório público, push, pull request e workflow_dispatch podem validar/compilar, mas não enviam APK como artefato e não criam GitHub Release.
- Em repositório privado, somente execução de `main` pode enviar APK e checksum SHA-256; retenção máxima de três dias.
- Pull requests nunca recebem etapa de upload, mesmo quando o repositório é privado.
- Confirmar `permissions: contents: read`, ausência de `contents: write` e ausência de job `publish-release`.
- Confirmar que cada action externa usa SHA completo de commit e que os SHAs correspondem às releases oficiais selecionadas.
- A configuração de visibilidade privada é requisito operacional separado; a CI não deve presumir que a branch de origem é privada.

## PERM-GPS-01 — Permissões opcionais e propriedade única do GPS

- Inicialização no Android 12+ solicita Bluetooth Connect/Scan sem solicitar localização.
- OBD pode conectar, inicializar ELM327 e consultar a ECU mesmo quando localização está negada ou serviços de localização estão desligados.
- A permissão de segundo plano só é solicitada após ação explícita no switch de Configurações; configuração ausente em arquivos antigos equivale a `false`.
- O serviço de monitoramento só consulta permissão de segundo plano já concedida e nunca abre prompt durante polling OBD.
- `sharedConnection` não inicia nem encerra GPS; `autoTripService` controla início, troca foreground/background e parada.
- Desativar background durante sessão troca para watcher foreground sem zerar distância, máximo de velocidade ou contagem de amostras.

## PERM-GPS-01 — Permissões opcionais e propriedade única do GPS

- Inicialização no Android 12+ solicita Bluetooth Connect/Scan sem solicitar localização.
- OBD pode conectar, inicializar ELM327 e consultar a ECU mesmo quando localização está negada ou serviços de localização estão desligados.
- GPS foreground e background começam desativados; suas permissões só são solicitadas após opt-in explícito em Configurações. Arquivos antigos sem essas opções permanecem desativados.
- O serviço de monitoramento apenas consulta permissões já concedidas e nunca abre prompt dentro do polling OBD.
- `sharedConnection` não inicia nem encerra GPS; `autoTripService` controla início, troca foreground/background e parada.
- Desativar background durante sessão troca para watcher foreground sem zerar distância, máximo de velocidade ou contagem de amostras.

## Casos de regressão obrigatórios

| ID | Cenário | Resultado esperado | Evidência |
|---|---|---|---|
| OBD-01 | Abrir o app sem adaptador ELM327 | ECU desconectada; leituras atuais mostram N/D; app não trava | testes de conectividade e inspeção Android |
| OBD-02 | Bluetooth conectado, ECU sem resposta | Estado distinto de Bluetooth conectado; não declarar diagnóstico pronto | `tests/bluetoothState.test.js`, `tests/ecuHealth.test.js` |
| OBD-03 | Perder ECU durante uma leitura | Encerrar/recuperar a sessão com erro explícito; nenhuma resposta ausente vira zero | testes de ciclo de vida ELM327 e validação física |
| OBD-04 | `isConnected()` nativo demora indefinidamente, rejeita ou retorna desconectado durante TX/RX/fechamento | Estado nativo tem timeout finito; escrita é bloqueada se o estado não for confirmado; o timeout do RX não é estendido indefinidamente; fechamento pendente mantém bloqueio RFCOMM | `tests/connectionRecovery.test.js`, `tests/bluetoothLifecycle.test.js`, teste físico Android/ELM327 |
| DATA-01 | Leitura ausente, inválida, futura ou vencida conforme a janela do recurso (10 s para contexto operacional; 30 s para autonomia) | Não exibir como leitura atual; usar N/D neutro e não classificar contexto a partir de timestamp futuro | `tests/regression.test.js`, `tests/liveTelemetry.test.js`, `tests/autonomyPresentation.test.js` |
| GPS-02 | GPS recebe timestamp ausente, não finito, zero ou anterior/igual ao último fix válido | Descartar a amostra inteira; não usar `Date.now()` como substituto nem alterar contagem, velocidade ou distância; retomar com o próximo timestamp crescente | `tests/gps.test.js`, RG-38 |
| DATA-02 | Autonomia sem nível de combustível atual válido, com timestamp ausente/inválido ou amostra do PID 012F acima de 30 s | Exibir N/D em todas as telas de estado atual; nunca presumir tanque cheio nem reutilizar amostra vencida ou autonomia persistida como atual | `tests/autonomyPresentation.test.js` |
| DATA-03 | Sem internet, com ECU funcional | Diagnóstico local continua funcional; clima/rede falham de forma isolada | `tests/onlineConditions.test.js`, `tests/connectivity.test.js` |
| NAV-01 | Navegar entre as cinco áreas principais | Um único conjunto de destinos, rótulos visíveis e alvos acessíveis | `tests/cockpitNavigation.test.js` |
| NAV-02 | Girar aparelho entre retrato e paisagem | Conteúdo e navegação continuam acessíveis; sem sobreposição crítica | `tests/orientationLayout.test.js` |
| COCKPIT-01 | Abrir cockpit com DTCs presentes/ausentes e PID 010B válido/ausente | Não repetir contagem/status DTC na página inicial; mostrar pressão do coletor apenas com leitura real válida e recente, caso contrário N/D; DTC continua na página Saúde | `tests/cockpitNavigation.test.js`, `tests/liveTelemetry.test.js` |
| DTC-01 | Ler DTC sem ECU conectada, com NO DATA, timeout ou quadro inválido/incompleto | Exibir erro/N/D; nunca declarar “nenhum DTC” nem tornar DTC anterior inativo sem resposta válida | `tests/dtcScanner.test.js`, `tests/regression.test.js` e gate de baseline |
| DTC-02 | Limpar DTC | Confirmar a ação destrutiva, informar sucesso/erro conforme resposta ECU | teste automatizado com transporte simulado e teste físico |
| SPLASH-01 | Inicialização fria de APK nativo | Fundo e imagem de marca corretos; transição para o app sem tela vazia persistente | gate de baseline verifica plugin, caminho e assinatura PNG; inspeção visual em Android instalado continua obrigatória |
| BUILD-01 | Commit final da PR | Gate, TypeScript, suíte e build Android concluídos com sucesso para o mesmo SHA | execução GitHub Actions do SHA exato |
| BACKUP-01 | Criar backup com registros de manutenção/abastecimento | Manifesto inclui MANUTENCAO e os tamanhos dos diretórios conferem; armazenamento mostra o tamanho da pasta | `tests/regression.test.js`, `tests/merivaAutosave.test.js` |
| BACKUP-02 | Restaurar snapshot íntegro com dados posteriores no aparelho | Desconectar OBD, salvar estado atual, criar safety backup, restaurar diretórios listados e re-hidratar autosave; rollback em falha de cópia | `tests/regression.test.js`, CI e teste Android |
| BACKUP-03 | Snapshot alterado ou incompleto | Não oferecer backup inválido e rejeitar restauração com divergência de manifesto/tamanho | `tests/regression.test.js` |

## Critérios para recursos adicionais

- **Manutenção:** só marcar como implementada após existir persistência local, edição/exclusão de lembretes, cálculo de vencimento e testes para datas/quilometragem ausente.
- **Exportação:** confirmar conteúdo, codificação, compartilhamento e tratamento de dados pessoais; não duplicar exportações TXT/CSV já existentes.
- **Mapas/postos/oficinas:** não adicionar chaves pagas nem rastreamento de localização em segundo plano sem decisão explícita de produto, orçamento, permissões e política de privacidade.
- **OTA, analytics, crash reporting e login:** são decisões de arquitetura e privacidade; não habilitar implicitamente durante um lote de UX.
- **Testes E2E:** Detox/Appium não devem ser declarados instalados ou executados até que dependências, configuração nativa, fixture de transporte OBD simulado e workflow estejam presentes e validados.

## BT-RADIO-01 — Rádio Bluetooth desligado ou indeterminado
- Antes de cada tentativa RFCOMM, confirmar o estado do rádio; desligado interrompe a tentativa antes de criar socket.
- Após falha da chamada nativa, só permitir fallback se o rádio continuar confirmado como ligado e a chamada anterior não estiver pendente.
- Estado indeterminado interrompe o fallback; erro nativo de rádio desligado ou estado desconhecido interrompe retries no manager e no splash.
- A splash preserva a mensagem real e oferece abrir o painel sem declarar a ECU conectada.
- Testes determinísticos: `tests/bluetoothRadioRecovery.test.js`; contratos de integração: `tests/projectBaseline.test.js`; validação final do Bluetooth Classic exige aparelho Android e ELM327 reais.
- Abrir três instâncias em paralelo para o mesmo endereço: todas podem concluir em sequência, mas o máximo de conexões nativas ativas permanece 1.
- Depois que um waiter aguardar uma tentativa anterior, revalidar o rádio e reler o bloqueio compartilhado antes de abrir outro socket.

## Sequência de validação para um lote

1. Inspecionar o diff consolidado e confirmar que nenhuma dependência/lockfile foi alterada sem justificativa.
2. Executar o gate de baseline, TypeScript e suíte completa localmente ou na CI depois que o lote estiver pronto.
3. Executar o build Android standalone e guardar a evidência do SHA.
4. Instalar o APK em Android e validar splash, orientação, navegação e estados sem ECU.
5. Testar conexão, leitura de PID, perda de sinal e DTC com ELM327/veículo reais antes de declarar integração OBD validada.
6. Atualizar o Diário de Bordo com resultados reais; registrar como pendente tudo que não foi executado.

## Não objetivos deste lote

Este plano não autoriza modo oficina avançado, sincronização em nuvem/perfis, login, rastreamento remoto, mudanças no protocolo Bluetooth ou publicação/merge automático.


## SPLASH-02 — Inicialização com ELM327/ECU
- Iniciar sem adaptador: a splash informa o estado e tenta novamente com backoff; após duas falhas, oferece abrir o cockpit sem declarar a ECU conectada.
- `autoConnectObd=false`: pular as tentativas automáticas e abrir o cockpit para conexão manual, conforme preferência salva.
- Negar localização/GPS na inicialização: a tela principal e a consulta OBD devem continuar disponíveis; GPS, clima e captura de percurso devem exibir indisponibilidade sem bloquear a ECU.
- Conectar somente Bluetooth: não declarar ECU pronta sem resposta OBD válida.
- ECU válida: reutilizar a resposta `010C`, consultar as bitmaps anunciadas e confirmar individualmente os PIDs conhecidos. Abrir o cockpit ao concluir a descoberta, sem cinco consultas extras por PID; cinco amostras continuam obrigatórias no teste de sensores.
- PID não suportado ou sem resposta: não fabricar valores, não marcar amostra como válida e continuar os testes restantes.
- Rotação durante splash e cockpit: conteúdo deve permanecer dentro da área segura; validar em Android físico retrato/paisagem.
- O gate automatizado verifica a estrutura do fluxo; a validação física confirma comportamento real de Bluetooth Classic e ELM327.


## UI-LOC-01 — Alternância de cidade/bairro e prioridade térmica
- Com permissão de localização previamente concedida e geocodificação contendo cidade e bairro, a faixa de clima alterna os rótulos a cada 10 s; se o bairro não existir, manter cidade/estado disponíveis sem inventar bairro.
- Sem permissão de localização, não solicitar permissão apenas para clima e exibir indicação opcional indisponível.
- Ao atingir temperatura de arrefecimento de 110 °C, manter o indicador térmico principal priorizado durante o alerta; restaurar a rotação habitual abaixo do limiar.
- Confirmar por testes de origem/geocodificação e gate de layout; a apresentação física permanece parte da validação em Android.


## MAINT-01 — Lembretes locais de manutenção
- Sem histórico: cada item aparece como “CADASTRAR”, sem afirmar que está em dia.
- Histórico por data e/ou odômetro: avaliar vencimento por km ou calendário, o que ocorrer primeiro; validar transição para vencida.
- Óleo: comparar uso normal (10.000 km/12 meses) e severo (5.000 km/6 meses) com o manual do Meriva 2012.
- Dados devem persistir localmente e sobreviver ao reinício; registros incompletos ou datas inválidas não podem confirmar manutenção como em dia.

## FUELLOG-01 — Registro de abastecimentos
- Exigir litros positivos, quilometragem atual salva e quilometragem não inferior ao registro anterior.
- Total pago é opcional; se preenchido, deve ser positivo e ficar separado de consumo OBD.
- Gravar até 100 registros locais; não converter abastecimentos manuais em amostras reais da ECU nem alterar a média OBD.


## PID-AUTO-01 — Integridade de respostas PID e autonomia em tempo real
- Para cada PID catalogado, validar o comprimento de payload definido no catálogo e o resultado da fórmula com bytes de teste; resposta truncada ou com bytes excedentes deve ser recusada.
- Aceitar resposta ELM327 com cabeçalho CAN antes do serviço positivo, sem incluir o cabeçalho no payload.
- No PID 0114, manter o valor principal em volts (A/200) e exibir a interpretação do byte B como STFT = (B×100/128)−100%; quando B=0xFF, informar que o sensor não é usado no cálculo, sem exibir +99,22%.
- A autonomia em tempo real só pode priorizar consumo da viagem quando houver distância ≥ 0,1 km, combustível integrado ≥ 0,05 L e pelo menos duas amostras válidas.
- Antes desse limiar, usar apenas uma média histórica positiva válida; se não existir, apresentar N/D, nunca transformar amostra insuficiente em consumo alto.
- CI automatizada não substitui teste físico com ELM327/ECU; validar no veículo a resposta real do PID 012F e a estabilidade da autonomia.

## FUEL-BUFFER-01 — Buffer volátil de nível de combustível PID 012F
- Coletar somente respostas reais do PID 012F com status RESPONDEU, unidade percent e valor finito entre 0 e 100; ignorar seed, simulação, histórico e falhas.
- Manter as dez leituras válidas mais recentes da mesma sessão ECU. Com menos de 10/10, não existe fallback.
- Leitura ao vivo com até 30 s prevalece; quando ficar desatualizada, a média aritmética do buffer pode sustentar estimativa temporária até 60 s após a última leitura válida. Depois disso, autonomia retorna N/D.
- Rejeitar timestamp futuro, duplicado/regressivo e nível fora de 0–100. Resetar buffer ao iniciar/trocar/encerrar sessão ECU; não persistir amostras entre sessões.
- Calcular a média aritmética simples das dez porcentagens (não mediana); a interface identifica o buffer explicitamente e não o apresenta como leitura atual do PID. ECU deve continuar conectada e o consumo médio deve ser positivo e confiável.
- Testes: tests/fuelLevelBuffer.test.js e tests/autonomyPresentation.test.js; validação física confirma resposta real 012F da ECU.

## PID-AI-01 — Proveniência, frescor e rastreabilidade do diagnóstico local

- Catalogar todas as entradas em `pids.json` e confirmar correspondência exata com `formulas.json` e `ranges.json`; nenhum PID duplicado, fórmula inexistente, unidade ausente ou payload divergente.
- Ao avaliar a IA, aceitar somente origem explícita `REAL`/`REAL_OBD` conforme o contrato da telemetria do app, sem converter fonte desconhecida/importada em real. Rejeitar origem `SIMULACAO`, baseline/seed, telemetria derivada, valor nulo/não finito, faixa inválida, timestamp futuro ou leitura com mais de 45 s por padrão.
- Normalizar o identificador antes da validação da faixa: `01 0B` e `010B` devem apontar para a mesma faixa; espaços não podem permitir que um valor impossível passe na triagem.
- DTC cuja origem não seja `REAL_OBD`, cujo status não esteja ativo ou que esteja marcado `historical=true` não pode gerar hipótese atual. Duplicatas do mesmo DTC/evidência não podem aumentar pontuação.
- Exibir score e LOW/MEDIUM/HIGH como pontuação/nível qualitativo heurístico, nunca como probabilidade de defeito. Não apresentar sistema normal só por inexistência de hipótese: exigir ECU respondendo na sessão atual e dados OBD reais recentes; sem isso, exibir dados insuficientes.
- PID 0101: testar MIL, contador DTC, estado de monitores comuns, suporte por monitor e mapas distintos para ciclo Otto/SI e diesel/CI; bits de incompletude não devem acusar monitores não suportados. Preservar interpretação semântica no autosave/TXT e não exibir o U32 empacotado como medição.
- Testes de sensores: pelo menos cinco tentativas numeradas distintas e cinco respostas válidas para um resultado conclusivo; timestamp inválido/futuro e número de tentativa duplicado não contam. Falha/timeout não vira zero nem aprovação.
- A CI deve validar gate anti-regressão, TypeScript e suíte completa no mesmo SHA. Após build, verificar a tela Saúde/Dados/Laboratório no APK. A confirmação de qualquer novo PID na Meriva exige resposta RAW da ECU; validação física do sensor requer evidência adicional e não é inferida do bitmap ou do valor escalado.

### Decisão de cobertura

O catálogo atual contém 34 PIDs, 20 fórmulas, 34 faixas e 30 avaliações de sensores. Quatro PIDs (`0101`, `0130`, `0131`, `0151`) não têm avaliação de sensor própria, por se tratarem de estado/código/contador e não terem uma regra de teste operacional dedicada. Somente `010C` possui resposta RAW_ECU documentada para a Meriva; dez PIDs são apenas candidatos. Expandir o catálogo requer, em lote controlado, fórmula/documentação, bytes, unidade, faixa, parser vector, política de polling, custo de descoberta e evidência por veículo. Nunca marcar PID padronizado como suportado apenas porque está definido em JSON.

## NET-WEATHER-01 — Atualização de localização/clima por conectividade
- Com internet disponível em Wi-Fi ou rede celular (4G/5G), carregar clima/localidade sem solicitar permissão de localização nova.
- Atualizar após retornar de offline para online e no ciclo de 15 minutos; eventos de rede repetidos não podem disparar requisições concorrentes nem refresh contínuo.
- Quando a rede confirma ausência de internet, não iniciar consulta remota; ao restabelecer a conexão, fazer uma atualização imediata.
- Em falha após leitura anterior, limpar a temperatura como dado atual, preservar apenas a última localidade e apresentar estado de atualização indisponível/desatualizado.
- Ao desmontar a tela, remover listener e temporizador; nenhuma atualização pode alterar estado depois da desmontagem.
- A tela e o motor de diagnóstico local devem continuar disponíveis offline e independentes da atualização de clima.

## BT-CONN-08 — Resposta KWP real e validação de checksum

- Entrada compacta SEARCHING...\n84F111410C0000D3 para PID 010C: reconhecer o cabeçalho KWP, validar comprimento e checksum, preservar os bytes brutos e retornar 0 rpm como valor válido porque existe payload completo.
- Repetir no formato espaçado 84 F1 11 41 0C 00 00 D3; ambos devem produzir a mesma interpretação.
- Alterar checksum para D2, truncar a resposta ou acrescentar byte após D3: rejeitar como valor não interpretado. Não declarar ECU conectada a partir de um marcador 41 0C sem payload.
- Testes: tests/pidParserIntegrity.test.js e tests/elm327Compatibility.test.js.

## BT-CONN-09 — Recuperação, retry e mensagem de estado

- Usar 3 tentativas padrão por adaptador e intervalo de 1500 ms. Após esgotar a varredura de protocolos sem resposta válida ao PID 010C, avançar ao próximo candidato pareado, sem repetir indefinidamente o mesmo adaptador.
- Recuperação usa ATDP para mapear o protocolo conhecido (KWP 5-baud → ATSP4; KWP fast → ATSP5; ISO 9141 → ATSP3; CAN/J1850 conforme identificado); protocolo desconhecido retorna a ATSP0.
- Sem 41 0C válido, a interface deve mostrar ECU sem resposta, não presumir falha do rádio Bluetooth. Sem ECU/leitura real válida, telemetria e autonomia continuam N/D.
- Testes: tests/bluetoothConfig.test.js, tests/elm327Compatibility.test.js e tests/projectBaseline.test.js.

## UI-COCKPIT-07 — Rotação e cockpit em paisagem

- Permitir retrato/paisagem conforme a configuração do Android (expo.orientation: default) e a chamada ScreenOrientation.unlockAsync; remover o listener ao desmontar.
- Em paisagem, usar faixa superior horizontal para título/conexão e clima/rede; cockpit de um lado e sessão de conexão em coluna compacta do outro. A navegação muda para raia vertical à direita para não consumir a altura que os quadrantes precisam.
- Manter os quatro quadrantes principais simultaneamente visíveis numa grade 2×2 em ambas as orientações. Em paisagem, reduzir gaps e padding e ajustar a altura dos cartões sem diminuir rótulos/dicas dos quadrantes abaixo de 8 dp nem a instrução/rótulos auxiliares abaixo de 7 dp. Valores, unidades e estado N/D não podem ser cortados. A navegação passa da parte inferior para a lateral direita; reservar área sem cobrir quadrantes. Compactar os cartões auxiliares sem ocultá-los, limitar o espaçador e preservar sessão/dados durante a rotação. Não introduzir ScrollView ou lock fixo.
- Testes: tests/orientationLayout.test.js e tests/cockpitNavigation.test.js devem validar configuração livre, estilos de duas colunas, raia lateral, compactação e presença dos cinco destinos.
- Ensaio final no Galaxy A06: ativar Rotação automática no Android; alternar retrato→paisagem→retrato, confirmar que o carrossel continua a alternar a cada 10 s, setas, leitura dos quatro quadrantes e as cinco abas, sem clipping nem sobreposição.
## UI-SCREEN-01 — Auditoria de layout e informação duplicada
- A Central de Saúde mostra cada contador de integridade uma única vez e obtém Bluetooth/ECU do estado ao vivo compartilhado, não de flags persistidas.
- O Laboratório fica focado em consulta de PID, descoberta, varredura DTC, integridade do decodificador e evidência técnica; não repete o resumo de distância/consumo/autonomia da viagem.
- Armazenamento mostra quota, fila de logs, exportação e limpeza; a lista canônica de viagens e seus detalhes ficam em /viagens.
- Uma tela sem navegação fixa não deve reservar espaço vertical para essa navegação. Revisar JSX aninhado/fechamento de views e remover estilos/estado mortos após retirar componentes repetidos.
- Testes: tests/orientationLayout.test.js, tests/cockpitNavigation.test.js e tests/projectBaseline.test.js; inspeção visual ainda é necessária no Android real.

## UI-COCKPIT-05 — Carrossel completo dos PIDs na área principal

- A primeira página mantém em ordem fixa quatro quadrantes principais: 0105 (temperatura), 0142 (tensão), 0111 (posição da borboleta) e 010C (RPM).
- Os demais PIDs suportados e catalogados são incluídos no mesmo carrossel, quatro por página; todos devem ser alcançáveis sem lacunas nem duplicações. A quantidade depende da bitmap anunciada pela ECU; PIDs não suportados não são apresentados como leituras disponíveis.
- O carrossel tem setas acessíveis de página anterior/próxima, retorna circularmente ao início e avança automaticamente a cada 10 segundos. Alertas entre os PIDs adicionais podem subir na ordem das páginas sem deslocar os quatro indicadores principais.
- Sem ECU ou leitura REAL/RESPONDEU válida, finita e recente, manter os quadrantes em N/D; não preencher com seed, histórico ou valores simulados.
- Testes: tests/cockpitTelemetry.test.js percorre os 20 PIDs de referência; tests/orientationLayout.test.js e tests/projectBaseline.test.js protegem a interface.

## UI-COCKPIT-04 — Quadrantes simultâneos e navegação de PIDs

- O cockpit deve exibir ao mesmo tempo uma grade 2×2 para os indicadores principais: PID 0105 (temperatura), 0142 (tensão), 0111 (borboleta) e 010C (RPM). Não substituir a grade por um único número grande que alterna a cada 10 s.
- PIDs adicionais anunciados e catalogados permanecem disponíveis em páginas de quatro quadrantes, com prioridade visual para anomalias; a página muda por toque no cabeçalho ou automaticamente a cada 10 s. A última página pode ter posições vazias, mas elas devem ser rotuladas como sem PID, nunca como leitura.
- Cada valor só pode vir de amostra REAL/RESPONDEU, finita, com timestamp válido e dentro da janela de frescor. Sem ECU ou amostra recente, exibir N/D e estado explicativo; não usar seed ou histórico como telemetria atual.
- Testes: tests/cockpitTelemetry.test.js valida paginação/retorno circular e tests/projectBaseline.test.js impede regressão para o mostrador único.

## AUDIT-HARDENING-01 — Integridade e recuperação de dados

- K-Line: checksum aditivo de 8 bits válido deve ser aceito; checksum incorreto, ausente quando exigido ou bytes extras devem ser rejeitados nos formatos compactos e espaçados.
- DTC: aceitar resposta direta válida; aceitar quadro CAN single-frame somente quando ID, byte de comprimento e payload concordam; processar linhas de ECUs separadamente; rejeitar comprimento inconsistente e checksum K-Line inválido.
- Histórico de viagens: gravações concorrentes não perdem nenhuma viagem; substituir o índice somente após validar o temporário; se índice principal e backup forem inválidos, preservar o arquivo e falhar explicitamente.
- Data do CSV de viagem: usar o calendário local da data de início da viagem, não a data UTC do momento de gravação.
- CSV: manter ordenação de colunas existente; ao aparecer campo novo, migrar cabeçalho e linhas antigas sem deslocar valores. Fila pendente possui teto explícito e contador de linhas descartadas.
- Cota: quando ultrapassada, limpeza remove apenas arquivos descartáveis de LOGS/LEITURAS até a meta possível. Erro ao consultar tamanho deve ser propagado e nunca virar zero silencioso.
- Backup: descarregar CSV antes de copiar, verificar tamanho copiado por diretório, validar manifesto, remover backup parcial em caso de erro e reter no máximo cinco backups verificados.
- Autosave: schema, dataType, timestamp e subestruturas devem ser validados; testar v0 com migração cadastrada, schema futuro, payload parcial, valores NaN/Infinity e restauração de previous.json.
- GPS: coordenadas inválidas são ignoradas; precisão nula/negativa/não finita não conta como fix preciso; Haversine retorna NaN para coordenadas fora da faixa.
- Consumo estimado: rejeitar temperaturas absolutas impossíveis e taxas calculadas NaN/Infinity/negativas.
- Buffer RX: exceder 16 KiB precisa gerar erro explícito, limitar diagnósticos a 256 caracteres e permitir receber um próximo quadro válido.
- Buffer de descoberta: FIFO limitado, normalização, capacidade ajustável e isolamento por execução.
- Aceitação física: comparar capturas RAW do ELM327/ECU para confirmar framing/checksum e precisão; testes sintéticos não substituem validação no veículo.


## GPS-BG-02 — Lifecycle and timestamp recovery
- A sample with a valid timestamp must be newer than the last accepted timestamp, including a sample whose coordinates were accepted but whose accuracy was unknown. Verify NaN, duplicate and regressive timestamps are rejected without changing sample count or distance.
- After a regressive/invalid sample, recovery is permitted only with a strictly increasing timestamp.
- The Expo Location test double must implement `hasStartedLocationUpdatesAsync`, `startLocationUpdatesAsync`, and `stopLocationUpdatesAsync`; do not let a caught TypeError stand in for a native lifecycle test.
- Verify background task start, stop, and reuse when a native task is already active after JavaScript context recreation. Confirm no duplicate task registration and no retained watchdog timer after stop.
- Physical validation remains required for Android foreground/background execution and permission transitions; mocked TaskManager/Location APIs are not a hardware or OS lifecycle test.


## GPS-MOTION-04 — Movimento urbano em callbacks de 1 segundo
- Com quatro posições GPS válidas a intervalos de 1 s, deslocamento aproximado de 2,8 m por segmento (10 km/h) e precisão de 5 m, confirmar movimento após três segmentos consecutivos sem exigir 8 m em cada segmento isolado.
- Exigir deslocamento líquido do início ao fim da janela maior ou igual ao limite de precisão calculado; segmentos individuais acima de 250 m, velocidade incoerente, precisão inválida ou intervalo excessivo quebram a janela.
- Confirmar que zigue-zague/jitter parado não aumenta a distância e que a distância só é adicionada após a confirmação da janela.
- Ensaiar também no veículo, comparando com odômetro/percurso conhecido. O teste sintético não substitui validação de precisão GNSS no Android 16.
