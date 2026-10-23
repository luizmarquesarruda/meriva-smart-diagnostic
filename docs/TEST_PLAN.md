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
| DATA-02 | Autonomia sem nível de combustível atual válido, com timestamp ausente/inválido ou amostra do PID 012F acima de 30 s | Exibir N/D em todas as telas de estado atual; nunca presumir tanque cheio nem reutilizar amostra vencida ou autonomia persistida como atual | `tests/autonomyPresentation.test.js` |
| DATA-03 | Sem internet, com ECU funcional | Diagnóstico local continua funcional; clima/rede falham de forma isolada | `tests/onlineConditions.test.js`, `tests/connectivity.test.js` |
| NAV-01 | Navegar entre as cinco áreas principais | Um único conjunto de destinos, rótulos visíveis e alvos acessíveis | `tests/cockpitNavigation.test.js` |
| NAV-02 | Girar aparelho entre retrato e paisagem | Conteúdo e navegação continuam acessíveis; sem sobreposição crítica | `tests/orientationLayout.test.js` |
| DTC-01 | Ler DTC sem ECU conectada, com NO DATA, timeout ou quadro inválido/incompleto | Exibir erro/N/D; nunca declarar “nenhum DTC” nem tornar DTC anterior inativo sem resposta válida | `tests/dtcScanner.test.js`, `tests/regression.test.js` e gate de baseline |
| DTC-02 | Limpar DTC | Confirmar a ação destrutiva, informar sucesso/erro conforme resposta ECU | teste automatizado com transporte simulado e teste físico |
| SPLASH-01 | Inicialização fria de APK nativo | Fundo e imagem de marca corretos; transição para o app sem tela vazia persistente | gate de baseline verifica plugin, caminho e assinatura PNG; inspeção visual em Android instalado continua obrigatória |
| BUILD-01 | Commit final da PR | Gate, TypeScript, suíte e build Android concluídos com sucesso para o mesmo SHA | execução GitHub Actions do SHA exato |

## Critérios para recursos adicionais

- **Manutenção:** só marcar como implementada após existir persistência local, edição/exclusão de lembretes, cálculo de vencimento e testes para datas/quilometragem ausente.
- **Exportação:** confirmar conteúdo, codificação, compartilhamento e tratamento de dados pessoais; não duplicar exportações TXT/CSV já existentes.
- **Mapas/postos/oficinas:** não adicionar chaves pagas nem rastreamento de localização em segundo plano sem decisão explícita de produto, orçamento, permissões e política de privacidade.
- **OTA, analytics, crash reporting e login:** são decisões de arquitetura e privacidade; não habilitar implicitamente durante um lote de UX.
- **Testes E2E:** Detox/Appium não devem ser declarados instalados ou executados até que dependências, configuração nativa, fixture de transporte OBD simulado e workflow estejam presentes e validados.

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
- ECU válida: executar cinco consultas por PID anunciado usando a fila serial compartilhada e abrir o cockpit após o aquecimento.
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
