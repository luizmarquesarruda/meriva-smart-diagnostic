# MERIVA SMART DIAGNOSTIC

Aplicativo Android offline de diagnóstico OBD-II para Chevrolet Meriva Maxx 1.4L 8V ECONO.FLEX.

As especificações físicas e de manutenção do veículo são mantidas em `src/database/merivaManual.ts`, com referência ao Manual do Proprietário Chevrolet Meriva 2012.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não vira um valor inventado.

O GPS do celular inicia automaticamente ao abrir o aplicativo. Ele fornece velocidade e distância em primeiro plano, mesmo quando a ECU não oferece o PID 015E. A gravação de litros e consumo depende de taxa de combustível OBD válida. Litros consumidos só entram no cálculo quando a ECU fornece uma taxa de combustível válida pelo PID OBD 015E. O GPS sozinho não mede litros. O aplicativo não aceita litros digitados manualmente na tela principal.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

## Estrutura

```text
app/             telas e navegação
src/obd/         Bluetooth, ELM327, parser, DTC, PIDs e telemetria
src/data/        tipos e ciclos de condução
src/database/    persistência, DTC, PIDs, aprendizado e veículos
src/meriva/      autosave e estado persistido
src/gps/         rastreamento de velocidade e distância
src/storage/     quota, backup, limpeza e ciclos
src/types/       contratos compartilhados
tests/           testes automatizados
docs/            arquitetura, desenvolvimento e auditorias
.github/         CI e governança
```

## Fluxo OBD

```text
UI
 ↓
Bluetooth Manager
 ↓
BluetoothClassicTransport (eventos)
 ↓
Elm327Session (fila de comandos)
 ↓
Discovery / PID / DTC
 ↓
Parser
 ↓
RAW + interpretado
 ↓
Banco / Histórico / DNA / Autosave
```

O sistema diferencia Bluetooth, ELM327 e ECU. Estar conectado ao ELM327 não significa que a ECU respondeu.

## GPS

```text
Root Layout
 ↓
GpsTracker singleton
 ↓
watchPositionAsync
 ↓
filtro por precisão + salto + velocidade
 ↓
velocidade / distância
 ↓
cálculo km/L somente com litros válidos
```

O rastreador é criado uma vez por sessão do aplicativo para continuar ativo enquanto o usuário navega entre as telas. A coleta é de primeiro plano e requer permissão de localização.

## Regras de dados

- REAL_OBD: veio da ECU através do transporte real.
- SIMULACAO: usado apenas para testes.
- CARSCANNER_BASELINE: referência externa, não é leitura atual da ECU.
- Dados simulados ou de referência não alimentam o aprendizado REAL_OBD.
- TX/RX original deve ser preservado quando houver logging.
- Respostas sem interpretação ficam como NÃO RESPONDEU, VALOR NÃO INTERPRETADO ou SEM DADOS.
- Nunca inventar valores.

## PIDs e combustível

A base cobre PIDs padrão úteis para telemetria e diagnóstico, incluindo velocidade, RPM, temperatura, MAF, posição da borboleta e taxa de combustível do motor (PID 015E). O PID 015E representa taxa de combustível em L/h quando suportado pela ECU. O aplicativo integra essa taxa ao longo do tempo usando os intervalos entre amostras, ignorando amostras inválidas e intervalos excessivamente longos. A disponibilidade e a exatidão devem ser confirmadas na ECU real da Meriva antes de usar o resultado como medição de consumo.

## Identificação de combustível

A versão de validação passou a reconhecer os PIDs padrão **0151 (Fuel Type)** e **0152 (Alcohol Fuel Percentage)**.

- **0151**: identifica o tipo de combustível declarado pela ECU. Não deve ser tratado como leitura da mistura atual do tanque.
- **0152**: quando suportado e respondido validamente, informa o percentual de álcool fornecido pela ECU.
- O aplicativo **não estima** a mistura usando STFT, LTFT, lambda, MAF ou consumo.
- Respostas TX/RX continuam sendo preservadas para conferência.
- Um valor fora da faixa de 0–100% é marcado como incoerente e não é usado.
- A Meriva real ainda precisa responder aos PIDs para que eles sejam considerados **confirmados para este veículo**.

O módulo src/obd/fuelIdentification.ts é deliberadamente conservador. Ele separa TIPO_VEICULO, COMPOSICAO_ECU, SEM_DADOS e DADO_INCOERENTE. Não altera a tela principal nem declara automaticamente o combustível até haver evidência real suficiente.

### Critério para avançar

1. Consultar 0151 e 0152 na ECU real da Meriva.
2. Registrar várias respostas reais, incluindo TX/RX e protocolo.
3. Verificar estabilidade e coerência dos valores.
4. Só depois considerar qualquer uso do resultado no diagnóstico ou na autonomia.
5. Se a ECU não suportar os PIDs, manter a funcionalidade como investigação e não substituir por uma estimativa silenciosa.

## Persistência

O aplicativo mantém CONFIG, BANCO, LEITURAS, APRENDIZADO, DTC, LOGS, VIAGENS e BACKUP.

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android. A conexão usa Bluetooth Classic/RFCOMM e preserva o prompt > para o parser do ELM.

## Testes

```bash
npm install
npm run doctor
npm run typecheck
npm test
npx expo prebuild --clean --platform android --non-interactive
npx expo run:android
```

A suíte automatizada cobre autosave, parser, DTC, descoberta de PIDs, fila de comandos, transporte Bluetooth por eventos, storage e GPS. O build nativo Android no CI usa Java 17.

## Próximos blocos técnicos

1. validar Bluetooth/ELM327 e GPS em Android físico;
2. monitorar PIDs suportados em ciclo real;
3. validar a taxa do PID 015E e outros PIDs relevantes na ECU real;
4. validar o comportamento específico da ECU da Meriva com dados reais;
5. manter especificações do manual separadas das evidências atuais da ECU.

## Princípio

**Evidência antes de conclusão.**


<!-- CI validation: 2026-10-04 -->
## Engenharia ELM327

A camada Bluetooth usa o transporte nativo do react-native-bluetooth-classic, com framing BINARY no aplicativo. Isso permite que o parser receba o prompt > do ELM327 sem depender do delimitador consumido pela biblioteca.

A inicialização separa Bluetooth, ELM e ECU. O primeiro teste real da ECU é 010C. A documentação detalhada e a matriz de comparação com AndrOBD, python-OBD e implementações Java estão em docs/ELM327_ENGINEERING_PLAYBOOK.md.

## Validação CI

Este commit é um gatilho técnico para confirmar que o workflow `.github/workflows/ci.yml` continua disparando em `push` e executando a validação e o build Android nativo.

O teste de transporte Bluetooth usa `connectionType: raw`, com buffering local até o prompt `>`. Esse contrato é intencional para o fluxo ELM327 e é protegido pela regressão automatizada.
