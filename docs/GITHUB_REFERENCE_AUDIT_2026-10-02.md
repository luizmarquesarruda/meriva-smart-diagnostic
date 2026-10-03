# Referência externa de engenharia: projetos GitHub testados

Data da comparação: 2026-10-02.

Este documento registra padrões encontrados em projetos públicos de diagnóstico OBD/GPS e o que foi ou não aproveitado no Meriva Smart Diagnostic.

## 1. Projetos analisados

### AndrOBD
Repositório: https://github.com/fr3ts0n/AndrOBD

É a principal referência de arquitetura OBD para este projeto. O README documenta conexão por Bluetooth/USB/Wi-Fi, leitura e gravação de dados em tempo real, DTC, dashboard, gráficos, gravação de dados e modo de demonstração. O projeto também mantém testes unitários e instrumentados, e o CONTRIBUTING informa como executar a suíte com ./gradlew test.

Ponto técnico aproveitado:
- banco de PIDs orientado a dados;
- descoberta de PIDs suportados;
- separação entre leitura bruta e valor físico;
- testes do parser/conversões;
- tratamento de diferentes protocolos em vez de fixar um único protocolo;
- tratamento de dados reais e modo de demonstração separadamente.

Também foi conferido o banco de PIDs do projeto: o PID 015E é definido como Engine fuel rate e usa a fórmula A*256+B seguida da conversão de taxa de combustível.

### python-OBD
Repositório: https://github.com/brendan-w/python-OBD

É uma referência de biblioteca de baixo nível. O README informa que a lista de comandos varia por veículo e inclui Engine fuel rate. Os testes verificam a integridade da tabela de comandos, nomes únicos e acesso por modo/PID. O código do ELM trata conexão, detecção de protocolo, respostas sem dados e timeout.

Ponto técnico aproveitado:
- não assumir que todo PID existe em todo carro;
- distinguir ausência de resposta de resposta válida;
- manter a camada de transporte separada da camada de decodificação;
- usar testes estruturais para tabelas e comandos.

### OBD Dash Android
Repositório: https://github.com/gustavozacarias04/obd2-dashboard-android

O README descreve cálculo de consumo a partir de MAF ou speed-density e um modelo de viagem com distância, litros, duração, média, máximas e amostras. O próprio projeto informa, porém, que o código ainda não havia sido testado em um veículo real. Por isso, a matemática de viagem foi usada somente como referência estrutural, não como fonte de validação de veículo.

Ponto técnico aproveitado:
- separar estado da viagem de dados de tela;
- guardar distância, litros, tempos e máximas por viagem;
- não confundir uma estimativa matemática com uma medição real.

## 2. O que não será importado

O cálculo por speed-density do OBD Dash não entra no núcleo real do Meriva Smart Diagnostic. O projeto atual exige dados reais da ECU para alimentar o consumo e evita fabricar litros a partir de MAP/IAT/RPM.

Também não será copiada uma dependência Android/Kotlin inteira. O app atual usa Expo/React Native e react-native-bluetooth-classic; trazer outra pilha de Bluetooth aumentaria o risco e o tamanho do projeto.

## 3. Decisão para o Meriva Smart Diagnostic

A arquitetura adotada fica híbrida e simples:

GPS do celular -> velocidade/distância
ELM327 real -> PIDs reais da ECU
PID 015E -> L/h quando suportado
FuelRateIntegrator -> litros por integração no tempo
RealTripRecorder -> junta GPS + L/h e produz o ciclo real
driveCycleStorage -> persiste histórico

O ciclo real só é salvo quando há distância mínima e dados de combustível válidos em pelo menos duas amostras. Assim, uma ECU que não disponibiliza 015E não gera consumo falso.

## 4. Resultado da comparação

A regra prática que ficou foi: aprender com projetos que têm testes e separação clara de camadas, mas manter somente componentes compatíveis com a arquitetura atual e com a exigência de dados reais do veículo.