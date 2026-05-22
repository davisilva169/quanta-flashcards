# Arquitetura do Quanta

Documento técnico para quem quer entender o código por dentro — você daqui a
seis meses, contribuidores, ou seu eu futuro projetando sync.

Convenções deste documento:

- **Decisão** introduz uma escolha de design e o motivo.
- **Gotcha** introduz uma armadilha conhecida no código.
- **Pendência** lista refinamentos planejados; ver
  [`ROADMAP.md`](ROADMAP.md) para o cronograma.

---

## 1. Visão geral

O Quanta é um app **Electron + React + TypeScript + Vite**, totalmente
local-first. Os dois processos do Electron são:

- **main** (`electron/main.ts`): cria a janela do navegador, controla
  `BrowserWindow`, gerencia ciclo de vida do app. Mínimo absoluto — não
  faz lógica de negócio.
- **renderer** (todo `src/`): a aplicação React. Toda a lógica de
  flashcards, scheduler, persistência, UI vive aqui.

O **preload** (`electron/preload.ts`) atualmente é um stub. Não há IPC
custom porque não há necessidade — toda persistência é via IndexedDB no
renderer, e nenhuma operação privilegiada precisa atravessar a ponte.

**Decisão**: manter o main "burro" pelo máximo de tempo possível. IPC só
entra quando for absolutamente necessário (ex: auto-start no Windows,
arquivos fora do app, notificações de background).

---

## 2. Stack

| Camada | Biblioteca | Versão |
|---|---|---|
| Empacotamento desktop | Electron | 32.0.2 |
| Build / dev server | Vite | 7.3.2 |
| Plugin Electron-Vite | vite-plugin-electron | 0.28.8 |
| UI | React | 18.3.1 |
| Linguagem | TypeScript | 5.5.4 |
| Estilização | Tailwind CSS | 3.4.10 |
| Persistência | Dexie (wrapper de IndexedDB) | 4.0.10 |
| Renderização LaTeX | KaTeX | 0.16.11 |
| Markdown + math | react-markdown + remark-math + rehype-katex | 9 / 6 / 7 |
| Animação | framer-motion | 11.5.6 |
| Ícones | lucide-react | 0.441.0 |
| Distribuição | electron-builder | 25.0.5 |

Sem estado global externo (Redux, Zustand, etc.) — comunicação entre
componentes via props e leitura direta do Dexie. Tudo cabe.

---

## 3. Estrutura de pastas

```
quanta/
├── electron/                  ← main + preload (saída em dist-electron/)
│   ├── main.ts
│   └── preload.ts
├── src/                       ← renderer (React)
│   ├── App.tsx                ← roteamento e shell
│   ├── main.tsx               ← entry point
│   ├── components/            ← componentes reutilizáveis
│   │   └── stats-panels/      ← painéis da página de estatísticas
│   ├── db/
│   │   └── database.ts        ← schema Dexie + uid() + defaults + backfill
│   ├── hooks/
│   │   └── useDeckReadyNotifier.ts
│   ├── pages/                 ← uma .tsx por rota
│   ├── scheduler/
│   │   └── scheduler.ts       ← SM-2 derivado, day-boundary
│   ├── styles/
│   │   └── index.css          ← tokens de tema + KaTeX overrides
│   ├── types/                 ← um .ts por entidade
│   └── utils/                 ← funções puras, sem React
├── public/                    ← assets servidos pelo Vite
├── build/                     ← assets para electron-builder (ícone)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

**Decisão**: pastas por **tipo** (components, pages, utils), não por
feature. O projeto é pequeno o suficiente para isso ainda funcionar; se
crescer muito, vale repensar para uma estrutura por feature
(`features/foco/`, `features/multi-cloze/`).

**Convenção de imports**: o alias `@/*` aponta para `src/*`. Sempre prefira
`@/utils/cloze` a `../../utils/cloze`.

---

## 4. Roteamento

Não usa React Router. **Roteamento manual via state em `App.tsx`**, com um
`type Route` discriminado por `name`.

```ts
type Route =
  | { name: 'home' }
  | { name: 'decks' }
  | { name: 'deck'; deckId: string }
  | { name: 'review'; deckId?: string }
  | { name: 'focus-setup' }
  | ...
```

Cada página recebe `route: Route` e `onNavigate: (r: Route) => void`.

**Decisão**: simplicidade. Sem URL bar (é app desktop), sem deep linking,
sem histórico de navegação além do que o componente decidir guardar. Um
`switch` no `App.tsx` resolve qual página montar.

**Gotcha**: a Sidebar mantém uma lista hardcoded das rotas principais. Ao
adicionar uma nova página, atualize:
1. O `Route` union em `Sidebar.tsx`.
2. O `switch` em `App.tsx`.
3. (Opcional) O array `items` da Sidebar, se a página deve aparecer no
   menu.

---

## 5. Modelo de dados

### 5.1 Schema Dexie

Versão atual: **v4**. Cada `this.version(N).stores({...})` é uma migração
**aditiva** — Dexie infere e executa automaticamente.

| Tabela | Índices | Conteúdo |
|---|---|---|
| `decks` | `id, folderId, name, createdAt` | Baralhos |
| `folders` | `id, name, createdAt` | Pastas |
| `cards` | `id, deckId, due, state, type, createdAt` | Cartões |
| `reviewLogs` | `id, cardId, deckId, reviewedAt` | Log de cada revisão (append-only) |
| `userStats` | `id` (singleton) | XP, level, streak |
| `settings` | `id` (singleton) | Tema, scheduler config, atalhos, foco, notificações, speech |
| `attachments` | `id, cardId, type, createdAt` | Imagens e áudios |
| `studySessionLogs` | `id, startedAt, createdAt` | Sessões de Foco |

`userStats` e `settings` têm `id = 'singleton'` — há sempre exatamente uma
linha em cada tabela. Defaults populados em `ensureInitialized()`.

### 5.2 Entidades principais

| Entidade | Arquivo | Características |
|---|---|---|
| `Folder` | `types/folder.ts` | id, name, color, createdAt, updatedAt |
| `Deck` | `types/deck.ts` | id, folderId?, name, description?, colorKey, createdAt, updatedAt |
| `Flashcard` | `types/flashcard.ts` | id, deckId, front, back, type (CardCategory), interaction, speech?, 10 campos de SR, `clozeStates?`, createdAt, updatedAt |
| `ReviewLog` | `types/review.ts` | id, cardId, deckId, rating, reviewedAt, intervalDays, prevState, newState, durationMs?, clozeKey? |
| `Attachment` | `types/attachment.ts` | id (`att_*`), cardId, type, mimeType, filename, size, data (Blob), createdAt, updatedAt |
| `Settings` | `types/stats.ts` | id, theme, scheduler, shortcuts?, focus?, notifications?, speech?, ... |
| `UserStats` | `types/stats.ts` | id, xp, level, streak, longestStreak, lastReviewDay |
| `StudySessionLog` | `types/focus.ts` | id, startedAt, endedAt, durationSeconds, reviews, correct, wrong, scopeKind, scopeId, endReason?, configuredFocusSeconds |

### 5.3 IDs

Gerados por `uid()` em `db/database.ts`:

```ts
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
```

`Date.now().toString(36)` (~8 chars) garante ordenação aproximada e
exclui colisão entre IDs criados em momentos diferentes; os 8 chars
randômicos cuidam de colisão dentro do mesmo ms.

Attachments têm prefixo: `attUid() = 'att_' + uid()`. O prefixo é o que
o regex de marcadores em texto (`![[att_xxx]]`) usa para
desambiguação.

**Pendência (sync)**: para sync entre dispositivos, considerar migrar para
UUID v4 (`crypto.randomUUID()`). Migração suave: novos IDs viram UUID;
antigos permanecem como estão. Detalhes em `docs/sync-design.md`
(futuro).

### 5.4 `SchedulingState`

```ts
type SchedulingState = Pick<Flashcard,
  | 'state' | 'due' | 'stability' | 'difficulty'
  | 'elapsedDays' | 'scheduledDays' | 'reps' | 'lapses'
  | 'lastReview' | 'ease'
>;
```

Subconjunto do `Flashcard` que descreve o estado de SR de **uma unidade
de revisão**. Para cartões não-cloze, é o estado raiz do cartão. Para
multi-cloze, cada chave (`c1`, `c2`, …) tem seu próprio `SchedulingState`
em `Flashcard.clozeStates`.

Detalhes em `utils/reviewItems.ts` e seção 9 deste documento.

---

## 6. Scheduler

`src/scheduler/scheduler.ts`. Algoritmo derivado do SM-2 com day-boundary
estilo Anki.

### 6.1 API

- `schedule(card, rating, nowMs, config?)` → `{ card, intervalDays }`
  — wrapper que opera no Flashcard inteiro.
- `scheduleState(state, rating, nowMs, config?)` → `{ state, intervalDays }`
  — versão pura, opera sobre `SchedulingState`. Multi-cloze usa esta.
- `previewIntervals(state, nowMs, config?)` → `Record<Rating, string>`
  — labels "<10m / 1d / 3d / 6d" mostradas nos botões de rating.

### 6.2 Algoritmo

Estados: `'new' | 'learning' | 'review' | 'relearning'`.

Ratings: `1 (Errei) | 2 (Difícil) | 3 (Bom) | 4 (Fácil)`.

- `Errei`: reduz ease em 0.2, incrementa lapses, vai para
  `relearning`, due = now + `lapseMinutes` (default 10 min, sub-day).
- `Difícil`: ease -= 0.15, intervalo = previous × `hardFactor` (default
  1.2), no mínimo `graduatingInterval` em new.
- `Bom`: ease igual, intervalo = previous × ease. Em new vai para
  `graduatingInterval` (1 dia); em learning/relearning sobe direto para
  3 dias como "step de recuperação".
- `Fácil`: ease += 0.15, intervalo = previous × ease × `easyBonus`
  (default 1.3).

### 6.3 Day-boundary

Plain SM-2 schedules `now + N * 24h`, então um cartão revisado às 21h
fica devido amanhã às 21h. Quanta (igual a Anki) **snaps para o
`rolloverHour`** (default 4 AM): "1 dia" vira "próximo rollover às 4 AM",
"7 dias" vira "7 rollovers à frente". Isso faz com que cartões fiquem
prontos no início do próximo dia de estudo.

Implementado em `dueAtDayInterval(nowMs, intervalDays, rolloverHour)`.

### 6.4 Recovery de lapses

Cada "Bom" em cartão não-novo decrementa o contador de lapses. "Fácil"
decrementa em 2. Isso permite que cartões saiam de listas tipo "Cartões
com mais tropeços" conforme o usuário re-domina.

---

## 7. Attachments

`src/types/attachment.ts` + `src/utils/attachments.ts`.

### 7.1 Modelo

```ts
interface Attachment {
  id: string;       // 'att_xxx'
  cardId: string;
  type: 'image' | 'audio';
  mimeType: string;
  filename: string;
  size: number;
  data: Blob;       // ← binário nativo no IndexedDB
  // ...
}
```

**Decisão**: `data` é `Blob` na memória e no banco, **base64 (data URL)
no export JSON**. Conversão é feita no IO edge: ao exportar,
`blobToBase64()`; ao importar, `base64ToBlob()`. Em runtime tudo é Blob —
Blobs em IndexedDB são nativos, sem overhead de string.

### 7.2 Referência inline

Cartões referenciam attachments via marcador estilo Obsidian:

```
A função delta de Dirac:
![[att_lkm9x_abc12345]]
```

O renderizador (`LatexMarkdown.tsx`) reescreve o marcador para uma tag
`<img>` ou `<audio>` HTML com `src` baseado em `URL.createObjectURL(blob)`.

### 7.3 Object URL lifecycle

**Gotcha sério**: `URL.createObjectURL()` cria uma URL que precisa ser
liberada com `URL.revokeObjectURL()`. **Mas** se você revogar enquanto
um `<audio>` está tocando, o áudio corta no meio.

A solução em `useObjectUrl` (em `utils/attachments.ts`) é um
**WeakMap<Blob, string>** em escopo de módulo: a URL é criada na primeira
vez que o Blob é visto, cacheada, e **nunca revogada do lado do React**.
A coleta acontece via WeakMap quando o Blob fica sem referências.

### 7.4 Limites

- 8 MB por imagem (`MAX_IMAGE_BYTES` em `utils/attachments.ts`).
- MIME whitelist no upload (`image/png|jpeg|gif|webp`, `audio/mpeg|wav|ogg`).
- Cascade delete: deletar um cartão deleta seus attachments
  (`deleteCard()` em DeckPage faz a query e remove ambos).

---

## 8. LatexMarkdown — o pipeline de renderização

`src/components/LatexMarkdown.tsx`. Renderiza markdown com LaTeX
(`$..$` inline, `$$..$$` block) e attachments inline.

### 8.1 Pipeline

`content` (string) →
**segment parser custom** →
`react-markdown` com `remarkMath`, `remarkGfm`, `rehypeKatex` por segmento.

O segment parser custom existe **porque o `react-markdown@9` sanitiza
qualquer protocolo de URL não-standard** — incluindo o marcador
`![[att_id]]` que não é nem markdown nem HTML. Solução: pré-processar o
texto, dividir em segmentos "texto markdown" e "attachment ref", renderizar
texto via `react-markdown` e attachment via componente React próprio.

### 8.2 KaTeX

`.katex-display` tem `overflow-x: auto` e `overflow-y: hidden` (CSS em
`styles/index.css`). Fórmulas muito largas ganham scroll horizontal
interno em vez de empurrar o layout.

### 8.3 Escala de fonte na revisão

`InteractiveCardBody` aplica uma classe `review-scale-{sm|md|lg|xl}` no
container. As classes definem duas CSS vars (`--review-text`,
`--review-katex`) que controlam o tamanho do texto e do KaTeX
juntamente. Configurável em Configurações → Revisão.

---

## 9. Multi-cloze

`src/utils/cloze.ts` + `src/utils/reviewItems.ts` + `ReviewPage.tsx` +
`InteractiveCardBody.tsx`.

### 9.1 Sintaxe

Subconjunto compatível com Anki:

```
{{c1::resposta}}
{{c1::resposta::dica}}
{{c2::outra}}
```

Aceita LaTeX e markdown na resposta, incluindo chaves aninhadas:
`{{c1::e^{βμ}}}`, `{{c1::\frac{a}{b}}}`.

### 9.2 Parser (state machine)

`parseClozeAll(content)` é um parser stateful que conta profundidade de
chaves. **Não usa regex** para o corpo da tag — a versão antiga (regex)
parava no primeiro `}` interno e perdia tags com LaTeX. O parser atual
considera `}}` no nível 0 como fim da tag.

API:
- `parseClozeAll(content)` → `{ hasCloze, keys, matches }`
- `renderClozeForReview(content, activeKey, reveal)` → renderiza com
  uma chave escondida e as outras visíveis como contexto.
- `parseCloze(content)` → wrapper compat com shape antigo (perspectiva
  `c1`). Mantido para call sites que ainda não migraram.

### 9.3 ReviewItem virtual

Cartões multi-cloze geram **N items virtuais**, um por chave:

```ts
interface ReviewItem {
  card: Flashcard;
  clozeKey?: string;        // 'c1', 'c2', undefined p/ non-cloze
  state: SchedulingState;   // do clozeStates[key] ou raiz
}
```

`enumerateItems(cards)` (em `utils/reviewItems.ts`) é o ponto de entrada.
A `ReviewPage` opera sobre `ReviewItem[]`, não `Flashcard[]`.

### 9.4 Persistência

`Flashcard.clozeStates?: Record<string, SchedulingState>` é o campo
opcional que guarda o estado de cada chave. Cartões não-cloze e cartões
cloze com 1 só chave **não precisam** desse campo — `enumerateItems` faz
fallback lazy pro state raiz.

### 9.5 Populate defensivo

Quando o usuário avalia uma chave de um cartão multi-cloze, antes de
gravar o `newState`, o `applyRatingResult` garante que TODAS as chaves
do cartão tenham snapshot em `clozeStates`. Isso evita que se o usuário
sair da sessão depois de revisar c1, na próxima sessão c2 leia o raiz já
alterado por c1.

### 9.6 Recompute do due raiz

O `card.due` raiz vira o **menor `due`** entre todas as chaves quando
`clozeStates` existe. Isso preserva queries `where('due').belowOrEqual(now)`
funcionando — um cartão multi-cloze com qualquer chave vencida aparece como
vencido na HomePage/DeckPage. Função utility `recomputeRootDue(card,
fallback)` exposta.

**Pendência declarada**: HomePage/Stats hoje contam cartões pelo
Flashcard, não pelo ReviewItem. Um cartão multi-cloze com 3 chaves
vencidas conta como `1` na HomePage; aparece como 3 na fila de revisão.
Refator futuro.

---

## 10. Import / export

### 10.1 Global — `utils/importExport.ts`

Backup completo. Inclui **tudo**: decks, folders, cards (incluindo
`clozeStates`), reviewLogs (incluindo `clozeKey`), userStats, settings,
attachments (como base64).

```
QuantaExport {
  schemaVersion: number
  exportedAt: number
  decks, folders, cards, reviewLogs, userStats, settings
  attachments?: AttachmentExport[]
}
```

Import global é **destrutivo**: substitui o banco inteiro pelo conteúdo
do JSON. Pede confirmação dupla na UI.

### 10.2 Individual por baralho — `utils/deckExport.ts`

Apenas conteúdo: cartões, attachments, metadata do deck/folder. **Não
inclui** estado de SR (state, due, reps, ...), `clozeStates`, nem logs.

**Decisão**: ao compartilhar um deck, o autor compartilha o conteúdo, não
a memória que ele próprio construiu revisando. Os 10 campos de SR raiz
+ `clozeStates` são deliberadamente omitidos no export e o import zera
tudo via `newCardDefaults()`.

---

## 11. Sistema de gamificação

### 11.1 XP e níveis — `utils/xp.ts`

XP por revisão depende do rating:
- Errei → 0 XP
- Difícil → 1 XP
- Bom → 2 XP
- Fácil → 3 XP

Bônus de streak e de combo (acertos consecutivos) somam até +50%.

Curva de níveis **não-linear** — XP necessário cresce conforme o nível,
desenhado para que os primeiros 5 níveis sejam rápidos e os superiores
exijam comprometimento real.

### 11.2 Títulos — `utils/ranks.ts`

10 postos hierárquicos, cada um cobre uma faixa de níveis e tem seu
próprio gradient. `rankForLevel(level)` resolve.

### 11.3 Chama (streak) — `utils/streak.ts`

Streak decai se o usuário não revisar no dia. Função `decayedStreak()`
calcula o valor atual considerando dias desde a última revisão.

Intensidade da chama na FlamePage é mapeada por `flameIntensityFor(reviews,
goal)` em 6 níveis (apagada → intensa).

---

## 12. Sessão de Foco

`pages/FocusSetupPage.tsx` → `pages/FocusSessionPage.tsx` →
`pages/FocusSummaryPage.tsx`.

### 12.1 Fluxo

1. **Setup**: usuário escolhe duração (15/25/45/60 min ou custom), pausa
   (5/10/15 min ou custom), meta (apenas tempo / atingir N revisões), e
   escopo (todos / deck específico).
2. **Session**: `<ReviewPage>` é montado com overlay sticky por cima
   contendo timer, contadores e botões Pausar/Encerrar.
3. **Termino**: dispara um de quatro motivos —
   - `timer`: tempo esgotou
   - `goal`: meta de revisões atingida
   - `queue-empty`: fila esgotada organicamente
   - `user`: usuário encerrou antes
4. **Summary**: textos adaptados ao motivo, stats, pausa sugerida,
   recompensa saudável.

### 12.2 Timer

Cronômetro **derivado de `Date.now()` no render** com `pausedTotalMsRef`
acumulando tempo gasto em pausa. Não usa `setInterval` para incrementar
um estado — apenas força re-render a cada segundo via `setTick`. Mais
robusto: se a aba ficar dormindo, o cronômetro recupera o tempo correto
no próximo render.

### 12.3 Hook `onQueueEmpty`

A `ReviewPage` aceita uma prop opcional `onQueueEmpty?: () => void`.
Quando passada, a fila esgotada dispara o callback **uma única vez**
(proteção via ref) e **não renderiza** a tela "Sessão concluída" interna.
A `FocusSessionPage` usa isso para finalizar a sessão com motivo
`queue-empty` automaticamente.

---

## 13. Notificações

`utils/notifications.ts` + `hooks/useDeckReadyNotifier.ts`.

- 100% renderer-side, usando a `Notification` API do Chromium.
- Sem IPC, sem mexer no main process.
- Polling fixo de 60s no hook. Settings (master switch, frequência
  mínima por deck, janela silenciosa) são lidas a cada poll — mudanças
  surtem efeito sem desmontar/remontar.
- Dedup por deck via `Map<deckId, lastNotifiedAt>` em ref + tag
  visual (`tag: 'deck-ready-${deckId}'`) que faz o navegador colapsar
  notificações repetidas.
- Janela silenciosa suporta janelas cruzando meia-noite (22:00 →
  08:00).

**Limitação declarada**: notificações disparam apenas enquanto o app
está aberto. Auto-start no Windows e background notifications são
pendências futuras que exigem mudança no main process.

---

## 14. Tema e tokens CSS

`src/styles/index.css`.

Duas paletas completas **hand-tuned** — não é uma paleta com cores
invertidas:

- `:root` → tema **claro** (default quando `<html>` não tem `class`).
- `html.dark` → tema **escuro**.

Cada token é uma triple `R G B` (espaço-separada) para que
`bg-card/60`, `text-primary/80` funcionem via o helper `withAlpha` em
`tailwind.config.js`.

Tokens semânticos (não nomes de cores):
- **Surfaces**: `bg-app`, `bg-surface`, `bg-surface-2`, `bg-card`,
  `bg-elevated`, `bg-input`.
- **Texto**: `text-primary`, `text-secondary`, `text-muted`, `text-faint`,
  `text-on-accent`, `text-inverse`.
- **Bordas**: `border-subtle`, `border-divider`.
- **Estados**: `bg-warning-soft`, `bg-danger-soft`, `bg-success-soft`,
  `text-warning-fg`, `text-danger-fg`, `text-success-fg`.

**Gotcha**: o token de texto sobre fundo accent é
`text-on-accent`. Não existe `text-accent-on`, `text-danger-on`, etc. —
inventei esses por engano em um bloco e o resultado foi texto preto em
fundo azul no tema claro. Sempre `text-on-accent`.

---

## 15. Pontos sensíveis e gotchas conhecidos

### 15.1 React 18 batching

Setters de state são batched **dentro do mesmo turn síncrono**.
**Qualquer `await` no meio quebra o batching**. Exemplos comuns que
falham:

```ts
// ❌ não bate — o setQueue acontece em outro turn
const updated = await schedule(...)
setQueue(...)
setPhase('graded')
```

```ts
// ✅ bate — síncrono
setQueue(...)
setPhase('graded')
// await depois
const updated = await schedule(...)
```

Quando precisar de sincronia entre múltiplos setters, faça-os antes do
primeiro `await`.

### 15.2 Imports no topo

TypeScript permite imports mid-file. **Vite/Vite-plugin-electron NÃO** —
imports fora do topo do arquivo geram erros "Failed to resolve module"
opacos. Regra: TODO import sempre nas primeiras linhas.

### 15.3 Listeners de teclado globais

Várias páginas registram `window.addEventListener('keydown', ...)` para
atalhos. **Sempre cheque** o foco antes de agir:

```ts
const el = document.activeElement
if (el instanceof HTMLInputElement) return
if (el instanceof HTMLTextAreaElement) return
if (el?.getAttribute('contenteditable') === 'true') return
```

Senão um aluno digitando no editor dispara "Errei" sem querer.

### 15.4 Mount animations e scrollHeight

`framer-motion` com `initial={{ y: N }}` cria `transform: translateY(Npx)`
durante o mount. Em listas grandes (DeckPage com 20+ cartões), o
scrollHeight do `<main>` é inflado pelos transforms e o
Chromium/Electron deixa o container "scrollável" mesmo depois da
animação acabar.

**Cura**: animação de mount **só com opacity**, sem translate. Há comentário
extenso em `FlashcardCard.tsx` sobre isso.

### 15.5 ConfirmModal e useConfirm()

Confirmações destrutivas (deletar deck, deletar cartão, importar global)
**sempre** usam `useConfirm()` em vez de `window.confirm()`. O hook
abre um modal estilizado, retorna Promise<boolean>, e respeita o tema.

### 15.6 Migrações Dexie

São **aditivas**. Cada `this.version(N).stores({...})` define o schema
para a versão N; Dexie infere a migração. Para mudanças que precisam
transformar dados existentes, use `.upgrade(async tx => { ... })`.

**Regra**: nunca remova uma tabela ou um índice em uma versão nova sem
um plano de migração. E nunca renomeie campos sem upgrade callback.

### 15.7 Export/import e schemaVersion

`QuantaExport.schemaVersion` indica o formato. Mudanças incompatíveis no
formato devem incrementar essa versão e ter handler de leitura para
versões anteriores. Hoje está em 3.

---

## 16. Onde olhar primeiro

Para alguém entrando no código:

1. `App.tsx` — rotas e shell.
2. `db/database.ts` — todas as entidades, schema, defaults.
3. `scheduler/scheduler.ts` — coração do algoritmo de SR.
4. `pages/ReviewPage.tsx` — fluxo principal de uso.
5. `components/InteractiveCardBody.tsx` — onde tipos de cartão diferentes
   se diferenciam.
6. `utils/cloze.ts` + `utils/reviewItems.ts` — multi-cloze.
7. `styles/index.css` — tokens de tema (entender antes de mexer em UI).

E os documentos próximos: [`README.md`](README.md), [`ROADMAP.md`](ROADMAP.md),
[`CHANGELOG.md`](CHANGELOG.md), [`CONTRIBUTING.md`](CONTRIBUTING.md).
