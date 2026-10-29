import type { Message } from '../domain/ports.js';

export type ConversationIntent =
  | 'unknown'
  | 'curiosity'
  | 'technical'
  | 'opportunity'
  | 'business'
  | 'meeting';

export interface ConversationInsight {
  intent: ConversationIntent;
  topics: string[];
  summary: string;
}

const topicRules = [
  { topic: 'Agendamento', pattern: /\b(reuniao|reunioes|agendar|agendamento|agenda|horario|calendario)\b/u },
  { topic: 'Oportunidades', pattern: /\b(vaga|emprego|recrutamento|contratar|contratacao|entrevista|curriculo)\b/u },
  { topic: 'Projetos', pattern: /\b(projeto|projetos|portfolio|repositorio|github|aplicativo|app)\b/u },
  { topic: 'Tecnologias', pattern: /\b(react|javascript|typescript|flutter|dart|java|python|node|api|postgres|docker|backend|frontend|codigo|framework|tecnologia)\b/u },
  { topic: 'Experiência', pattern: /\b(experiencia|trabalhou|trabalho|atuacao|profissional|carreira)\b/u },
  { topic: 'Formação', pattern: /\b(faculdade|formacao|diploma|certificado|curso|graduacao|estudo)\b/u },
  { topic: 'Energia solar', pattern: /\b(solar|fotovoltaico|energia|greencity|hsp)\b/u },
  { topic: 'Contato', pattern: /\b(contato|conversar|email|mensagem|telefone)\b/u },
] as const;

const intentLabels: Record<ConversationIntent, string> = {
  unknown: 'não identificada',
  curiosity: 'conhecer o portfólio',
  technical: 'dúvida técnica',
  opportunity: 'oportunidade profissional',
  business: 'parceria ou serviço',
  meeting: 'agendamento',
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
}

/** Conservative heuristic: never copies prompts, contact details or model output. */
export function summarizeConversation(history: Message[], latestMessage: string): ConversationInsight {
  const recent = [...history.filter((item) => item.role === 'user').map((item) => item.content), latestMessage]
    .slice(-8)
    .map(normalize)
    .join(' ');
  const topics = topicRules.filter((rule) => rule.pattern.test(recent)).map((rule) => rule.topic);
  let intent: ConversationIntent = 'unknown';
  if (/\b(agendar|agendamento|marcar (?:uma )?reuniao|marcar horario|disponibilidade de horario)\b/u.test(recent))
    intent = 'meeting';
  else if (/\b(vaga|recrutamento|contratar|contratacao|entrevista|oportunidade profissional)\b/u.test(recent))
    intent = 'opportunity';
  else if (/\b(orcamento|parceria|freelance|servico|proposta comercial)\b/u.test(recent))
    intent = 'business';
  else if (/\b(react|javascript|typescript|flutter|dart|java|python|node|api|postgres|docker|backend|frontend|codigo|framework|arquitetura|implementacao)\b/u.test(recent))
    intent = 'technical';
  else if (/\b(projeto|projetos|portfolio|sobre|experiencia|formacao|carreira|quem e)\b/u.test(recent))
    intent = 'curiosity';
  const subjects = topics.length ? topics.slice(0, 5).join(', ') : 'assunto não identificado';
  return {
    intent,
    topics: topics.slice(0, 8),
    summary: 'Assuntos identificados: ' + subjects + '. Intenção provável: ' + intentLabels[intent] + '.',
  };
}
