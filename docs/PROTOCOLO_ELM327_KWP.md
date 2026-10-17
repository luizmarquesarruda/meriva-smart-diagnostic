# Protocolo ELM327 / ISO 14230-4 KWP — Meriva Smart Diagnostic

Data de revisão: 2026-10-16  
Alvo: Chevrolet Meriva Maxx 1.4 Flex; Bluetooth Classic; KWP Fast, 10400 baud.

## Inicialização pretendida após conectar ao adaptador

Executar em fila única, sem comandos concorrentes:

1. ATZ — reset do adaptador; aguardar prompt estável.
2. ATE0 — eco desligado.
3. ATL0 — linefeeds desligados.
4. ATS0 — espaços desligados.
5. ATH0 — cabeçalhos desligados para respostas PID comuns.
6. ATSP5 — ISO 14230-4 KWP FAST.
7. 0100 — validar que a ECU responde e descobrir bitmask inicial.

Após duas falhas de inicialização em ATSP5, permitir fallback para protocolo automático. Depois de validar KWP Fast na sessão, preferir ATSP5 nessa sessão até que a recuperação falhe.

## Timeout e serialização

- Uma fila/mutex por socket: no máximo um comando ELM ativo por vez.
- Cada comando deve ter timeout explícito e resultado classificado, sem bloquear o thread de UI.
- Telemetria de alta prioridade: 010C RPM, 010D velocidade e 0110 MAF quando suportado.
- O monitor de enlace e o serviço de telemetria devem compartilhar a mesma fila.
- O limite de 3 s para keep-alive KWP é um requisito de projeto; precisa de validação com ELM327 real antes de ser considerado cumprido.

## Política de recuperação desejada

1. Três falhas consecutivas: enviar ATWS e repetir uma consulta segura.
2. Se continuar falhando: reinicializar com ATZ, ATE0, ATL0, ATS0, ATH0, ATSP5 e 0100.
3. Se continuar sem resposta: fechar socket e reconectar com backoff 2 s, 5 s e 15 s; teto de 15 s, sem laço apertado.
4. Agrupar eventos de queda para não registrar várias quedas pelo mesmo incidente.
5. Depois de reconectar, marcar ECU respondendo somente após uma resposta OBD válida; Bluetooth conectado, por si só, não prova que a ECU responde.

## Classificação dos resultados

- RESPONDEU: resposta de ECU válida para o comando/PID solicitado.
- NO DATA: o adaptador respondeu, mas não há dado para aquela consulta; não converter em zero.
- BUS INIT: ERROR: falha de inicialização de protocolo.
- UNABLE TO CONNECT: o adaptador não conseguiu estabelecer comunicação com a ECU.
- TIMEOUT: não houve resposta dentro do prazo.
- SOCKET CLOSED / read failed: transporte Bluetooth interrompido.
- STOPPED: sessão encerrada deliberadamente.

## Segurança dos dados e diagnóstico

- Respostas brutas são evidência; não inferir suporte de PID por ausência de erro genérico.
- A tensão ATRV é a tensão reportada pelo adaptador; PID 0142, quando suportado e fresco, é a tensão reportada pela ECU.
- A releitura de DTC usa modos 03 e 07, além de 0A quando suportado, no início da sessão e sob demanda.
- Não associar freeze frame sem DTC proprietário; resposta vazia significa indisponível.
- Não declarar um protocolo ou adaptador validado fisicamente sem registrar comando, resposta, adaptador real e sessão de teste.

## Estado da implementação

A fila de comandos, os timeouts de comando e a recuperação completa com ATWS/re-init/backoff devem ser verificados contra o código da branch de conexão e por testes com relógio/transporte falsos. O serviço Android foreground, wake lock e execução do loop de telemetria fora do JS permanecem itens que precisam de implementação e validação próprios. Nenhuma CI ou validação física foi executada nesta etapa.
