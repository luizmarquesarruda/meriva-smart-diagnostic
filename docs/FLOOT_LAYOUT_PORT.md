# Portabilidade visual Floot → Expo/React Native

Data: 2026-10-24  
Branch: `feat/port-floot-layout-20261024`

## Escopo

Foi criada a rota de pré-visualização nativa `app/floot-layout.tsx` para transportar a estrutura visual do cockpit do projeto Floot para o repositório Expo/React Native. A implementação é nativa; não copia componentes web/CSS do Floot diretamente, pois esses componentes não são compatíveis com React Native.

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

A rota é explicitamente uma prévia visual. Não inicia Bluetooth, não conecta ao ELM327 e não declara conexão com a ECU. Valores veiculares ficam como N/D para não apresentar dados inventados. A tela operacional existente permanece intacta nesta etapa, preservando o fluxo real de conexão e os serviços de telemetria.

## Validação pendente

A CI da branch deve confirmar TypeScript, testes e build Android. Depois da CI, revisar a prévia em aparelho Android para confirmar dimensões, safe areas e ícones. Esta alteração não foi mesclada em `main`, não foi publicada e não foi testada com ELM327 físico.
