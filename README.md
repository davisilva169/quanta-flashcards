# Quanta

> **Flashcards técnicos com LaTeX, revisão espaçada e progresso real.**

Quanta é um aplicativo desktop para estudo via flashcards, focado em conteúdo
técnico — fórmulas, derivações, conceitos de física, matemática, química,
qualquer disciplina onde notação importa. É **local-first**: roda sem login,
sem internet, e seus dados ficam no seu computador.

[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
[![Versão: 0.5.0](https://img.shields.io/badge/vers%C3%A3o-0.5.0-green.svg)](CHANGELOG.md)
[![Plataforma: Windows · Linux · macOS](https://img.shields.io/badge/plataforma-Windows%20%C2%B7%20Linux%20%C2%B7%20macOS-lightgrey.svg)](#-instala%C3%A7%C3%A3o)

> ⚠️ **Status**: em desenvolvimento ativo. O Quanta é usável para estudo
> diário, mas o formato dos dados e algumas APIs internas ainda podem mudar.
> **Exporte backups com frequência** (veja [Backup e migração](#-backup-e-migra%C3%A7%C3%A3o)).

---

## ✨ Por que Quanta

Os apps de flashcard que existem foram pensados pra texto cru e listas. Quanta
existe porque revisar **fórmulas e derivações** exige um suporte sério:

- **LaTeX renderizado nativamente** com KaTeX, incluindo `\frac`, `\sum`,
  `\int`, matrizes, ambientes de equação.
- **Imagens e áudio** anexados diretamente ao cartão. Diagrama de circuito?
  Cola na frente. Áudio explicando uma derivação? Anexa.
- **Multi-cloze estilo Anki**: um cartão com várias lacunas (`{{c1::...}}`,
  `{{c2::...}}`) vira N revisões independentes, cada uma com seu próprio
  agendamento espaçado. Aceita chaves aninhadas em LaTeX
  (`{{c1::e^{βμ}}}`).
- **Repetição espaçada de verdade**, derivada do SM-2 com snap para um
  rollover diário configurável (estilo Anki) — você não fica com cartões
  "vencendo às 23h" só porque revisou ontem à noite.
- **Sessão de Foco** (Pomodoro) que envolve a revisão: configurar duração,
  meta, e ter um resumo no fim com sugestão de pausa saudável.

---

## 🚀 Funcionalidades

### Estudo

- Cartões clássicos (frente/verso), múltipla escolha, multi-cloze e
  verdadeiro/falso.
- Markdown e LaTeX inline e em bloco.
- Imagens e áudio anexados por cartão (até 8 MB por imagem).
- Narração TTS opcional por cartão (Web Speech API).
- Modo Rush para revisar rapidamente sem aplicar agendamento.
- Atalhos de teclado configuráveis.

### Organização

- Pastas para agrupar baralhos.
- Cores customizadas por pasta.
- Categorias predefinidas e custom para os cartões.

### Acompanhamento

- Estatísticas detalhadas por baralho e globais.
- Taxa de acerto, retenção, distribuição de revisões.
- Heatmap de 14 dias na página da Chama.
- Sistema de XP e Títulos (10 postos hierárquicos).
- Streak diário com indicador visual de chama.

### Sessão de Foco

- Pomodoro integrado à revisão.
- Configura duração da sessão e da pausa.
- Meta opcional (atingir N revisões).
- Termina automaticamente quando a fila de cartões se esgota.
- Resumo com sugestão de pausa saudável (caminhar, beber água, alongar...).

### Notificações

- Lembrete de baralho pronto para revisar (renderer-side).
- Frequência mínima configurável por baralho.
- Janela silenciosa (suporta janela cruzando meia-noite).

### Persistência e portabilidade

- Tudo local em IndexedDB via Dexie.
- Tema claro e escuro completos.
- Export/import completo (backup global em JSON).
- Export/import por baralho (compartilhar conteúdo sem o seu progresso).

---

## 🧰 Stack

- **[Electron](https://www.electronjs.org/)** 32 — empacotamento desktop
- **[React](https://react.dev/)** 18 + **TypeScript** 5
- **[Vite](https://vitejs.dev/)** 7 — bundler e dev server
- **[Tailwind CSS](https://tailwindcss.com/)** 3 — estilização por tokens
- **[Dexie](https://dexie.org/)** 4 — wrapper sobre IndexedDB
- **[KaTeX](https://katex.org/)** — renderização LaTeX
- **[react-markdown](https://github.com/remarkjs/react-markdown)** + remark-math + rehype-katex
- **[framer-motion](https://www.framer.com/motion/)** — animações
- **[lucide-react](https://lucide.dev/)** — ícones

---

## 📋 Requisitos

- **Node.js** 18 ou superior (recomendado 20+).
- **npm** (vem com Node).
- **Windows 10/11**, **macOS** 11+, ou Linux moderno (qualquer distro com
  AppImage ou suporte a `.deb`).

---

## 📦 Instalação

### Para usuários — instalar o app empacotado

Versões oficiais ficam em [Releases](https://github.com/davisilva169/quanta-flashcards/releases).
Baixe o `.exe` (Windows), `.AppImage`/`.deb` (Linux) ou `.dmg` (macOS).

> No Windows, na primeira execução, o **SmartScreen** mostra "Aplicativo não
> reconhecido" porque o binário não tem assinatura digital. Clique em
> **Mais informações → Executar mesmo assim**. Versões futuras serão
> assinadas.

### Para desenvolvedores — rodar a partir do código

```bash
git clone https://github.com/davisilva169/quanta-flashcards.git
cd quanta-flashcards
npm install
npm run dev
```

A janela do Electron deve abrir em alguns segundos com o Vite dev server.

---

## 🔨 Gerar build de produção

### Windows

```bash
npm run dist:win
```

Saída em `release/`:

- `Quanta Setup <versão>.exe` — instalador NSIS
- `Quanta <versão>.exe` — versão portátil (não precisa instalar)

### Linux

```bash
npm run dist:linux
```

Saída em `release/`: AppImage e `.deb`.

### macOS

```bash
npm run dist:mac
```

Saída em `release/`: `.dmg`.

> Builds cruzados (gerar `.exe` em Linux ou vice-versa) podem funcionar mas
> não são oficialmente suportados — gere em cada plataforma quando possível.

---

## 💾 Backup e migração

### Onde ficam os dados

| Sistema | Caminho |
|---|---|
| Windows | `%APPDATA%\Quanta\IndexedDB\` |
| macOS | `~/Library/Application Support/Quanta/IndexedDB/` |
| Linux | `~/.config/Quanta/IndexedDB/` |

Os dados são armazenados localmente em IndexedDB e **nunca saem do seu
computador**, exceto quando você exportar manualmente. Isso inclui cartões,
attachments (imagens/áudio), logs de revisão, configurações.

### Exportar antes de atualizar

> **Importante**: o Quanta está em desenvolvimento ativo. Antes de instalar
> uma nova versão, principalmente versões MINOR/MAJOR, **exporte um backup
> global**.

Em **Configurações → Dados e backup → Backup completo → Exportar**: gera um
JSON único com tudo. Guarde esse arquivo. Se algo der errado, você pode
restaurar com **Importar**.

### Reinstalar / desinstalar / mudar de máquina

- **Reinstalar a mesma versão**: dados preservados (mesmo `productName`).
- **Atualizar para versão nova**: dados preservados *na esmagadora maioria
  dos casos*. Migrações Dexie são aditivas. Mas sempre faça backup antes.
- **Mudar de computador**: instale o Quanta no novo, exporte backup do
  antigo, importe no novo.
- **Desinstalar**: o instalador NSIS pergunta se você quer remover os
  dados do usuário. Por padrão preserva (caminho do APPDATA acima).

---

## 🧪 Status do projeto

O Quanta está em uso real diário para estudo de física. As funcionalidades
principais (revisão espaçada, multi-cloze, attachments, sessão de foco,
import/export) são consideradas estáveis. Algumas áreas ainda em refino:

- Sincronização em nuvem: em projeto técnico, sem implementação ainda.
- App mobile: não existe ainda.
- Assinatura digital do binário: não tem ainda (SmartScreen avisa).

Veja [ROADMAP.md](ROADMAP.md) para o que vem.

Reporte bugs em [Issues](https://github.com/davisilva169/quanta-flashcards/issues).

---

## 🤝 Contribuição

Contribuições são bem-vindas! Antes de abrir PR, leia o
[CONTRIBUTING.md](CONTRIBUTING.md) — em particular as seções sobre cuidado com
migrações Dexie e com o formato de export/import.

---

## 📄 Licença

[MIT](LICENSE) © 2026 Davi dos Santos Silva ([@davisilva169](https://github.com/davisilva169))

---

## 🙏 Agradecimentos

- [KaTeX](https://katex.org/) por uma renderização LaTeX rápida e fiel.
- [Dexie](https://dexie.org/) por tornar IndexedDB usável.
- [Anki](https://apps.ankiweb.net/) pela inspiração — particularmente a
  sintaxe de cloze e o conceito de day-boundary no agendamento.
- [3Blue1Brown](https://www.3blue1brown.com/) e [Kurzgesagt](https://kurzgesagt.org/)
  por mostrarem que ciência pode ser visualmente impecável.
