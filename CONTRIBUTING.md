# Contribuindo

## Ambiente

Requisitos:

- Node.js 20
- Android SDK configurado
- Android Studio para build nativo
- ELM327 Bluetooth Classic para testes reais

Instalação:

```bash
npm install
```

Validação:

```bash
npm run typecheck
npm test
```

Build Android:

```bash
npx expo prebuild
npx expo run:android
```

## Regras de código

- TypeScript estrito.
- Não usar valores fictícios como se fossem dados reais.
- Não misturar SIMULAÇÃO com REAL.
- Preservar TX/RX quando houver logging.
- Alterações no transporte Bluetooth precisam de teste em Android real.
- Alterações no parser precisam de testes para resposta válida, inválida e incompleta.

## Commits

Prefira mensagens curtas e objetivas:

- `fix: corrigir...`
- `feat: adicionar...`
- `docs: atualizar...`
- `test: adicionar...`
- `refactor: reorganizar...`

## Pull requests

Descreva:

- problema;
- causa;
- solução;
- testes executados;
- impacto no Android/ELM327;
- riscos conhecidos.
