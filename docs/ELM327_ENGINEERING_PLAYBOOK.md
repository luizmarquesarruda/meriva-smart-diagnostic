# ELM327 Engineering Playbook

> Para nomes/fórmulas dos PIDs e limites da documentação do veículo, consulte [Auditoria de fontes da Meriva e compatibilidade OBD](MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md). O gate por resposta real de `010C` é um critério operacional observado no projeto, não uma promessa de que todos os PIDs SAE estejam disponíveis.

## Objetivo
Construir uma sessão OBD-II tolerante a clones ELM327, mas rigorosa com evidência.

## Arquitetura atual
~~~text
Android Bluetooth Classic
        |
        v
RFCOMM / SPP
        |
        v
react-native-bluetooth-classic
        |
        v
BluetoothClassicTransport
        | bytes/eventos crus
        v
prompt ELM >
        |
        v
Elm327Session + fila/mutex
        |
        +--> ATZ / ATI / AT...
        +--> ATSP0 / ATDP
        +--> 010C
        +--> fallback de protocolo
        v
PID / DTC / parser
        v
RAW TX/RX + resposta interpretada
        v
histórico / aprendizado / diagnóstico
~~~

## O achado mais importante
A implementação usa `connectionType: delimited`, `charset: ascii` e **delimiter vazio**. A biblioteca documenta que um delimiter vazio entrega todo o conteúdo atualmente recebido sem segmentá-lo artificialmente. Isso combina melhor com o ELM327 porque suas respostas podem ser fragmentadas pelo RFCOMM e o enquadramento final da resposta é o prompt `>`.

O projeto mantém `ATL0`, portanto o ELM327 fica sem linefeed extra. O TX continua terminando em CR (`0x0D`). O termo RAW na documentação significa preservar TX/RX recebidos, não significa que o socket esteja configurado como `raw`.

A biblioteca também possui um modo `binary`, mas nele o Android entrega os bytes como Base64 para a ponte React Native. Como o ELM327 deste projeto usa ASCII, optamos por `delimited` com delimiter vazio: mantém os dados legíveis e ainda permite nosso próprio framing por `>`.

Esta decisão foi baseada no código/documentação da `react-native-bluetooth-classic` e no datasheet do ELM327.

### Evidência do trace real — 2026-10-27

O retorno `010C` registrado como `84F111410C0000D3` não é ausência de resposta: é compatível com um quadro KWP compacto. O cabeçalho `84 F1 11` declara quatro bytes de mensagem, `41 0C 00 00` é a resposta positiva do PID e `D3` confere como checksum aditivo dos bytes anteriores. O payload representa 0 rpm; isso pode ocorrer com o motor parado e continua sendo uma resposta válida para confirmar comunicação com a ECU.

O parser deve aceitar esse envelope apenas quando comprimento declarado e checksum forem válidos. Não deve exigir que todo K-Line/KWP retorne o formato antigo `48 6B 10`, nem deve avançar para `ATSP5/3/4/...` depois de já receber uma resposta `010C` válida. Quadros com checksum errado, comprimento divergente ou bytes extras continuam inválidos.

## Comparação com implementações reais

| Implementação | Transporte | Inicialização | Timeout | Recuperação |
|---|---|---|---|---|
| AndrOBD | Android/Java | máquina de estados ELM | adaptativo | BUS/NODATA/RX/DATA separados |
| python-OBD | serial | ATSP0 + 0100 + ATDP | configurável | fallback de protocolo |
| Java OBD | BluetoothSocket RFCOMM/SPP | comandos AT | socket + OBD | dependente da sessão |
| react-native-bluetooth-classic | ponte nativa | socket nativo | conexão + eventos | evento de desconexão |
| Meriva Smart Diagnostic | RN -> Java nativo -> RFCOMM/SPP | ATZ + ATI + ATDP | adaptativo no app | estado ELM/ECU + retry de conexão |

AndrOBD mantém estados explícitos como INITIALIZING, ECU_DETECT, CONNECTED, NODATA, BUSERROR, DATAERROR, RXERROR e DISCONNECTED. O projeto deve seguir a mesma ideia, mesmo com implementação TypeScript.

python-OBD é referência de engenharia para descoberta e fallback. Neste projeto, o primeiro gate da ECU é 010C porque esse é o PID real de referência disponível para a Meriva.

Implementações Java Android tradicionais usam BluetoothSocket com o UUID SPP conhecido:

~~~text
00001101-0000-1000-8000-00805F9B34FB
~~~

Nossa aplicação não abre esse socket diretamente em Java. Ela delega essa parte à biblioteca react-native-bluetooth-classic, que é uma ponte nativa Android. Isso reduz código nativo próprio, mas deixa o controle fino do socket abaixo da nossa camada.

## Regras de conexão

### 1. Bluetooth não é ELM
Estados mínimos:
1. Bluetooth indisponível
2. Bluetooth desligado
3. permissões ausentes
4. Bluetooth pronto
5. RFCOMM conectando
6. RFCOMM conectado
7. ELM respondendo
8. ECU respondendo
9. protocolo identificado
10. sessão operacional
11. recuperação
12. desconectado

Nunca mostrar apenas conectado como diagnóstico final.

### 2. SPP/RFCOMM
O alvo atual é Bluetooth Classic, não BLE.
O aplicativo trabalha com dispositivos pareados pelo Android e não depende de um MAC fixo.
O endereço só identifica o dispositivo. A confirmação real exige resposta do ELM.

### 3. Framing
TX termina com CR: `010C + CR`.

RX é recebido como **stream sem delimitador**. Cada evento é anexado ao buffer local, sem assumir que um evento contém uma resposta inteira.

A resposta somente fecha quando o buffer contém o prompt `>` do ELM327. Tudo antes do primeiro `>` pertence ao comando atual. A implementação atual descarta qualquer cauda após o primeiro prompt recebido no mesmo evento e registra essa cauda como `trailingDiscarded`; isso impede que clones que repetem uma resposta/prompt contaminem a resposta do próximo comando.

Isso evita depender do particionamento do RFCOMM e evita misturar `OK`, `NO DATA` ou linhas intermediárias com o comando seguinte. A sessão mantém fila/mutex e não envia dois comandos em paralelo.

### 4. Inicialização
Sequência base:
~~~text
ATZ
ATI
ATE0
ATL0
ATS0
ATH1
ATSP0
ATDP
~~~

`ATZ` é a etapa obrigatória que reinicializa o adaptador. `ATI` é best-effort e não é gate universal: alguns clones não o implementam corretamente; comandos AT opcionais são classificados individualmente. Se o adaptador responder explicitamente `?`/`UNKNOWN COMMAND`, o comando opcional é marcado como não suportado e não é repetido com retries e atrasos fixos. Timeouts e falhas transitórias continuam sujeitos à política de retry limitada. O gate real da ECU permanece `010C -> 41 0C`, independentemente do texto de identificação do adaptador.

### 5. Primeiro teste da ECU
O primeiro PID real da Meriva é 010C.
Resposta conhecida de referência: 41 0C 1A F8.
RPM = ((0x1A * 256) + 0xF8) / 4 = 1726 rpm.
Uma conexão Bluetooth sem 410C não deve ser chamada de ECU OK.

## Timing
O ELM327 possui seu próprio temporizador de resposta. ATST usa unidades de aproximadamente 4 ms. O ELM também possui adaptive timing.

O projeto também possui timeout adaptativo no lado do aplicativo.

Regra:
- timeout do socket não é igual a timeout OBD;
- timeout do app não substitui o temporizador interno do ELM;
- NO DATA é uma resposta do adaptador, não prova de defeito da ECU;
- timeout repetido exige recuperação observável;
- nunca esconder timeout aumentando o valor indefinidamente.

## Recuperação
Classificar separadamente:
- NO DATA
- BUS ERROR
- BUS INIT ERROR
- BUFFER FULL
- RX ERROR
- DATA ERROR
- TIMEOUT
- DISCONNECTED
- UNSUPPORTED

Depois decidir:
~~~text
falha de AT obrigatório
    -> fechar -> reconectar -> inicializar

falha parcial de resposta
    -> limpar framing -> reexecutar somente se seguro

NO DATA isolado
    -> registrar -> não inventar valor

BUS/RX/DATA ERROR
    -> recuperação do ELM/protocolo

desconexão Bluetooth
    -> fechar estado -> reconexão
~~~

A recuperação deve ser cancelável no futuro. O modo infinito de reconexão não deve bloquear o fechamento da sessão.

## Java versus nossa implementação
### O que os projetos Java fazem melhor
- acesso direto ao BluetoothSocket;
- controle explícito do UUID SPP;
- leitura de InputStream;
- escrita em OutputStream;
- estados nativos de conexão;
- possibilidade de fallback de socket.

### O que nosso projeto faz melhor
- fila de comandos;
- separação Bluetooth / ELM / ECU;
- persistência de TX/RX;
- parser de PIDs;
- histórico;
- diagnóstico local;
- testes rápidos sem depender da ECU.

### Decisão de engenharia
Não duplicar o socket Java agora.
O projeto não versiona `android/` porque o Expo prebuild o gera. A CI usa Java 17 para o build nativo.
Primeiro validar o transporte nativo existente. Só criar uma camada Java própria se o hardware real demonstrar que a ponte não oferece controle suficiente sobre UUID SPP, fallback RFCOMM, leitura por bytes, reconexão, cancelamento de socket ou estados nativos.

## UX / Product Design
A interface deve tratar a conexão como um processo técnico, não como um botão binário.

Hierarquia recomendada:
~~~text
BLUETOOTH
   OK

ELM327
   RESPONDENDO
   ELM327 v1.5

ECU
   RESPONDENDO

PROTOCOLO
   ISO 14230-4 KWP FAST

PRIMEIRO PID
   010C -> 1726 rpm
~~~

Em falha, mostrar a camada que falhou:
- Bluetooth desligado
- RFCOMM não abriu
- ELM não respondeu ao ATI
- ECU não respondeu ao 010C

Evitar mensagens genéricas como Erro Bluetooth.

## Critérios de aceite
### Bluetooth
- [ ] permissões Android concedidas
- [ ] Bluetooth ligado
- [ ] dispositivo pareado
- [ ] RFCOMM abre
- [ ] estado do socket confirmado

### ELM
- [ ] ATZ responde
- [ ] ATI responde
- [ ] versão preservada
- [ ] comandos AT opcionais classificados
- [ ] prompt > recebido

### ECU
- [ ] 010C enviado
- [ ] 410C validado
- [ ] protocolo identificado
- [ ] PIDs descobertos somente depois de ECU válida

### Evidência
- [ ] TX preservado
- [ ] RX preservado
- [ ] tempo de resposta preservado
- [ ] status preservado
- [ ] protocolo preservado
- [ ] origem REAL/SIMULAÇÃO preservada

## Referências técnicas
- AndrOBD: máquina de estados, adaptive timing e recuperação.
- python-OBD: descoberta de protocolo e fallback.
- react-native-bluetooth-classic: ponte Android/Java e modos de framing.
- Android Bluetooth: RFCOMM/SPP e UUID.
- ELM327 datasheet: prompt, ATST e adaptive timing.

A documentação externa é referência de engenharia. Ela não substitui o comportamento medido no ELM327 real da Meriva.
## Política de teste Bluetooth

Para diagnóstico físico, a sessão de conexão usa no máximo **20 tentativas automáticas por padrão**. O limite efetivo pode ser reduzido pelas configurações do aplicativo. Entre falhas há **8 segundos** de espera. Cada tentativa é registrada no trace TXT, incluindo TX/RX e erro de conexão quando disponível.

Eventos principais: `BLUETOOTH_ATTEMPT_START`, `BLUETOOTH_ATTEMPT_RESULT`, `BLUETOOTH_RETRY_WAIT_START`, `BLUETOOTH_RETRY_WAIT_END` e `BLUETOOTH_TEST_SESSION_END`.

A contagem é encerrada imediatamente quando a ECU é validada por `010C -> 41 0C XX XX`. Não são executadas 20 tentativas após uma conexão válida.

## Correção da política de retry no TypeScript

As constantes da política de teste ficam no escopo do módulo para serem reutilizadas pela aplicação e pelos testes de regressão:

~~~ts
export const MAX_BLUETOOTH_ATTEMPTS = 20; // limite-base do catálogo Bluetooth
export const BLUETOOTH_RETRY_INTERVAL_MS = 8000; // intervalo-base do catálogo Bluetooth

// O limite efetivo de tentativas pode ser reduzido pela configuração do aplicativo;
// valor 0/ausente usa o limite-base finito de 20 para impedir ciclos infinitos.
~~~

Não declarar `export const` dentro de `createRealElmSession`. A função apenas consome as constantes exportadas.


## Regra final de retry Bluetooth

O ciclo executa no máximo o limite efetivo configurado; o padrão seguro é 20 tentativas. O intervalo de 8 segundos ocorre somente após uma falha. Ao obter SUCCESS, o ciclo termina imediatamente e a sessão bem-sucedida é devolvida ao aplicativo. Não existe reabertura ou tentativa adicional depois do sucesso.


## Aquisição e redução de latência — 2026-10-12

- O projeto mantém comandos OBD serializados porque a interface ELM327/K-Line usa ciclos request/reply.
- `python-OBD` oferece um loop assíncrono `watch/start` que atualiza respostas em background e permite retornar o último valor conhecido sem bloquear o chamador: https://python-obd.readthedocs.io/en/latest/Async%20Connections/
- OBD Auto Doctor declara que atualiza os PIDs sequencialmente tão rápido quanto carro/adaptador/conexão permitem e que PIDs adicionais de logging reduzem a atualização dos demais: https://www.obdautodoctor.com/features/ e https://support.obdlink.com/support/solutions/articles/43000709894
- O ELM327L possui adaptive timing com timeout baseado nos tempos reais de resposta, limitado pelo `ATST`; portanto, não se deve reduzir timeouts sem captura de latência real: https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327L_Data_Sheet.pdf
- A aplicação reaproveita a resposta de validação `010C`, percorre apenas páginas bitmap anunciadas, remove do conjunto operacional os PIDs que não devolvem payload válido, e distribui fallback MAF/MAP e nível de tanque em ciclos separados. I/O CSV e persistência repetida do perfil PID foram tirados do caminho crítico sempre que possível.
- Não foi aplicada alteração em `ATST`, `ATAT` ou protocolo KWP nesta rodada, porque ainda falta benchmark físico da mesma ECU/adaptador. O esperado é menor carga de consultas redundantes, não um valor prometido em milissegundos.


### Retry rápido para comando opcional não suportado — 2026-10-12

Quando um comando AT opcional retorna `UNSUPPORTED`, repetir o mesmo comando não oferece nova informação e só acrescenta latência de inicialização. `Elm327Session.performInitialize()` agora interrompe os retries deste caso explícito. `TIMEOUT` e `ERROR` mantêm a política de repetição limitada porque podem ser transitórios. Foi adicionada uma regressão com transporte falso que responde `?` para `ATI` e verifica uma única tentativa. Não foram alterados o reset obrigatório `ATZ`, os atrasos de assentamento do firmware, o protocolo KWP ou ATST.


## 2026-10-13 — Timeout de inicialização sem bloquear a conexão

### Evidência e comparação
Implementações abertas consultadas:
- `python-OBD` separa a aquisição contínua da interface por meio de uma conexão assíncrona e callbacks/watchers: https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md
- `Free_OBD` organiza o transporte por uma fila serializada de comandos, separa comandos AT de comandos OBD e usa bitmap para descoberta: https://github.com/3badguys/Free_OBD
- `AndroidOBD` executa cada comando sobre um socket Bluetooth, calcula o PID após a resposta e deixa clara a dependência da transação serial: https://github.com/barnhill/AndroidOBD
- `obd-scanner-android` separa os fluxos Dashboard, Diagnostics e Telemetry e define cadências diferentes por grupo de sensor: https://github.com/ETSoftwareStudio/obd-scanner-android

A regra comum é não permitir que uma operação opcional de inicialização bloqueie a sessão inteira e manter apenas um comando em voo sobre RFCOMM/K-Line. Não se deve paralelizar consultas OBD no mesmo ELM327: isso mistura respostas e não aumenta a taxa física do barramento.

### Correção implementada nesta branch
- Somente `ATZ`, comando obrigatório, conserva tentativas de recuperação.
- Comandos AT locais opcionais (`ATI`, `ATE0`, `ATL0`, `ATS0`, `ATH1`) usam timeout curto configurável de **2500 ms** e não são repetidos em erro/timeout.
- `ATSP0` mantém timeout de negociação configurável de **15000 ms**, mas não entra em três tentativas completas.
- A aplicação continua validando a ECU por resposta OBD real de `010C`; ATI e comandos de configuração opcionais não passam a ser requisitos de conexão.
- Os limites são configurados em `src/knowledge/bluetooth_config.json`, normalizados em `src/obd/elm327Compatibility.ts` e aplicados pelo `src/obd/bluetoothManager.ts`.
- Testes adicionados para timeout curto, timeout completo de seleção de protocolo, valores default e falha transitória de comando opcional sem retry.

### Limites e segurança
Esta alteração reduz a pior espera provocada por comandos AT locais que não respondem; não garante menor latência em toda conexão e não altera os tempos de `ATZ`, a negociação K-Line ou a cadência dos PIDs em sessão. Não ajustar `ATST`/timing do barramento sem medição real no Meriva/ELM327.

### Validação
As regressões foram atualizadas, mas **não foi executada CI** conforme a instrução desta etapa. A alteração deve ser validada localmente/na próxima CI autorizada antes de ser considerada pronta para uso físico.


## 2026-10-13 — Nova auditoria: latência de polling, combustível e integridade

### O que o TXT real demonstrou

O arquivo de autosave enviado tinha 205 blocos, porém 200 números únicos; os números 262–266 reapareciam após o 302. O código passou a deduplicar registros antigos por número e a serializar o ciclo de leitura/atualização/escrita do histórico. O arquivo local será normalizado no próximo append de autosave; não foi possível modificá-lo remotamente no telefone.

### O que foi comparado externamente

- [python-OBD Async Connections](https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md): a interface consulta o último valor de um loop assíncrono de atualização; isso reduz espera da UI, mas não diminui magicamente a latência física do PID.
- [OBDLink logging](https://support.obdlink.com/support/solutions/articles/43000709894): cada PID monitorado compete por tempo de aquisição; logging por PID-frame evita produzir diversas linhas repetidas quando a taxa desejada excede a taxa real.
- [Car Scanner connection speed](https://www.carscanner.info/optimizing-connection-speed/): diminuir a lista de sensores aumenta a frequência por sensor; a otimização específica para CAN não deve ser aplicada à sessão K-Line sem suporte técnico.

### Correções confirmadas no código

1. **Fila serial do ELM327 preservada.** A sessão permanece request/reply; não é correto executar comandos PID em paralelo pelo mesmo RFCOMM/K-Line. A descoberta reaproveita a resposta do gate `010C`, percorre somente bitmaps anunciadas e consulta cada PID candidato uma vez para confirmar resposta.
2. **Trabalho de disco removido da parte lenta de aprendizado.** `registerObdQuery` continua enfileirando as amostras RAW/interpretadas e atualizando a telemetria e a última leitura em memória. A persistência do banco e do perfil de aprendizado corre em uma fila serializada própria; isso reduz o tempo que cada volta do polling fica aguardando JSON read-modify-write.
3. **Timeout de inicialização controlado por JSON.** Comandos AT locais opcionais têm limite padrão de 2500 ms e não são tentados repetidamente em falhas transitórias; `ATZ` continua obrigatório e `ATSP0` conserva até 15000 ms para negociação. Os contratos foram versionados e testados.
4. **Combustível específico e composição FLEX.** O estimador MAF/MAP utiliza a opção ETANOL/GASOLINA; FLEX exige composição válida do PID 0152 quando não há taxa medida disponível. PID 015E medido mantém precedência. Os parâmetros AFR/densidade são aproximações de referência e ainda não foram calibrados no veículo.
5. **Integridade temporal dos logs.** CSV RAW e interpretado agora usam a mesma data local do aparelho no nome do arquivo; timestamps das amostras continuam ISO UTC.
6. **Integrador de combustível.** Uma amostra com timestamp anterior à referência atual não pode recuar a linha de base nem modificar o total integrado.
7. **Histórico autosave.** Deduplicação legada e fila read-modify-write impedem novas colisões de número entre o autosave e uma exportação simultânea.

### Limites da otimização

A alteração da fila de aprendizado visa reduzir espera no caminho crítico, mas não foi medida em milissegundos neste dispositivo. A frequência dos dados continua limitada por: ECU KWP/K-Line, adaptador ELM327, Bluetooth, timeout/resposta da consulta e número de PIDs solicitados. Não se deve alegar fator de aceleração antes de uma comparação empírica com o mesmo conjunto de PIDs e as mesmas condições do motor.

### Verificações obrigatórias

- CI verde no commit final (TypeScript, regressões completas, Expo Doctor e build APK Android).
- No Meriva físico: tempo de início até a primeira resposta válida `010C`, intervalo entre respostas `010D` e `010C`, taxa de falha `NO DATA`/timeout e cadência do PID rotativo.
- Teste de consumo com combustível explicitamente selecionado e, para FLEX, somente com PID 0152 confirmado. Comparar a taxa `015E` quando disponível com estimativa MAF/MAP, registrando a diferença.
- Confirmar que o autosave exportado após a atualização contém até 200 números únicos, em ordem, sem blocos repetidos.


### Complemento — limite de persistência das leituras

O app separa o cache vivo do autosave persistente. `pushLastReading` atualiza a última leitura na memória em todas as respostas, mas evita a regravação completa do JSON/TXT para cada mudança numérica: uma vez por PID por janela de 10 s é a cadência normal de persistência. PID novo e alterações de status/unidade/origem continuam imediatas. Ao sair do primeiro plano, a persistência compara o fingerprint do estado em memória com o snapshot persistido e descarrega o valor mais recente mesmo dentro da janela. Nenhuma amostra RAW/interpretada do CSV é removida por essa regra.

Essa diferença é importante: o painel segue rápido e responsivo, enquanto o armazenamento reduz operações completas no filesystem. O ganho precisa ser medido na próxima captura física; não se deve inferir taxa de atualização do ELM a partir da frequência de snapshots TXT.

## Atualização de conexão — 2026-10-27

### Referências de comportamento em outros aplicativos

- [Car Scanner — conexão Bluetooth Android](https://www.carscanner.info/android-bluetooth/): parear no Android, selecionar o adaptador na configuração da aplicação e iniciar a conexão.
- [Torque — Getting Started](https://wiki.torque-bhp.com/view/Getting_Started): escolher conexão Bluetooth e o dispositivo previamente pareado.
- [OBDLink — Connection Wizard e troubleshooting](https://support.obdlink.com/support/solutions/articles/43000715570): protocolo OBD-II automático como ponto de partida; verificar se outro aplicativo manteve a conexão, pois alguns adaptadores só aceitam um cliente por vez.
- [python-OBD — Connections](https://python-obd.readthedocs.io/en/latest/Connections/): timeouts configuráveis e negociação automática como base, sem tratar a conexão serial como prova de ECU operacional.
- [Android — permissões Bluetooth](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions) e [BluetoothSocket](https://developer.android.com/reference/android/bluetooth/BluetoothSocket): permissões runtime atuais, RFCOMM como stream, cancelamento da descoberta antes de conectar e fechamento do socket como mecanismo de cancelamento.

### Decisões aplicadas ao Meriva Smart

1. **Não substituir a biblioteca nativa sem evidência.** A ponte `react-native-bluetooth-classic` já fornece RFCOMM/SPP, dois modos de socket, leitura contínua e evento de desconexão. A camada TypeScript já protege conexão nativa concorrente e exige enquadramento pelo prompt `>`. Uma reescrita Java antes de captura física aumentaria o risco sem provar que é necessária.
2. **Limitar a espera de conexão.** `src/knowledge/bluetooth_config.json` agora define três tentativas por adaptador e 1500 ms entre falhas transitórias, em vez de 20 tentativas e 8000 ms. O limite é configurável e permanece validado por teste.
3. **Não repetir uma negociação completa sem evidência nova.** Quando o candidato termina o fallback de protocolo sem resposta válida do PID `010C`, o manager registra `ECU_PROBE_EXHAUSTED` e segue para o próximo dispositivo pareado; não repete a mesma varredura no mesmo adaptador. Falhas de abertura/transientes continuam elegíveis ao retry limitado.
4. **Completar a tabela de protocolos.** O fallback inclui SAE J1850 VPW (ID `2`) e PWM (ID `1`) além de KWP/CAN. A negociação automática `ATSP0` continua inicial; os fallbacks não são prova de suporte e a ECU só valida com resposta OBD `41 0C` correta.
5. **Manter descoberta automática segura.** O último adaptador validado tem prioridade, nomes ELM/OBD vêm em seguida e os demais pareados continuam candidatos. A seleção manual é estrita: não troca silenciosamente de adaptador. Não exigir MAC fixo e não confiar somente no nome anunciado.
6. **Preservar separação dos estados.** Bluetooth/radio pronto, socket RFCOMM, ELM respondendo, ECU respondendo e diagnóstico pronto seguem separados. Timeout, `NO DATA`, erro de protocolo, rádio desligado e estado nativo indeterminado não podem virar “ECU conectada”.

### Limites de validação

- A suíte automatizada valida a política e as funções puras; a CI atual deve ser repetida no novo SHA final.
- O ensaio físico deve registrar no Samsung Galaxy A06/Android 16: tempo entre toque e primeiro `41 0C`, adaptador escolhido, protocolo identificado, latência por resposta, timeouts/NO DATA e resultado da reconexão. Testar com nenhum outro app OBD aberto para evitar disputa pelo mesmo adaptador.
- Não alegar melhoria de velocidade percentual, estabilidade ou compatibilidade com o veículo antes de medir o mesmo ELM327 e a mesma ECU em condições repetíveis.
