# Matriz de aproveitamento das melhores práticas de aplicativos OBD-II

**Data:** 2026-10-26  
**Escopo:** pesquisa comparativa e recomendações futuras; sem alteração de implementação.  
**Branch:** `research/obd-methods-ui-architecture-20261026`  
**Base do Meriva Smart examinada:** snapshot `main` indicado nos estudos de pesquisa desta branch.

## 1. Conclusão executiva

Não há evidência para afirmar que um único aplicativo é o melhor em todas as dimensões. O aproveitamento mais valioso é composto por práticas específicas:

1. **OBDLink:** assistente de configuração e diagnóstico por camadas, além de registro de viagens/logs reproduzíveis.
2. **OBD Auto Doctor:** sequência de troubleshooting, seleção manual de protocolo como recurso orientado e exportação explícita de logs.
3. **Car Scanner:** flexibilidade de perfis, painéis e PIDs, com atenção à relação entre quantidade de consultas e frequência de atualização.
4. **Torque Pro:** funções temporais documentadas para suavização, médias e totalizadores, sem copiar equações sem validação dimensional.
5. **OBD Fusion:** diagnóstico condensado em relatório, freeze frame, gráficos e exportação CSV.
6. **ScanMyOpel / ScanMyOpelCAN:** separação explícita por geração de veículo e por cobertura genérica versus fabricante.
7. **python-OBD:** aquisição assíncrona baseada numa lista de comandos observados e suporte confirmado, sem bloquear a UI.
8. **OBDvis:** diagnósticos explicáveis por evidência, confiança, contexto de condução e validade temporal das amostras.
9. **OBD Metrics:** disciplina de testes, cobertura declarada e compatibilidade verificada em ECUs/dispositivos identificados.
10. **OBD-Droid:** referência para estudar transporte/parsers abertos; sua heurística de consumo é também um alerta contra estimativas que produzem valores positivos sem evidência suficiente.

**A principal ação futura não é transplantar uma biblioteca:** é demonstrar, com teste reproduzível no hardware alvo, que as práticas escolhidas melhoram conexão, observabilidade, frescor, desempenho e exatidão.

## 2. Matriz por aplicativo: melhor prática e limite

| Aplicativo / fonte | O melhor a aproveitar | Aplicação possível no Meriva Smart | O que não copiar automaticamente |
|---|---|---|---|
| **Car Scanner ELM OBD2** | Personalização de painéis, configuração do veículo/adaptador, PIDs customizados e consciência de que mais PIDs podem reduzir a frequência de atualização. | Usabilidade futura dos perfis e organização visual dos dados; usar medições para encontrar equilíbrio entre cobertura e cadência. | Otimizações de requisição divulgadas para CAN 11/29-bit em K-Line/KWP. A documentação pública não revela toda a implementação comercial nem prova que o mesmo ganho se aplique à Meriva. |
| **OBDLink** | Assistente para primeira configuração; separação das fases de conexão; dicas para adaptador ocupado; logs de telemetria que podem ser reproduzidos/exportados; visão de viagem. | Mensagens de diagnóstico por etapa e pacote de diagnóstico exportável com estados, timestamps, erros e resumo da sessão. UX deve distinguir rádio, socket/adaptador e ECU. | Dependência de funções exclusivas dos adaptadores OBDLink. O método de cálculo de combustível documentado pode servir de hierarquia conceitual, não como prova de que uma fonte está disponível na ECU da Meriva. |
| **OBD Auto Doctor** | Sequência de troubleshooting clara: confirmar veículo/adaptador, tentar protocolo automático, oferecer substituição manual guiada e pedir logs quando falhar. | Diagnóstico que sugere a próxima verificação com base na etapa que falhou; botão explícito para gerar e compartilhar log depois do consentimento. | Forçar protocolo manual como comportamento padrão ou tratar qualquer conexão de adaptador como ECU conectada. |
| **ScanMyOpel / ScanMyOpelCAN** | Compatibilidade específica de marca e separação de versões não-CAN/CAN; deixar claro quais módulos e funções estão realmente cobertos. | Perfil precisa registrar geração/ano, motor/ECU quando conhecidos, protocolo observado, adaptador e nível de evidência; distinguir OBD-II genérico de diagnóstico proprietário. | Presumir protocolo apenas pelo nome Meriva, prometer ABS/airbag/BCM ou executar comandos de fabricante sem especificação e validação. |
| **Torque Pro** | Linguagem documentada de cálculo e funções temporais: EWMAF, TAVG, RAVG, AVG, TDLY/RDLY, TOT; PIDs customizados com unidade e fórmula identificáveis. | Catálogo versionado de fórmulas, testes unitários com vetores conhecidos, métodos separados para suavização, janela temporal e integração. | Copiar fórmula sem conferir unidade, amostragem, lacunas e reset; adicionar uma linguagem arbitrária executável ou filtro que esconda picos relevantes. |
| **OBD Fusion** | Relatórios integrados de diagnóstico, freeze frame, readiness, gráficos, CSV e dashboards selecionáveis. | Relatório de sessão que conecta DTC, contexto, leituras disponíveis e histórico de viagem, com exportação reprodutível. | Inferir fórmulas internas proprietárias de consumo; as fontes públicas consultadas não expõem detalhes suficientes para reproduzi-las fielmente. |
| **python-OBD** | Modelo assíncrono de observação: registrar comandos desejados, atualizar em ciclo de fundo e retornar a última resposta sem bloquear a tela; verificar suporte antes de consultar. | Usar como referência para o contrato de scheduler, idade da amostra e consumidores da telemetria. Conservar a fila serial única já existente no Meriva Smart. | Abrir consultas concorrentes independentes. A implementação Meriva precisa manter um único dono da sessão/stream e serializar comandos. Otimizações de repetição de comando devem ser avaliadas por adaptador/protocolo. |
| **OBDvis** | Regras diagnósticas determinísticas e explicáveis; evidência, gravidade, confiança e limitações; janelas temporais e contexto; ignorar amostras vencidas. | Melhorar futuramente explicações de achados: “o que foi observado”, “em que condições”, “quantas amostras”, “quão recente” e “o que não foi possível concluir”. | Converter uma heurística comunitária em diagnóstico OEM, ou apresentar ausência de dado como condição saudável. |
| **OBD Metrics** | Testes e cobertura de engenharia, lista de ECUs/dispositivos efetivamente verificados, registry de comandos/decodificadores e resultados reproduzíveis. | Matriz explícita de compatibilidade com adaptador, protocolo, ECU, versão Android, CI, resultado físico e evidência de cada PID. | Tratar cobertura de testes ou compatibilidade com outras ECUs/Android como prova de funcionamento na Meriva e no Galaxy A06. |
| **OBD-Droid** | Código aberto útil para inspecionar parser, transporte Android e definições de PIDs. | Usar código apenas como referência de engenharia, após revisão de licença, testes e comparação com o contrato de bytes/unidades do projeto. | A estimativa heurística RPM/carga que força um mínimo positivo de combustível. Tal regra pode criar consumo durante desaceleração, marcha lenta ou ausência de evidência. |
| **ELM327 datasheet / Android Bluetooth API** | Contratos de AT commands, temporização, fluxo RFCOMM e necessidade de enquadrar a resposta no prompt ELM. | Usar como base para separar stream bruto, framing, timeout do app, estado do adaptador e estado da ECU. | Assumir que todas as clones implementam todos os comandos AT ou que um timeout equivale necessariamente a desconexão. |

## 3. O que o Meriva Smart já possui — não duplicar

O snapshot de código analisado já contém várias bases equivalentes ou próximas às boas práticas:

- Transporte Android por Bluetooth Classic/RFCOMM, leitura de stream enquadrada pelo prompt, limite de RX e tratamento da limpeza de socket pendente.
- Sessão ELM com fila de comandos, timeout e classificação de resultado.
- Estados separados para ciclo Bluetooth, conexão Bluetooth e resposta/validade da ECU, além de timestamp da última resposta e último erro.
- Descoberta de PIDs por bitmap e sondagem individual; bitmap anunciado não é prova suficiente de que toda leitura será válida.
- Política declarativa de polling, catálogo de PIDs/fórmulas e motor de fórmulas determinístico.
- Camadas de telemetria, GPS e cálculo de combustível, incluindo distinção de métodos de estimativa.

Portanto, não propor uma segunda fila, um segundo leitor de Bluetooth, um motor paralelo de fórmulas ou consultas próprias em cada tela. Qualquer melhoria futura deve reforçar as camadas existentes, não contorná-las.

## 4. Lista priorizada para avaliação futura

Os itens abaixo são **candidatos de produto/engenharia**, não tarefas autorizadas para implementar agora. Antes de qualquer mudança, verificar se já existe cobertura equivalente no HEAD corrente e reconciliar com a PR/branch de integração ativa.

### P0 — Evidência de conexão sem falso positivo

**Referências:** OBDLink, OBD Auto Doctor, OBDvis.

O resultado da conexão deve permitir distinguir pelo menos: Bluetooth desligado/permissão ausente; dispositivo não localizado; pareamento presente mas socket não aberto; adaptador conectado mas sem resposta ELM; ECU sem resposta válida; ECU respondendo; sessão em recuperação. Mostrar protocolo observado quando disponível e idade da última resposta real.

**Aceitação futura:** cada cenário tem teste automatizado e captura/log físico; nenhuma mensagem genérica “conectado” é mostrada só porque o socket abriu; a amostra vencida não aparece como valor ao vivo.

### P1 — Sessão de diagnóstico reproduzível

**Referências:** OBDLink, OBD Auto Doctor, OBD Fusion.

Uma exportação útil deve guardar, quando disponível, data/hora, dispositivo/adaptador, veículo/perfil, protocolo, versão do aplicativo, comando TX, RX bruto normalizado, duração, status, timeout, número da tentativa e estado da ECU. O compartilhamento deve ser iniciado pelo usuário, com prévia dos dados e sem enviar automaticamente.

**Aceitação futura:** a falha pode ser reproduzida a partir do pacote sem inferir bytes ausentes; o log marca explicitamente o que não foi capturado.

### P1 — Polling com prioridade e frescor explícitos

**Referências:** python-OBD, OBDvis, Car Scanner.

O scheduler deve equilibrar prioridade funcional, idade máxima aceitável por PID e custo real de consulta do protocolo. Conservar uma única fila serial. Aumentar a quantidade de PIDs ou a cadência somente após medir latência, timeouts e perdas na K-Line/KWP da Meriva, se esse for o protocolo físico confirmado.

**Aceitação futura:** relatório por PID com intervalo mediano/p95, percentagem de respostas válidas, timeout/NO DATA, tempo sem atualização e efeito da carga. Comparar perfis com o mesmo adaptador, motor, estado de ignição e conjunto de PIDs.

### P1 — Proveniência e validação das fórmulas

**Referências:** Torque Pro, OBDLink, OBD-Droid.

Cada valor derivado deve ter fórmula versionada, unidade de entrada/saída, proveniência dos sinais, política para valores ausentes, timestamps, lacunas, limites e confiança. Média temporal, filtro e integração de taxa são operações diferentes e precisam de testes separados. Manter hierarquia explícita entre taxa real da ECU e estimativas, sem representar estimativa como medição.

**Aceitação futura:** vetores de referência, casos-limite, dados ausentes/obsoletos, timestamps duplicados/regressivos e intervalos longos são testados; a integração não acumula combustível por uma lacuna sem dados válidos.

### P2 — Diagnósticos explicáveis por contexto

**Referência:** OBDvis.

Quando um insight for produzido, registrar a regra aplicada, amostras e período usados, condições de motor, severidade, grau de confiança e limitações. Exigir persistência suficiente para filtrar ruído, mas manter eventos críticos válidos separados de médias suavizadas.

**Aceitação futura:** o insight não afirma “normal” quando faltam dados; o utilizador consegue conferir os sinais que sustentam a conclusão; regras são testadas com dados históricos e negativos.

### P2 — Perfis de compatibilidade e cobertura real

**Referências:** ScanMyOpel / ScanMyOpelCAN, OBD Metrics.

Manter uma matriz versionada de combinações físicas testadas: modelo/geração/motor/ECU, protocolo detectado, adaptador/firmware, versão Android/aparelho, funções testadas e evidência. Uma configuração só deve ser chamada “validada” depois de teste físico reproduzível; suporte genérico OBD-II não implica acesso a ABS, airbag ou BCM.

**Aceitação futura:** testes falhos ou não executados permanecem explicitamente pendentes, não são interpretados como sucesso.

## 5. Regras de segurança técnica para a futura seleção

1. Não importar código de terceiros sem examinar licença, dependências, manutenção e contratos de API.
2. Não copiar otimizações CAN para K-Line/KWP sem bancada e teste físico comparável.
3. Não transformar timeout, `NO DATA`, PID não suportado ou amostra velha em zero, consumo positivo, autonomia ou diagnóstico saudável.
4. Não abrir uma segunda sessão/socket ou um fluxo de consulta paralelo para alimentar uma tela.
5. Não tornar protocolo manual a escolha silenciosa padrão; manter o automático como base e oferecer intervenção guiada para troubleshooting.
6. Não escrever, apagar códigos ou executar testes de atuador sem escopo funcional explícito, confirmação e validação específica do veículo.
7. Não marcar conectividade ou PID como validado apenas porque a CI, o emulador ou outro veículo funcionou.

## 6. Plano mínimo de comparação física

Executar somente numa etapa autorizada e segura. Para cada cenário, usar o mesmo adaptador, veículo e versão do app, fechar outros aplicativos OBD e fazer pelo menos três repetições:

- rádio Bluetooth desligado/ligado e permissão ausente/concedida;
- adaptador pareado mas indisponível, ocupado por outro app e disponível;
- socket abre, mas não há resposta ELM; ELM responde, mas ECU não responde;
- seleção automática do protocolo e eventual protocolo manual guiado;
- PID suportado, não suportado, timeout, resposta incompleta e desconexão durante leitura;
- reconexão e primeira resposta válida após queda;
- baixa e alta carga de polling, medindo latência mediana/p95, respostas válidas, timeout/NO DATA e frescor por PID;
- logs comparados com captura TX/RX e estado da tela.

**Critério global:** não escolher uma prática por popularidade ou aparência. Aprovar somente a que melhora uma métrica definida sem regredir as demais; guardar dados brutos, passos e resultado.

## 7. Referências públicas

### Produtos

- Car Scanner — Google Play e funcionalidades: https://play.google.com/store/apps/details?id=com.ovz.carscanner
- Car Scanner — configuração de conexão: https://www.carscanner.info/configuring/
- Car Scanner — otimização de velocidade: https://www.carscanner.info/optimizing-connection-speed/
- OBDLink — aplicativo e recursos: https://www.obdlink.com/obd-apps/obdlink-app/
- OBDLink — troubleshooting de conexão: https://support.obdlink.com/support/solutions/articles/43000715570
- OBDLink — registro de dados: https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs
- OBD Auto Doctor — recursos: https://www.obdautodoctor.com/features/
- OBD Auto Doctor — troubleshooting: https://www.obdautodoctor.com/help/articles/troubleshoot-connectivity-issues/
- OBD Auto Doctor — adaptadores suportados: https://www.obdautodoctor.com/help/articles/supported-obd-adapters/
- ScanMyOpel / ScanMyOpelCAN — cobertura Opel/Vauxhall: https://scanmyopel.com/
- Torque Pro — equações/filtros: https://wiki.torque-bhp.com/view/Equations
- Torque Pro — PIDs personalizados: https://wiki.torque-bhp.com/view/PIDs
- OBD Fusion — recursos: https://www.obdsoftware.net/software/obdfusion

### Engenharia aberta

- python-OBD — conexões: https://python-obd.readthedocs.io/en/latest/Connections/
- python-OBD — conexões assíncronas: https://python-obd.readthedocs.io/en/latest/Async%20Connections/
- OBDvis — diagnóstico explicável e configuração: https://github.com/Joost-vanAndel/OBDvis
- OBD Metrics — framework e testes: https://github.com/tzebrowski/ObdMetrics
- OBD-Droid — calculadora de consumo: https://github.com/Wal33D/OBD-Droid/blob/main/app/src/java/com/obddroid/features/fueleconomy/data/FuelEconomyCalculator.java
- ELM Electronics — datasheet ELM327: https://www.elmelectronics.com/wp-content/uploads/2017/01/ELM327DS.pdf
- Android AOSP — contrato BluetoothSocket: https://android.googlesource.com/platform/frameworks/base/+/be0a453/core/java/android/bluetooth/BluetoothSocket.java

## 8. Estado e limite do trabalho

**Realizado:** comparação documental, extração das melhores práticas, análise de aplicabilidade e definição de critérios de validação.

**Não realizado:** mudanças em código, UI, fórmulas executáveis, PIDs, cadência, dependências, configurações, PRs ou testes no veículo. Nenhuma superioridade em campo foi declarada sem dados de hardware. Este documento é uma referência isolada de pesquisa; sua existência não autoriza implementar as recomendações.
