# Auditoria técnica - Bíblia da Meriva no aplicativo

Data: 2026-10-04

## Decisão de arquitetura

A Bíblia Técnica completa **não é carregada como banco de diagnóstico no runtime**.

Ela permanece como fonte documental no repositório. O aplicativo usa somente uma camada curada com informações que têm função direta no fluxo do scanner.

Motivos:
- a fonte é um catálogo de peças/aplicações;
- grande parte dos códigos de peças não é necessária durante uma leitura OBD;
- carregar referências sem uso aumenta manutenção e risco de associação errada;
- catálogo não fornece pinagem, PID proprietário, fórmulas de conversão ou diagnóstico definitivo.

## Dados mantidos no runtime

### Identificação técnica
- Família do motor: 1.4 MPFI 8V ECONOFLEX.
- Combustível: Flex Fuel.
- Aplicação: LKF.
- Referências de ECU: 24578333 e 93338267.

As referências de ECU são tratadas como **referências de catálogo**, não como confirmação da ECU instalada no veículo.

### Apoio ao diagnóstico de DTC
Quando um DTC real conhecido é registrado, o app pode anexar uma árvore de investigação baseada na fonte:
- P0301: bobina → vela → injetor → compressão → fiação → alimentação/terra → sincronismo.
- P0123: sensor/borboleta → fiação → alimentação → terra → ECU.
- P0015: sensor de fase → sincronismo → atuador/comando → fiação.

Isso é uma ordem de investigação, não uma causa fechada.

## Dados que ficam somente na documentação

Não entram no runtime neste momento:
- códigos individuais de peças de sensores;
- chicotes;
- TID/MID;
- sensor de temperatura externa;
- referências físicas que não participam de uma decisão atual do scanner;
- demais detalhes de catálogo sem uso operacional.

Esses dados podem ser consultados futuramente quando houver uma função real que precise deles.

## Dados que NÃO podem ser tratados como confirmados pela Bíblia

- Pinagem da ECU.
- Tensões/resistências de sensores.
- PIDs proprietários.
- Fórmulas de conversão específicas da ECU.
- Comandos bidirecionais.
- Protocolo proprietário de TID/MID.
- Relação direta Bluetooth → TID.
- Causa definitiva de DTC.
- Compatibilidade exata de cada código de peça sem confirmação da aplicação do veículo.

## Regra de confiança

1. Resposta bruta da ECU e observação real do veículo têm prioridade.
2. OBD/PID realmente observado tem prioridade sobre inferência de catálogo.
3. A Bíblia serve para contexto físico e árvores de investigação.
4. Nenhum PID é criado porque existe um componente físico correspondente.
5. Nenhum DTC é considerado resolvido somente pela Bíblia.

## Próximas evoluções

Só adicionar novos dados da Bíblia quando existir uma função concreta que os consuma, por exemplo:
- identificar a ECU instalada;
- montar uma checklist física para um DTC;
- relacionar um PID já confirmado a um componente;
- registrar uma peça realmente substituída no histórico de serviço.

A regra passa a ser: **fonte completa fora do runtime; conhecimento operacional mínimo dentro do app.**
