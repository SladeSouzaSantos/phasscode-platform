import type { KnowledgeDocument } from '../domain/ports.js';
import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';
import { documentSource } from './sources.js';

interface Requirement {
  label: string;
  key: string;
}

const labels: Readonly<Record<string, string>> = {
  java: 'Java',
  hibernate: 'Hibernate',
  jboss: 'JBoss',
  'spring boot': 'Spring Boot',
  jpa: 'JPA',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sql: 'SQL',
  'sql server': 'SQL Server',
  angular: 'Angular',
  react: 'React',
  typescript: 'TypeScript',
  'node js': 'Node.js',
  python: 'Python',
  fastapi: 'FastAPI',
  flutter: 'Flutter',
  firebase: 'Firebase',
  redis: 'Redis',
  docker: 'Docker',
  'docker swarm': 'Docker Swarm',
  git: 'Git',
  'github actions': 'GitHub Actions',
  'ci cd': 'CI/CD',
  vitest: 'Vitest',
  playwright: 'Playwright',
  codeql: 'CodeQL',
  'owasp zap': 'OWASP ZAP',
  ingles: 'Inglês',
  english: 'Inglês',
  graduacao: 'Graduação',
};

function parseRequirements(query: string): Requirement[] {
  if (!/\b(?:matriz|tabela|planilha)\b/i.test(knowledgePhrase(query))) return [];
  // A comma-separated requirement block must be explicit. Do not try to turn
  // casual prose or a CV into a claimed exhaustive skills audit.
  const start = /\b(?:java|hibernate|postgresql|mysql|react|angular|spring boot)\s*,/i.exec(query);
  if (!start || start.index === undefined) return [];
  const list = query
    .slice(start.index)
    .split(/[?!]|\.\s+(?=Em cada|Para cada|Não|Nao|Explique)/i)[0]!;
  const pieces = list.replace(/\s+e\s+(?=gradua[çc][aã]o\b|ingl[eê]s\b)/gi, ', ').split(',');
  const result: Requirement[] = [];
  const seen = new Set<string>();
  for (const part of pieces) {
    const key = knowledgePhrase(part.trim());
    const label = labels[key];
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push({ key, label });
  }
  return result.length >= 7 ? result : [];
}

function relevantCourse(document: KnowledgeDocument, requirement: Requirement): boolean {
  if (!document.id.startsWith('cursos-')) return false;
  const rows = document.content.split('\n').filter((line) => /(?:^Curso \[|^\d+\.)/.test(line));
  const target = requirement.key;
  return rows.some((line) => {
    const lineText = knowledgePhrase(line);
    if (target === 'sql server') return lineText.includes('sql server');
    if (target === 'angular') return lineText.includes('angular');
    return false;
  });
}

function supports(document: KnowledgeDocument, requirement: Requirement): boolean {
  if (relevantCourse(document, requirement)) return true;
  if (document.id.startsWith('cursos-')) return false;
  if (requirement.key === 'ingles' || requirement.key === 'english')
    return document.id === 'idiomas-declarados';
  if (requirement.key === 'graduacao') return document.id === 'formacao-gestao-ti';
  // The index normalizes Node.js to `node`, not `node-js`. CI/CD is
  // a distinct workflow capability and requires explicit source metadata.
  const technology =
    requirement.key === 'node js' ? 'node' : requirement.key.replaceAll(' ', '-');
  const available = mentionedTechnologies(document.technologies?.join(' ') ?? '');
  if (technology === 'sql')
    return (
      available.has('postgresql') ||
      available.has('mysql') ||
      // Explicit SQL skill on its own also qualifies; never infer SQL Server.
      available.has('sql')
    );
  return available.has(technology);
}

function priority(document: KnowledgeDocument, requirement: Requirement): number {
  if (requirement.key === 'flutter' || requirement.key === 'firebase') {
    if (document.id === 'greencity-sdgp') return 100;
  }
  if (requirement.key === 'java' && document.id === 'experiencia-sig') return 100;
  if (requirement.key === 'mysql' && document.id === 'experiencia-geowellex') return 100;
  if (document.category === 'professional' && document.type === 'profile') return 80;
  if (document.category === 'professional' && document.type === 'project') return 75;
  if (document.category === 'personal') return 60;
  if (document.category === 'study') return 40;
  return 30;
}

function classification(document: KnowledgeDocument): string {
  if (document.id.startsWith('cursos-')) return 'Curso';
  if (document.id === 'idiomas-declarados') return 'Declarado: inglês básico';
  if (document.id === 'formacao-gestao-ti') return 'Formação concluída';
  if (document.category === 'professional') return 'Experiência profissional';
  if (document.category === 'study') return 'Projeto de estudo';
  return 'Projeto autoral';
}

function origin(document: KnowledgeDocument, requirement: Requirement): string {
  if (document.id === 'experiencia-sig') return 'SIGAA / SIG Software';
  if (document.id === 'experiencia-geowellex') return 'Geowellex';
  if (document.id === 'greencity-sdgp') return 'SDGP / Greencity';
  if (document.id === 'formacao-gestao-ti') return 'Tecnólogo em Gestão de TI';
  if (document.id === 'idiomas-declarados') return 'Currículo declarado';
  if (document.id.startsWith('cursos-')) {
    if (requirement.key === 'sql server') return 'Dois cursos específicos de SQL Server (Udemy)';
    if (requirement.key === 'angular') return 'Desenvolvimento Frontend com Angular (DIO)';
  }
  return document.title.replaceAll('|', '/').slice(0, 66);
}

/** A complete, source-scoped recruiter matrix without generative row fabrication.
 * No private repository URL, unproven paid experience or output token cap.
 */
export function buildVerifiedRecruiterMatrix(
  query: string,
  documents: readonly KnowledgeDocument[],
): { answer: string; sourceDocuments: KnowledgeDocument[]; requirements: number } | undefined {
  const requirements = parseRequirements(query);
  if (!requirements.length) return undefined;
  const cited = new Map<string, KnowledgeDocument>();
  const rows = requirements.map((requirement) => {
    const selected = documents
      .filter((doc) => supports(doc, requirement))
      .sort(
        (a, b) => priority(b, requirement) - priority(a, requirement) || a.id.localeCompare(b.id),
      )[0];
    if (!selected) return `| ${requirement.label} | Sem evidência suficiente | — | — |`;
    cited.set(selected.id, selected);
    const url = documentSource(selected).url ?? '—';
    return `| ${requirement.label} | ${classification(selected)} | ${origin(selected, requirement)} | ${url} |`;
  });
  const answer = [
    'Matriz de requisitos baseada exclusivamente em registros disponíveis, sem inferir experiência profissional a partir de cursos ou projetos:',
    '| Requisito | Classificação | Evidência | Fonte pública |',
    '|---|---|---|---|',
    ...rows,
    '',
    `Itens avaliados: ${rows.length}. “Sem evidência suficiente” não significa ausência da competência.`,
  ].join('\n');
  return { answer, requirements: rows.length, sourceDocuments: [...cited.values()] };
}
