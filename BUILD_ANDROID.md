# Build Android

## Perfis

- `preview`: gera APK instalável para testes no Android.
- `production`: gera AAB para distribuição pela Google Play.

## Toolchain oficial do projeto

- Node.js: 20.x
- Java/JDK: 17
- Expo SDK: 51.0.39
- React Native: 0.74.5
- Android nativo: gerado pelo Expo prebuild

Java 21 não é a referência deste projeto. O build CI usa Java 17. Em Termux/ARM, erros do Gradle envolvendo `SystemInfo` não devem ser corrigidos trocando aleatoriamente a versão do Gradle.

## Validação local

```bash
npm install
npm run doctor
npm run typecheck
npm test
npx expo prebuild --clean --platform android --non-interactive
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

## Observação sobre Android/Java

O diretório `android/` é ignorado pelo Git e é recriado pelo prebuild. A configuração nativa usada pela CI é, portanto, derivada do `app.json`, das dependências e do Expo SDK. O workflow fixa Java 17 antes do prebuild e do Gradle.

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
