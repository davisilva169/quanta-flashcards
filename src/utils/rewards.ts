/**
 * Healthy reward system.
 *
 * Two pools:
 *  - DAILY_REWARDS: simple, repeatable suggestions for hitting the daily goal.
 *  - LEVEL_UP_REWARDS: more ceremonial / symbolic rituals for reaching a new
 *    rank tier.
 *
 * The goal is gentle nudges toward healthy habits — water, walking, stretching,
 * resting eyes, time off-screen — never anything compulsive, transactional, or
 * infantilizing. No streaks-as-pressure, no consumption rewards, no
 * monetization hooks.
 */

export type RewardKind = 'daily' | 'levelUp';

export interface Reward {
  /** Stable id used by `pickReward({ exclude })` to avoid suggesting the same one twice in a row. */
  id: string;
  title: string;
  description: string;
  /** Rough estimate to set expectations. */
  durationLabel: string;
  /** Lucide icon name (rendered by `RewardModal`). */
  icon:
    | 'Droplet'
    | 'Footprints'
    | 'Eye'
    | 'Coffee'
    | 'Sparkles'
    | 'Sun'
    | 'Wind'
    | 'BookOpen'
    | 'Music'
    | 'PenLine'
    | 'Brain'
    | 'Glasses'
    | 'Map'
    | 'Compass'
    | 'Trees';
}

export const DAILY_REWARDS: Reward[] = [
  { id: 'water',          title: 'Beba um copo de água',                  description: 'Hidratar antes de sentir sede é um hábito subestimado.',           durationLabel: '30 s',     icon: 'Droplet'   },
  { id: 'stretch',        title: 'Levante e alongue por 2 minutos',       description: 'Pescoço, ombros, costas, quadril. Devagar.',                       durationLabel: '2 min',    icon: 'Wind'      },
  { id: 'walk-5',         title: 'Caminhe 5 minutos',                     description: 'Ar fora do quarto. Se possível, sem celular.',                    durationLabel: '5 min',    icon: 'Footprints'},
  { id: 'eye-rest',       title: 'Descanse os olhos olhando longe',       description: 'Foque algo a 6 metros por 20 segundos. Regra 20-20-20.',          durationLabel: '20 s',     icon: 'Eye'       },
  { id: 'tea',            title: 'Prepare um café ou chá',                description: 'Pequeno ritual entre blocos de estudo.',                          durationLabel: '5 min',    icon: 'Coffee'    },
  { id: 'desk',           title: 'Arrume a mesa de estudos',              description: 'Uma mesa limpa é um cérebro mais leve.',                          durationLabel: '3 min',    icon: 'Sparkles'  },
  { id: 'breath',         title: 'Respire fundo por 60 segundos',         description: 'Inspire por 4, segure 4, expire por 6. Repita.',                  durationLabel: '1 min',    icon: 'Wind'      },
  { id: 'no-phone',       title: 'Pausa sem celular',                     description: 'Cinco minutos longe da tela e sem rolagem.',                      durationLabel: '5 min',    icon: 'Glasses'   },
  { id: 'music',          title: 'Ouça uma música com atenção',           description: 'Uma música inteira, sem fazer outra coisa.',                      durationLabel: '4 min',    icon: 'Music'     },
  { id: 'paper-note',     title: 'Revise uma anotação no papel',          description: 'Manuscrito ativa memória diferente da tela.',                     durationLabel: '3 min',    icon: 'PenLine'   },
  { id: 'sun',            title: 'Tome sol por alguns minutos',           description: 'Se houver sol disponível. Janela aberta também conta.',           durationLabel: '5 min',    icon: 'Sun'       },
  { id: 'walk-out',       title: 'Caminhe fora do quarto',                description: 'Mude de ambiente físico, mesmo que por pouco tempo.',             durationLabel: '3 min',    icon: 'Footprints'},
  { id: 'tidy',           title: 'Pequena limpeza no ambiente',           description: 'Organizar 3 objetos. Ambiente pesa na concentração.',             durationLabel: '2 min',    icon: 'Sparkles'  },
  { id: 'reflect',        title: 'Escreva uma frase sobre o que aprendeu',description: 'Uma linha sobre a melhor ideia da sessão.',                       durationLabel: '1 min',    icon: 'BookOpen'  },
];

export const LEVEL_UP_REWARDS: Reward[] = [
  {
    id: 'theorem-ritual',
    title: 'Ritual do Teorema',
    description: 'Escreva sua fórmula favorita do dia em uma folha de papel — devagar, com capricho.',
    durationLabel: '3 min',
    icon: 'PenLine',
  },
  {
    id: 'experimentalist-pause',
    title: 'Pausa do Físico Experimental',
    description: 'Observe um fenômeno simples ao seu redor e descreva em uma frase: a luz, a temperatura, um som.',
    durationLabel: '2 min',
    icon: 'Eye',
  },
  {
    id: 'asymptotic-walk',
    title: 'Caminhada Assintótica',
    description: 'Dê uma volta curta pensando em uma ideia difícil — sem tentar resolvê-la, só deixá-la respirar.',
    durationLabel: '10 min',
    icon: 'Footprints',
  },
  {
    id: 'water-ceremony',
    title: 'Cerimônia da Água',
    description: 'Beba um copo de água como se tivesse desbloqueado uma nova fase do cérebro. Porque você desbloqueou.',
    durationLabel: '30 s',
    icon: 'Droplet',
  },
  {
    id: 'mini-retreat',
    title: 'Mini retiro de 10 minutos',
    description: 'Fique longe da tela. Deixe a memória consolidar o que acabou de aprender.',
    durationLabel: '10 min',
    icon: 'Trees',
  },
  {
    id: 'knowledge-map',
    title: 'Mapa do Conhecimento',
    description: 'Desenhe no papel uma conexão entre dois assuntos que estudou recentemente. Uma linha basta.',
    durationLabel: '5 min',
    icon: 'Map',
  },
  {
    id: 'euler-rest',
    title: 'Descanso de Euler',
    description: 'Feche os olhos por 2 minutos e respire. Sem música, sem podcast.',
    durationLabel: '2 min',
    icon: 'Brain',
  },
  {
    id: 'feynman-walk',
    title: 'Passeio de Feynman',
    description: 'Caminhe explicando mentalmente um conceito como se ensinasse alguém. Nos pontos onde você travar, está a próxima coisa a estudar.',
    durationLabel: '8 min',
    icon: 'Compass',
  },
];

export interface PickRewardOptions {
  exclude?: string;
  /** Deterministic seed for testability. Defaults to Math.random(). */
  rand?: () => number;
}

export function pickReward(kind: RewardKind, opts: PickRewardOptions = {}): Reward {
  const pool = kind === 'daily' ? DAILY_REWARDS : LEVEL_UP_REWARDS;
  const candidates = opts.exclude ? pool.filter(r => r.id !== opts.exclude) : pool;
  const rand = opts.rand ?? Math.random;
  return candidates[Math.floor(rand() * candidates.length)];
}
