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
- **Compartilhável:** substitui endereços MAC, nomes conhecidos de dispositivos pareados, VIN rotulado e coordenadas GPS rotuladas, inclusive dentro da trilha bruta. O nome do adaptador conectado vira uma descrição genérica.

O cabeçalho deve identificar fabricante/modelo Android quando fornecidos pela plataforma, versão Android, API, versão do aplicativo e modo de exportação. O modelo físico vem exclusivamente de `Platform.constants.Model`; se ausente, o TXT informa `N/D` e o JSON omite o campo. Não usar `Constants.deviceName` nem outro nome personalizado como substituto do modelo.

O campo de erro principal deve apontar para a falha mais recente identificada na trilha da tentativa, com evento e timestamp. O erro mantido pelo estado compartilhado deve aparecer separadamente como contexto, pois pode ter sido registrado por uma camada diferente.

O relatório nunca deve declarar ECU validada apenas porque Bluetooth está ligado, o dispositivo está pareado ou o socket RFCOMM abriu. A validação OBD exige resposta real válida ao PID 010C.

## Diagnóstico JSON

Todo JSON exportado precisa incluir:

- `schemaVersion` e `dataType` explícitos.
- Horário da exportação e horário do snapshot de estado.
- Versão do aplicativo e metadados de plataforma.
- Estado do veículo, OBD, leituras, DTCs, viagens, autonomia e manutenção.
- Política de proveniência que distingue `REAL_OBD`, `SIMULACAO`, `CARSCANNER_SEED`, `CARSCANNER_BASELINE` e `IMPORTADO`.

O estado em memória é copiado antes das leituras assíncronas dos arquivos, para que alterações posteriores durante a exportação não mudem silenciosamente o snapshot inicial. O relatório Bluetooth captura conexão, dispositivos, trilha, erro e telemetria antes da primeira leitura assíncrona e informa o horário desse snapshot. Dados persistidos em arquivos independentes podem ter horários próprios; não devem ser apresentados como uma transação atômica se o armazenamento não oferecer essa garantia.

## Privacidade e retenção

O relatório técnico pode conter identificadores Bluetooth e dados do veículo; deve ser tratado como arquivo privado. A exportação compartilhável aplica anonimização aos identificadores diretos tratados pelo contrato (MAC, nomes conhecidos de dispositivos, VIN rotulado e coordenadas GPS rotuladas). DTCs, leituras, horários, fabricante/modelo Android e características do veículo permanecem porque são relevantes ao diagnóstico e ainda podem permitir correlação indireta. Revisar o conteúdo antes de enviar. TXT de autosave e JSON/CSV permanecem exportações técnicas; não compartilhar sem revisão, pois podem conter VIN, dados de viagem e identificadores do veículo.

O histórico interno permanece sob controle do aplicativo. A exportação não deve apagar nem alterar os dados de origem.
