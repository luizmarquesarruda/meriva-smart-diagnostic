# Relatórios e exportações — MERIVA SMART

## Formatos disponíveis

| Arquivo | Finalidade | Contrato |
|---|---|---|
| Relatório Bluetooth TXT | Diagnóstico de rádio, RFCOMM, ELM327, ECU e evidências de aprendizado | Esquema TXT 2 |
| Autosave TXT | Leitura humana do estado salvo, DTCs, viagens e aprendizado | Schema do autosave |
| Histórico diário ECU TXT | Fronteiras de sessão e leituras reais | Eventos por data local |
| Diagnóstico JSON | Intercâmbio estruturado de veículo, OBD, DTC, viagens, autonomia e manutenção | `MERIVA_DIAGNOSTIC_EXPORT`, schema 1 |
| Viagens CSV | Análise tabular dos ciclos de condução | Cabeçalho versionado pela implementação |

## Relatório Bluetooth

A tela Configurações oferece duas exportações distintas:

- **Técnico completo:** preserva nomes, endereços MAC e trilha bruta para diagnóstico interno.
- **Compartilhável:** substitui todos os endereços MAC por `XX:XX:XX:XX:XX:XX`, inclusive dentro da trilha bruta.

O cabeçalho deve identificar fabricante/modelo Android quando fornecidos pela plataforma, versão Android, API, versão do aplicativo e modo de exportação. Não usar o nome genérico do dispositivo como substituto silencioso do modelo físico.

O campo de erro principal deve apontar para a falha mais recente identificada na trilha da tentativa, com evento e timestamp. O erro mantido pelo estado compartilhado deve aparecer separadamente como contexto, pois pode ter sido registrado por uma camada diferente.

O relatório nunca deve declarar ECU validada apenas porque Bluetooth está ligado, o dispositivo está pareado ou o socket RFCOMM abriu. A validação OBD exige resposta real válida ao PID 010C.

## Diagnóstico JSON

Todo JSON exportado precisa incluir:

- `schemaVersion` e `dataType` explícitos.
- Horário da exportação e horário do snapshot de estado.
- Versão do aplicativo e metadados de plataforma.
- Estado do veículo, OBD, leituras, DTCs, viagens, autonomia e manutenção.
- Política de proveniência que distingue `REAL_OBD`, `SIMULACAO`, `CARSCANNER_SEED`, `CARSCANNER_BASELINE` e `IMPORTADO`.

O estado em memória é copiado antes das leituras assíncronas dos arquivos, para que alterações posteriores durante a exportação não mudem silenciosamente o snapshot inicial.

## Privacidade e retenção

O relatório técnico pode conter identificadores Bluetooth e dados do veículo; deve ser tratado como arquivo privado. A exportação compartilhável reduz a exposição de endereços MAC, mas o conteúdo ainda pode revelar nomes dos dispositivos, DTCs, leituras, horários e características do veículo. Revisar o conteúdo antes de enviar.

O histórico interno permanece sob controle do aplicativo. A exportação não deve apagar nem alterar os dados de origem.
