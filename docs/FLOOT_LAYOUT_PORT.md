# Portabilidade visual Floot → Expo/React Native

Data: 2026-10-24  
Branch: `feat/port-floot-layout-20261024`

## Escopo

Foi criado o componente de pré-visualização nativo `src/ui/FlootLayoutPreview.tsx` para revisar a estrutura visual do cockpit inspirada no projeto Floot. Ele fica fora de `app/`, portanto não é registrado como rota Expo de produção. A implementação é nativa; não copia componentes web/CSS do Floot diretamente, pois esses componentes não são compatíveis com React Native.

## Elementos transportados

- Cabeçalho escuro com marca e estado de conexão.
- Cartão de contexto do veículo/clima/rede.
- Cartão principal de dados OBD em tempo real.
- Três indicadores compactos: média histórica, autonomia e falhas ativas.
- Cartão de temperatura do líquido de arrefecimento.
- Barra inferior com seis ícones de 32 dp, sem legendas visíveis, nomes acessíveis e distribuição uniforme: Painel, Conexões, Diagnóstico, Viagem, Laboratório e Configurações.
- Destinos de Dados/Telemetria e Mais Recursos preservados por navegação secundária.
- Cores, contornos azulados, fundos escuros, cantos arredondados e hierarquia tipográfica inspirados no layout Floot.

## Integridade dos dados

O componente é explicitamente uma prévia visual e não deve ser montado em produção como rota. Não inicia Bluetooth, não conecta ao ELM327 e não declara conexão com a ECU. Valores veiculares ficam como N/D para não apresentar dados inventados. A tela operacional existente permanece intacta nesta etapa, preservando o fluxo real de conexão e os serviços de telemetria.

## Validação pendente

A CI deve confirmar TypeScript, testes e build Android após mover a prévia para fora da árvore de rotas. Depois da CI, revisar a prévia em aparelho Android para confirmar dimensões, safe areas e ícones. Esta alteração não foi mesclada em `main`, não foi publicada e não foi testada com ELM327 físico.
