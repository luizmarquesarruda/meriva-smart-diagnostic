# Política de relatórios — Meriva Smart Diagnostic

## Formato de saída
Os relatórios voltados ao usuário são salvos exclusivamente em TXT UTF-8, dentro de MERIVA_SMART/RELATORIOS. Os relatórios de testes de sensores ficam em MERIVA_SMART/RELATORIOS/TESTES.

- **Diagnóstico TXT:** perfil do veículo, estado/protocolo da ECU, leituras reais recentes, DTCs e viagens reais recentes.
- **Viagens TXT:** uma seção por viagem real, com distância, duração, velocidade e consumo apenas quando os dados permitem uma estimativa válida.
- **Teste de sensores TXT:** condição do motor, PIDs anunciados pela ECU, tentativas, valores, respostas brutas, latência, avaliação e limitações.
- **Histórico diário ECU:** páginas lógicas por data, preservando eventos de várias sessões e reconexões.
- **Histórico de autosave:** snapshots TXT mantidos pela política própria do autosave.

A central lista TXT novos e históricos, permite abrir uma prévia e compartilhar o conteúdo pelo Android. Para arquivos grandes, a prévia ou o compartilhamento podem mostrar apenas o trecho final; isso não modifica o arquivo original.

## Formatos internos
O estado validado, as configurações e os catálogos versionados continuam em JSON porque fazem parte do funcionamento interno do aplicativo, não de relatórios de usuário. Os registradores estruturados internos permanecem separados dos relatórios exportados; os botões de exportação manual geram somente TXT.

## Integridade dos dados
- Não apresentar viagens importadas como se fossem viagens reais.
- Não transformar ausência de resposta de PID em diagnóstico de sensor defeituoso.
- Preservar fonte, timestamp, unidade e resposta bruta quando disponíveis.
- Marcar resultados incompletos como parciais ou inconclusivos.
- Não remover relatórios TXT na rotina que limpa logs e leituras temporais.
- Não declarar CI, testes, Expo Doctor ou build Android como aprovados antes de verificar os resultados.
