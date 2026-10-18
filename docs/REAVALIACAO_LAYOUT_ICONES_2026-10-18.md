# Reavaliação de layout — Meriva Smart Diagnostic
**Data:** 18/10/2026  
**Branch:** `feat/cockpit-layout-refresh-20261018`  
**Status:** implementação estrutural concluída; validação nativa/visual pendente.

## Diagnóstico de UX

A linguagem de ícones já existia, mas a aplicação ainda apresentava três lacunas de layout: o cockpit concentrava informação sem atalhos claros para os módulos mais consultados; a página de recursos continuava como uma lista vertical longa; e o laboratório OBD preservava uma paleta clara diferente da linguagem azul-marinho do cockpit. Além disso, os cabeçalhos de módulos diferentes não tinham uma hierarquia consistente.

## Decisões de layout

- **Cockpit como tela operacional:** manter a leitura principal grande, associar um ícone contextual a cada indicador rotativo e preservar o rótulo/fonte da leitura. Os atalhos de Dados ao Vivo e Testes de Sensores ficam na tela inicial, sem substituir o menu completo.
- **Saúde navegável:** o resumo compacto abre a tela Saúde para consultar DTCs, evidências e hipóteses; não apresenta pontuação heurística como probabilidade.
- **Mais recursos em grade:** cartões responsivos em duas colunas, com ícone, nome, explicação curta e seta de navegação. A lista continua acessível por rolagem, sem reduzir as áreas de toque.
- **Cabeçalhos coerentes:** adicionados emblemas vetoriais a Saúde, Dados, Veículo, Aprendizado, Bluetooth, Configurações, Histórico, Viagens e Diagnóstico OBD.
- **Diagnóstico OBD com tema consistente:** o laboratório passa para fundo azul-marinho, cartões de contraste alto e acentos azul/âmbar; os botões de ações principais recebem ícones vetoriais.
- **Tons semânticos nos emblemas:** azul para navegação/técnica, dourado para realce, verde para estado saudável, âmbar para aviso e vermelho-rosado para falha. O estado segue expresso em texto, não só em cor.

## Paleta de referência

| Uso | Token |
|---|---|
| Fundo principal | `#07111f` |
| Cartão | `#0e1b2d` |
| Cartão profundo | `#091626` |
| Borda | `#28415f` |
| Azul técnico | `#7db3ff` |
| Âmbar Meriva | `#e8b54b` |
| Sucesso | `#4ade80` |
| Aviso | `#fbbf24` |
| Falha | `#fb7185` |

## Escopo e segurança

A revisão altera apresentação e navegação por tela. Não altera aquisição serial do ELM327, comandos OBD, PIDs, política da IA, interpretação de DTC, serviços de viagem, GPS ou persistência. Nenhum logotipo oficial Chevrolet foi incorporado; o emblema é um ícone vetorial genérico de veículo.

## Validação pendente

- Não foi disparada CI, conforme a orientação de consolidar as alterações primeiro.
- Os contratos estáticos foram conferidos pelo conector: todos os nomes literais de ícone detectados estão no catálogo e não foram encontradas referências de estilo sem definição nos arquivos revisados.
- O teste Node atualizado não foi executado; TypeScript, Expo Doctor, prebuild/Gradle/APK e inspeção visual em Android retrato/paisagem permanecem pendentes.
- A compactação do cockpit deve ser confirmada em aparelho real, especialmente em telas pequenas e em paisagem. O teste estático não comprova layout sem rolagem nem ausência de corte de texto.

## Próxima etapa

Concluir o conjunto de modificações planejadas antes de autorizar a primeira rodada de validação. Após autorização, executar validação local ou CI controlada, corrigir regressões encontradas e testar o fluxo visual com o ELM327 real — sem dirigir enquanto se interage com o aplicativo.
