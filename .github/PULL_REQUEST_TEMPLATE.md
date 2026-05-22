# Pull Request

## O que mudou

<!-- Resumo curto, 1-3 frases. -->

## Por que mudou

<!-- 
Motivação. Link pra issue se houver: "Closes #123" ou "Refs #45". 
Se não tem issue, explique o problema que motivou.
-->

## Como testar

<!-- 
Passos manuais para validar a mudança. Quanto mais explícito, melhor.
Exemplo:

1. Abrir o app
2. Criar deck "Teste"
3. Criar cartão multi-cloze: `{{c1::a}} {{c2::b}}`
4. Revisar e verificar que aparecem 2 itens na fila
-->

## Tipo de mudança

<!-- Marque com x o que se aplica -->

- [ ] 🐛 Bug fix (mudança sem quebrar funcionalidade existente)
- [ ] ✨ Feature (funcionalidade nova)
- [ ] 💥 Breaking change (afeta dados existentes, formato de export,
      ou schema Dexie)
- [ ] 📝 Documentação
- [ ] 🔧 Refator (sem mudança funcional visível)
- [ ] 🎨 Estilo / UI

## Áreas tocadas

<!-- Liste os principais arquivos/módulos afetados. -->

## Riscos / regressões possíveis

<!-- 
O que poderia quebrar? Em que cenários você prestaria atenção? 
Se mexeu em Dexie / export / scheduler, descreva especificamente o
risco.
-->

## Checklist

- [ ] Smoke test rodou sem erro (`npm run dev` + criar/revisar cartões)
- [ ] `npm run build:vite` passou sem erros de TypeScript
- [ ] Testei em tema claro e escuro
- [ ] Atualizei `CHANGELOG.md` (seção `[Não lançado]`)
- [ ] Se for breaking change, descrevi a migração na descrição acima
- [ ] Se mudei `ARCHITECTURE.md`/`README.md`, está consistente com o
      código

## Screenshots / vídeos

<!-- Se a mudança é visual, anexe antes/depois. -->
