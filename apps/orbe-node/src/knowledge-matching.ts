import { normalize } from './domain/security.js';

const stopWords = new Set(
  'a o os as e de do da dos das em no na nos nas um uma uns umas ao aos com para por que qual quais como sobre seu sua seus suas ele ela eles elas voce voces pedro santos phasscode tem possui utiliza usam usar usa gostaria saber explique fale responda brevemente pode poderia mostrar apresentar sao tambem isso essa esse apenas ainda entre desde ate mas alem mais the what your is are'.split(
    ' ',
  ),
);
const aliases: Record<string, string> = {
  projetos: 'projeto',
  projects: 'projeto',
  project: 'projeto',
  tecnologias: 'tecnologia',
  technologies: 'tecnologia',
  technology: 'tecnologia',
  platform: 'plataforma',
  linguagens: 'tecnologia',
  linguagem: 'tecnologia',
  languages: 'tecnologia',
  language: 'tecnologia',
  competencias: 'competencia',
  habilidades: 'competencia',
  skills: 'competencia',
  experiencias: 'experiencia',
  qualifications: 'qualificacao',
  qualificacoes: 'qualificacao',
  certificados: 'certificado',
  certificacoes: 'certificado',
  certification: 'certificado',
  certificacao: 'certificado',
  reunioes: 'reuniao',
  formacoes: 'formacao',
  estudos: 'estudo',
  cursos: 'curso',
  inteligencia: 'ia',
  artificial: 'ia',
  ai: 'ia',
  llms: 'llm',
};

/** Word boundaries preserve Java/JavaScript, including punctuation and Portuguese accents. */
export function knowledgeTerms(text: string): Set<string> {
  const words = normalize(text).split(/[^a-z0-9]+/);
  const result = new Set(
    words
      .filter((term) => term.length > 1 && !stopWords.has(term))
      .map((term) => aliases[term] ?? term),
  );
  // Names are noise in technology questions, but remain useful as standalone profile searches.
  if (result.size === 0)
    for (const word of words) if (['pedro', 'santos', 'phasscode'].includes(word)) result.add(word);
  return result;
}

export function knowledgePhrase(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const technologyPatterns: Record<string, RegExp> = {
  java: /\bjava\b/,
  javascript: /\bjavascript\b|(?<!\b(?:node|react|angular) )\bjs\b/,
  typescript: /\b(?:typescript|ts)\b/,
  python: /\bpython\b/,
  flutter: /\bflutter\b/,
  dart: /\bdart\b/,
  react: /\breact(?:js)?\b/,
  angular: /\bangular\b/,
  node: /\bnode(?:\s*js)?\b/,
  spring: /\bspring(?:boot)?\b/,
  'spring-boot': /\bspring\s*boot\b|\bspringboot\b/,
  'spring-data': /\bspring\s+data\b/,
  'spring-security': /\bspring\s+security\b/,
  jpa: /\bjpa\b/,
  hibernate: /\bhibernate\b/,
  jboss: /\bjboss\b/,
  quarkus: /\bquarkus\b/,
  langchain: /\blangchain\b/,
  langchain4j: /\blangchain4j\b/,
  langgraph: /\blanggraph\b/,
  ia: /\b(?:ia|ai|llms?|inteligencia artificial|artificial intelligence)\b/,
  fastapi: /\bfast\s*api\b/,
  fastify: /\bfastify\b/,
  django: /\bdjango\b/,
  'docker-swarm': /\bdocker\s+swarm\b/,
  codeql: /\bcodeql\b/,
  'owasp-zap': /\b(?:owasp\s+)?zap\b/,
  sast: /\bsast\b/,
  dast: /\bdast\b/,
  docker: /\bdocker\b/,
  kubernetes: /\b(?:kubernetes|k8s)\b/,
  postgresql: /\b(?:postgresql|postgres)\b/,
  mysql: /\bmysql\b/,
  redis: /\bredis\b/,
  mongodb: /\b(?:mongodb|mongo)\b/,
  firebase: /\bfirebase\b/,
  h2: /\bh2\b/,
  kafka: /\bkafka\b/,
  rabbitmq: /\brabbitmq\b/,
  wordpress: /\bwordpress\b/,
  php: /\bphp\b/,
  html: /\bhtml(?:5)?\b/,
  css: /\bcss(?:3)?\b/,
  git: /\bgit\b/,
  vitest: /\bvitest\b/,
  playwright: /\bplaywright\b/,
  pytest: /\bpytest\b/,
  'sql-server': /\bsql server\b/,
  sql: /\bsql\b/,
  'github-actions': /\bgithub actions\b/,
  'ci-cd':
    /\bci cd\b|\bcontinuous integration(?: and| &)? (?:continuous deployment|continuous delivery)\b/,
};

export function mentionedTechnologies(text: string): Set<string> {
  const phrase = knowledgePhrase(text);
  const result = new Set(
    Object.entries(technologyPatterns)
      .filter(([, pattern]) => pattern.test(phrase))
      .map(([technology]) => technology),
  );
  // A specific Spring module must not match another module through its shared family name.
  if ([...result].some((technology) => technology.startsWith('spring-'))) result.delete('spring');
  return result;
}

export function technologyMatches(requested: Set<string>, available: Set<string>): boolean {
  return [...requested].some(
    (technology) =>
      available.has(technology) ||
      (technology === 'spring' && [...available].some((item) => item.startsWith('spring-'))),
  );
}
