# Auditoria Android e navegação — 2026-10-17

## Escopo desta etapa

Correção mínima para reduzir duplicação visual no Android sem alterar as rotas nem o ciclo de conexão OBD. A aplicação usa Expo SDK 51 / React Native 0.74.5, Expo Router e Continuous Native Generation (CNG); a pasta `android/` é gerada pelo prebuild e não deve ser mantida manualmente como fonte de configuração.

## Evidências do repositório

- `app/_layout.tsx` renderizava um `Stack` sem `headerShown: false` global. Apenas as rotas `index` e `bluetooth` ocultavam o cabeçalho nativo.
- As telas usam cabeçalhos próprios (por exemplo, `app/veiculo.tsx` renderiza o título “VEÍCULO”; `app/mais.tsx` renderiza “MAIS RECURSOS”). Para as demais rotas, o cabeçalho padrão do Stack podia aparecer junto ao título interno.
- `src/ui/midLayout.ts` centraliza padding, largura máxima e detecção de paisagem. `app/index.tsx` usa layout sem ScrollView para manter os dados principais visíveis.
- O painel oferece atalhos para Diagnóstico, Dados, Viagens, Saúde, Bluetooth e Mais recursos; a tela Mais também lista alguns desses destinos. Isso é duplicação de acesso/atalhos, não duplicação de rota. A consolidação completa do menu fica para uma etapa própria, com matriz de navegação e teste de acessibilidade, para não ocultar recursos sem verificar o fluxo de cada tela.

## Correção aplicada nesta branch

- `app/_layout.tsx`: define `headerShown: false` no Stack raiz. As telas mantêm seus cabeçalhos internos e o espaço útil vertical aumenta; nenhuma rota é removida.
- `tests/cockpitNavigation.test.js`: adiciona uma asserção de contrato para evitar que o cabeçalho global volte a duplicar os cabeçalhos das telas.

## Android nativo

A integração Java/Kotlin deve continuar via config plugin do Expo e prebuild, não por edição manual de uma pasta `android/` descartável. O repositório já tem uma proposta separada para serviço OBD em primeiro plano (PR #67), empilhada sobre PRs de integridade do histórico e SQLite (#65 e #66). Ela ainda exige revisão e build nativo; não deve ser tratada como integrada nem validada fisicamente.

A proposta do serviço de primeiro plano mantém a conexão/socket e a fila ELM327 no fluxo React Native; não deve abrir um segundo socket nem concorrer com o polling existente. O build Android real é necessário porque Expo Go não valida a dependência nativa Bluetooth Classic.

## Documentação consultada

- Expo — Config plugins / CNG: https://docs.expo.dev/config-plugins/introduction/
- Expo Router — Navigation layouts: https://docs.expo.dev/router/basics/navigation-layouts/
- Expo Router — Nesting navigators: https://docs.expo.dev/router/advanced/nesting-navigators/
- Expo SDK 51 — Build Properties: https://docs.expo.dev/versions/v51.0.0/sdk/build-properties/

## Validação

- Alteração de código e teste de contrato: commitados nesta branch.
- Execução local de testes, TypeScript, Expo Doctor, prebuild, Gradle/APK e teste em celular físico: **NÃO EXECUTADOS**.
- CI/workflows: **NÃO DISPARADOS**.
- Layout em 360×640, 411×891, paisagem e fonte 1,3×: **NÃO VALIDADO VISUALMENTE**.
- Bluetooth/ECU/serviço Android em segundo plano: **NÃO VALIDADO EM HARDWARE**.

## Próxima etapa

1. Revisar a árvore de navegação completa e construir a matriz de duplicações por função.
2. Consolidar os destinos de primeiro nível sem quebrar deep links/rotas antigas.
3. Medir o encaixe do painel em 360×640 e 411×891, paisagem e fonte ampliada.
4. Rever PRs #65 → #66 → #67 na ordem de dependência e só então validar o serviço nativo em build Android.
