# MERIVA SMART DIAGNOSTIC

Aplicativo Android offline de diagnóstico OBD-II para Chevrolet Meriva Maxx 1.4 8V.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não vira um valor inventado.

O GPS do celular inicia automaticamente ao abrir o aplicativo. Ele fornece velocidade e distância em primeiro plano. Litros consumidos só entram no cálculo quando existe uma fonte real de combustível, como medição informada ou PID OBD suportado. GPS sozinho não mede litros.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

## Estrutura

```text
app/             telas e navegação
src/obd/         Bluetooth, ELM327, parser, DTC e descoberta de PIDs
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

A base agora cobre PIDs padrão úteis, incluindo velocidade, RPM, temperatura, MAF, posição da borboleta, nível de combustível e taxa de combustível do motor (PID 015E). Um PID só é usado quando a ECU efetivamente responde e o parser reconhece o formato.

A taxa de combustível 015E é uma possível fonte para integrar litros consumidos ao longo do tempo. Ela ainda deve ser validada no veículo real antes de ser tratada como medição disponível.

## Persistência

O aplicativo mantém CONFIG, BANCO, LEITURAS, APRENDIZADO, DTC, LOGS, VIAGENS e BACKUP.

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android.

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
3. integrar uma fonte de combustível contínua ao histórico de viagens;
4. validar o comportamento específico da ECU da Meriva com dados reais;
5. completar o cadastro do veículo na UI, sem valores presumidos.

## Princípio

**Evidência antes de conclusão.**
