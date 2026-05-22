import { motion } from 'framer-motion';

/**
 * Chama animada renderizada em SVG.
 *
 * Decisão visual:
 *   - Forma estilizada (não realista) — corpo externo em gradient quente,
 *     corpo interno mais quente, núcleo branco-amarelado. Três paths
 *     sobrepostos com diferentes amplitudes de animação dão a sensação
 *     de movimento orgânico sem custar muito CPU.
 *   - Animação via framer-motion com loops `repeat: Infinity` e easing
 *     "easeInOut". Os timings dos três paths são propositalmente
 *     LIGEIRAMENTE diferentes (1.2s / 1.0s / 1.4s) — quebra a sincronia
 *     mecânica que seria óbvia se tudo pulsasse junto.
 *   - Cor: gradient laranja→amarelo→vermelho. Vou usar HEX direto em vez
 *     de CSS vars porque (a) a chama tem identidade visual única — não
 *     deve pegar accent do tema — e (b) gradients em SVG <stop> não lêem
 *     CSS vars confiavelmente em todos os browsers.
 *   - Drop shadow via `filter`: cresce com a intensidade da chama.
 *   - Tema claro/escuro: a chama é colorida em si mesma; só o glow
 *     muda intensidade. Funciona nos dois.
 *
 * Níveis (`intensity`):
 *   0 — apagada: pavio cinza com cinza esverdeado, sem chama.
 *   1 — faísca: ponto luminoso oscilando.
 *   2 — pequena: chama curta, glow leve.
 *   3 — média: chama média, glow visível.
 *   4 — forte: chama cheia, glow intenso, partícula extra.
 *   5 — intensa: tudo no máximo + halo externo.
 *
 * O componente é puro display. Quem decide o nível é a página, com base
 * em revisões-do-dia / meta diária.
 */
export type FlameIntensity = 0 | 1 | 2 | 3 | 4 | 5;

interface Props {
  intensity: FlameIntensity;
  /** Side of the rendered SVG. Default 240. */
  size?: number;
}

export function Flame({ intensity, size = 240 }: Props) {
  // Visual scaling per level. The chame coordinates are sized for a
  // viewBox of 200×260; the wrapper scales linearly to `size`.
  //
  // We pre-compute the parameters so the JSX stays clean.
  const cfg = getFlameConfig(intensity);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size * 1.1 }}
      aria-label={`Chama com intensidade ${intensity} de 5`}
    >
      {/* Halo externo (só para intensidade alta). Renderizado como um
          div com radial-gradient porque escalar bem em CSS é trivial. */}
      {intensity >= 4 && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              intensity === 5
                ? 'radial-gradient(circle, rgba(251,146,60,0.35) 0%, rgba(251,146,60,0) 65%)'
                : 'radial-gradient(circle, rgba(251,146,60,0.22) 0%, rgba(251,146,60,0) 65%)',
          }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Pavio sempre presente. Cinza escuro quando apagado, marrom
          enegrecido quando a chama está acesa (sugere brasa). */}
      <svg
        viewBox="0 0 200 260"
        width={size}
        height={size * 1.3}
        className="relative"
        style={{
          filter: cfg.glow,
        }}
      >
        <defs>
          {/* Gradientes da chama, indo de quente externo para núcleo
              branco-amarelado. Stops em ordem do topo (fim) pra base. */}
          <radialGradient id="bodyOuter" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="30%" stopColor="#fb923c" />
            <stop offset="70%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.7" />
          </radialGradient>
          <radialGradient id="bodyMid" cx="50%" cy="85%" r="55%">
            <stop offset="0%" stopColor="#fffbeb" />
            <stop offset="50%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="bodyCore" cx="50%" cy="90%" r="40%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="80%" stopColor="#fef9c3" />
            <stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Base / pavio. Sempre visível. */}
        <rect
          x="92"
          y="220"
          width="16"
          height="22"
          fill={cfg.wickColor}
          rx="2"
        />
        <ellipse
          cx="100"
          cy="244"
          rx="42"
          ry="6"
          fill="rgba(0,0,0,0.18)"
        />

        {/* Núcleo da chama. Visível a partir de intensity >= 1 (faísca). */}
        {intensity >= 1 && (
          <motion.path
            d={cfg.outerPath}
            fill="url(#bodyOuter)"
            initial={{ scaleY: cfg.scaleY, opacity: cfg.opacity }}
            animate={{
              scaleY: [cfg.scaleY * 0.96, cfg.scaleY * 1.04, cfg.scaleY * 0.97],
              scaleX: [1, 0.96, 1.02, 1],
              opacity: [cfg.opacity, Math.min(1, cfg.opacity + 0.05), cfg.opacity],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ transformOrigin: '100px 230px' }}
          />
        )}

        {intensity >= 2 && (
          <motion.path
            d={cfg.midPath}
            fill="url(#bodyMid)"
            initial={{ scaleY: cfg.scaleY * 0.85 }}
            animate={{
              scaleY: [cfg.scaleY * 0.82, cfg.scaleY * 0.9, cfg.scaleY * 0.84],
              y: [0, -2, 0],
            }}
            transition={{
              duration: 1.0,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ transformOrigin: '100px 230px' }}
          />
        )}

        {intensity >= 3 && (
          <motion.path
            d={cfg.corePath}
            fill="url(#bodyCore)"
            initial={{ scaleY: cfg.scaleY * 0.7 }}
            animate={{
              scaleY: [cfg.scaleY * 0.68, cfg.scaleY * 0.75, cfg.scaleY * 0.7],
              opacity: [0.85, 1, 0.9],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ transformOrigin: '100px 230px' }}
          />
        )}

        {/* Faísca solta para intensidades 4 e 5 — partícula que sobe. */}
        {intensity >= 4 && (
          <motion.circle
            cx="112"
            cy="120"
            r="3"
            fill="#fef9c3"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: [-10, -60, -90], opacity: [0, 1, 0] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}
        {intensity >= 5 && (
          <motion.circle
            cx="88"
            cy="140"
            r="2.5"
            fill="#fde68a"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: [-10, -50, -80], opacity: [0, 1, 0] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeOut',
              delay: 0.6,
            }}
          />
        )}

        {/* Chama apagada: minúscula fumacinha indicando "estava acesa". */}
        {intensity === 0 && (
          <motion.path
            d="M 100 220 Q 95 200 100 185 Q 105 175 100 165"
            stroke="rgba(148,163,184,0.4)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.2, 0.45, 0.2], y: [0, -5, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </svg>
    </div>
  );
}

interface FlameConfig {
  wickColor: string;
  scaleY: number;
  opacity: number;
  glow: string;
  outerPath: string;
  midPath: string;
  corePath: string;
}

function getFlameConfig(intensity: FlameIntensity): FlameConfig {
  // Path coordinates: a teardrop centered on x=100, base at y≈230, tip
  // higher for stronger flames. I pre-tuned three sizes for outer/mid/core
  // and pick by intensity. Faísca (1) reuses the small flame paths but
  // scales them way down via `scaleY`.
  const smallOuter =
    'M 100 230 C 80 220 75 200 80 185 C 85 175 95 168 100 168 ' +
    'C 105 168 115 175 120 185 C 125 200 120 220 100 230 Z';
  const mediumOuter =
    'M 100 230 C 72 222 64 198 72 175 C 80 158 92 142 100 132 ' +
    'C 108 142 120 158 128 175 C 136 198 128 222 100 230 Z';
  const largeOuter =
    'M 100 232 C 65 224 54 195 64 165 C 76 142 90 120 100 100 ' +
    'C 110 120 124 142 136 165 C 146 195 135 224 100 232 Z';

  const smallMid =
    'M 100 228 C 86 222 82 208 86 196 C 90 188 96 184 100 184 ' +
    'C 104 184 110 188 114 196 C 118 208 114 222 100 228 Z';
  const mediumMid =
    'M 100 228 C 80 222 74 204 80 185 C 86 172 94 160 100 152 ' +
    'C 106 160 114 172 120 185 C 126 204 120 222 100 228 Z';
  const largeMid =
    'M 100 230 C 75 222 66 200 74 175 C 84 154 94 138 100 122 ' +
    'C 106 138 116 154 126 175 C 134 200 125 222 100 230 Z';

  const smallCore =
    'M 100 226 C 93 222 91 214 93 207 C 96 202 99 200 100 200 ' +
    'C 101 200 104 202 107 207 C 109 214 107 222 100 226 Z';
  const mediumCore =
    'M 100 226 C 88 222 84 210 88 196 C 92 188 97 180 100 175 ' +
    'C 103 180 108 188 112 196 C 116 210 112 222 100 226 Z';
  const largeCore =
    'M 100 228 C 82 222 76 206 82 188 C 88 174 95 158 100 150 ' +
    'C 105 158 112 174 118 188 C 124 206 118 222 100 228 Z';

  switch (intensity) {
    case 0:
      return {
        wickColor: '#64748b',
        scaleY: 0,
        opacity: 0,
        glow: 'none',
        outerPath: smallOuter,
        midPath: smallMid,
        corePath: smallCore,
      };
    case 1: // faísca
      return {
        wickColor: '#3f3f46',
        scaleY: 0.35,
        opacity: 0.85,
        glow: 'drop-shadow(0 0 4px rgba(251,146,60,0.4))',
        outerPath: smallOuter,
        midPath: smallMid,
        corePath: smallCore,
      };
    case 2: // pequena
      return {
        wickColor: '#27272a',
        scaleY: 0.7,
        opacity: 0.9,
        glow: 'drop-shadow(0 0 8px rgba(251,146,60,0.5))',
        outerPath: smallOuter,
        midPath: smallMid,
        corePath: smallCore,
      };
    case 3: // média
      return {
        wickColor: '#18181b',
        scaleY: 1,
        opacity: 0.95,
        glow: 'drop-shadow(0 0 12px rgba(251,146,60,0.55))',
        outerPath: mediumOuter,
        midPath: mediumMid,
        corePath: mediumCore,
      };
    case 4: // forte
      return {
        wickColor: '#18181b',
        scaleY: 1.05,
        opacity: 1,
        glow: 'drop-shadow(0 0 18px rgba(251,146,60,0.65))',
        outerPath: largeOuter,
        midPath: largeMid,
        corePath: largeCore,
      };
    case 5: // intensa
      return {
        wickColor: '#18181b',
        scaleY: 1.1,
        opacity: 1,
        glow:
          'drop-shadow(0 0 24px rgba(251,146,60,0.8)) ' +
          'drop-shadow(0 0 40px rgba(220,38,38,0.4))',
        outerPath: largeOuter,
        midPath: largeMid,
        corePath: largeCore,
      };
  }
}

/**
 * Map "% da meta diária" pra intensidade visual.
 *
 *  - 0 revisões → apagada (0)
 *  - 1+ revisão E < 25% da meta → faísca (1)
 *  - 25% – 49% → pequena (2)
 *  - 50% – 99% → média (3)
 *  - 100% – 149% → forte (4)
 *  - ≥ 150% → intensa (5)
 */
export function flameIntensityFor(
  reviewsToday: number,
  dailyGoal: number,
): FlameIntensity {
  if (reviewsToday <= 0) return 0;
  if (dailyGoal <= 0) return reviewsToday > 0 ? 3 : 0; // fallback sane
  const pct = reviewsToday / dailyGoal;
  if (pct < 0.25) return 1;
  if (pct < 0.5) return 2;
  if (pct < 1.0) return 3;
  if (pct < 1.5) return 4;
  return 5;
}

/** Label legível pro estado, exibido abaixo da chama. */
export function flameLabel(intensity: FlameIntensity): string {
  switch (intensity) {
    case 0:
      return 'Apagada';
    case 1:
      return 'Faísca';
    case 2:
      return 'Chama pequena';
    case 3:
      return 'Chama média';
    case 4:
      return 'Chama forte';
    case 5:
      return 'Chama intensa';
  }
}
