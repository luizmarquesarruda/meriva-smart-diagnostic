# ELM327 Compatibility Review

Data original: 2026-10-06  
Reconciliação com o código: 2026-10-28

> As decisões abaixo foram conferidas contra `src/obd/bluetoothClassicTransport.ts`, `src/knowledge/bluetooth_config.json` e `src/obd/elm327Compatibility.ts`. Esta atualização corrige descrições antigas; o teste com o adaptador físico continua obrigatório.

## Evidence used

1. python-OBD keeps the ELM prompt as a framing boundary, normalizes CR/LF lines, distinguishes empty reads and disconnects, and uses an explicit I/O timeout.
Reference: https://github.com/brendan-w/python-OBD/blob/master/obd/elm327.py

2. AndrOBD documents Bluetooth ELM327 pairing/permission flow and separates Bluetooth connection establishment from the OBD protocol layer.
References: https://github.com/fr3ts0n/AndrOBD/wiki/OBD-connection
https://github.com/fr3ts0n/AndrOBD/blob/master/library/src/main/java/com/fr3ts0n/ecu/prot/obd/ElmProt.java

3. The supplied Car Scanner captures show incomplete responses, malformed line endings and unsupported AT commands, plus configurable I/O timeout, Bluetooth timeout, command delay, infinite retry, NO DATA recovery and partial-response recovery.

## Engineering decisions
- Bluetooth Classic/SPP remains the transport for the tested adapter.
- Bluetooth connection is not equivalent to ELM readiness.
- ELM initialization is tolerant of unsupported optional AT commands.
- `ATZ` é o comando obrigatório de reinicialização. `ATI` é opcional/best-effort e não valida a ECU; comandos opcionais não suportados não podem bloquear a sessão.
- Commands remain serialized through the existing queue.
- CR/LF and NUL noise are normalized before classification.
- I/O timeout, Bluetooth timeout and inter-command delay are configurable.
- A política-base em `src/knowledge/bluetooth_config.json` é de 20 tentativas com intervalo de 8 s. O limite efetivo pode ser reduzido pela configuração. `maxConnectionAttempts = 0` usa o limite-base finito do catálogo; não significa retry infinito.
- PID 010C remains the ECU proof test. A Bluetooth socket alone never makes the app OBD-ready.
- Unsupported AT commands are compatibility information, not automatic fatal errors.
- The code does not fabricate PID support or fuel data.

## Important limitation
A repository audit can prove source-level behavior, but it cannot prove that a specific physical clone ELM327 will respond correctly on every Android phone. Final proof requires a real-device test with the user's paired ELM327. The application automatically tries paired candidates, prioritizes ELM/OBD-like names, and validates the ECU with 010C before accepting a candidate.

## Validation target
1. Bluetooth enabled.
2. Android permission granted.
3. Paired adapter selected.
4. RFCOMM/SPP connected.
5. ELM initialization responds.
6. 010C returns a valid 410C payload.
7. App reports OBD ONLINE only after these checks.

## Configuração vigente reconfirmada — 2026-10-28

O código vigente usa Bluetooth Classic/RFCOMM com `connectionType: delimited`, delimitador vazio (`delimiter: ''`) e charset `ascii`; o RX é anexado ao buffer e a resposta fecha no prompt `>`. CR (`0x0D`) termina o comando TX. A política-base de retry é finita: 20 tentativas e 8 s entre falhas; `ATI` é best-effort e a validação da ECU exige uma resposta OBD válida ao PID `010C`. A seleção automática não depende de MAC informado pelo usuário.