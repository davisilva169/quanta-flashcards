/**
 * LaTeX shortcut catalog.
 *
 * Each shortcut carries:
 *   - `preview`:      LaTeX rendered in the button itself (so users see
 *                     what they'll get).
 *   - `insert`:       raw text inserted into the textarea (no math
 *                     delimiters — the inserter adds `$$ … $$` or `$ … $`
 *                     based on context).
 *   - `cursorOffset`: where to place the cursor *inside the insert string*
 *                     (relative to its start). Use the position of the
 *                     first empty `{}` so users can type the argument.
 *   - `block`:        true for display math; the inserter wraps with
 *                     `$$ … $$`. Otherwise it wraps with `$ … $`.
 *   - `wrap?`:        optional function. If the user has selected text
 *                     and clicks this shortcut, wrap returns a custom
 *                     insert that contains the selection.
 *
 * Note: inline wrapping uses `$ … $` (Markdown-friendly single dollar) —
 * react-markdown + remark-math renders `$x^2$` correctly inline; the
 * `\( … \)` form does NOT render reliably in this pipeline.
 */

export type ShortcutGroup =
  | 'estrutura'
  | 'operadores'
  | 'relacoes'
  | 'logica'
  | 'gregas'
  | 'gregas_maiusc'
  | 'funcoes'
  | 'matrizes'
  | 'conjuntos'
  | 'fisica';

export interface LatexShortcut {
  label: string;
  preview: string;
  insert: string;
  cursorOffset: number;
  block: boolean;
  group: ShortcutGroup;
  wrap?: (selection: string) => { insert: string; cursorOffset: number };
}

export const LATEX_SHORTCUTS: LatexShortcut[] = [
  // ─── Estrutura ────────────────────────────────────────────────────────────
  { label: 'Fração',               preview: '\\frac{a}{b}',          insert: '\\frac{}{}',          cursorOffset: 6,  block: true,  group: 'estrutura',
    wrap: sel => ({ insert: `\\frac{${sel}}{}`, cursorOffset: 7 + sel.length }) },
  { label: 'Raiz',                 preview: '\\sqrt{x}',             insert: '\\sqrt{}',            cursorOffset: 6,  block: true,  group: 'estrutura',
    wrap: sel => ({ insert: `\\sqrt{${sel}}`, cursorOffset: 6 + sel.length + 1 }) },
  { label: 'Raiz n-ésima',         preview: '\\sqrt[n]{x}',          insert: '\\sqrt[]{}',          cursorOffset: 6,  block: true,  group: 'estrutura' },
  { label: 'Expoente',             preview: 'a^{b}',                 insert: '^{}',                 cursorOffset: 2,  block: false, group: 'estrutura',
    wrap: sel => ({ insert: `^{${sel}}`, cursorOffset: 2 + sel.length + 1 }) },
  { label: 'Subscrito',            preview: 'a_{b}',                 insert: '_{}',                 cursorOffset: 2,  block: false, group: 'estrutura',
    wrap: sel => ({ insert: `_{${sel}}`, cursorOffset: 2 + sel.length + 1 }) },
  { label: 'Sub e Sup',            preview: 'a_{i}^{j}',             insert: '_{}^{}',              cursorOffset: 2,  block: false, group: 'estrutura' },
  { label: 'Vetor',                preview: '\\vec{v}',              insert: '\\vec{}',             cursorOffset: 5,  block: false, group: 'estrutura',
    wrap: sel => ({ insert: `\\vec{${sel}}`, cursorOffset: 5 + sel.length + 1 }) },
  { label: 'Chapéu',               preview: '\\hat{H}',              insert: '\\hat{}',             cursorOffset: 5,  block: false, group: 'estrutura',
    wrap: sel => ({ insert: `\\hat{${sel}}`, cursorOffset: 5 + sel.length + 1 }) },
  { label: 'Til',                  preview: '\\tilde{x}',            insert: '\\tilde{}',           cursorOffset: 7,  block: false, group: 'estrutura' },
  { label: 'Barra',                preview: '\\bar{x}',              insert: '\\bar{}',             cursorOffset: 5,  block: false, group: 'estrutura' },
  { label: 'Ponto',                preview: '\\dot{x}',              insert: '\\dot{}',             cursorOffset: 5,  block: false, group: 'estrutura' },
  { label: 'Dois pontos',          preview: '\\ddot{x}',             insert: '\\ddot{}',            cursorOffset: 6,  block: false, group: 'estrutura' },
  { label: 'Sobrelinha',           preview: '\\overline{ABC}',       insert: '\\overline{}',        cursorOffset: 10, block: false, group: 'estrutura' },
  { label: 'Sublinha',             preview: '\\underline{x}',        insert: '\\underline{}',       cursorOffset: 11, block: false, group: 'estrutura' },
  { label: 'Chave por cima',       preview: '\\overbrace{x+y}^{n}',  insert: '\\overbrace{}^{}',    cursorOffset: 11, block: true,  group: 'estrutura' },
  { label: 'Chave por baixo',      preview: '\\underbrace{x+y}_{n}', insert: '\\underbrace{}_{}',   cursorOffset: 12, block: true,  group: 'estrutura' },
  { label: 'Parênteses grandes',   preview: '\\left( x \\right)',    insert: '\\left( \\right)',    cursorOffset: 7,  block: false, group: 'estrutura',
    wrap: sel => ({ insert: `\\left( ${sel} \\right)`, cursorOffset: 7 + sel.length + 8 }) },
  { label: 'Colchetes grandes',    preview: '\\left[ x \\right]',    insert: '\\left[ \\right]',    cursorOffset: 7,  block: false, group: 'estrutura' },
  { label: 'Chaves grandes',       preview: '\\left\\{ x \\right\\}', insert: '\\left\\{ \\right\\}', cursorOffset: 8, block: false, group: 'estrutura' },

  // ─── Operadores ────────────────────────────────────────────────────────────
  { label: 'Somatório',            preview: '\\sum_{i}^{n}',         insert: '\\sum_{}^{}',         cursorOffset: 6,  block: true,  group: 'operadores' },
  { label: 'Produtório',           preview: '\\prod_{i}^{n}',        insert: '\\prod_{}^{}',        cursorOffset: 7,  block: true,  group: 'operadores' },
  { label: 'Integral',             preview: '\\int_{a}^{b}',         insert: '\\int_{}^{}',         cursorOffset: 6,  block: true,  group: 'operadores' },
  { label: 'Integral fechada',     preview: '\\oint',                insert: '\\oint ',             cursorOffset: 6,  block: true,  group: 'operadores' },
  { label: 'Integral dupla',       preview: '\\iint',                insert: '\\iint ',             cursorOffset: 6,  block: true,  group: 'operadores' },
  { label: 'Integral tripla',      preview: '\\iiint',               insert: '\\iiint ',            cursorOffset: 7,  block: true,  group: 'operadores' },
  { label: 'Limite',               preview: '\\lim_{x\\to 0}',       insert: '\\lim_{ \\to }',      cursorOffset: 6,  block: true,  group: 'operadores' },
  { label: 'Parcial',              preview: '\\partial',             insert: '\\partial ',          cursorOffset: 9,  block: false, group: 'operadores' },
  { label: 'Nabla',                preview: '\\nabla',               insert: '\\nabla ',            cursorOffset: 7,  block: false, group: 'operadores' },
  { label: 'Derivada',             preview: '\\frac{d}{dx}',         insert: '\\frac{d}{d}',        cursorOffset: 12, block: true,  group: 'operadores' },
  { label: 'Derivada parcial',     preview: '\\frac{\\partial}{\\partial x}', insert: '\\frac{\\partial }{\\partial }', cursorOffset: 16, block: true, group: 'operadores' },
  { label: 'Infinito',             preview: '\\infty',               insert: '\\infty ',            cursorOffset: 7,  block: false, group: 'operadores' },
  { label: 'Mais ou menos',        preview: '\\pm',                  insert: '\\pm ',               cursorOffset: 4,  block: false, group: 'operadores' },
  { label: 'Vezes (ponto)',        preview: 'a \\cdot b',            insert: '\\cdot ',             cursorOffset: 6,  block: false, group: 'operadores' },
  { label: 'Vezes (×)',            preview: 'a \\times b',           insert: '\\times ',            cursorOffset: 7,  block: false, group: 'operadores' },
  { label: 'Divisão',              preview: 'a \\div b',             insert: '\\div ',              cursorOffset: 5,  block: false, group: 'operadores' },
  { label: 'Composição',           preview: 'f \\circ g',            insert: '\\circ ',             cursorOffset: 6,  block: false, group: 'operadores' },

  // ─── Relações ──────────────────────────────────────────────────────────────
  { label: 'Aproximadamente',      preview: '\\approx',              insert: '\\approx ',           cursorOffset: 8,  block: false, group: 'relacoes' },
  { label: 'Equivalente',          preview: '\\equiv',               insert: '\\equiv ',            cursorOffset: 7,  block: false, group: 'relacoes' },
  { label: 'Diferente',            preview: '\\neq',                 insert: '\\neq ',              cursorOffset: 5,  block: false, group: 'relacoes' },
  { label: 'Menor ou igual',       preview: '\\leq',                 insert: '\\leq ',              cursorOffset: 5,  block: false, group: 'relacoes' },
  { label: 'Maior ou igual',       preview: '\\geq',                 insert: '\\geq ',              cursorOffset: 5,  block: false, group: 'relacoes' },
  { label: 'Muito menor',          preview: '\\ll',                  insert: '\\ll ',               cursorOffset: 4,  block: false, group: 'relacoes' },
  { label: 'Muito maior',          preview: '\\gg',                  insert: '\\gg ',               cursorOffset: 4,  block: false, group: 'relacoes' },
  { label: 'Proporcional',         preview: '\\propto',              insert: '\\propto ',           cursorOffset: 8,  block: false, group: 'relacoes' },
  { label: 'Para',                 preview: '\\to',                  insert: '\\to ',               cursorOffset: 4,  block: false, group: 'relacoes' },
  { label: 'Mapeia',               preview: '\\mapsto',              insert: '\\mapsto ',           cursorOffset: 8,  block: false, group: 'relacoes' },
  { label: 'Implica',              preview: '\\Rightarrow',          insert: '\\Rightarrow ',       cursorOffset: 12, block: false, group: 'relacoes' },
  { label: 'Bicondicional',        preview: '\\Leftrightarrow',      insert: '\\Leftrightarrow ',   cursorOffset: 16, block: false, group: 'relacoes' },
  { label: 'Esquerda',             preview: '\\leftarrow',           insert: '\\leftarrow ',        cursorOffset: 11, block: false, group: 'relacoes' },
  { label: 'Bidirecional',         preview: '\\leftrightarrow',      insert: '\\leftrightarrow ',   cursorOffset: 16, block: false, group: 'relacoes' },

  // ─── Lógica e conjuntos ───────────────────────────────────────────────────
  { label: 'Para todo',            preview: '\\forall',              insert: '\\forall ',           cursorOffset: 8,  block: false, group: 'logica' },
  { label: 'Existe',               preview: '\\exists',              insert: '\\exists ',           cursorOffset: 8,  block: false, group: 'logica' },
  { label: 'Não',                  preview: '\\neg',                 insert: '\\neg ',              cursorOffset: 5,  block: false, group: 'logica' },
  { label: 'E (lógico)',           preview: '\\land',                insert: '\\land ',             cursorOffset: 6,  block: false, group: 'logica' },
  { label: 'Ou (lógico)',          preview: '\\lor',                 insert: '\\lor ',              cursorOffset: 5,  block: false, group: 'logica' },
  { label: 'Pertence',             preview: '\\in',                  insert: '\\in ',               cursorOffset: 4,  block: false, group: 'logica' },
  { label: 'Não pertence',         preview: '\\notin',               insert: '\\notin ',            cursorOffset: 7,  block: false, group: 'logica' },
  { label: 'Subconjunto',          preview: '\\subset',              insert: '\\subset ',           cursorOffset: 8,  block: false, group: 'logica' },
  { label: 'Subconj. ou igual',    preview: '\\subseteq',            insert: '\\subseteq ',         cursorOffset: 10, block: false, group: 'logica' },
  { label: 'União',                preview: '\\cup',                 insert: '\\cup ',              cursorOffset: 5,  block: false, group: 'logica' },
  { label: 'Interseção',           preview: '\\cap',                 insert: '\\cap ',              cursorOffset: 5,  block: false, group: 'logica' },
  { label: 'Vazio',                preview: '\\emptyset',            insert: '\\emptyset ',         cursorOffset: 10, block: false, group: 'logica' },

  // ─── Gregas minúsculas ────────────────────────────────────────────────────
  { label: 'α', preview: '\\alpha',   insert: '\\alpha ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'β', preview: '\\beta',    insert: '\\beta ',    cursorOffset: 6,  block: false, group: 'gregas' },
  { label: 'γ', preview: '\\gamma',   insert: '\\gamma ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'δ', preview: '\\delta',   insert: '\\delta ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'ε', preview: '\\epsilon', insert: '\\epsilon ', cursorOffset: 9,  block: false, group: 'gregas' },
  { label: 'ϵ', preview: '\\varepsilon', insert: '\\varepsilon ', cursorOffset: 12, block: false, group: 'gregas' },
  { label: 'ζ', preview: '\\zeta',    insert: '\\zeta ',    cursorOffset: 6,  block: false, group: 'gregas' },
  { label: 'η', preview: '\\eta',     insert: '\\eta ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'θ', preview: '\\theta',   insert: '\\theta ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'ϑ', preview: '\\vartheta', insert: '\\vartheta ', cursorOffset: 10, block: false, group: 'gregas' },
  { label: 'ι', preview: '\\iota',    insert: '\\iota ',    cursorOffset: 6,  block: false, group: 'gregas' },
  { label: 'κ', preview: '\\kappa',   insert: '\\kappa ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'λ', preview: '\\lambda',  insert: '\\lambda ',  cursorOffset: 8,  block: false, group: 'gregas' },
  { label: 'μ', preview: '\\mu',      insert: '\\mu ',      cursorOffset: 4,  block: false, group: 'gregas' },
  { label: 'ν', preview: '\\nu',      insert: '\\nu ',      cursorOffset: 4,  block: false, group: 'gregas' },
  { label: 'ξ', preview: '\\xi',      insert: '\\xi ',      cursorOffset: 4,  block: false, group: 'gregas' },
  { label: 'π', preview: '\\pi',      insert: '\\pi ',      cursorOffset: 4,  block: false, group: 'gregas' },
  { label: 'ρ', preview: '\\rho',     insert: '\\rho ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'σ', preview: '\\sigma',   insert: '\\sigma ',   cursorOffset: 7,  block: false, group: 'gregas' },
  { label: 'τ', preview: '\\tau',     insert: '\\tau ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'υ', preview: '\\upsilon', insert: '\\upsilon ', cursorOffset: 9,  block: false, group: 'gregas' },
  { label: 'φ', preview: '\\phi',     insert: '\\phi ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'ϕ', preview: '\\varphi',  insert: '\\varphi ',  cursorOffset: 8,  block: false, group: 'gregas' },
  { label: 'χ', preview: '\\chi',     insert: '\\chi ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'ψ', preview: '\\psi',     insert: '\\psi ',     cursorOffset: 5,  block: false, group: 'gregas' },
  { label: 'ω', preview: '\\omega',   insert: '\\omega ',   cursorOffset: 7,  block: false, group: 'gregas' },

  // ─── Gregas maiúsculas ────────────────────────────────────────────────────
  { label: 'Γ', preview: '\\Gamma',   insert: '\\Gamma ',   cursorOffset: 7,  block: false, group: 'gregas_maiusc' },
  { label: 'Δ', preview: '\\Delta',   insert: '\\Delta ',   cursorOffset: 7,  block: false, group: 'gregas_maiusc' },
  { label: 'Θ', preview: '\\Theta',   insert: '\\Theta ',   cursorOffset: 7,  block: false, group: 'gregas_maiusc' },
  { label: 'Λ', preview: '\\Lambda',  insert: '\\Lambda ',  cursorOffset: 8,  block: false, group: 'gregas_maiusc' },
  { label: 'Ξ', preview: '\\Xi',      insert: '\\Xi ',      cursorOffset: 4,  block: false, group: 'gregas_maiusc' },
  { label: 'Π', preview: '\\Pi',      insert: '\\Pi ',      cursorOffset: 4,  block: false, group: 'gregas_maiusc' },
  { label: 'Σ', preview: '\\Sigma',   insert: '\\Sigma ',   cursorOffset: 7,  block: false, group: 'gregas_maiusc' },
  { label: 'Υ', preview: '\\Upsilon', insert: '\\Upsilon ', cursorOffset: 9,  block: false, group: 'gregas_maiusc' },
  { label: 'Φ', preview: '\\Phi',     insert: '\\Phi ',     cursorOffset: 5,  block: false, group: 'gregas_maiusc' },
  { label: 'Ψ', preview: '\\Psi',     insert: '\\Psi ',     cursorOffset: 5,  block: false, group: 'gregas_maiusc' },
  { label: 'Ω', preview: '\\Omega',   insert: '\\Omega ',   cursorOffset: 7,  block: false, group: 'gregas_maiusc' },

  // ─── Funções ──────────────────────────────────────────────────────────────
  { label: 'sin', preview: '\\sin',   insert: '\\sin ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'cos', preview: '\\cos',   insert: '\\cos ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'tan', preview: '\\tan',   insert: '\\tan ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'sec', preview: '\\sec',   insert: '\\sec ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'csc', preview: '\\csc',   insert: '\\csc ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'cot', preview: '\\cot',   insert: '\\cot ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'ln',  preview: '\\ln',    insert: '\\ln ',      cursorOffset: 4,  block: false, group: 'funcoes' },
  { label: 'log', preview: '\\log',   insert: '\\log ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'exp', preview: '\\exp',   insert: '\\exp ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'det', preview: '\\det',   insert: '\\det ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'tr',  preview: '\\operatorname{tr}', insert: '\\operatorname{tr} ', cursorOffset: 18, block: false, group: 'funcoes' },
  { label: 'max', preview: '\\max',   insert: '\\max ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'min', preview: '\\min',   insert: '\\min ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'sup', preview: '\\sup',   insert: '\\sup ',     cursorOffset: 5,  block: false, group: 'funcoes' },
  { label: 'inf', preview: '\\inf',   insert: '\\inf ',     cursorOffset: 5,  block: false, group: 'funcoes' },

  // ─── Matrizes / ambientes ─────────────────────────────────────────────────
  // Why `block: false` (single `$...$` instead of `$$...$$`):
  //   The `react-markdown + remark-math` pipeline does not parse
  //   multi-line `$$...$$` as a single math block when `$$` is not on
  //   its own line — it bails on the first `\` it doesn't understand.
  //   Wrapping the same multi-line content in `$...$` keeps it as one
  //   inline math expression, which KaTeX then renders as a real matrix.
  //   The visual difference inline-vs-display for matrices is negligible.
  //
  // Previews are intentionally minimal (single-line symbolic hints) so
  // they fit the 48px-tall button without clipping. The label below the
  // preview ("Matriz ( )", "Casos", etc.) carries the full meaning.
  { label: 'Matriz ( )',  preview: '\\bigl(\\;\\bigr)',
    insert: '\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}', cursorOffset: 17, block: false, group: 'matrizes' },
  { label: 'Matriz [ ]',  preview: '\\bigl[\\;\\bigr]',
    insert: '\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}', cursorOffset: 17, block: false, group: 'matrizes' },
  { label: 'Determinante',preview: '\\bigl|\\;\\bigr|',
    insert: '\\begin{vmatrix}\n  a & b \\\\\n  c & d\n\\end{vmatrix}', cursorOffset: 17, block: false, group: 'matrizes' },
  { label: 'Casos',       preview: '\\bigl\\{\\;\\bigr.',
    insert: '\\begin{cases}\n   & \\text{se } \\\\\n   & \\text{caso contrário}\n\\end{cases}', cursorOffset: 16, block: false, group: 'matrizes' },
  { label: 'Sistema',     preview: 'a\\!=\\!b',
    insert: '\\begin{aligned}\n  &= \\\\\n  &=\n\\end{aligned}', cursorOffset: 16, block: false, group: 'matrizes' },

  // ─── Conjuntos numéricos / símbolos especiais ─────────────────────────────
  { label: 'ℝ', preview: '\\mathbb{R}',   insert: '\\mathbb{R} ',   cursorOffset: 11, block: false, group: 'conjuntos' },
  { label: 'ℂ', preview: '\\mathbb{C}',   insert: '\\mathbb{C} ',   cursorOffset: 11, block: false, group: 'conjuntos' },
  { label: 'ℤ', preview: '\\mathbb{Z}',   insert: '\\mathbb{Z} ',   cursorOffset: 11, block: false, group: 'conjuntos' },
  { label: 'ℕ', preview: '\\mathbb{N}',   insert: '\\mathbb{N} ',   cursorOffset: 11, block: false, group: 'conjuntos' },
  { label: 'ℚ', preview: '\\mathbb{Q}',   insert: '\\mathbb{Q} ',   cursorOffset: 11, block: false, group: 'conjuntos' },
  { label: 'cal Z', preview: '\\mathcal{Z}', insert: '\\mathcal{Z} ', cursorOffset: 12, block: false, group: 'conjuntos' },
  { label: 'cal H', preview: '\\mathcal{H}', insert: '\\mathcal{H} ', cursorOffset: 12, block: false, group: 'conjuntos' },
  { label: 'cal L', preview: '\\mathcal{L}', insert: '\\mathcal{L} ', cursorOffset: 12, block: false, group: 'conjuntos' },

  // ─── Física ───────────────────────────────────────────────────────────────
  { label: 'ℏ',           preview: '\\hbar',                  insert: '\\hbar ',          cursorOffset: 6,  block: false, group: 'fisica' },
  { label: 'k_B',         preview: 'k_B',                     insert: 'k_B ',             cursorOffset: 4,  block: false, group: 'fisica' },
  { label: 'k_BT',        preview: 'k_B T',                   insert: 'k_B T ',           cursorOffset: 6,  block: false, group: 'fisica' },
  { label: 'Hamiltoniano',preview: '\\hat{H}',                insert: '\\hat{H} ',        cursorOffset: 8,  block: false, group: 'fisica' },
  { label: 'Bra',         preview: '\\langle \\psi |',        insert: '\\langle | ',      cursorOffset: 8,  block: false, group: 'fisica' },
  { label: 'Ket',         preview: '| \\psi \\rangle',        insert: '| \\rangle ',      cursorOffset: 2,  block: false, group: 'fisica' },
  { label: 'Braket',      preview: '\\langle\\phi|\\psi\\rangle', insert: '\\langle | \\rangle ', cursorOffset: 8, block: false, group: 'fisica' },
  { label: 'Valor médio', preview: '\\langle A \\rangle',     insert: '\\langle  \\rangle ', cursorOffset: 8, block: false, group: 'fisica' },
  { label: 'Adaga',       preview: 'A^{\\dagger}',            insert: '^{\\dagger} ',     cursorOffset: 11, block: false, group: 'fisica' },
  { label: 'Divergente',  preview: '\\nabla \\cdot \\vec{F}', insert: '\\nabla \\cdot ',  cursorOffset: 13, block: false, group: 'fisica' },
  { label: 'Rotacional',  preview: '\\nabla \\times \\vec{F}',insert: '\\nabla \\times ', cursorOffset: 14, block: false, group: 'fisica' },
  { label: 'Laplaciano',  preview: '\\nabla^{2}',             insert: '\\nabla^{2} ',     cursorOffset: 11, block: false, group: 'fisica' },
  { label: '∂_t',         preview: '\\partial_{t}',           insert: '\\partial_{t} ',   cursorOffset: 13, block: false, group: 'fisica' },
  { label: '∂_x',         preview: '\\partial_{x}',           insert: '\\partial_{x} ',   cursorOffset: 13, block: false, group: 'fisica' },
];

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  estrutura: 'Estrutura',
  operadores: 'Operadores',
  relacoes: 'Relações',
  logica: 'Lógica',
  gregas: 'Grega min.',
  gregas_maiusc: 'Grega MAI.',
  funcoes: 'Funções',
  matrizes: 'Matrizes',
  conjuntos: 'Conjuntos',
  fisica: 'Física',
};

export const GROUP_ORDER: ShortcutGroup[] = [
  'estrutura',
  'operadores',
  'relacoes',
  'logica',
  'gregas',
  'gregas_maiusc',
  'funcoes',
  'matrizes',
  'conjuntos',
  'fisica',
];

// ─────────────────────────────────────────────────────────────────────────────
// Smart insertion
//
// Wraps with delimiters based on the current context:
//   - If the cursor is already inside math (between `$$ … $$` or `$ … $`),
//     no extra delimiters.
//   - Otherwise: `$$ … $$` for a block shortcut, `$ … $` for an inline one.
//
// The single-dollar form is what react-markdown + remark-math actually
// renders; `\( … \)` does not pass through the Markdown pipeline reliably.
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertionResult {
  text: string;
  cursor: number;
}

/**
 * Returns true if `cursor` sits inside an unclosed math block / inline run.
 *
 * The scanner walks the prefix character by character:
 *   - `\X` is treated as an escaped pair (skip 2). Notably, `\$` is a
 *     literal dollar sign and does not toggle math state.
 *   - `$$` toggles block-math state.
 *   - A lone `$` (not part of `$$`) toggles inline-math state, but only
 *     when not currently inside a block — block math is not cancelled by a
 *     stray `$`.
 */
export function isCursorInsideMath(value: string, cursor: number): boolean {
  const before = value.slice(0, cursor);
  let i = 0;
  let blockOpen = false;
  let inlineOpen = false;
  while (i < before.length) {
    if (before[i] === '\\' && i + 1 < before.length) {
      // Escaped pair — skip both chars (covers \$, \\ , etc.)
      i += 2;
      continue;
    }
    if (before[i] === '$' && before[i + 1] === '$') {
      blockOpen = !blockOpen;
      i += 2;
      continue;
    }
    if (before[i] === '$' && !blockOpen) {
      inlineOpen = !inlineOpen;
      i += 1;
      continue;
    }
    i += 1;
  }
  return blockOpen || inlineOpen;
}

export function insertShortcut(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  shortcut: LatexShortcut,
): InsertionResult {
  const selection = value.slice(selectionStart, selectionEnd);
  const inMath = isCursorInsideMath(value, selectionStart);

  // 1. Build raw insertion (selection-aware if a wrap fn was supplied)
  let insertText: string;
  let cursorOffset: number;
  if (selection.length > 0 && shortcut.wrap) {
    const wrapped = shortcut.wrap(selection);
    insertText = wrapped.insert;
    cursorOffset = wrapped.cursorOffset;
  } else {
    insertText = shortcut.insert;
    cursorOffset = shortcut.cursorOffset;
  }

  // 2. Decide delimiters
  let prefix = '';
  let suffix = '';
  if (!inMath) {
    if (shortcut.block) {
      prefix = '$$';
      suffix = '$$';
    } else {
      prefix = '$';
      suffix = '$';
    }
  }

  const fullInsert = prefix + insertText + suffix;
  const newText =
    value.slice(0, selectionStart) + fullInsert + value.slice(selectionEnd);
  const newCursor = selectionStart + prefix.length + cursorOffset;

  return { text: newText, cursor: newCursor };
}
