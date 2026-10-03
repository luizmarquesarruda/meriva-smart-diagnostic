# Build Android

## Perfis

- `preview`: gera APK instalável para testes no Android.
- `production`: gera AAB para distribuição pela Google Play.

## Validação local

```bash
npm install
npm run doctor
npm run typecheck
npm test
npx expo prebuild
```

Para testar o projeto nativo em um Android conectado:

```bash
npx expo run:android
```

## APK pela EAS

Depois de autenticar no Expo:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

O perfil `preview` está configurado com `android.buildType = apk`.

## Produção

```bash
npx eas-cli build --platform android --profile production
```

O perfil de produção gera AAB.

## Observação sobre Bluetooth

Este aplicativo usa `react-native-bluetooth-classic`, portanto o teste deve ser feito em um build nativo Android. Expo Go não é suficiente para validar o transporte Bluetooth Classic.

## Java no Termux

O CI do GitHub usa Temurin 17 porque o ambiente de CI suporta esse JDK de forma estável.

O Termux atual deste projeto fornece OpenJDK 21 e 25. O build local do Termux usa o JDK compatível disponível, preferindo 21.

Execute:

```bash
npm run android:termux
```

O script:
1. encontra o JDK instalado;
2. define `JAVA_HOME` somente para o build;
3. gera o projeto Android com Expo prebuild se necessário;
4. força o Gradle a usar esse `JAVA_HOME`;
5. gera `android/app/build/outputs/apk/debug/app-debug.apk`;
6. mostra o SHA256 do APK.

Não use `pkg install openjdk-17` no Termux atual deste projeto, porque esse pacote não está disponível no repositório configurado.

## Como as funções conversam

A arquitetura usa uma ponte nativa em camadas:

```text
TELAS REACT NATIVE
        |
        v
SERVIÇOS TYPESCRIPT
        |
        +---- Bluetooth Manager
        |          |
        |          v
        |   react-native-bluetooth-classic
        |          |
        |          v
        |      ANDROID / JAVA
        |
        +---- Elm327Session
        |          |
        |          v
        |    PID / DTC / ECU
        |
        +---- GPS Tracker
        |          |
        |          v
        |     Expo Location
        |          |
        |          v
        |      ANDROID
        |
        +---- Storage / Autosave / Histórico
                   |
                   v
              Arquivos locais
```

O Java nativo não duplica o parser OBD, DTC, PID, histórico ou autosave. Ele fornece as funções Android nativas. A lógica de diagnóstico continua no TypeScript, onde os dados podem ser testados e rastreados por origem.

Assim, Bluetooth Classic, ELM327, ECU, GPS, armazenamento e interface permanecem separados, mas ligados pelo mesmo fluxo do aplicativo.
