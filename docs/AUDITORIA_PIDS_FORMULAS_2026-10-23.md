# Auditoria de fórmulas e PIDs OBD-II — 2026-10-23

## Escopo

Revisão direcionada do catálogo `src/knowledge/pids.json`, motor `src/obd/formulaEngine.ts`, faixas `src/knowledge/ranges.json` e parser `src/obd/parser.ts` no repositório Meriva Smart Diagnostic.

## Achados confirmados e correções

1. **Faixas arredondadas rejeitavam valores matematicamente válidos.**
   - PID 0106 (STFT), PID 0107 (LTFT) e PID 012D (erro EGR) usam `(A - 128) × 100 / 128`. Para A = 255, o resultado é **99,21875%**, mas o limite anterior 99,2 rejeitava esse resultado.
   - PID 015D (tempo de injeção) usa `((256A + B) - 26880) / 128`. Para A = B = 255, o resultado é **301,9921875°**, mas o limite anterior 301,99 rejeitava esse resultado.
   - Corrigidos os limites em `src/knowledge/ranges.json` para os valores exatos. Esses limites são de decodificação/plausibilidade, não alegações de que esses valores sejam normais em funcionamento real.

2. **Validação de bytes no motor de fórmulas.**
   - `requireBytes` já verificava a quantidade mínima, mas não validava se os bytes eram inteiros entre 0 e 255.
   - Agora cada byte consumido pela operação é validado; entradas negativas, fracionárias ou maiores que FF geram erro explícito, em vez de produzir um valor potencialmente enganoso.

3. **Regressão automatizada.**
   - Criado `tests/pidFormulaBoundaries.test.js` com casos de fronteira para os PIDs 0106, 012D e 015D e casos negativos para bytes inválidos.
   - O teste foi incluído no início do script `npm test`, para falhar cedo quando houver regressão nesse contrato.

## Limites desta auditoria

- O catálogo define PIDs padronizados, mas não prova que a ECU específica do Chevrolet Meriva suporte todos eles.
- A evidência de referência existente identifica o PID 010C (RPM) como resposta RAW_ECU confirmada; os demais precisam ser classificados por respostas reais da ECU na sessão atual.
- O ajuste de faixas não valida a exatidão física de sensores nem substitui comparação com instrumento de referência.
- A captura fornecida mostra falha Bluetooth/ECU desconectada. Não é possível confirmar a execução das fórmulas no veículo enquanto a comunicação real não estiver estabelecida.
- CI/build e teste físico ELM327/ECU são evidências distintas. O resultado final deve ser confirmado pela CI do SHA desta branch e, posteriormente, por teste no veículo.

## Estado

Correções de código preparadas em branch isolada para revisão. Não mesclar em `main` até a CI completa da PR passar.

## Portabilidade da interface Floot para o aplicativo nativo

A seção visual de verificação de limites foi portada para `app/laboratorio.tsx` em React Native, reutilizando `decodeFormula` de `src/obd/formulaEngine.ts`. Não foi adicionada uma segunda implementação das fórmulas. Os valores apresentados são casos de teste de fronteira com bytes `0xFF`, identificados na interface como exemplos matemáticos; não são dados de ECU. A validação da portabilidade depende da CI da PR #80 após este commit.
