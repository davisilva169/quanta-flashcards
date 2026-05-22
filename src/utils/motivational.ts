export const MOTIVATIONAL_MESSAGES = [
  'Um cartão por vez. O importante é voltar.',
  'Hoje você não precisa estudar tudo. Só precisa não quebrar o ritmo.',
  'Conhecimento técnico se constrói em camadas.',
  'Revisar é transformar esforço em memória.',
  'Seu eu do futuro vai agradecer esses 10 minutos.',
  'Você está treinando familiaridade, não perfeição.',
  'Não existe atalho para fluência — existe consistência.',
  'O cérebro consolida no segundo encontro, não no primeiro.',
  'Um cartão errado hoje é um cartão dominado em uma semana.',
  'Constância vence intensidade.',
];

/**
 * Escolhe uma mensagem determinística pelo dia atual,
 * pra não trocar a cada render.
 */
export function todaysMessage(): string {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + d.getMonth() * 50 + d.getDate();
  return MOTIVATIONAL_MESSAGES[seed % MOTIVATIONAL_MESSAGES.length];
}
