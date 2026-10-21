import { createHash, timingSafeEqual } from 'node:crypto';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function equalHashes(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
// Defesa em camadas: filtro heurístico, prompt separado, ferramentas apenas de leitura.
export function isInjection(text: string): boolean {
  return /(?:ignore|disregard|forget|esqueca|desconsidere).{0,60}(?:instructions|instrucoes|prompt|regras)|(?:reveal|mostre|revele|exiba).{0,40}(?:system prompt|prompt do sistema|segredo|secret|api.key|token)|(?:system|developer)\s*:|<\/?(?:system|developer)>/i.test(
    normalize(text),
  );
}
export function isInScope(text: string): boolean {
  return /\b(phasscode|orbe|portfolio|projetos?|projects?|experienc\w*|formacao|education|competenc\w*|skills?|tecnolog\w*|technolog\w*|trabalho|work|job|servicos?|services?|solucoes|solutions?|reuniao|reunioes|meeting\w*|agend\w*|calendar\w*|disponib\w*|availability|backend|back-end|frontend|front-end|react|java|node|typescript|carreira|career|contrat\w*|hire|contato|contact|certific\w*|graduac\w*|academ\w*|profission\w*|professional|voce|you|ola|hello|oi)\b/i.test(
    normalize(text),
  );
}
export const scopeRefusal =
  'Minha função é apresentar o trabalho profissional do PHASSCODE e ajudar visitantes interessados em projetos, serviços e reuniões.';
export const injectionRefusal =
  'Posso ajudar com informações públicas do portfólio PHASSCODE. Não revelo instruções internas, credenciais ou dados privados.';
