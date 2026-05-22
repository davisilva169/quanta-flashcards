# Contribuindo com o Quanta

Obrigado pelo interesse em contribuir. Este documento descreve como
instalar, rodar e propor mudanças no código de forma que tenham boa
chance de serem mescladas.

Antes de tudo, **leia o [ARCHITECTURE.md](ARCHITECTURE.md)**. Sem ele
algumas decisões podem parecer arbitrárias.

---

## Setup de desenvolvimento

### Pré-requisitos

- **Node.js** 18+ (recomendado 20+)
- **npm** (vem com Node)
- Editor com suporte a TypeScript e ESLint (VS Code recomendado)

### Primeira clonagem

```bash
git clone https://github.com/davisilva169/quanta-flashcards.git
cd quanta-flashcards
npm install
npm run dev
```

A janela do Electron deve abrir em poucos segundos. Vite faz HMR — você
edita um arquivo, salva, e a tela atualiza sozinha.

### Scripts disponíveis

| Script | O que faz |
|---|---|
| `npm run dev` | Vite dev server + Electron com HMR |
| `npm run build` | Alias para `build:vite` |
| `npm run build:vite` | `tsc -b && vite build` (produção, sem empacotar) |
| `npm run preview` | Servir `dist/` localmente (debug) |
| `npm run dist` | Build + empacotar para o SO atual |
| `npm run dist:win` | Build + empacotar Windows (NSIS + portable) |
| `npm run dist:linux` | Build + empacotar Linux (AppImage + deb) |
| `npm run dist:mac` | Build + empacotar macOS (DMG) |

**Nunca use `npm audit fix --force`** — várias dependências têm versões
exatas pinadas por motivo. Se houver alerta de segurança que parece
relevante, abra uma issue antes.

---

## Padrões de código

### TypeScript

- **Strict mode** está ligado no `tsconfig.json`. Não use `any` sem
  justificativa em comentário.
- Tipos das entidades estão em `src/types/`. Sempre reutilize, não
  recrie.
- Para reaproveitar shape de uma entidade, prefira `Pick`/`Omit` sobre
  duplicar. Exemplo: `SchedulingState = Pick<Flashcard, 'state' | 'due' | ...>`.

### React

- Componentes funcionais. Sem class components.
- Hooks padrão (`useState`, `useEffect`, `useMemo`, `useCallback`,
  `useRef`). Sem libs externas de estado global — o app é pequeno o
  suficiente pra prop drilling + leitura direta do Dexie.
- Para confirmações destrutivas, use o hook `useConfirm()`
  (`components/ConfirmModal.tsx`). Nunca `window.confirm()`.
- **Imports sempre no topo do arquivo**. Vite trata imports mid-file como
  erro opaco.

### Estilização

- Tudo via classes do Tailwind. **Não escreva CSS inline** exceto quando
  for valor calculado em runtime (transform, percentage de progresso,
  etc.).
- **Sempre use tokens semânticos**, nunca cores literais:
  - ✅ `bg-card`, `text-primary`, `border-subtle`, `bg-accent`,
    `text-on-accent`
  - ❌ `bg-white`, `text-gray-900`, `border-zinc-200`, `bg-indigo-500`
- Lista completa de tokens em [`ARCHITECTURE.md §14`](ARCHITECTURE.md#14-tema-e-tokens-css).
- Mudança de tema (claro/escuro) deve funcionar sem retoques — se você
  precisou escrever uma cor literal, o token correto provavelmente já
  existe.

### Comentários

- Comentários explicam o **porquê**, não o **o quê**. O código já mostra
  o "o quê".
- Decisões não-óbvias merecem comentário extenso. Bugs encontrados
  durante implementação merecem virar uma seção "Gotcha:" no arquivo
  relevante.
- Comentários em **português** ou **inglês** — consistente dentro de um
  arquivo. O projeto hoje mistura — não é ideal, mas tudo bem manter o
  idioma de cada arquivo.

---

## Cuidados específicos

### Migrações Dexie

O schema está em **v4**. Ao adicionar tabelas ou índices:

1. **Sempre aditivo**: adicione uma nova `this.version(N+1).stores({...})`
   com **TODAS** as tabelas anteriores intactas + a tabela nova.
2. **Não remova nem renomeie** campos/tabelas sem um `.upgrade(async tx
   => { ... })` callback que faça a transformação.
3. Após a migração rodar uma vez no banco de um usuário, ela é
   permanente — não dá pra reverter sem refletir nos dados.
4. Faça `ensureInitialized()` em `db/database.ts` populare/backfille
   defaults para entidades novas, lidando com bancos antigos que ainda
   não tinham essas linhas.

Mais detalhes em [`ARCHITECTURE.md §5`](ARCHITECTURE.md#5-modelo-de-dados)
e [§15.6](ARCHITECTURE.md#156-migrações-dexie).

### Formato de export/import

O export é **a fronteira de compatibilidade externa** do app. Mudanças
no formato precisam de cuidado especial:

1. **Mudanças aditivas** (campos novos opcionais): seguras. Bumpa
   `schemaVersion` se quiser, mas não é obrigatório.
2. **Mudanças que renomeiam campos**: requer handler de leitura para
   versões antigas em `readJsonFile()` (`utils/importExport.ts`).
3. **Mudanças destrutivas**: incremente `schemaVersion` e suba a barra
   de aceitação no `readJsonFile()`.

Confirma com export **antes** e **depois** da mudança que o round-trip
ainda funciona em dados existentes.

### Multi-cloze

O parser de cloze (`utils/cloze.ts`) usa state machine, não regex. Se for
mudar:

1. Não substitua por regex — perderá suporte a chaves aninhadas em
   LaTeX.
2. Mudanças no shape de `ClozeMatch` (especialmente `position` e
   `length`) afetam `renderClozeForReview` e o `filledText` do
   `parseCloze`. Garanta que os três continuam coerentes.
3. `parseCloze` (wrapper compat) é mantido por motivo — não delete.
   Cartões com apenas `c1` precisam continuar funcionando
   byte-a-byte iguais.

### Attachments

- Limite de 8 MB por imagem é deliberado (`MAX_IMAGE_BYTES`). Aumentar
  expõe risco de IndexedDB ficar grande.
- `useObjectUrl` cacheia URLs em WeakMap — não revogue do lado do React.
- Cascade delete: deletar cartão deleta attachments. Se você adicionar
  outros lugares que removem cartões, lembre da chamada de cleanup.

### Atalhos de teclado

Atalhos são configuráveis em Configurações → Atalhos
(`utils/shortcuts.ts`). Ao adicionar um atalho novo:

1. Adicione a chave no `ShortcutMap` em `utils/shortcuts.ts`.
2. Adicione o default em `DEFAULT_SHORTCUTS`.
3. Adicione uma label em português pra UI de Settings.
4. **Cheque o foco** antes de executar (input/textarea/contenteditable
   devem ignorar).

---

## Testes manuais

O projeto **não tem suíte de testes automatizados** ainda. Validações
ficam manuais. Antes de submeter PR:

### Smoke test obrigatório

1. Abrir app: `npm run dev`.
2. Criar um deck novo.
3. Criar pelo menos 1 cartão clássico com LaTeX (`$E = mc^2$`) e 1
   cartão cloze (`{{c1::resposta}}`).
4. Anexar uma imagem em algum cartão.
5. Iniciar uma sessão de revisão. Avaliar 3-4 cartões.
6. Verificar que as estatísticas se atualizam (HomePage, Stats).
7. Trocar de tema (claro ↔ escuro). Conferir que nada virou cor errada.
8. Exportar backup global. Confirmar JSON válido.
9. Fechar e reabrir o app. Conferir persistência.

### Quando mexer em código de revisão

Adicione ao smoke test:

- Multi-cloze: criar `{{c1::a}} {{c2::b}}` e confirmar que aparecem 2
  itens na fila.
- Cartão com áudio: anexar `.mp3`, conferir que toca durante a revisão.
- Cartão com narração TTS configurada: ativar, confirmar que fala.
- Modo Rush: rodar uma sessão Rush rápida.
- Sessão de Foco: rodar uma sessão de 2 minutos (configurável). Confirma
  que o resumo aparece.

### Quando mexer em CSS / layout

- Conferir DeckPage com 20+ cartões — sem scroll fantasma.
- Conferir HomePage / Stats em janela pequena (960×640, o `minWidth`).
- Modais (deletar deck, mover deck, lightbox de imagem) abrindo e
  fechando corretamente.
- Tema claro **e** escuro.

---

## Submetendo Pull Request

### Antes de abrir

1. Faça o smoke test relevante (acima).
2. Rode `npm run build:vite` — TypeScript não pode ter erros.
3. Atualize [`CHANGELOG.md`](CHANGELOG.md) na seção `[Não lançado]`
   com uma linha sob `Adicionado`, `Corrigido` ou `Mudado`.
4. Se mudar comportamento documentado, atualize o
   [`README.md`](README.md) ou [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Mensagens de commit

Convenção solta — mensagens em português ou inglês, na voz
imperativa, dizendo **o quê** mudou e **por quê** se não for óbvio:

```
✅ Adicionar populate defensivo de clozeStates em applyRatingResult
✅ Corrigir scroll fantasma da DeckPage (motion.div com y inicial)
✅ Refatorar parser de cloze para state machine (suporte a {})
✅ Bump versão 0.4.0 → 0.5.0

❌ wip
❌ fix
❌ changes
```

Não exigimos Conventional Commits (`feat:`, `fix:`, ...) — é mais
importante a mensagem ser útil.

### Branches

- Trabalhe em uma branch nomeada por feature ou fix:
  `feat/sync-phase0`, `fix/scroll-deckpage`, `docs/contributing`.
- Não trabalhe direto em `main`.

### Descrição do PR

Use o [template de PR](.github/PULL_REQUEST_TEMPLATE.md). No mínimo:

1. **O que mudou** (resumo curto, 1-2 frases).
2. **Por que mudou** (motivação, link pra issue se houver).
3. **Como testar** (passos manuais que você fez).
4. **Riscos** (regressões possíveis, áreas tocadas).

---

## Cuidado com dados do usuário

O Quanta lida com **dados pessoais reais** dos usuários — cartões que
eles criaram, anexos, progresso de estudo de meses. **Cuidado redobrado**
em qualquer mudança que:

- Modifique o schema Dexie.
- Modifique o formato de export.
- Apague registros (mesmo "limpeza" de logs antigos).
- Modifique caminhos de arquivos no electron-builder.

Em PR que toca essas áreas, **inclua um plano de migração explícito** na
descrição. Quando em dúvida, abra uma issue antes de codar.

---

## Reportando bugs

Use [issues](https://github.com/davisilva169/quanta-flashcards/issues)
com o [template de bug](.github/ISSUE_TEMPLATE/bug_report.md). Quanto
mais informação, melhor: versão do app, SO, passos pra reproduzir,
screenshots, e — se você está confortável — um export do deck que
gerou o problema (mas sem dados que você não queira compartilhar).

---

## Propondo features

Use [issues](https://github.com/davisilva169/quanta-flashcards/issues)
com o [template de feature](.github/ISSUE_TEMPLATE/feature_request.md).
Vale checar o [`ROADMAP.md`](ROADMAP.md) primeiro — sua ideia pode já
estar planejada.
