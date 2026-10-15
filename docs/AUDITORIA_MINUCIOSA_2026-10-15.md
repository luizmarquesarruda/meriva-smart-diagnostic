# Auditoria técnica minuciosa — 15/10/2026

## Resumo executivo

A CI do commit `7db27f00f5f23fe4f9d63e34ce820372faa7025d` falhou no job `validate`; o job `android-build` foi ignorado porque depende de `validate`. A falha não foi causada pela alteração Java, SQLite ou pelo novo tamanho dos botões: uma asserção de regressão continuava procurando o filtro de viagens na antiga tela de armazenamento.

## Evidência da falha

Execução: [GitHub Actions #38765550919](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38765550919)

- `npm ci --no-audit --no-fund`: concluído.
- Java 17: verificação de `java`, `javac` e `JAVA_HOME` concluída.
- Expo Doctor: 17/17 verificações passaram.
- TypeScript (`tsc --noEmit`): passou.
- Testes executados até o contrato de histórico: passaram, incluindo navegação, TXT, layout responsivo, JSON de conhecimento, Bluetooth e autosave.
- Falha: `tests/regression.test.js`, `testStorageScreenDoesNotPromoteSeedOrInvalidFuel`, asserção que exigia `filter((cycle) => cycle.source === 'REAL_OBD')` dentro de `app/armazenamento.tsx`.
- Consequência: `android-build` ficou `skipped`; não existe evidência de que um build Android tenha falhado nesta execução.

## Correções aplicadas

1. **Teste de regressão alinhado com a arquitetura atual.** A tela de viagens em `app/viagens.tsx` é a responsável por mostrar somente `REAL_OBD`; `src/storage/exportDiagnostics.ts` protege os relatórios TXT. As verificações agora cobrem os locais reais de filtragem sem enfraquecer a regra de proveniência.
2. **Navegação inferior.** Os quatro botões ficaram individualizados, com altura mínima 78 dp, ícones maiores, rótulos mais legíveis, espaçamento e destaque do destino selecionado. O teste de navegação protege essas propriedades.
3. **Persistência SQLite consolidada.** Integra a camada operacional `src/storage/merivaDatabase.ts` e `expo-sqlite ~14.0.6`, compatíveis com a linha do Expo SDK 51 do projeto. O esquema é versionado (`user_version`), usa WAL e chaves estrangeiras, e contém tabelas para sessões ECU, leituras reais, eventos DTC, PIDs aprendidos, testes de sensores, leituras de testes, viagens e achados diagnósticos.
4. **Recuperação e integridade.** O JSON de autosave continua preservado; migração do snapshot para SQLite é idempotente, viagens/DTCs operacionais são filtrados por origem real e sessões abertas por encerramento abrupto podem ser recuperadas. Leituras PID persistidas passam por validação de valor, estado, proveniência e frescor (janela de 30 s; tolerância futura de 5 s), com limite de amostragem por PID.
5. **Relatórios.** TXT permanece como formato de exportação para o usuário. JSON é mantido para configuração, catálogo técnico, snapshot e recuperação, não como relatório visível.
6. **Java/Android.** O workflow usa Java 17 e já passou da verificação de toolchain na execução que falhou. Não foi encontrado erro Java/Gradle como causa; uma mudança Java manual seria desnecessária e aumentaria o risco. A nova CI precisa validar o build Android com SQLite consolidado.

## JSON, SQLite e compatibilidade

- Não foi necessário alterar os schemas JSON para corrigir a falha; o erro era uma expectativa do teste. A implementação integrada mantém JSON interno e adiciona SQLite relacional sem apagar o snapshot.
- `expo-sqlite ~14.0.6` consta em `package.json` e no `package-lock.json`; a dependência não foi adicionada isoladamente sem lockfile.
- As migrações são versionadas e o app recusa silenciosamente operar num esquema futuro. A persistência degradada mantém caminhos TXT/JSON como fallback; o estado real no dispositivo ainda deve ser confirmado.
- Os seeds CarScanner não devem aparecer como viagens operacionais nem contaminar as métricas de aprendizado; a nova regressão verifica a filtragem na tela de viagens e na exportação.

## O que precisa ficar verde na nova CI

- `npm ci`
- Expo Doctor
- `npm run typecheck`
- toda a suíte `npm test`, incluindo regressões, relatórios e contrato SQLite
- Expo prebuild e montagem do APK release standalone
- verificação da existência do APK e upload do artefato

## Riscos residuais — não ocultar

- O contrato SQLite automatizado verifica esquema e integração estática; o build compila o app, mas não prova todos os caminhos de I/O do SQLite em execução real.
- Após CI verde, ainda é necessário abrir o app no Android, conferir que o banco é criado/migrado, gerar/ler um TXT e verificar que dados existentes não foram perdidos.
- A conexão Bluetooth, PIDs, DTCs, ciclo de viagem e o encerramento/reabertura de sessão precisam ser testados com o ELM327 e a ECU reais. Não usar simulação como comprovação de compatibilidade física.
- Alertas de pacotes obsoletos no `npm ci` não causaram esta falha; não foram executadas atualizações amplas de dependências porque o projeto está ancorado em Expo SDK 51/React Native 0.74.5.

## Resultado desta consolidação

O código e os contratos foram ajustados e consolidados na branch de trabalho. A validação conclusiva depende da nova execução da CI; até os dois jobs terminarem, o build não deve ser declarado aprovado.
