# Auditoria do repositório: 2026-10-02

## Escopo

Revisão do código rastreado no branch principal, incluindo UI Expo Router, transporte Bluetooth Classic, sessão ELM327, parser e PIDs, persistência, autosave, DTC, aprendizado, ciclos, storage, testes, CI e documentação.

## Problemas encontrados e corrigidos

### Autosave
- Corrigida condição de corrida que podia perder uma mutação feita durante uma gravação assíncrona.
- O autosave agora controla uma versão de mutação e agenda nova gravação quando necessário.
- Troca de basePath força descarte seguro do runtime anterior.
- Falhas de gravação mantêm o estado marcado como pendente.

### OBD e ELM327
- Protocolo deixou de ser gravado como valor fixo.
- A sessão consulta ATDP e expõe o protocolo detectado.
- O resultado de PID carrega o protocolo usado na sessão.

### Logging
- RAW e interpretado passam a preservar TX e RX em campos próprios.
- Tempo de resposta, status, protocolo e fonte ficam em colunas semânticas.
- Simulação continua separada de dados reais.

### Bluetooth
- Ciclo de vida da tela de laboratório foi corrigido para não encerrar o checkpoint ao alterar o estado da sessão.
- Foi adicionada desconexão explícita.
- Ações OBD ficam bloqueadas até o armazenamento inicial estar pronto.
- O texto da lista de pareados não confunde rádio Bluetooth ligado com ELM conectado.

### Storage
- Quota passa a respeitar o limite configurado.
- Perfil do veículo valida JSON e garante a criação do diretório.
- Ciclos persistidos são validados antes de entrar no histórico.
- Importação de seed não depende mais de um caminho inexistente dentro de documentDirectory.

### Testes
- O teste Jest isolado e não executado pelo npm test foi removido.
- Foi criada uma suíte de regressão Node cobrindo parser, ELM/protocolo, quota, logging TX/RX, perfil do veículo, seed, ciclos e corrida do autosave.
- O npm test executa agora as duas suítes.

### CI e manutenção
- CI usa npm install sem cache dependente de package-lock inexistente.
- CI executa expo-doctor e a validação completa.
- Adicionados templates de pull request, bug e feature.

## Validação automatizada

CI GitHub Actions, execução #40:

- npm install: PASS
- expo-doctor: 17/17 checks PASS
- tsc --noEmit: PASS
- testes de autosave: 12/12 PASS
- regressões adicionais: 8/8 PASS

## Limitações que permanecem

- Bluetooth Classic, ELM327 e ECU real ainda exigem teste em Android físico.
- O build nativo Android local não é validado pelo CI atual porque o diretório android/ é gerado pelo Expo e não é versionado.
- Algumas rotinas de integração, como descoberta de PIDs e importação de seed explícito, ainda não estão expostas em telas próprias.
- O repositório não possui package-lock.json, portanto a instalação depende das resoluções disponíveis no registry. As principais versões exigidas pelo Expo SDK 51 foram fixadas conforme o expo-doctor.

## Princípio de confiabilidade

Dados de simulação e referências históricas permanecem identificados e não alimentam o aprendizado REAL_OBD.
