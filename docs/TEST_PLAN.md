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
| SPLASH-01 | Inicialização fria de APK nativo | Fundo e imagem de marca corretos; transição para o app sem tela vazia persistente | inspeção visual em Android instalado |
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
