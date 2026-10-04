# Auditoria técnica - Bíblia da Meriva no aplicativo

Data: 2026-10-04

## Objetivo
Usar a Bíblia Técnica como fonte de aplicação/componentes, sem transformar catálogo de peças em esquema elétrico, pinout, PID ou diagnóstico definitivo.

## Dados que entram no app
- Família do motor: 1.4 MPFI 8V ECONOFLEX.
- Combustível: Flex Fuel.
- Aplicação LKF.
- Códigos de aplicação documentados: NF7/NF2, quando aplicáveis.
- Referências de ECU: 24578333 e 93338267.
- Componentes relevantes: ECT, MAP/IAT, TPS, CKP, CMP, knock, O2, bobina, sensor de velocidade, TID/MID e temperatura externa.
- Árvores de investigação para P0301, P0123 e P0015.
- Inspeção física para odor de combustível: linhas/conexões, trilho/injetores, tanque/linhas, canister/mangueiras.

## Dados que NÃO podem ser tratados como confirmados pela Bíblia
- Pinagem da ECU.
- Tensões/resistências de sensores.
- PIDs proprietários.
- Fórmulas de conversão específicas da ECU.
- Comandos bidirecionais.
- Protocolo proprietário de TID/MID.
- Relação direta Bluetooth -> TID.
- Causa definitiva de DTC.
- Compatibilidade exata de cada código de peça sem confirmação da aplicação do veículo.

## Regra de confiança
OBD/PID observado em veículo real tem prioridade sobre inferência de catálogo.
Catálogo é fonte de aplicação física.
Resposta bruta da ECU deve ser preservada.
Nenhum PID deve ser criado apenas porque existe um componente físico correspondente.

## Exclusão
Informações de boia/medidor de nível permanecem fora do aplicativo conforme requisito do projeto.

## Próximas validações físicas
1. Confirmar VIN.
2. Confirmar etiqueta/código da ECU instalada.
3. Confirmar aplicação/opções do veículo.
4. Validar comunicação ELM327 Bluetooth Classic.
5. Validar PIDs reais com resposta bruta.
6. Só depois promover associações técnicas de componente/PID para estado confirmado.
