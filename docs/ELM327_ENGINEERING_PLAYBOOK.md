# ELM327 Engineering Playbook

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

A resposta somente fecha quando o buffer contém o prompt `>` do ELM327. Tudo antes do primeiro `>` pertence ao comando atual; qualquer cauda depois do prompt fica preservada para o próximo ciclo.

Isso evita depender do particionamento do RFCOMM e evita misturar `OK`, `NO DATA` ou linhas intermediárias com o comando seguinte.

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

ATZ e ATI são portas de entrada obrigatórias.
Comandos AT opcionais podem ser desabilitados individualmente se o adaptador responder ?.

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
