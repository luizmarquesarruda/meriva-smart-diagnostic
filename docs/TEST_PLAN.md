# Plano de testes críticos — Meriva Smart Diagnostic

## Objetivo e limites

Este documento define os critérios de aceitação para mudanças no cockpit, navegação, estado da ECU, telemetria e diagnóstico. Ele distingue **testes automatizados**, **CI/build nativo** e **validação física**. Não declarar um nível de validação com base em evidência de outro nível.

## Estado verificado na branch de trabalho

A branch mantém o fluxo OBD/ELM327 existente e inclui testes automatizados para navegação do cockpit, estado de conectividade, apresentação da autonomia, temperatura e DTC. O relatório de funcionalidades é uma proposta, não prova de que cada recurso está implementado. Antes de criar novos módulos, verificar a tela/serviço existente e ampliar o contrato atual.

## Casos de regressão obrigatórios

| ID | Cenário | Resultado esperado | Evidência |
|---|---|---|---|
| OBD-01 | Abrir o app sem adaptador ELM327 | ECU desconectada; leituras atuais mostram N/D; app não trava | testes de conectividade e inspeção Android |
| OBD-02 | Bluetooth conectado, ECU sem resposta | Estado distinto de Bluetooth conectado; não declarar diagnóstico pronto | `tests/bluetoothState.test.js`, `tests/ecuHealth.test.js` |
| OBD-03 | Perder ECU durante uma leitura | Encerrar/recuperar a sessão com erro explícito; nenhuma resposta ausente vira zero | testes de ciclo de vida ELM327 e validação física |
| DATA-01 | Leitura ausente, inválida, futura ou vencida conforme a janela do recurso (10 s para contexto operacional; 30 s para autonomia) | Não exibir como leitura atual; usar N/D neutro e não classificar contexto a partir de timestamp futuro | `tests/regression.test.js`, `tests/liveTelemetry.test.js`, `tests/autonomyPresentation.test.js` |
| GPS-02 | GPS recebe timestamp ausente, não finito, zero, futuro, vencido (>5 s) ou anterior/igual ao último fix válido | Descartar timestamps inválidos/fora de ordem; amostra ausente, futura ou vencida não sustenta velocidade no painel nem movimento de viagem; não usar `Date.now()` como substituto; retomar com o próximo fix válido | `tests/gps.test.js`, RG-38 |
| DATA-02 | Autonomia sem nível de combustível atual válido, com timestamp ausente/inválido ou amostra acima de 60 s | Exibir N/D se não houver balanço independente de tanque cheio validado; nunca presumir tanque cheio nem reutilizar autonomia persistida como atual | `tests/autonomyPresentation.test.js`, RG-45/RG-51 |
| DATA-03 | Sem internet, com ECU funcional | Diagnóstico local continua funcional; clima/rede falham de forma isolada | `tests/onlineConditions.test.js`, `tests/connectivity.test.js` |
| DATA-04 | Leitura PID 012F entre >30 s e 60 s | Usar mediana do buffer só com pelo menos duas amostras reais válidas, ECU/sessão conectadas e consumo positivo; rotular ESTIMADA · BUFFER e apresentar a idade real. Acima de 60 s, desconexão ou buffer insuficiente não pode autorizar fallback; um balanço de tanque cheio validado é identificado à parte | `tests/autonomyBuffer.test.js`, `tests/autonomyPresentation.test.js`, `tests/projectBaseline.test.js`, RG-51 |
| NAV-01 | Navegar entre as cinco áreas principais | Um único conjunto de destinos, rótulos visíveis e alvos acessíveis | `tests/cockpitNavigation.test.js` |
| NAV-02 | Girar aparelho entre retrato e paisagem | Conteúdo e navegação continuam acessíveis; sem sobreposição crítica | `tests/orientationLayout.test.js` |
| DTC-01 | Ler DTC sem ECU conectada, com NO DATA, timeout ou quadro inválido/incompleto | Exibir erro/N/D; nunca declarar “nenhum DTC” nem tornar DTC anterior inativo sem resposta válida; `historical=true` nunca pode aparecer como atual e a reconciliação deve preservar PENDING/PERMANENT e origens importadas | `tests/dtcScanner.test.js`, `tests/regression.test.js` e gate de baseline |
| DTC-02 | Limpar DTC | Confirmar a ação destrutiva, informar sucesso/erro conforme resposta ECU | teste automatizado com transporte simulado e teste físico |
| SPLASH-01 | Inicialização fria de APK nativo | Fundo e imagem de marca corretos; transição para o app sem tela vazia persistente | gate de baseline verifica plugin, caminho e assinatura PNG; inspeção visual em Android instalado continua obrigatória |
| BUILD-01 | Commit final da PR | Gate, TypeScript, suíte e build Android concluídos com sucesso para o mesmo SHA | execução GitHub Actions do SHA exato |

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

## TELEM-BUF-01 — Cota global de séries da telemetria ao vivo
- A ingestão aceita somente IDs Mode 01 normalizados no formato `01XX`; comandos de outro modo, IDs malformados, fontes sintéticas e timestamps inválidos/futuros não entram no buffer.
- Cada PID conserva no máximo 120 amostras e o processo conserva no máximo 64 séries distintas. Ao receber o 65.º PID, deve sair o menos recentemente usado; atualização da série deve refrescar sua posição LRU e a remoção deve limpar também o índice de leituras atuais.
- Executar `node tests/liveTelemetry.test.js`, `node tests/projectBaseline.test.js`, TypeScript e a CI completa no SHA exato; teste físico continua separado.

## AUTONOMY-GAP-01 — Continuidade da janela de consumo móvel
- Inserir dez intervalos válidos de fluxo/velocidade. Depois enviar taxa inválida, trocar origem, fornecer timestamp fora de ordem ou criar intervalo >10 s; a janela anterior deve ser descartada e a autonomia móvel deve voltar a N/D.
- Deixar de receber taxa por >10 s; o consumo móvel não deve continuar como atual apenas porque ainda existem dez intervalos antigos no buffer.
- A mediana de nível deve conservar no máximo dez leituras e só considerar amostras dos últimos 60 s. Com leituras a cada 25 s, um pico com mais de 60 s deve sair da mediana.
- Após a lacuna, a janela só pode voltar ao estado pronto depois de dez novos intervalos contínuos que somem pelo menos 0,1 km e 0,05 L. Não integrar valores em cache para preencher amostras ausentes.

## FUEL-BALANCE-01 — Validade do consumo e fallback de tanque cheio
- Uma viagem com lacuna de taxa >30 s deve manter a distância no histórico, mas persistir fuelDataValid=false e avgFuelConsumptionKml=0, mesmo que já tenha integrado 0,05 L ou mais.
- Sem PID 012F atual, o fallback exige abastecimento explicitamente marcado como tanque cheio, viagens REAL_OBD com >=0,1 km e >=0,05 L, média coerente com distância/litros dentro de 5% ou 0,005 km/L e nenhuma sobreposição temporal. Divergência de odômetro ou evento entre o fim e início de viagens exige N/D.
- A viagem ativa só pode subtrair combustível se a média da própria viagem atual for confiável. Histórico parcial, simulado ou importado não pode servir de evidência.
- Executar node tests/autonomyBuffer.test.js, node tests/fuelConsumption.test.js, node tests/tripRecorder.test.js, node tests/fuelBalance.test.js, gate anti-regressão, TypeScript, suíte completa e build Android no mesmo SHA. Teste real no veículo e comparação de litros/odômetro continuam necessários para validar precisão física.

## ELM-QUEUE-01 — Backpressure e espera da fila serial
- Bloquear artificialmente a primeira resposta, enfileirar acima de 16 comandos e verificar que apenas 16 aguardam além da transação ativa; excessos devem rejeitar com ELM_COMMAND_QUEUE_FULL antes de escrever no transporte. A vaga da operação ativa deve ser reservada sincronicamente para não consumir uma posição das 16 pendentes em chamadas concorrentes no mesmo turno.
- O snapshot deve expor profundidade atual/máxima, rejeições, espera média e máxima. Após liberar o transporte, a profundidade retorna a zero e a ordem dos comandos aceitos continua serial. O gate estático verifica liberação em `finally` sem depender de o corpo do callback caber em uma única linha.
- Saturar a fila e solicitar close(): o fechamento precisa ser aceito como operação reservada e executar depois das operações já aceitas. A recuperação também é reservada, mas não pode contornar a serialização.
- CI automatizada não substitui medição de latência real com ELM327/K-Line.

## CSV-ROTATE-01 — Rotação segura de logs de alto volume
- Em LOGS/, quando o segmento ativo atingir aproximadamente 1 MiB, novas linhas vão para .part-0001.csv, .part-0002.csv etc.; segmentos anteriores permanecem intactos.
- Cada segmento novo começa com cabeçalho independente e mantém a ordem de colunas do segmento anterior, acrescentando novas colunas pelo mecanismo de migração existente.
- Se o tamanho não puder ser verificado, falhar explicitamente. CSVs de viagens fora de LOGS/ permanecem no caminho compatível.
- Verificar rotação em duas fronteiras, cabeçalho, preservação do conteúdo anterior, esquema, gravações concorrentes e inclusão automática de segmentos no backup.
- O leitor do cabeçalho deve verificar `exists` antes de acessar `FileInfo.size`; o gate do repositório e o TypeScript devem passar com a versão atual do Expo.

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

## PID-AUTO-02 — Buffer móvel de autonomia com dez leituras
- O nível do PID 012F mantém uma janela FIFO de no máximo dez respostas reais válidas; valor exibido é a mediana para reduzir picos, sem criar valores iniciais sintéticos.
- O buffer de consumo mantém até dez intervalos calculados por integração trapezoidal de velocidade e fluxo; só aceita fluxo recém-medido (015E) ou estimativa recém-calculada (MAF/MAP), nunca uma taxa em cache reintegrada.
- A estimativa móvel só fica pronta após dez intervalos válidos, pelo menos 0,1 km e 0,05 L integrados; intervalos não monotônicos, longos, fora de faixa ou sem movimento são rejeitados.
- O consumo móvel recente tem prioridade sobre o consumo acumulado da viagem e a média histórica; se estiver vazio/vencido, usa-se uma fonte confiável anterior, nunca autonomia persistida como valor atual.
- Testes determinísticos cobrem rotação das dez amostras, mediana contra outlier, entradas inválidas, gaps, limiares, frescor e reset ao desconectar. Teste físico de precisão continua obrigatório.

## PID-AUTO-03 — Autonomia sem PID 012F por balanço de tanque cheio
- A tela de abastecimento deve permitir marcar explicitamente “tanque completo”; registros antigos e abastecimentos parciais nunca podem ser tratados como tanque cheio.
- O balanço começa na capacidade nominal de 56 L após o último tanque completo, subtrai somente viagens REAL_OBD com combustível válido e soma abastecimentos parciais posteriores sem ultrapassar a capacidade.
- Rejeitar viagens inválidas, viagens que cruzem o evento de abastecimento, falta de ordenação temporal, combustível negativo/maior que a capacidade e odômetro incompatível no próximo abastecimento.
- Quando houver odômetro atual informado, comparar a distância desde o último abastecimento com a soma das viagens registradas (incluindo a viagem ativa); odômetro desatualizado, anterior ao abastecimento ou divergente acima da tolerância deve resultar em N/D.
- O PID 012F atual prevalece; sem PID 012F, o balanço de tanque cheio pode fornecer litros restantes somente com ECU conectada e consumo móvel/viagem/histórico confiável. Sem baseline válido, retornar N/D.
- A UI deve distinguir “PID 012F • BUFFER n/10” de “TANQUE ESTIMADO • n VIAGENS” e avisar que viagens não registradas podem superestimar o alcance. Testar falha de salvamento sem limpar os campos digitados.

## NET-WEATHER-01 — Atualização de localização/clima por conectividade
- Com internet disponível em Wi-Fi ou rede celular (4G/5G), carregar clima/localidade sem solicitar permissão de localização nova.
- Atualizar após retornar de offline para online e no ciclo de 15 minutos; eventos de rede repetidos não podem disparar requisições concorrentes nem refresh contínuo.
- Quando a rede confirma ausência de internet, não iniciar consulta remota; ao restabelecer a conexão, fazer uma atualização imediata.
- Em falha após leitura anterior, limpar a temperatura como dado atual, preservar apenas a última localidade e apresentar estado de atualização indisponível/desatualizado.
- Ao desmontar a tela, remover listener e temporizador; nenhuma atualização pode alterar estado depois da desmontagem.
- A tela e o motor de diagnóstico local devem continuar disponíveis offline e independentes da atualização de clima.

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
- Saúde Bluetooth/ELM327: a tela deve mostrar profundidade atual/pico da fila, recusas, espera média/máxima; recusas ou espera máxima >=5 s devem gerar aviso, e valores negativos/NaN/Infinity devem ser neutralizados. `tests/elmHealthPresentation.test.js` e `tests/projectBaseline.test.js`.
- Buffer de descoberta: FIFO limitado, normalização, capacidade ajustável e isolamento por execução.
- Aceitação física: comparar capturas RAW do ELM327/ECU para confirmar framing/checksum e precisão; testes sintéticos não substituem validação no veículo.

## BT-CONN-02 — Tentativas limitadas e descoberta de protocolo

- A lista automática testa primeiro o endereço do último adaptador validado, depois candidatos com nome compatível com ELM/OBD e por fim os demais dispositivos pareados; endereço salvo não é prova de conexão.
- Seleção explícita testa somente o dispositivo escolhido; se ele não estiver mais pareado, deve falhar claramente, sem trocar silenciosamente para outro adaptador.
- Padrão de recuperação: no máximo três tentativas por candidato, com 1500 ms entre falhas transitórias. Rádio desligado/estado indeterminado interrompe o retry.
- Após a varredura completa de protocolos de um candidato terminar sem resposta ECU válida para `010C`, o manager deve registrar `ECU_PROBE_EXHAUSTED` e avançar ao próximo candidato, sem repetir a mesma varredura longa no mesmo adaptador. Não reduzir validação, não criar outra fila e não abrir sockets RFCOMM concorrentes.
- A negociação começa em `ATSP0` (automático). Fallback ordenado inclui os IDs 5, 3, 4, 6, 7, 8, 9, 2 e 1; 1/2 correspondem às famílias SAE J1850 PWM/VPW. Só usar o protocolo detectado/forçado após resposta real do veículo.
- Testes automatizados devem verificar limites JSON, função de decisão de retry, presença dos protocolos 1 e 2, seleção explícita e gate real `010C -> 41 0C`.
- Aceite de hardware continua obrigatório: Samsung Galaxy A06 / Android 16, adaptador ELM327 real, ECU real, captura TX/RX, tempo até a primeira resposta válida, falhas/timeout e reconexão. A CI e o transporte simulado não substituem este ensaio.

## BT-CONN-03 — Recuperação pelo protocolo identificado

- Após falha parcial ou reconexão, a escolha de protocolo deve refletir o protocolo identificado por `ATDP`: KWP 5-baud = `ATSP4`, KWP fast = `ATSP5`, ISO 9141 = `ATSP3`, J1850 PWM/VPW = `ATSP1`/`ATSP2`, CAN deve mapear para o ID correspondente à família e velocidade.
- Rótulo desconhecido/ambíguo deve voltar a `ATSP0` (automático); não assumir que qualquer ISO 14230 é KWP fast.
- Testes obrigatórios em `tests/elm327Compatibility.test.js`: cobrir todos os mapeamentos e o fallback de protocolo desconhecido. `tests/projectBaseline.test.js` protege a utilização da função pela recuperação real.
- Validação física segue obrigatória: registrar protocolo devolvido pelo `ATDP`, comando `ATSP` de recuperação, resposta real ao `010C` e resultado de reconexão. Não declarar êxito com base apenas em testes simulados.

## BT-CONN-04 — Gate íntegro do PID 010C durante recuperação

- A recuperação deve validar a resposta de `010C` pelo mesmo parser estrito da conexão inicial. O texto `41 0C` isolado, payload truncado, bytes excedentes ou quadro inválido deve retornar falha de recuperação.
- Uma resposta completa válida, por exemplo `41 0C 1A F8` (1726 rpm), pode confirmar recuperação quando o status do comando também for `OK`.
- `tests/elm327Compatibility.test.js` exercita a sessão ELM com transporte simulado: primeiro retorna apenas `41 0C` e exige `false`; depois retorna `41 0C 1A F8` e exige `true`. `tests/pidParserIntegrity.test.js` cobre payloads incompletos e excedentes; `tests/projectBaseline.test.js` protege o gate no código de produção.
- A simulação não substitui a validação física no Galaxy A06 / Android 16 com ELM327 e ECU reais.

## BT-CONN-05 — Limite efetivo de tentativas Bluetooth

- Sem override do usuário, `DEFAULT_ELM327_COMPATIBILITY` deve delegar ao limite finito de `src/knowledge/bluetooth_config.json` (3 tentativas por candidato e intervalo de 1500 ms).
- Override explícito de 3, 10 ou 20 tentativas nas Configurações deve continuar válido; a decisão precisa ocorrer numa única função de resolução usada pelo laço real.
- Testar valores ausentes, zero, não finitos e overrides; confirmar que o número de tentativas executadas coincide com o limite efetivo e que falha de ECU após a varredura avança ao próximo candidato.
- O teste de CI cobre política e caminho de código; capturas no Galaxy A06 / Android 16 com ELM327 real continuam necessárias para validar latência e reconexão.

## BT-CONN-06 — Interpretar resposta KWP com cabeçalho e checksum

- Reproduzir o RX real observado no Galaxy A06: `SEARCHING...\n84F111410C0000D3`. O parser deve reconhecer o envelope KWP de três bytes, validar o comprimento e o checksum e retornar `010C = 0 rpm` com status `RESPONDEU`.
- Repetir o teste com espaços (`84 F1 11 41 0C 00 00 D3`); ambos os formatos devem preservar os bytes brutos, incluindo cabeçalho e checksum.
- Alterar o checksum (`D2`), comprimento declarado ou acrescentar bytes depois do checksum: a resposta deve ser rejeitada. A mensagem `SEARCHING...` não pode ser concatenada aos bytes do PID.
- Com o quadro KWP válido recebido em `ATSP0`, a validação da ECU deve passar imediatamente; não executar a sequência de fallback `ATSP5/3/4/...` para essa mesma resposta.
- Testes automatizados não substituem novo ensaio físico no Samsung Galaxy A06 / Android 16, com o mesmo adaptador ELM327 e a ECU do veículo. Guardar um trace pós-correção e confirmar que `010C` passa a validar; não exigir RPM diferente de zero para validar a comunicação.

## BT-CONN-07 — Consistência do perfil ELM327 genérico

- Validar que `bluetooth_config.json` e a tela de configurações apresentam o padrão real: 3 tentativas por candidato, intervalo de 1500 ms e parada imediata após sucesso; 10 e 20 são overrides, não o padrão.
- Confirmar transporte Bluetooth Classic RFCOMM/SPP, ASCII, terminador CR real e framing robusto a fragmentação até o prompt `>`; não confundir `delimited` com socket binário/raw.
- Confirmar que a sequência documentada corresponde a `ELM_PROTOCOL_FALLBACKS` (`5,3,4,6,7,8,9,2,1` após `ATSP0`). J1850 (`ATSP2/ATSP1`) é fallback genérico e não evidência de protocolo da Meriva.
- `ATI` é informativo, não prova autenticidade de clone. A ECU só valida com resposta OBD real, incluindo envelopes KWP válidos com checksum.
- Estes checks documentais não substituem CI verde no SHA final nem ensaio físico no veículo.

## DATA-05 — Consumo móvel com marcha lenta

- Cada intervalo contínuo com taxa de combustível e velocidade válidas deve integrar combustível mesmo quando a velocidade é zero ou baixa.
- Intervalos estacionários podem acrescentar combustível e zero distância; não podem inventar distância. A janela continua exigindo dez intervalos válidos, pelo menos 0,1 km e 0,05 L.
- Regressão obrigatória: janela com movimento e marcha lenta deve ter consumo km/L inferior ao caso de mesma taxa e velocidade constante, se o combustível de marcha lenta não acrescentar distância proporcional.
- Gap acima de 10 s, taxa inválida ou troca de origem deve invalidar/reconstruir a janela conforme RG-49.

## DATA-06 — Integridade do balanço de tanque cheio com histórico legado

- Cada viagem que alimenta o balanço precisa ter `source === 'REAL_OBD'` e `fuelDataValid === true`.
- `fuelDataValid === false` ou ausente deve retornar N/D, mesmo que a média seja aritmeticamente compatível com distância/litros.
- Testar dados legados sem flag, viagens com lacunas, viagens sobrepostas, abastecimentos parciais, odômetro divergente e um caso completo explicitamente válido.

## DTC-02 — Preservar a última observação real

- Ao marcar código como histórico/inativo porque ele não apareceu no Mode 03 válido, preservar `lastSeen`.
- O teste usa uma data de última observação anterior à leitura de reconciliação e garante que o histórico não apresente a reconciliação como se o DTC estivesse presente.


## SQLITE-01 — Migração e restauração do histórico de viagens

- Em instalação legada válida, inicializar SQLite importando todas as viagens operacionais, sem misturar registros `CARSCANNER_SEED`; conferir o número de IDs únicos antes de confirmar a transação.
- Inicializar duas vezes e reiniciar o módulo: não duplicar registros nem reimportar o JSON após o marcador `legacy_json_migration_v1` ter sido gravado.
- Adicionar viagem nova e verificar que SQLite é a fonte de verdade; o `index.json` derivado e a cópia validada `VIAGENS/meriva_smart_history.db` devem refletir o estado confirmado.
- Corromper o espelho JSON após migração: a leitura deve continuar retornando as linhas válidas do SQLite. Corromper o legado antes da migração e sem backup válido: abortar, preservar a origem e não gravar marcador de conclusão.
- Fornecer IDs duplicados no JSON legado: abortar antes de importar, mantendo a origem integral para reconciliação. Não descartar uma linha silenciosamente por causa da chave primária.
- Validar a restauração usando `index.previous.json` ou `index.pre-sqlite.json`: escolher backup válido antes de alterar SQLite, restaurar em transação, atualizar espelho e sincronizar a cópia SQLite para backup.
- Criar pacote por `createBackup()`, confirmar `VIAGENS/meriva_smart_history.db` e `manifest.json`, depois restaurar indicando a pasta do pacote; nenhum arquivo de origem do backup pode ser alterado durante a restauração.
- Executar `npm run gate:baseline`, `npm run typecheck`, `npm test` e build Android no mesmo SHA. O mock SQLite não substitui validação do banco nativo no APK.


## BT-CONN-08 — Timeout da primeira sondagem ECU após ATSP0

- Configurar timeout adaptativo mínimo de 3000 ms e protocolSelectionTimeoutMs de 9000 ms; confirmar que a primeira execução de 010C recebe override de 9000 ms e que o payload válido continua aceito.
- Confirmar que apenas a primeira sondagem automática recebe essa janela; probes após ATSP5/3/4/... continuam usando a política adaptativa normal, evitando alongar todas as tentativas.
- Confirmar no diagnóstico o campo timeoutOverrideMs em ECU_PROBE_START; no ensaio físico, guardar latência/resposta de 010C e comparar resultado com o build anterior.
- Rodar o gate anti-regressão, TypeScript, suíte completa e build Android no mesmo SHA. Este teste automatizado não substitui a confirmação física no Galaxy A06 / Android 16 com ELM327/ECU reais.


## GPS-03 — Movimento urbano, deriva e integridade do odômetro GPS

- Usar quatro posições válidas em sequência, com timestamps crescentes de 1 s, accuracy de 5 m, distância aproximada de 2,8 m por segmento e velocidade reportada/derivada de 10 km/h. Após três segmentos, o tracker deve confirmar o movimento e somar pelo menos 0,008 km.
- Fornecer quatro posições com speed positivo, mas trajetória em zigue-zague cuja posição final está a menos de 8 m da origem. A velocidade não pode ser confirmada e a distância deve permanecer em zero.
- Confirmar que o tracker continua exigindo precisão conhecida ≤30 m, timestamp válido, lacuna ≤5 s, velocidade derivada de pelo menos 5 km/h e limite de segmento de 250 m.
- Inserir um fix de baixa precisão ou velocidade incompatível no meio da sequência: a contagem/pêndencia deve reiniciar, sem apagar distância já confirmada.
- Confirmar que 4G/5G não é tratado como coordenada. O tracker permanece com um único watcher e o sistema Android/Expo escolhe os provedores disponíveis; sem fix atual, velocidade deve ser N/D e a distância não pode ser interpolada.
- Na transição offline→online ou mudança de tipo/geração celular, quando o último fix venceu, permitir uma consulta pontual do provedor com timeout de 8 s e cooldown de 30 s. Fix fresco não gera consulta; falha/retorno antigo não altera distância e nenhum watcher adicional pode ser criado.
- Enquanto 4G/5G estiver disponível, verificar o frescor a cada 30 s; somente pedir posição se o último fix venceu. Repetir eventos sem novo fix não pode causar consultas sobrepostas, e o cooldown deve limitar tentativas a uma a cada 30 s.
- Reexecutar gate anti-regressão, TypeScript, suíte completa e build Android no mesmo SHA. Fazer percurso físico com APK validado e comparar o total GPS com rota/odômetro conhecidos antes de declarar precisão real.
