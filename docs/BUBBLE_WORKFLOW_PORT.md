# Portagem dos contratos Bubble para o MERIVA SMART

Data da inspeção: 2026-10-28. Fonte: ambiente de desenvolvimento do app Bubble \`meriva-smart\`, versão \`test\`, lido sem alterações.

## O que foi portado

O módulo nativo \`src/cloud/bubbleWorkflowContract.ts\` expressa os limites validados nos workflows de entrada. \`src/cloud/bubbleWorkflowClient.ts\` implementa um cliente HTTPS para os workflows existentes e mantém o token de sessão somente em memória.

| Workflow Bubble | Contrato usado no app nativo |
|---|---|
| \`v1_login\` | Login público por e-mail/senha; token de usuário retornado pelo Bubble |
| \`v1_reading\` | Versão 1, referência do dispositivo, ID de evento estável, PID catalogado, bytes A/B inteiros 0–255, timestamp e fonte real validada |
| \`v1_gps\` | Dispositivo e viagem, ID estável, coordenadas, precisão, velocidade e timestamp |
| \`v1_trip\` | Upsert por \`external_id\`, dispositivo, nome, início/fim e estado |
| \`v1_dtc\` | Código DTC, descrição, severidade, confirmação e data |
| \`v1_support\` | Declaração de suporte de PID separada de resposta real confirmada |
| \`v1_heartbeat\` | Estado de conexão, sinal e versão do firmware |

A API usa POST JSON em \`/api/1.1/wf/{workflow}\`. Workflows de dados exigem token de usuário; somente o login é público. IDs de eventos devem ser persistidos antes do primeiro envio e reutilizados em todas as tentativas daquele mesmo evento. Não gere um novo ID só porque houve timeout.

## Guardas portadas

- Não enviar simulação, baseline externo ou leitura sem validação real da ECU como leitura OBD válida.
- A/B precisam ser bytes inteiros entre 0 e 255; o PID precisa estar no conjunto de PIDs atualmente aceito pelo workflow Bubble.
- Eventos OBD e GPS devem estar no passado, dentro da janela máxima de 24 horas que os workflows verificam. Dados antigos continuam preservados no histórico local, mas não devem ser disfarçados como evento atual.
- O contrato Bubble limita amostras a um envio por PID por segundo; o cliente nativo impõe o intervalo entre chamadas e não faz retry automático que possa criar um evento novo.
- GPS no contrato Bubble: latitude de -85 a 85, longitude de -180 a 180, precisão entre 0 e 50 metros e velocidade entre 0 e 250 km/h. O rastreador local permanece mais conservador (precisão máxima e velocidade máxima próprias, além de confirmar movimento com amostras consecutivas); não enfraquecer o filtro local para coincidir com o servidor.
- Acknowledgements distinguem aceitação, duplicata previamente aceita, rejeição e resposta desconhecida. Um timeout de rede não prova que o servidor não gravou; repetir com o mesmo \`event_id\`.

## Não importar sem correção

A fórmula de combustível observada no workflow Bubble \`ms_obd_process_ms_obd_fuel\` parece somar uma taxa atual em L/h a apenas metade da taxa anterior multiplicada pelo intervalo. Isso não é a integração trapezoidal dimensionalmente correta. O aplicativo deve continuar usando \`src/obd/fuelConsumption.ts\` como integrador local; não trocar o cálculo por essa expressão do Bubble.

Suporte de PID declarado não é evidência de suporte confirmado pela ECU. O campo de suporte declarado fica como pendente e não deve alimentar o diagnóstico, o aprendizado ou a autonomia.

## Limitações ainda reais

1. Não existe workflow público de cadastro/provisionamento de dispositivo no inventário atual. \`v1_reading\`, \`v1_gps\`, \`v1_trip\`, \`v1_dtc\`, \`v1_support\` e \`v1_heartbeat\` exigem a referência de um registro \`custom.device\` existente e pertencente ao usuário autenticado.
2. O plano Bubble consultado não habilita Data API; o app nativo não deve tentar ler ou criar esses registros por acesso administrativo.
3. A sincronização ainda não foi conectada ao ciclo live do OBD/GPS: falta provisionar um ID de dispositivo/viagem confiável e integrar armazenamento seguro de token Android. O cliente não salva senha/token no autosave nem em texto simples. O consumidor deve guardar tokens usando Keystore/SecureStore e manter fila local durável; os dados locais e o SQLite/histórico permanecem a fonte de verdade.
4. A base URL é injetada explicitamente no construtor. Não há envio automático para a versão \`version-test\`, nem fallback para dados simulados, se a configuração estiver ausente.

Nenhum workflow, tipo, dado, configuração ou tela do Bubble foi alterado nesta portagem.
