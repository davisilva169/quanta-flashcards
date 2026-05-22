# Roadmap do Quanta

Visão do que vem pela frente, organizado por horizonte de tempo e prioridade.
Este documento é vivo — itens entram, saem e mudam de prioridade conforme o
projeto evolui.

Convenções:

- **Curto prazo**: já em planejamento concreto, próximos releases.
- **Médio prazo**: decidido como caminho, sem data definida.
- **Longo prazo**: visão de futuro, ainda em aberto.

---

## Curto prazo

### Distribuição

- **Instalador Windows polido.** Ícone próprio, NSIS configurado com nome
  e atalhos corretos, smoke test em máquina limpa, documentação de
  instalação no README, instruções sobre SmartScreen quando o binário
  não estiver assinado.
- **Versão portátil** (`.exe` único sem instalação) gerada junto com o
  instalador NSIS.
- **Documentar persistência local.** Onde o IndexedDB do app instalado
  vive (`%APPDATA%/Quanta/IndexedDB/` no Windows), como exportar
  backup antes de atualizações grandes.

### Documentação

- `ARCHITECTURE.md` — guia técnico do código: stack, pastas, modelo de
  dados, scheduler, attachments, multi-cloze, import/export, pontos
  sensíveis.
- `CONTRIBUTING.md` — fluxo de desenvolvimento, padrões, cuidados com
  migrations Dexie e import/export.
- Templates de Issue e Pull Request no GitHub.
- Screenshots do app em uso (Home, DeckPage, ReviewPage, Foco).

### Sync — projeto técnico

- Documento `docs/sync-design.md` com a arquitetura proposta antes de
  qualquer implementação. Inclui modelo de tombstones, plano de
  migração para UUID, estratégia para attachments e ReviewLogs,
  comparativo final de backends.
- **Não há implementação de sync planejada nesta fase**, apenas o
  projeto técnico.

---

## Médio prazo

### Sync em nuvem (implementação)

Faseado, começando do menos arriscado:

1. **Fase 0 — Preparação local.**
   - Adicionar `deletedAt?: number` opcional em entities mutáveis.
   - Soft delete + purga física depois de N dias.
   - Migrar gradualmente IDs para UUID v4 (novos cartões; antigos
     permanecem).
   - `updatedAt` nas poucas entities que ainda não têm.
2. **Fase 1 — Conta opcional.** Tela de login/sync, usuário escolhe
   ativar. App continua 100% funcional sem login.
3. **Fase 2 — Backup remoto manual.** Upload/download do JSON
   completo (mesmo formato do export atual) para object storage.
   Sem sync automático, sem conflitos. Provedor a definir (Supabase
   Storage, Cloudflare R2, ou similar).
4. **Fase 3 — Sync incremental.** Mudanças locais sobem; mudanças
   remotas baixam. Last-write-wins onde for seguro, marca d'água
   para ReviewLogs.
5. **Fase 4 — Conflitos e mídia.** Resolução fina onde
   last-write-wins não basta. Upload de attachments separado da
   metadata. Deduplicação por hash.

### Polimentos da revisão

- **Rush com multi-cloze completo.** Hoje o Rush mostra apenas a
  primeira chave (`c1`) de cartões multi-cloze e exibe aviso para o
  usuário. Estender o Rush para gerar items por chave, igual à
  revisão normal.
- **HomePage e Stats por item, não por Flashcard.** Cartões
  multi-cloze com várias chaves vencidas hoje contam como `1` na
  HomePage; deveriam contar como `N`.
- **Som ao fim do timer da Sessão de Foco.** Notificação sonora
  opcional configurável.
- **Click em notificação navegar.** Hoje a notificação só foca a
  janela; deveria abrir o deck correspondente.
- **Filtros avançados na DeckPage.** Filtrar cartões por estado, por
  data, por categoria, por última nota. Útil em decks grandes.

### Outros

- **Zoom in/out global.** Atalho de teclado para escalar todo o app,
  útil em monitores de alta densidade.
- **Refinamentos do parser de cloze.** Sintaxe estendida (ex: dicas
  com markdown interno), reordenação por drag.

---

## Longo prazo

### Plataformas

- **App mobile.** iOS e Android via React Native ou framework
  similar. Reutiliza o modelo de dados (Postgres ou similar como
  fonte da verdade após sync), com cliente nativo enxuto. Vai
  depender da arquitetura de sync escolhida.
- **Auto-update.** O instalador NSIS atual não suporta atualização
  automática. Configurar `electron-updater` apontando para GitHub
  Releases ou outro provedor.
- **Assinatura digital Windows.** Comprar certificado code-signing
  para eliminar o aviso do SmartScreen na primeira execução.
  Importante para distribuição mais ampla.

### Áudio / TTS

- **Provedores externos de TTS.** Hoje a narração usa a Web Speech
  API do Chromium, que tem qualidade variável. Integrar com
  ElevenLabs, Azure Speech, ou Google Cloud TTS como opções.
- **Geração em lote de áudio.** Botão "Gerar narração para todo o
  baralho" — útil para revisar com fones sem ter que digitar nada.
- **Cache de áudio gerado.** Para TTS pago, evitar regenerar o
  mesmo cartão. Hash do texto + voz + provedor como chave.

### Comunidade

- **Marketplace / compartilhamento de decks.** Repositório público
  de baralhos exportados (formato JSON atual já é portável). Pode
  ser via GitHub gist público inicialmente, depois um serviço
  dedicado.
- **GitHub Actions para release.** Workflow que, em push de tag
  `v*`, roda `npm run dist:win` (e linux/mac) em runners
  apropriados e anexa os binários ao GitHub Release automaticamente.

---

## Em estudo, sem prioridade definida

- Tema customizado pelo usuário (paleta de cores própria).
- Estatísticas comparativas entre baralhos.
- Exportar estatísticas como PDF ou imagem para compartilhar.
- Modo "estudar com colega" (sessão sincronizada entre dois
  dispositivos para revisão em dupla).
- Lembretes inteligentes baseados em fadiga (sugerir parar quando
  taxa de acerto cai muito numa sessão).
- Webhook para integração com Notion/Obsidian (exportar progresso).

---

## Concluído

Visão geral do que já foi entregue está no [CHANGELOG.md](CHANGELOG.md).
