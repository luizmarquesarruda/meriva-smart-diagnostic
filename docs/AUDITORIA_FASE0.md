# AUDITORIA DO REPOSITÓRIO

Atualização: 2026-10-02

## Situação

A auditoria inicial da Fase 0 foi executada e as falhas de compilação registradas naquele documento foram tratadas.

Este documento histórico não deve ser usado como checklist atual. O estado atual está descrito em:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `CHANGELOG.md`

## Estrutura atual

- `app/`: interface Expo Router.
- `src/obd/`: transporte Bluetooth Classic, sessão ELM327, parser e PIDs.
- `src/database/`: DTC, aprendizado e persistência.
- `src/meriva/`: autosave e estado persistido.
- `src/storage/`: quota, limpeza, backup, ciclos e importação.
- `src/types/`: contratos TypeScript.
- `tests/`: testes automatizados.
- `.github/`: CI e governança.
- `docs/`: documentação técnica.

## Correções realizadas desde a auditoria inicial

- import de `ElmCommandResult`;
- módulos quebrados do aprendizado legado;
- logger CSV;
- transporte Bluetooth Classic;
- inicialização e permissões Bluetooth;
- classificação das respostas do ELM327;
- descoberta de PIDs;
- autosave e recuperação;
- migração de schema;
- cálculo de tamanho de backup;
- quota por tamanho real;
- CI;
- documentação de arquitetura e desenvolvimento.

## Pontos que ainda exigem validação

### CI

O GitHub Actions foi criado para executar TypeScript e testes. Uma execução anterior falhou na etapa `setup-node` porque o workflow usava cache npm sem `package-lock.json`. O cache foi removido para não depender de lockfile inexistente.

### Bluetooth

A tipagem local foi alinhada com os métodos realmente usados pelo transporte. Ainda é necessária validação em Android físico.

### Parser

O parser cobre os PIDs atualmente definidos, mas ainda deve receber testes para respostas multi-frame, headers variados e casos reais específicos da ECU da Meriva.

### Protocolo

Não assumir protocolo específico da Meriva como verdade universal. O aplicativo deve registrar a identificação efetivamente obtida do ELM/ECU.

### Integração

DTC, histórico, logger e aprendizado precisam continuar sendo integrados ao fluxo real de leitura sem permitir contaminação por simulação.

## Critério de conclusão

Uma funcionalidade só deve ser marcada como concluída depois de:

1. implementação;
2. typecheck;
3. teste automatizado quando aplicável;
4. teste Android quando envolver hardware/nativo;
5. documentação atualizada.

## Regra principal

**Sem evidência, o sistema deve dizer que não sabe.**
