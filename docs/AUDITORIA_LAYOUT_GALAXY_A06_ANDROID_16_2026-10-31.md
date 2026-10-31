# Auditoria comparativa de layout — Galaxy A06 / Android 16

**Data:** 2026-10-31  
**Aparelho de referência:** Samsung Galaxy A06, modelo SM-A065M  
**Código examinado:** branch main, SHA \`ba2ef4b72f43e65eb4254ae58fce0091df7a5dce\`  
**Escopo:** comparação estática entre especificações oficiais do aparelho, diretrizes Android para telas/insets e o código React Native/Expo do MERIVA SMART.

## 1. Referência física e software do aparelho

A página oficial Samsung para a família Galaxy A06 informa tela PLS LCD de 6,7 polegadas, resolução HD+ de 720 × 1600, dimensões físicas de 167,3 × 77,3 mm e Bluetooth 5.3. A ficha técnica da versão LTE informa conectividade móvel 2G/3G/4G LTE, sem 5G. O manual do usuário em português para Android 16 aparece na área de suporte Samsung do modelo.

A resolução física de 720 × 1600 pixels **não equivale** à área de layout do React Native em dp. Densidade, zoom de tela, escala de fonte, barras do sistema e área da câmera alteram a janela lógica disponível. Por isso, não é seguro converter 720 pixels diretamente em largura/altura de componentes.

## 2. O que o código já faz corretamente

- **Orientação:** app.json usa orientation default e o layout raiz chama unlockAsync(); o sistema pode alternar entre retrato e paisagem.
- **Área segura:** o app monta SafeAreaProvider e o cockpit usa SafeAreaView com edges top, bottom, left e right.
- **Dimensionamento:** src/ui/midLayout.ts usa useWindowDimensions(), recalculando o layout quando a janela muda. Em retrato compacto, reduz espaçamento e padding; em paisagem, reserva 56 dp para a raia lateral e limita a largura do conteúdo.
- **Cockpit em retrato:** cinco abas em cartões separados, com altura mínima de 60 dp.
- **Cockpit em paisagem:** as cinco abas passam para uma raia vertical à direita, com alvos de altura mínima de 48 dp; os cartões e o painel superior ficam mais compactos.
- **Sistema visual:** tema escuro centralizado, status bar clara e plugin da navigation bar com fundo alinhado ao fundo do aplicativo.
- **Telas secundárias:** a maior parte usa SafeAreaView + ScrollView e dimensionamento compartilhado. Foram encontrados controles com minHeight de 48 dp, coerentes com a referência Android de alvo de toque.

Conclusão parcial: a implementação está adaptada de forma consciente para uma tela de telefone estreita e para paisagem. Não há evidência estática que justifique reconstruir o cockpit ou alterar globalmente as dimensões dos cartões.

## 3. Diferenças e riscos específicos no A06

### R1 — Área útil e recortes do sistema

O uso de SafeAreaView é um bom ponto de partida, mas não comprova sozinho que o resultado está correto em todas as versões do One UI, modos de navegação e configurações de recorte. A documentação Android recomenda tratar WindowInsets explicitamente quando o conteúdo desenha edge-to-edge e manter controles acionáveis fora das áreas ocupadas pelas barras e recortes.

**Verificação necessária no aparelho:** capturar o cockpit em retrato e paisagem com navegação por gestos e com navegação de três botões. Conferir se a última linha do conteúdo e as cinco abas não ficam sob a barra inferior e se o cabeçalho não invade a câmera/área de status.

### R2 — Escala de fonte e zoom do One UI

O layout compartilhado decide breakpoints usando largura e altura da janela; ele não usa fontScale para recalcular a geometria. Os textos compactos do cockpit incluem estilos de 8–10 sp e há conteúdo principal sem ScrollView. A escala de texto padrão do React Native pode aumentar conforme a configuração de acessibilidade do Android, mas a composição fixa do cockpit pode não ganhar espaço na mesma proporção.

**Risco:** com fonte ampliada ou zoom de tela diferente do padrão, rótulos podem quebrar linhas, reduzir a área de toque visual ou disputar espaço com métricas. Isso é um risco a testar, não um defeito visual confirmado.

**Verificação necessária no aparelho:** repetir capturas com tamanho de fonte padrão e ampliado, além de um nível maior de Zoom da tela. Conferir especialmente os rótulos inferiores, os quatro quadrantes, a conexão/ECU e os valores de autonomia/consumo.

### R3 — Densidade lógica e largura de cada aba

As cinco abas do cockpit dividem a largura disponível em retrato. O código define altura mínima, mas o teste estático não mede a largura real de cada alvo nem verifica o comportamento de rótulos em escala de fonte maior. A referência Android recomenda alvos interativos de pelo menos 48 × 48 dp.

**Verificação necessária:** medir no layout renderizado largura e altura das cinco abas e confirmar pelo menos 48 × 48 dp, inclusive com fonte ampliada. Verificar se “Diagnóstico” e “Viagens” permanecem legíveis sem sobreposição.

### R4 — Compatibilidade Android 15/16 e edge-to-edge

O projeto está em Expo SDK 51.0.39 e React Native 0.74.5. app.json não declara targetSdkVersion nem configuração explícita de edge-to-edge; a pasta android é gerada no prebuild e não está versionada. A referência do React Native para a linha 0.74 usa target SDK 34 como configuração-base, mas isso **não confirma** o target SDK do APK efetivamente gerado neste repositório.

Android 15 aplica a exigência edge-to-edge para apps que apontam para API 35 ou superior; Android 16 amplia o comportamento para target API 36, sem opção de desativação. Portanto, não se deve afirmar que o APK atual já está sob esse regime sem ler o AndroidManifest final do artefato.

**Verificação necessária:** extrair do APK da CI o targetSdkVersion e compileSdkVersion reais. Se o target for 35/36, executar ensaio visual específico de edge-to-edge no A06 e conferir os insets de status/navigation/cutout. Se permanecer 34, registrar isso como situação atual e planejar a migração separadamente; não atualizar SDK junto com um ajuste visual sem baseline e testes próprios.

### R5 — Rede móvel

A tela de rede do aplicativo reconhece gerações celulares 2G/3G/4G/5G quando o Android/NetInfo as informa. O Galaxy A06 SM-A065M é um modelo LTE/4G; portanto, não se deve esperar indicação 5G neste aparelho. A presença de rótulo 5G genérico no aplicativo não é incompatibilidade, desde que ele mostre a geração real reportada pelo sistema.

## 4. Cobertura existente e limites da auditoria

O repositório possui testes estruturais para orientação, navegação do cockpit e tema. Eles verificam contratos no código-fonte (por exemplo, presença de SafeAreaView, estilos de paisagem e navegação), mas **não renderizam a interface**, não medem dp reais, não fazem comparação de screenshots e não substituem um teste físico no Galaxy A06.

Não foram alterados tamanhos, cores ou navegação nesta auditoria. Sem uma captura renderizada do dispositivo, mudar valores de layout seria uma correção por suposição e poderia regredir a paisagem que já foi deliberadamente otimizada.

## 5. Plano de validação recomendado

1. Instalar o APK correspondente ao SHA testado, não um APK antigo.
2. Registrar targetSdkVersion/compileSdkVersion diretamente do APK/manifesto gerado.
3. Capturar cockpit e telas secundárias no A06 em retrato e paisagem.
4. Repetir com navegação por gestos e com três botões.
5. Repetir com fonte ampliada e Zoom de tela maior.
6. Medir os alvos das cinco abas e dos controles principais; mínimo de 48 × 48 dp.
7. Registrar clipping, sobreposição, rolagem e áreas tocáveis em imagens; corrigir somente os pontos reproduzidos.
8. Repetir a CI e comparar as mesmas capturas após qualquer correção.

## 6. Parecer

**Resultado estático: base responsiva adequada; validação visual no aparelho ainda pendente.**

Prioridade mais alta: confirmar o target SDK do APK e realizar inspeção visual em condições reais de One UI. O principal risco de interface identificado é a escala de fonte/zoom em um cockpit compacto e sem rolagem, não a resolução física isolada de 720 × 1600.

A auditoria não comprova defeito de layout no Galaxy A06 e não declara teste físico concluído.

## Fontes

- Samsung Brasil — Galaxy A06, especificações e área de manuais: https://www.samsung.com/br/smartphones/galaxy-a/galaxy-a06-black-128gb-sm-a065mzkgzto/
- Samsung Support — manuais do SM-A065M: https://www.samsung.com/br/support/
- Android Developers — Window insets e barras do sistema: https://developer.android.com/develop/ui/views/layout/insets
- Android Developers — edge-to-edge: https://developer.android.com/develop/ui/views/layout/edge-to-edge
- Android Developers — diretrizes de layout adaptável: https://developer.android.com/develop/ui/compose/layouts/adaptive
- Android Developers — tamanho mínimo de alvo de toque: https://support.google.com/accessibility/android/answer/7101858
- Samsung Support — ajustar fonte e zoom da tela: https://www.samsung.com/br/support/
- React Native — compatibilidade por versão/plataforma: https://reactnative.dev/docs/environment-setup
- Expo — Android 16 e edge-to-edge em SDKs recentes: https://expo.dev/blog
