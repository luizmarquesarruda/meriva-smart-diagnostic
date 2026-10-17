# Auditoria de UX, configurações e duplicação — 2026-10-17

## Decisões de interface
- Velocidade GPS não é mais o indicador principal por padrão.
- Temperatura do motor é o indicador principal padrão, pois já existe requisito explícito de manter a temperatura visível no painel.
- A velocidade fica fora da rotação automática por padrão e só aparece quando habilitada ou selecionada pelo usuário.
- A alternância automática de indicadores é opt-in; o usuário pode tocar no indicador para alternar manualmente.
- Animação suave de transição pode ser desativada nas configurações.
- Textos maiores ficam ativados por padrão. Botões de opções e ações importantes têm altura mínima de 48 px; navegação inferior tem alvo mínimo de 44 px em retrato e 40 px em paisagem para preservar espaço de tela.
- Configurações são persistidas em MERIVA_SMART/CONFIG/app-settings.json; valores antigos recebem defaults compatíveis quando o arquivo é lido.

## Configurações de painel adicionadas
- Indicador principal: temperatura, RPM, tensão, posição da borboleta ou velocidade GPS.
- Alternância automática a cada 10 segundos.
- Mostrar/ocultar velocidade GPS como indicador secundário.
- Texto maior.
- Animações suaves.

## Auditoria de navegação
A arquitetura atual mantém quatro destinos primários: Painel, Diagnóstico, Viagens e Veículo. O menu Mais recursos contém Dados ao Vivo, Aprendizado, Saúde, Histórico/Arquivos, Configurações e Testes de Sensores. Bluetooth é acessado pelo chip de estado da conexão no painel. Viagens e Veículo não são repetidos no menu secundário. A suíte cockpitNavigation.test.js verifica os destinos e a preservação das rotas secundárias.

## Auditoria de respostas
A tela Saúde agora apresenta títulos e explicações em português, distingue pontuação heurística de probabilidade e recomenda uma próxima ação. A origem de leituras é mapeada explicitamente; fontes desconhecidas são classificadas como IMPORTADO, nunca promovidas a REAL_OBD.

## Auditoria técnica e riscos restantes
- O painel usa animação leve de opacidade no indicador principal e permite desativá-la.
- A CI precisa confirmar que a animação, os tipos novos de configuração e os testes de regressão compilam corretamente.
- Ainda é necessária inspeção em emulador e telefone para confirmar legibilidade, foco de acessibilidade e ausência de corte em retrato/paisagem.
- A auditoria atual cobre as telas e rotas que a suíte de navegação conhece; não afirma que todos os componentes de todo o repositório foram deduplicados.
- O serviço Android em segundo plano e o comportamento Bluetooth precisam de validação própria; não foram considerados comprovados por mudanças de UX.

## Referências oficiais consultadas
- Expo Router layouts: https://docs.expo.dev/router/basics/navigation-layouts/
- Expo SDK 51: https://docs.expo.dev/versions/v51.0.0/
- Expo Keep Awake SDK 51: https://docs.expo.dev/versions/v51.0.0/sdk/keep-awake/
- Android foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types
- React Native accessibility: https://reactnative.dev/docs/accessibility

## Resultado antes da CI
Implementação registrada em branch de trabalho. Estado de testes e compilação: NÃO EXECUTADO nesta branch até o workflow terminar. Não há validação física nesta entrada.
