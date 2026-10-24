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
  const query = normalize(text);
  const directSecretRequest =
    /(?:ignore|disregard|forget|esqueca|desconsidere|substitua|sobrescreva)[\s\S]{0,100}(?:instructions|instrucoes|prompt|regras)|(?:reveal|mostre|revele|exiba)[\s\S]{0,60}(?:system prompt|prompt (?:do sistema|interno)|segredo|secret|(?:api[ _.-]?key)|chave (?:de api|secreta)|token de (?:acesso|autenticacao))|qual[\s\S]{0,60}(?:system prompt|prompt (?:do sistema|interno)|segredo|secret|(?:api[ _.-]?key)|chave (?:de api|secreta))|(?:system|developer)\s*:|<\/?(?:system|developer)>|\[\/?INST\]|<\|(?:im_start|im_end|system|developer)\|>/i.test(
      query,
    );
  const tokenQuestion = /\bqual[\s\S]{0,60}token de (?:acesso|autenticacao)\b/.test(query);
  const tokenConcept =
    /\b(?:papel|funcao|formato|tipo|validade|finalidade|duracao)\b[\s\S]{0,40}\btoken de (?:acesso|autenticacao)\b/.test(
      query,
    );
  return directSecretRequest || (tokenQuestion && !tokenConcept);
}
export function isInScope(text: string, publicKeywords: string[] = []): boolean {
  const words = (value: string) =>
    normalize(value)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const query = ` ${words(text)} `;
  // Novos projetos da base curada também são assuntos válidos, sem manter nomes no código.
  if (
    publicKeywords.some(
      (keyword) => words(keyword).length >= 3 && query.includes(` ${words(keyword)} `),
    )
  )
    return true;
  return /\b(phasscode|orbe|portfolio|projetos?|projects?|experienc\w*|formacao|education|competenc\w*|skills?|tecnolog\w*|technolog\w*|linguage\w*|languages?|stack|trabalho|work|job|servicos?|services?|solucoes|solutions?|reuniao|reunioes|meeting\w*|agend\w*|calendar\w*|disponib\w*|availability|backend|back-end|frontend|front-end|react|java|javascript|node|typescript|flutter|dart|python|spring|quarkus|kafka|rabbitmq|ia|ai|login|jwt|oauth\w*|oidc|autentic\w*|langchain\w*|langgraph|openrouter|smart model router|carreira|career|contrat\w*|hire|contato|contact|e-mail|email|certific\w*|graduac\w*|academ\w*|profission\w*|professional|github|linkedin|curriculo|biografia|quem e|quem eh|who is)\b/i.test(
    normalize(text),
  );
}
export const scopeRefusal =
  'Minha função é apresentar o trabalho profissional do PHASSCODE e ajudar visitantes interessados em projetos, serviços e reuniões.';
export const injectionRefusal =
  'Posso ajudar com informações públicas do portfólio PHASSCODE. Não revelo instruções internas, credenciais ou dados privados.';
export const unknownAnswer =
  'Essa informação ainda não consta na base pública verificada do PHASSCODE. Posso apresentar os projetos e as tecnologias documentados.';
export const meetingUnavailable =
  'O agendamento de reuniões ainda não está disponível nesta versão. Não consigo consultar horários, registrar solicitações ou confirmar reuniões. Posso explicar os projetos do PHASSCODE.';
export const greetingAnswer =
  'Olá! Sou o Orbe Mágico do PHASSCODE. Posso apresentar o perfil profissional, os projetos e as tecnologias documentados no portfólio. O que você gostaria de conhecer?';
export const simpleTestAnswer =
  'Estou por aqui! Posso apresentar as experiências, os projetos e as tecnologias de Pedro. O que você gostaria de conhecer?';
export const personalLifeAnswer =
  'Não tenho informações públicas sobre a vida afetiva de Pedro. Posso apresentar sua trajetória profissional, projetos ou formas de contato.';

export function isGreeting(text: string): boolean {
  return /^(?:oi|ola|hello|hi|bom dia|boa tarde|boa noite)[!.,\s]*$/.test(normalize(text).trim());
}
export function isSimpleTest(text: string): boolean {
  // A mensagem inteira precisa ser um teste simples; não absorva instruções adicionais.
  return /^(?:(?:so |apenas )?(?:um )?(?:teste|testando)|testing|test)[!.,?\s]*$/.test(
    normalize(text).trim(),
  );
}
export function isPersonalLifeQuestion(text: string): boolean {
  // Relacionamentos profissionais e projetos de aplicativos de namoro continuam no escopo.
  return /\b(?:namorad[ao]s?|espos[ao]s?|marido|mulher dele|casad[ao]|solteir[ao]|estado civil|vida (?:afetiva|amorosa|conjugal))\b/.test(
    normalize(text),
  );
}
export function isMeetingRequest(text: string): boolean {
  return /\b(?:agendar|agende|marcar|marque|reservar|reserve|confirmar|confirme|cancele|cancelar|aprovar|recusar|schedule|book|cancel|confirm)\b[\s\S]{0,100}\b(?:reuniao|reunioes|horario|meetings?|agenda)\b|\b(?:reuniao|reunioes|meetings?)\b[\s\S]{0,80}\b(?:horarios?|disponibilidade|amanha|hoje|semana|marcar|confirmar|availability|available)\b|\b(?:horarios?|slots?)\b[\s\S]{0,60}\b(?:livres?|disponiveis|reuniao|available|free)\b/.test(
    normalize(text),
  );
}
export function isOffTopicTask(text: string): boolean {
  return /\b(?:escreva|crie|gere|implemente|faca|write|generate)\b[\s\S]{0,90}\b(?:codigo|script|programa|receita|poema|redacao|historia ficticia)\b|\b(?:receita de|previsao do tempo|resultado (?:do jogo|da loteria)|diagnostico medico)\b/.test(
    normalize(text),
  );
}
export function isContextualFollowUp(text: string): boolean {
  const query = normalize(text)
    .trim()
    .replace(/[?!.,:;]+$/g, '')
    .replace(/\s+/g, ' ');
  return /^(?:e )?(?:qual e |quais sao |como faco (?:para )?|como fazer |onde esta |onde estao )?(?:(?:o|a|os|as) )?(?:build|stack|tecnologias|repositorio|repositorios|fontes|links?|contato)$|^(?:(?:voce )?pode |poderia )?(?:explicar|detalhar|resumir)(?: (?:isso|melhor|mais|um pouco mais|esse projeto|o projeto)){0,3}$|^(?:(?:voce )?pode |poderia )?(?:mostrar|apresentar)(?: (?:o|a|esse|essa|este|esta))? (?:projeto|repositorio|link|demo|demonstracao)$|^(?:e )?(?:por que|porque|como assim|qual deles|quais deles|qual a diferenca|como funciona|onde encontro|onde posso ver|tem (?:o|esse) link|continue|fale mais|conte mais)$/.test(
    query,
  );
}
