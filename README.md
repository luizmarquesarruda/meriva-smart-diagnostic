# MERIVA SMART DIAGNOSTIC

Aplicativo Android offline de diagnóstico OBD-II para Chevrolet Meriva Maxx 1.4 8V.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não é transformada em um valor inventado.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

## Estrutura

```text
app/             telas e navegação
src/obd/         Bluetooth, ELM327, parser e PIDs
src/data/        dados e ciclos
src/database/    persistência, DTC e aprendizado
src/meriva/      autosave e estado persistido
src/storage/     quota, backup, limpeza e importação
src/types/       contratos compartilhados
tests/           testes automatizados
docs/            arquitetura e desenvolvimento
.github/         CI e governança
```

## Fluxo OBD

```text
UI
 ↓
Bluetooth Manager
 ↓
Bluetooth Classic
 ↓
Elm327Session
 ↓
Discovery / PID
 ↓
Parser
 ↓
Raw + Interpretado
 ↓
Banco / DTC / Histórico / DNA
```

O sistema diferencia Bluetooth, ELM327 e ECU. Estar conectado ao ELM327 não significa que a ECU respondeu.

## Regras de dados

- REAL_OBD: veio da ECU através do transporte real.
- SIMULACAO: usado apenas para testes.
- REFERENCIA: dado externo usado como referência.
- Dados simulados não alimentam o aprendizado real.
- TX/RX original deve ser preservado quando houver logging.
- Respostas sem interpretação ficam como NÃO RESPONDEU, VALOR NÃO INTERPRETADO ou SEM DADOS.
- Nunca inventar valores.

## Persistência

O aplicativo mantém CONFIG, BANCO, LEITURAS, APRENDIZADO, DTC, LOGS, VIAGENS e BACKUP.

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android.

## Testes

```bash
npm install
npm run typecheck
npm test
npx expo prebuild
npx expo run:android
```

## Documentação

- Arquitetura: docs/ARCHITECTURE.md
- Desenvolvimento: docs/DEVELOPMENT.md
- Segurança: SECURITY.md
- Contribuição: CONTRIBUTING.md
- Histórico: CHANGELOG.md

## Próximos blocos técnicos

1. estabilizar CI;
2. ampliar testes do parser e Bluetooth;
3. integrar logging e histórico ao fluxo real de PID;
4. completar DTC na UI;
5. identificar protocolo real sem valores fixos;
6. validar em Android físico com ELM327 e veículo real.

## Princípio

**Evidência antes de conclusão.**