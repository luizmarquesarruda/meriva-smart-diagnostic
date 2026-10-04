# Auditoria técnica do Meriva Smart Diagnostic

Data: 2026-10-03

## Escopo

Varredura estrutural dos arquivos críticos do aplicativo: inicialização, Bluetooth Classic, ELM327, parser, PIDs, GPS, viagens, armazenamento, DTC, perfil do veículo, testes e CI.

A auditoria priorizou comportamento real do Android/ELM327 e dados observados. Não considera modo de simulação como prova de funcionamento físico.

## Correções aplicadas

- Removida a camada da chamada "Bíblia" do runtime.
- Removido o PID 012F de nível de combustível.
- Perfil do veículo voltou a ser independente de fonte documental externa.
- DTC não recebe diagnóstico automático de catálogo.
- GPS passou a rejeitar segmentos com intervalo maior que 5 s.
- GPS parado passou a respeitar a velocidade reportada pelo aparelho, reduzindo deriva causada por ruído de posição.
- Distância da interface passa a mostrar metros abaixo de 1 km e quilômetros a partir de 1 km.
- Timeout Bluetooth sem prompt final do ELM não é mais tratado como resposta válida.
- Conexão real do ELM agora exige uma resposta válida ao 010C antes de ser considerada pronta para ECU.
- Removido integrador de combustível duplicado e sem uso na tela de laboratório.
- CI passou de npm install para npm ci, usando o package-lock de forma reprodutível.

## Regras preservadas

- Resposta RAW da ECU continua sendo preservada.
- PID só é interpretado quando existir definição e resposta compatível.
- Consumo continua indisponível quando a ECU não fornecer taxa de combustível válida.
- Simulação não alimenta aprendizado real.
- Bluetooth Classic continua sendo o transporte alvo para ELM327.

## Limitações

- A conexão Bluetooth e a resposta da ECU ainda precisam de validação em Android físico com o ELM327 real.
- A CI valida compilação/testes, mas não substitui teste físico na Meriva.
- O PID 015E permanece dependente de suporte real da ECU.

## Próxima validação física

1. Ligar ignição.
2. Parear o ELM327 Bluetooth Classic.
3. Abrir o aplicativo.
4. Confirmar Bluetooth pronto.
5. Conectar o ELM.
6. Confirmar resposta real do 010C.
7. Conferir RPM próximo ao valor observado pelo Car Scanner.
8. Executar descoberta de PIDs.
9. Ler DTCs.
10. Confirmar GPS parado sem aumento artificial de distância.
11. Rodar alguns minutos e conferir distância em metros/km.
12. Testar PID 015E somente se anunciado como suportado pela ECU.
