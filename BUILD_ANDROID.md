# Build Android

## Perfis

- `preview`: gera APK instalável para testes no Android.
- `production`: gera AAB para distribuição pela Google Play.

O APK que deve ser instalado diretamente no telefone é o **standalone release APK**. Ele contém o bundle JavaScript dentro do próprio arquivo e **não depende do Metro**.

## CI do GitHub

A CI faz:

1. instala as dependências;
2. executa `expo doctor` e os testes;
3. gera o projeto nativo com `expo prebuild`;
4. compila `app-release.apk`;
5. verifica se `assets/index.android.bundle` está dentro do APK;
6. publica o APK como artefato.

O artefato correto é:

`meriva-smart-diagnostic-standalone-apk`

Não use um `app-debug.apk` da CI para o teste standalone. APK Debug pode depender do Metro durante o desenvolvimento.

## Validação local

```bash
npm install
npm run doctor
npm run typecheck
npm test
npx expo prebuild --platform android
```

Para desenvolvimento com Metro:

```bash
npx expo start --dev-client
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

O perfil `preview` usa `distribution: internal`, `developmentClient: false` e `android.buildType: apk`. O resultado é um APK instalável diretamente no Android e não depende do Metro.

## Produção

```bash
npx eas-cli build --platform android --profile production
```

O perfil de produção gera AAB.

## Java no Termux

O CI do GitHub usa Temurin 17.

O Termux deste projeto pode usar um JDK disponível localmente, conforme o script já existente em `scripts/build-android-termux.sh`. O Termux não é o caminho principal para gerar o APK standalone; a compilação oficial de validação é feita pela CI do GitHub.

## Bluetooth

Este aplicativo usa `react-native-bluetooth-classic`, portanto o teste deve ser feito em um build nativo Android. Expo Go não é suficiente para validar o transporte Bluetooth Classic.

## Diagnóstico do erro "Unable to load script"

Esse erro aparece quando um build de desenvolvimento/debug tenta carregar o JavaScript pelo Metro ou quando o bundle não foi empacotado.

Para o teste físico do aplicativo, use somente o artefato `meriva-smart-diagnostic-standalone-apk`. O APK standalone é validado pela CI antes de ser publicado como artefato.
