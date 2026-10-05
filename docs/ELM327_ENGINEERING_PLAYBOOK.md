# Meriva Smart Diagnostic - ELM327 Engineering Playbook

## Architecture
Bluetooth Classic -> RFCOMM/SPP -> ELM validated -> ECU validated -> protocol -> PID -> raw data -> diagnosis.

## Engineering rules
1. Bluetooth connected is not the same as ELM ready.
2. ELM ready is not the same as ECU responding.
3. ATZ and ATI are mandatory gates.
4. Optional AT commands may be disabled individually when a clone returns ?.
5. The ELM prompt character > closes a response. The transport accumulates fragments until the prompt arrives.
6. PID 010C is the first ECU probe for the Meriva project.
7. Raw TX/RX and response time must remain available for diagnosis.
8. Adaptive timeout changes polling speed without hiding errors.
9. NO DATA must not become a fake vehicle fault.
10. Recovery must be observable and cancellable.

## External engineering references
- AndrOBD: state machine, error classes, timeout handling and clone compatibility.
- MotoCortex: Android Bluetooth Classic RFCOMM and prioritized polling.
- OBD2 App: prompt-delimited ELM responses with react-native-bluetooth-classic.
- OBDLink documentation: bonded-device flow and reconnection strategy.
- Pi Drive 2: AT initialization and PID validation tests.
- OBD2AI reference inventory: optional AT disabling, adaptive timing and multi-frame work.

## Current project decision
The app keeps the simple user surface but exposes a technical laboratory for raw evidence. The next major transport frontier is explicit connection-state control plus ISO/KWP multi-frame reassembly.