# Auditoria Android e navegação — 2026-10-17

## Escopo desta etapa

Correção mínima para reduzir duplicação visual no Android sem alterar as rotas nem o ciclo de conexão OBD. A aplicação usa Expo SDK 51 / React Native 0.74.5, Expo Router e Continuous Native Generation (CNG); a pasta `android/` é gerada pelo prebuild e não deve ser mantida manualmente como fonte de configuração.

## Evidências do repositório

- `app/_layout.tsx` renderizava um `Stack` sem `headerShown: false` global. Apenas as rotas `index` e `bluetooth` ocultavam o cabeçalho nativo.
- As telas usam cabeçalhos próprios (por exemplo, `app/veiculo.tsx` renderiza o título “VEÍCULO”; `app/mais.tsx` renderiza “MAIS RECURSOS”). Para as demais rotas, o cabeçalho padrão do Stack podia aparecer junto ao título interno.
- `src/ui/midLayout.ts` centraliza padding, largura máxima e detecção de paisagem. `app/index.tsx` usa layout sem ScrollView para manter os dados principais visíveis.
- A barra principal agora concentra quatro destinos: Painel, Diagnóstico OBD, Viagens e Veículo, visível em retrato e paisagem.
- O chip de estado da ECU/Bluetooth abre o gerenciamento de conexão; Bluetooth foi retirado da lista Mais recursos para evitar dois pontos de entrada.
- O Painel usa um único atalho para Mais recursos. A tela Mais inclui Dados ao Vivo, Testes de Sensores, Aprendizado, Saúde, Histórico/Arquivos e Configurações; Viagens e Veículo saíram dessa lista porque já são destinos principais.
- O cartão Saúde do Painel ficou informativo, sem um segundo botão para a mesma tela. A rota `/saude` continua disponível em Mais recursos.
- Os caminhos de rota não foram apagados nem renomeados, preservando deep links e chamadas existentes.

## Correção aplicada nesta branch

- `app/_layout.tsx`: define `headerShown: false` no Stack raiz para evitar títulos duplicados. Como o header nativo também continha a seta de retorno, foram adicionados retornos internos acessíveis ao Laboratório (`/`), Armazenamento (`/mais`) e Configurações (`/mais`); nenhuma rota é removida.
- `tests/cockpitNavigation.test.js`: verifica o cabeçalho global, os quatro destinos principais, a entrada única de Bluetooth, a ausência de Viagens/Veículo em Mais recursos e a existência de retorno visível nas três rotas que antes dependiam da seta nativa.
- `app/index.tsx`: substitui os atalhos independentes de Diagnóstico/Dados/Viagens por um único acesso a Mais recursos; adiciona navegação principal de quatro destinos, acessível nas duas orientações; transforma o chip de conexão em link acessível para Bluetooth.
- `app/mais.tsx`: remove entradas duplicadas de Viagens e Veículo, remove Bluetooth (centralizado no chip) e adiciona Dados ao Vivo para preservar o acesso à rota `/dados`.
- Layout em paisagem: cabeçalho com menor padding vertical, três cards de métricas com espaçamento compacto e atalho de recursos mais baixo; a navegação principal também reduz espaçamento/tamanho. Isso é uma correção baseada nas dimensões relativas, não uma medição visual real.

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

1. Executar `node tests/cockpitNavigation.test.js` e `node tests/orientationLayout.test.js` no checkout.
2. Revisar o encaixe do Painel em 360×640, 411×891, paisagem e fonte ampliada com screenshots/emulador; esse teste visual ainda está pendente.
3. Executar TypeScript, suíte completa e Expo Doctor somente após autorização para validação; CI segue não disparada.
4. Rever PRs #65 → #66 → #67 na ordem de dependência e validar serviço Android em APK e hardware antes de merge.
