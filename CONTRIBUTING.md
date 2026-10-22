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


## Documentação obrigatória para mudanças

Ao alterar inicialização, identidade visual, navegação, dependências Expo ou configuração nativa:

- atualize o README e o documento técnico afetado;
- atualize `CHANGELOG.md` para mudanças voltadas ao usuário;
- acrescente uma entrada sequencial a `docs/DIARIO_DE_BORDO.md` com causa, arquivos, correções, testes e estado real da CI;
- atualize `docs/CONTRATO_ANTI_REGRESSAO.md` e o teste executável quando um requisito crítico precisar de proteção;
- mantenha auditorias antigas como registro histórico, adicionando uma nota datada quando a conclusão for superada por evidência posterior;
- não declare a CI aprovada antes de verificar os jobs do SHA exato. Teste de código, build nativo e teste físico são evidências diferentes.
- não afirme que a imagem da splash está restaurada apenas porque `expo.splash` e o pacote estão configurados; confira o asset e o APK real.
