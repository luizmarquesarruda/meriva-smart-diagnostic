# Auditoria comparativa de conexão OBD-II — Meriva Smart

**Data:** 2026-10-26  
**Tipo:** pesquisa técnica e leitura de código; sem alteração de implementação.  
**Branch:** research/obd-methods-ui-architecture-20261026  
**Snapshot analisado:** main, lido em 2026-10-26.

## 1. Resumo executivo

O Meriva Smart já possui uma arquitetura de conexão defensiva no código: distingue Bluetooth, resposta do ELM e resposta da ECU; serializa comandos; limita RX; classifica erros; impede abrir um segundo socket enquanto a limpeza nativa anterior é incerta; registra diagnóstico; e valida a ECU por uma resposta positiva do PID 010C.

Isso não prova superioridade de confiabilidade em campo. Documentação comercial descreve a experiência do usuário, mas não revela toda a implementação interna. A validação física do conjunto Galaxy A06/Android 16 + adaptador usado + Chevrolet Meriva continua necessária.

## 2. Evidência do código atual

Arquivos examinados: src/obd/bluetoothManager.ts, src/obd/bluetoothClassicTransport.ts, src/obd/sharedConnection.ts, src/obd/elm327.ts, src/obd/elm327Compatibility.ts, src/knowledge/bluetooth_config.json e docs/CONTRATO_ANTI_REGRESSAO.md.

### Transporte e rádio

- Usa react-native-bluetooth-classic, Bluetooth Classic e RFCOMM/SPP no Android.
- Perfil genérico ELM327 Mini; sockets seguros e inseguros; charset ASCII; leitura de stream até o prompt ELM.
- Lista dispositivos pareados. O nome do dispositivo ajuda a ordenar candidatos, mas não comprova compatibilidade.
- Limita RX a 16 KiB e mantém diagnósticos do transporte.
- Verifica permissões, disponibilidade e estado do rádio antes de abrir o socket. Se o rádio continua desligado ou seu estado é incerto, aborta.
- Mantém travas compartilhadas para conexões e limpezas nativas pendentes por endereço normalizado, impedindo sockets duplicados enquanto o estado anterior não é seguro.

### Inicialização ELM

A sessão abre o transporte e executa comandos em série. ATZ é obrigatório e pode ser repetido; ATI é diagnóstico, não requisito de compatibilidade. A configuração contempla ATE0, ATL0, ATS0, ATH1 e ATSP0 como comandos opcionais/forçados. ATDP consulta o protocolo informado pelo adaptador. Depois, o aplicativo testa 010C e exige resposta parseável 41 0C. Se falhar, tenta protocolos 5, 3, 4, 6, 7, 8 e 9 antes de desistir. A descoberta de PIDs usa bitmaps da ECU da sessão atual; cache só prioriza candidatos.

Os valores configurados incluem timeout I/O base de 15 s, seleção de protocolo até 15 s, timeout curto para ATs opcionais e timing adaptativo. São parâmetros atuais do projeto, não prova de que sejam ideais para todos os clones.

### Fila e monitoramento

A sessão serializa comandos por fila; consultas paralelas no mesmo ELM/K-Line não são seguras. A conexão compartilhada evita uma sessão por tela. O monitor verifica o rádio em intervalos de 5 s; para KWP envia keep-alive; aproximadamente a cada três ciclos consulta 010C como prova de resposta da ECU. Falhas consecutivas podem levar à recuperação de protocolo e a uma reconexão com backoff finito.

A configuração de conexão inicial permite até 20 tentativas com intervalo de 8 s; a recuperação após queda usa, por padrão, backoff de 2, 5 e 15 s. São contextos diferentes e precisam ser avaliados separadamente.

## 3. Comparação com os aplicativos

| Aplicativo | Métodos documentados | Comparação com Meriva Smart |
|---|---|---|
| Car Scanner ELM OBD2 | Guias separados para Bluetooth Android, BLE, Wi-Fi e otimização; alerta sobre adaptador incompatível | Boa referência para clareza na escolha do transporte e configuração. O Meriva oferece mais detalhes explícitos de estados internos no código analisado; não é possível comparar a implementação proprietária completa. |
| OBDLink | Pareamento, botão Connect, assistente para novo adaptador/veículo, protocolo automático e troubleshooting; alerta sobre conflito com outro app | Boa referência de onboarding e resolução acionável de falhas. Meriva já tem log, estado Bluetooth/ECU e recuperação, mas a equivalência visual do assistente não foi verificada. |
| OBD Auto Doctor | Suporte a Bluetooth Classic, BLE e Wi-Fi conforme plataforma; permite protocolo manual e envio de logs | Boa referência de fallback manual e diagnóstico exportável. Meriva é focado em Android Bluetooth Classic/RFCOMM neste fluxo. |
| ScanMyOpel / ScanMyOpelCAN | Separa modelos Opel não-CAN e CAN; alerta que clones ELM podem falhar | Referência importante para segmentar suporte por geração/ECU. OBD genérico não equivale a acesso proprietário a múltiplos módulos Opel. |
| Torque Pro | Documenta configuração de adaptador, sensores e fórmulas; sequência interna completa não foi confirmada | Não há evidência pública suficiente nesta auditoria para afirmar que use o mesmo algoritmo de conexão ou retry. |
| OBD Fusion | Documenta adaptadores e recursos diagnósticos; sequência interna não suficientemente pública | Referência funcional, não prova de uma implementação de transporte superior. |

## 4. Comparação com projetos abertos

| Projeto | Padrão observado | Significado para o Meriva Smart |
|---|---|---|
| Car Scanner ELM OBD2 repository público | Inicialização ELM, controles de echo/linefeed/space/headers, seleção de protocolo e tratamento distinto de falha de conexão/ausência de dados | Confirma que comandos de formatação e seleção são comuns; não torna cada comando obrigatório para todo clone. |
| OBDvis | BluetoothSocket/stream, framing até prompt ELM, inicialização AT, scheduler por prioridade/frescor e estados de conexão | Corrobora leitor único, framing e polling centralizado, conceitos já presentes no Meriva. |
| python-OBD | Modos síncrono/assíncrono e loop de atualização | Referência para separar UI e aquisição; não significa que comandos paralelos sejam seguros no mesmo adaptador. |
| OBD-Droid | Transporte Bluetooth, threads, limpeza e PIDs customizados | Referência de ciclo de vida, sem provar que suas heurísticas sejam práticas comerciais recomendáveis. |
| OBD Metrics | Camadas de request/response, registry e codecs | Referência para separar responsabilidades; não prova desempenho em K-Line. |

## 5. Pontos fortes comprovados no código

1. Pareamento não é confundido com ECU válida: a sessão exige resposta 010C interpretada como 41 0C.
2. ATI não é requisito, evitando rejeitar clones que não o implementam corretamente.
3. Timeouts de I/O e seleção de protocolo são explícitos.
4. Comandos são serializados.
5. O buffer RX tem limite.
6. A limpeza nativa e a abertura de socket são protegidas contra concorrência e estado incerto.
7. Falhas e eventos são registrados.
8. Bluetooth e ECU têm estados distintos.
9. Cache não substitui descoberta de suporte na sessão atual.
10. O contrato anti-regressão inclui requisitos específicos para timeout, cleanup, descoberta e rádio.

Essas propriedades foram identificadas no código; não são resultados de benchmark físico.

## 6. Riscos a verificar antes de qualquer mudança

### P0 — Falta de validação física reproduzível

Testar com telefone real Android 16, adaptador exato e Meriva real. Medir tempo até primeiro 41 0C, duração de ATSP0, taxa de timeout/NO DATA e tempo de recuperação. Repetir com ignição ligada/motor funcionando quando seguro, rádio desligado/ligado, remoção do adaptador e perda de resposta da ECU. Confirmar ATDP em vez de assumir o protocolo pela descrição do veículo.

### P1 — Fallback de protocolo

A lista de fallback cobre famílias diferentes e é uma estratégia, não prova de que todas sejam adequadas à ECU real. Não mudar ordem nem remover protocolos sem capturas físicas reproduzíveis e protocolo final registrado.

### P1 — Prova de ECU

A resposta 010C precisa conter serviço e PID esperados, tamanho correto e passar validação de envelope/parser. Os testes devem rejeitar respostas ambíguas, bytes excedentes e quadros de outra ECU.

### P1 — Timeout versus desconexão

Timeout pode indicar ECU lenta, protocolo errado, adaptador bloqueado ou enlace perdido. A UI deve preservar a categoria do erro e não afirmar uma causa única sem evidência.

### P1 — Monitor de saúde versus polling

A consulta 010C periódica entra na fila da sessão e pode aumentar latência dos PIDs. Medir o impacto e verificar starvation, comandos duplicados e sobreposição.

### P2 — UX de configuração

Os concorrentes dão instruções explícitas sobre adaptador/transporte, ignição, permissões, apps OBD concorrentes, protocolo automático/manual e envio de logs. Uma futura auditoria de UX deveria verificar se o usuário consegue distinguir rádio desligado, adaptador ausente, socket recusado, ELM sem resposta, AT não suportado, ECU sem resposta, protocolo incompatível e PID individual indisponível sem interpretar logs brutos. Isto é proposta de análise, não implementação autorizada.

## 7. Plano de comparação reproduzível

Usar o mesmo veículo, telefone, adaptador, estado de ignição e condição do motor. Registrar versão do app e adaptador. Fazer pelo menos três repetições por cenário, sem outras aplicações OBD abertas.

| Métrica | Medição |
|---|---|
| Tempo Bluetooth | Ação de conectar até socket ativo |
| Tempo ELM | Socket ativo até primeiro AT válido |
| Tempo ECU | Início até resposta 010C válida |
| Sucesso inicial | Sessões válidas / tentativas |
| Latência por PID | TX até prompt completo e payload validado |
| Taxa de falha | Timeout, NO DATA, BUS INIT e RX inválido / total |
| Recuperação | Queda até nova resposta válida da ECU |
| Falsos conectados | Tempo em que a UI indica conexão sem ECU fresca |
| Impacto do monitor | Latência com e sem probe periódico |
| Diagnóstico acionável | Falhas corretamente classificadas / cenários simulados |

Comparação justa exige protocolo e adaptador equivalentes. Um adaptador OBDLink dedicado não é equivalente a um clone ELM327 Mini; diferenças não podem ser atribuídas apenas ao aplicativo.

## 8. Referências públicas

- Car Scanner — configuração: https://www.carscanner.info/configuring/
- Car Scanner — FAQ/adaptador incompatível: https://www.carscanner.info/faq/
- OBDLink — troubleshooting, assistente, protocolo e exclusividade: https://support.obdlink.com/support/solutions/articles/43000715570
- OBD Auto Doctor — troubleshooting, protocolo manual e logs: https://www.obdautodoctor.com/help/articles/troubleshoot-connectivity-issues/
- OBD Auto Doctor — adaptadores por plataforma: https://www.obdautodoctor.com/help/articles/supported-obd-adapters/
- ScanMyOpel — suporte CAN/não-CAN e adaptadores: https://scanmyopel.com/
- Car Scanner ELM OBD2 repository: https://github.com/car-scanner-elm/car-scanner-elm-obd2
- OBDvis: https://github.com/Joost-vanAndel/OBDvis
- python-OBD: https://github.com/brendan-w/python-OBD
- OBD-Droid: https://github.com/Wal33D/OBD-Droid
- OBD Metrics: https://github.com/tzebrowski/ObdMetrics
- Meriva Smart Bluetooth manager: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/bluetoothManager.ts
- Meriva Smart transport: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/bluetoothClassicTransport.ts
- Meriva Smart shared connection: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/sharedConnection.ts
- Meriva Smart ELM session: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/elm327.ts
- Meriva Smart compatibility config: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/obd/elm327Compatibility.ts
- Meriva Smart Bluetooth config: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/src/knowledge/bluetooth_config.json
- Meriva Smart anti-regression contract: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/blob/main/docs/CONTRATO_ANTI_REGRESSAO.md

## 9. Conclusão e estado

O Meriva Smart já possui uma base sólida de controle de sessão no código. As diferenças comerciais mais visíveis estão em onboarding e apresentação de falhas, não em uma superioridade interna comprovada. A maior lacuna probatória é a ausência de medições físicas completas e reproduzíveis no telefone, adaptador e ECU reais. Antes de alterar comandos ou temporização, medir e registrar.

**Estado:** documento de pesquisa isolado. Nenhuma implementação, teste físico, alteração de configuração, mudança em PR ou merge foi realizado.