# ELM327 Compatibility Review

Data: 2026-10-06

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
- ATZ and ATI are the mandatory proof path when forced initialization is enabled; ATE0 is best-effort.
- Commands remain serialized through the existing queue.
- CR/LF and NUL noise are normalized before classification.
- I/O timeout, Bluetooth timeout and inter-command delay are configurable.
- Connection attempts default to 2 and remain configurable; zero may be used explicitly for infinite retry.
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

## Correção documental 2026-10-06

O projeto usa Bluetooth Classic/RFCOMM com connectionType delimited, delimitador CR real e charset ascii. O default de conexão é 2 tentativas. A seleção não depende de MAC informado pelo usuário.