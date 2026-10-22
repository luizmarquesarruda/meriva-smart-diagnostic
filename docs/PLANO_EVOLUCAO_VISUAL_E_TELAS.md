# Plano de evolução visual e navegação — Meriva Smart Diagnostic

**Status:** proposta de design e escopo para implementação incremental  
**Base de código:** Expo Router / React Native, branch `fix/bt-reconnect-guard`  
**Princípio:** melhorar a experiência sem alterar silenciosamente os contratos de diagnóstico OBD-II ou a segurança da recuperação Bluetooth.

## 1. Referências pesquisadas

1. **Google — Design for Driving**: priorizar informação rapidamente legível, reduzir distrações, usar alvos de toque claros e linguagem concisa. Embora o app seja para telefone e não Android Auto, os princípios de leitura rápida são úteis para o contexto automotivo.  
   https://developers.google.com/cars/design/design-foundations
2. **OBDLink App**: referência funcional para dashboards configuráveis, PIDs ao vivo, DTCs, freeze frame, prontidão de monitores, logs e mapa de viagens.  
   https://www.obdlink.com/obd-apps/obdlink-app/
3. **OBD Auto Doctor**: referência para separar códigos confirmados/pendentes/permanentes, freeze frame, relatório exportável e base local de códigos.  
   https://www.obdautodoctor.com/features/
4. **Torque Pro**: referência para dashboards com layouts distintos, gráficos de múltiplos sensores, PIDs customizados e histórico de sessões. Os recursos devem ser comparados como referência de produto, não copiados literalmente.  
   https://apps.apple.com/br/app/torque-pro-obd2-car-scanner/id6504351894
5. **Android Developers — acessibilidade**: controles com rótulos descritivos, alternativas à cor para comunicar estados e suporte a tecnologias assistivas.  
   https://developer.android.com/guide/topics/ui/accessibility/principles
6. **MDN — checklist de acessibilidade móvel**: contraste, foco, orientação, estado visível e redundância além de cores.  
   https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Mobile_accessibility_checklist

## 2. Direção visual proposta

- Interface escura de alto contraste, com fundo grafite/azul profundo, superfícies diferenciadas, tipografia legível e um único acento consistente.
- Cor nunca é o único indicador: usar texto, ícone e rótulo explícito para conectado, desconectado, simulado, indisponível, alerta e erro.
- Métricas principais em cartões simples; gráficos e detalhes em telas secundárias.
- Navegação principal limitada a **Cockpit**, **Diagnóstico**, **Dados** e **Viagens**. Recursos administrativos ficam em **Mais**.
- Estados vazios explicam o próximo passo; erros oferecem ação segura de recuperação sem iniciar conexões duplicadas.
- Layout responsivo para retrato e paisagem; rolagem e áreas de toque verificadas em telas estreitas.

## 3. Mapa de telas

### A. Cockpit — `app/index.tsx`
- Cartão de conexão que diferencia adaptador Bluetooth, sessão ELM327 e ECU validada.
- Métricas em destaque somente quando a fonte e o timestamp forem válidos.
- Ações principais: **Diagnóstico**, **Dados ao vivo**, **Iniciar/encerrar viagem**.
- Indicação explícita de última atualização e estado REAL/SIMULAÇÃO.
- Não usar valores de demonstração como se fossem leituras do veículo.

### B. Diagnóstico — `app/saude.tsx` e `app/laboratorio.tsx`
- Resumo de DTCs separados por confirmado, pendente, permanente e histórico.
- Detalhe do código com descrição, origem, evidência disponível e limitações da ECU.
- Freeze frame e prontidão só aparecem quando houver resposta real suportada.
- Consulta manual de PID mantém cinco amostras válidas como contrato do motor de testes; amostragem incompleta permanece inconclusiva.
- Não executar limpeza de DTC ou comandos que alterem parâmetros/configurações do veículo como parte de uma varredura automática.

### C. Dados ao vivo — `app/dados.tsx`
- Seleção clara de PID, unidade, fonte, timestamp e estado de suporte.
- Gráfico sem série falsa quando ECU estiver desconectada.
- Separação entre telemetria em tempo real e histórico de viagens concluídas.
- Atualização controlada e mensagens específicas para timeout, resposta inválida e PID não suportado.

### D. Viagens — `app/viagens.tsx`
- Sessão ativa separada do histórico salvo.
- GPS opcional; ausência de permissão de localização não bloqueia OBD.
- Distinguir distância GPS, métricas OBD e estimativas derivadas.
- Nunca apresentar ciclos simulados/importados como viagens reais.

### E. Bluetooth / ELM327 — `app/bluetooth.tsx`
- Etapas de conexão explícitas: Bluetooth/permissões → adaptador → sessão RFCOMM → resposta ELM → validação ECU.
- Erro e timeout com ações de recuperação limitadas; impedir conexões concorrentes enquanto limpeza nativa estiver incerta.
- Mostrar nome/endereço do adaptador sem expor dados sensíveis desnecessários.

### F. Histórico e exportação — `app/armazenamento.tsx`
- Lista de sessões, data/hora, origem real/simulada, disponibilidade do arquivo e resultado da exportação.
- Falhas de persistência apresentadas separadamente das falhas de desconexão.
- Repetir exportação não deve duplicar registros nem alterar sessões antigas.

### G. Testes de sensores — `app/testes-sensores.tsx`
- Estado por PID: aguardando, válido, inválido, sem resposta, não suportado e inconclusivo.
- Progresso explícito das cinco leituras e média calculada apenas com cinco respostas válidas.
- Resultados simulados identificados em todos os níveis do fluxo.

## 4. Contratos de segurança e confiabilidade

- Preservar a serialização de comandos ELM e a trava global de limpeza de socket.
- Timeout JS não é prova de cancelamento da chamada nativa; fechamento não confirmado bloqueia nova conexão.
- Nenhum dado simulado pode entrar no histórico real ou ser exportado como medição ECU.
- GPS e internet são recursos opcionais para o diagnóstico local OBD.
- Nenhuma nova tela pode criar sua própria conexão Bluetooth independente; deve usar o dono de sessão compartilhado.
- Nenhuma consulta de PID deve competir com reset/renegociação de protocolo.
- Evitar alterar o SDK Expo ou a biblioteca Bluetooth no mesmo conjunto de mudanças visuais; migração de dependências deve ser uma tarefa isolada.

## 5. Critérios de aceite por tela

- Testes de navegação e tema existentes continuam verdes.
- Testes de origem REAL/SIMULAÇÃO, desconexão, rotação e persistência continuam verdes.
- Estados vazios, loading, erro, desconectado e dados incompletos têm tratamento explícito.
- Rótulos acessíveis e alvos de toque adequados; contraste revisado.
- Testes automatizados passam em `gate:baseline` e `validate`; `android-build` gera APK standalone verificado.
- Teste físico com ELM327 é registrado separadamente e não pode ser substituído por testes simulados.

## 6. Plano incremental

1. Definir uma direção visual a partir de três alternativas antes de reestruturar as telas.
2. Aplicar tokens e componentes comuns sem reescrever a camada OBD.
3. Atualizar primeiro Cockpit e navegação; depois Diagnóstico, Dados e Viagens.
4. Revisar telas de suporte (Bluetooth, testes de sensores, histórico e configurações).
5. Rodar CI por etapa e revisar APK no dispositivo.
6. Manter a PR em rascunho até todos os gates necessários e o teste físico documentado.

## 7. Limites

Este documento é uma especificação de trabalho, não uma declaração de que todas as mudanças visuais já foram implementadas. Os recursos dependem do adaptador, protocolo e ECU do veículo; suporte a um PID deve ser comprovado por resposta válida, não inferido pelo catálogo.
