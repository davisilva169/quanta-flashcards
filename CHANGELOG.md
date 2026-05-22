# Changelog

Todas as mudanças notáveis no Quanta são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e
o projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não lançado]

Em andamento:

- Documentação técnica adicional (`ARCHITECTURE.md`, `CONTRIBUTING.md`).

## [0.5.1] — 2026-05

Primeira release pública preparada para distribuição. Inclui apenas
melhorias defensivas em cima da 0.5.0 — sem mudanças funcionais
perceptíveis para o usuário.

### Corrigido

- `resetAll()` e `importData()` em `db/database.ts` agora incluem
  `studySessionLogs` nas tabelas limpas. Bug pré-existente: logs de
  sessão de foco sobreviviam a um reset/import global, gerando
  inconsistência nas estatísticas.

### Mudado

- `electron/main.ts`: caminho de `userData` agora é fixado em
  `%APPDATA%\Quanta\` via `app.setPath` independente do `productName`.
  Defesa contra rename futuro do app — caso o nome mude um dia, os
  dados locais não somem.

## [0.5.0] — 2026-05

Marco com vários blocos de evolução agregados.

### Adicionado

- **Atalhos configuráveis.** Toda tecla de revisão (Espaço, 1-4, R, Esc,
  Enter) pode ser remapeada em Configurações → Atalhos. Conflitos são
  detectados ao remapear. Atalhos sem modificadores (Ctrl/Alt/Cmd) por
  enquanto.
- **Página de Títulos.** Galeria de 10 postos com gradientes únicos.
  Banner do posto atual + grid responsivo de todos os postos
  (Desbloqueado / Atual / Bloqueado).
- **Página da Chama.** Indicador visual de meta diária de revisões.
  SVG animado em 6 níveis (apagada → intensa) com mensagens
  contextuais e heatmap de 14 dias.
- **Sessão de Foco (Pomodoro).** Configura duração e meta (apenas
  tempo / atingir N revisões), inicia uma sessão envolvendo a tela de
  revisão. Cronômetro overlay com botões Pausar/Encerrar. Resumo no
  fim com tempo estudado, acertos, erros, taxa, pausa sugerida e
  recompensa saudável aleatória. Log persistente em
  `db.studySessionLogs`.
- **Notificações.** Lembretes de baralho pronto via API de
  Notification do Chromium. Master switch, toggle de "deck-ready",
  frequência mínima por baralho (15/30/60/120 min) e janela
  silenciosa (suporta janelas que cruzam meia-noite). Dispara apenas
  enquanto o app está aberto.
- **Multi-cloze (Anki-style).** Cartões com múltiplas chaves
  (`{{c1::a}} {{c2::b}}`) viram N unidades independentes de revisão.
  Cada chave tem seu próprio agendamento espaçado. Outras chaves
  aparecem em texto puro como contexto durante a revisão da chave
  ativa. Editor mostra preview de cada variante separadamente, avisa
  sobre gaps na numeração e sobre tags mal-formadas.
- **Parser de cloze com chaves aninhadas.** Aceita LaTeX dentro da
  resposta (`{{c1::e^{βμ}}}`, `{{c1::\frac{a}{b}}}`,
  `{{c1::\sum_{i=1}^n a_i}}`). Implementado via state machine que
  conta profundidade de chaves — substituiu o regex anterior que
  parava no primeiro `}` interno.
- "Revisar agora" da Home agora abre direto o setup da Sessão de
  Foco. Sessão de Foco saiu da barra lateral.

### Corrigido

- Scroll vertical fantasma na DeckPage com muitos cartões: o `motion.div`
  com `initial={{ y: 6 }}` em cada FlashcardCard inflava o `scrollHeight`
  do `<main>` durante o mount em Chromium/Electron. Agora é fade-in
  puro de opacidade.
- `html, body, #root` ganharam `overflow: hidden` em ambos os eixos
  como defesa-em-camadas contra qualquer scroll fantasma fora do
  `<main>`.
- Sessão de Foco: contagem de acertos/erros em cartões clássicos. A
  lógica usava `wasCorrect`, que só é definido em cartões
  interativos. Agora usa o `rating` final (1 = erro, ≥2 = acerto)
  para todos os tipos de cartão.
- Botões "Iniciar sessão", "Nova sessão", "Encerrar" e "Adicionar
  recompensa" usavam o token inventado `text-accent-on` (inexistente).
  Trocados para `text-on-accent`. No tema claro o texto ficava preto
  em fundo azul.
- Várias regressões menores entre os blocos foram corrigidas conforme
  identificadas durante o desenvolvimento.

### Mudado

- **Sidebar** reorganizada: Início · Baralhos · Estatísticas · Títulos ·
  Chama · Configurações. Foco saiu da sidebar e virou o caminho
  natural de "Revisar agora".
- **Esquema do banco** evoluiu para a versão 4 do Dexie com a tabela
  nova `studySessionLogs`. Migração aditiva — nenhum dado existente é
  modificado.

## [0.4.0]

- Narração TTS opcional por cartão usando a Web Speech API. Configurações
  de voz, taxa e idioma por cartão.
- Modo Rush: revisar cartões rapidamente sem aplicar o agendamento.

## [0.3.0]

- Anexos (imagens e áudio) embutidos em cartões via marcador
  `![[att_id]]`. Armazenados como Blob no IndexedDB.
- Lightbox para visualização ampliada de imagens.
- Import/export global (backup completo: cartões, decks, pastas,
  attachments, logs, settings).
- Import/export individual por baralho (apenas conteúdo; estado de SR
  e logs zerados na importação).

## [0.2.0]

- Pastas para organizar baralhos.
- Categorias customizadas além das 6 predefinidas.
- Tema claro e escuro completos.
- Sistema de leveling não-linear baseado em XP por revisão.

## [0.1.0]

- MVP inicial: criar baralhos, criar cartões, revisar com agendamento
  SM-2 derivado. Markdown + LaTeX (KaTeX). Persistência local via
  Dexie/IndexedDB.

[Não lançado]: https://github.com/davisilva169/quanta-flashcards/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/davisilva169/quanta-flashcards/releases/tag/v0.5.1
[0.5.0]: https://github.com/davisilva169/quanta-flashcards/releases/tag/v0.5.0
