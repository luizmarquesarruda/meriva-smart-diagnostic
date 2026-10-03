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

O arquivo gerado pode ser instalado diretamente no Android. O EAS usa APK para instalação direta e AAB como formato padrão para distribuição em loja. 

## Produção

```bash
npx eas-cli build --platform android --profile production
```

O perfil de produção gera AAB.

## Observação sobre Bluetooth

Este aplicativo usa `react-native-bluetooth-classic`, portanto o teste deve ser feito em um build nativo Android. Expo Go não é suficiente para validar o transporte Bluetooth Classic.

## Estado da auditoria

- Expo SDK: 51
- React Native: 0.74.5
- Android package: `com.meriva.smartdiagnostic`
- EAS: configurado
- APK preview: configurado
- AAB production: configurado
- Assinatura: será administrada pelo EAS quando o primeiro build for executado

Antes do primeiro build, execute `npm run doctor`. Se houver incompatibilidade de dependências, corrija-a antes de gerar o APK final.


## Java no Termux

O projeto Android é compilado com **Java 17**. O CI do GitHub já usa Temurin 17.

No Termux, o Android/Gradle pode iniciar com outro JDK instalado no sistema. Para evitar que o Gradle use Java 21 por engano, use:

```bash
npm run android:termux
```

O script procura automaticamente um JDK 17 instalado em `$PREFIX/lib/jvm`, define `JAVA_HOME` somente para essa compilação e monta o APK debug.

Não é necessário copiar um caminho fixo de JDK para dentro do GitHub. Isso mantém o projeto portátil.

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

O Java nativo não deve duplicar o parser OBD, DTC, PID, histórico ou autosave. Ele fornece as funções Android nativas. A lógica de diagnóstico continua no TypeScript, onde os dados podem ser testados e rastreados por origem.

Assim, Bluetooth Classic, ELM327, ECU, GPS, armazenamento e interface permanecem separados, mas ligados pelo mesmo fluxo do aplicativo.
