import type { Source } from '../../../../packages/contracts/src/index.js';
import type { KnowledgeDocument } from '../domain/ports.js';
import {
  knowledgePhrase,
  knowledgeTerms,
  mentionedTechnologies,
  technologyMatches,
} from '../knowledge-matching.js';

const genericTerms = new Set(
  'projeto portfolio experiencia profissional profissionais tecnologia competencia qualificacao desenvolvimento desenvolvedor apresenta utiliza pode possui publico publica publicos publicas conhecimento conhecimentos sistema sistemas aplicacao aplicacoes estudo curso fonte fontes material registrado registrada base informacao informacoes relacionado relacionadas relacionado documentado documentada trabalho atuacao repositorio demonstracao link'.split(
    ' ',
  ),
);

function distinctiveTerms(text: string): Set<string> {
  return new Set([...knowledgeTerms(text)].filter((term) => !genericTerms.has(term)));
}

function validUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    // An internal data file or source-code permalink is never a recruiting reference.
    if (/\/assets\/json\/|\/src\/data\/|\.(?:json|ts|tsx)(?:$|[?#])/i.test(url.pathname))
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Names provide provenance for specific named subjects; technology overlap alone does not. */
function explicitSubject(document: KnowledgeDocument, normalizedAnswer: string): boolean {
  const aliases: Record<string, string[]> = {
    'experiencia-sig': ['sigaa', 'sig software'],
    'experiencia-acrux': ['acrux'],
    'experiencia-geowellex': ['geowellex'],
    'experiencia-greencity': ['greencity sustainable energy'],
    'phasscode-platform': ['phasscode platform', 'backend do orbe', 'plataforma phasscode'],
    'web-portfolio-v2': ['portfolio phasscode', 'frontend phasscode'],
    'greencity-os': ['greencity os'],
    'hsp-simulator': ['hsp simulator'],
    'webservice-springboot-jpa': ['webservice spring boot'],
    'task-manager-flask': ['task manager'],
    'formacao-gestao-ti': [
      'gestao da tecnologia da informacao',
      'gestao da ti',
      'tecnologo em gestao',
      'etep',
      'unibf',
    ],
    'formacao-computacao': ['ciencia da computacao', 'bacharelado em computacao'],
    'idiomas-declarados': ['ingles basico', 'ingles para leitura'],
  };
  const phrases = aliases[document.id] ?? [document.title];
  return phrases.some((phrase) => {
    const normalized = knowledgePhrase(phrase);
    return normalized.length >= 5 && normalizedAnswer.includes(` ${normalized} `);
  });
}

/** Keep the existing HTTP DTO; cite public portfolio pages or public projects, not internal files. */
export function documentSource(document: KnowledgeDocument): Source {
  const publicProject =
    (document.type === 'project' || document.type === 'platform') &&
    document.visibility !== 'private' &&
    document.visibility !== 'third-party';
  const url =
    (publicProject && (validUrl(document.repositoryUrl) ?? validUrl(document.demoUrl))) ||
    validUrl(document.url);
  return {
    type: document.type,
    id: document.id,
    title: document.title,
    ...(url ? { url } : {}),
  };
}

/**
 * Select only from bounded documents actually supplied to the provider in this turn.
 * Retrieving a record alone does not make it a source for the final answer.
 */
export function selectSources(input: {
  query: string;
  answer: string;
  documents: KnowledgeDocument[];
}): Source[] {
  const query = distinctiveTerms(input.query);
  const supportedAnswer = input.answer
    .split(/(?<=[.!?;])\s+|\n+|\bmas\b/i)
    .filter(
      (sentence) =>
        !/\b(?:nao (?:tenho|temos|ha|encontrei|consta|existem?)[\s\S]{0,70}(?:informac|dado|registro|evidenc)|nao (?:posso|consigo) confirmar|desconheco)\w*/.test(
          knowledgePhrase(sentence),
        ),
    )
    .join(' ');
  const answer = distinctiveTerms(supportedAnswer);
  const answerPhrase = ` ${knowledgePhrase(supportedAnswer)} `;
  const answerTechnologies = mentionedTechnologies(supportedAnswer);
  const queryTechnologies = mentionedTechnologies(input.query);
  // A personal project cannot substantiate duties at a third-party employer.
  // Keep company-experience evidence separate even when Java technologies overlap.
  const queryPhrase = knowledgePhrase(input.query);
  const employmentInquiry =
    /\b(?:sigaa|sig software|geowellex|acrux)\b/.test(queryPhrase) &&
    /\b(?:atuou|atuacao|contribuicao|responsabilidades?|empresa|emprego|trabalh\w*|experienc\w*)\b/.test(
      queryPhrase,
    );
  // Mixed vacancy questions may mention employers AND personal projects.
  // Restrict projects only for an exclusive inquiry about a third-party employer.
  const exclusiveEmploymentInquiry =
    employmentInquiry &&
    !/\b(?:projet\w*|repositori\w*|portfoli\w*|greencity os|hsp simulator|phasscode platform|spring boot)\b/.test(
      queryPhrase,
    );
  const documents = [
    ...new Map(
      input.documents
        .filter(
          (document) =>
            !exclusiveEmploymentInquiry ||
            (document.type !== 'project' && document.type !== 'platform'),
        )
        .map((document) => [document.id, document]),
    ).values(),
  ];
  const indexed = documents.map((document) => {
    // Evidence footnotes contain other record names and URLs; they are not the record's subject.
    const body = document.content.split(/\bFontes?\s*:/i)[0]!;
    const facts = distinctiveTerms(`${document.title} ${body}`);
    const subject = distinctiveTerms(`${document.title} ${document.id.replaceAll('-', ' ')}`);
    const technologies = mentionedTechnologies(
      document.technologies?.join(' ') ??
        `${document.title} ${document.keywords.join(' ')} ${body}`,
    );
    return { document, facts, subject, technologies };
  });
  const frequency = (term: string) => indexed.filter((entry) => entry.facts.has(term)).length;
  const weight = (term: string) => 1 + Math.log((documents.length + 1) / (frequency(term) + 1));

  const ranked = indexed
    .map(({ document, facts, subject, technologies }) => {
      const overlap = new Set([...answer].filter((term) => facts.has(term)));
      const subjectHits = [...subject].filter(
        (term) =>
          answer.has(term) && (frequency(term) < documents.length || documents.length === 1),
      );
      const exactTitle = knowledgePhrase(document.title);
      const explicitlyNamed = explicitSubject(document, answerPhrase);
      const named =
        explicitlyNamed ||
        subjectHits.some((term) => !mentionedTechnologies(term).size) ||
        (exactTitle.length > 4 && answerPhrase.includes(` ${exactTitle} `));
      const queryOverlap = [...query].some((term) => facts.has(term));
      const technologyMatch = technologyMatches(answerTechnologies, technologies);
      const requestedTechnology = technologyMatches(queryTechnologies, technologies);
      const project = document.type === 'project' || document.type === 'platform';
      // A common technology alone cannot justify a generic record with no stated facts.
      const relevant =
        explicitlyNamed ||
        (overlap.size >= 2 &&
          (named ||
            queryOverlap ||
            (technologyMatch && (requestedTechnology || queryTechnologies.size === 0))));
      const score =
        [...overlap].reduce((total, term) => total + weight(term), 0) +
        (explicitlyNamed ? 24 : named ? 8 : 0) +
        (project && technologyMatch ? 4 : 0) +
        (document.category === 'professional' && technologyMatch ? 4 : 0);
      return { document, overlap, relevant, named, explicitlyNamed, score };
    })
    .filter((entry) => entry.relevant)
    .sort((left, right) => {
      // Prefer a demonstrable project when factual relevance is comparable.
      const project = (document: KnowledgeDocument) =>
        (document.type === 'project' || document.type === 'platform') &&
        document.visibility !== 'private' &&
        document.visibility !== 'third-party' &&
        Boolean(validUrl(document.repositoryUrl) ?? validUrl(document.demoUrl));
      if (
        Math.abs(right.score - left.score) < 3 &&
        project(left.document) !== project(right.document)
      )
        return project(left.document) ? -1 : 1;
      return right.score - left.score || left.document.id.localeCompare(right.document.id);
    });

  // Once a named, evidence-backed project is present, generic technology
  // overlap must not add unrelated projects to the public citations.
  const hasNamedProject = ranked.some(
    (entry) =>
      entry.explicitlyNamed &&
      (entry.document.type === 'project' || entry.document.type === 'platform'),
  );
  const selected: Source[] = [];
  const covered = new Set<string>();
  const urls = new Set<string>();
  for (const entry of ranked) {
    if (
      hasNamedProject &&
      !entry.explicitlyNamed &&
      (entry.document.type === 'project' || entry.document.type === 'platform')
    )
      continue;
    const source = documentSource(entry.document);
    // Different employers often share the same public portfolio anchor.
    // They remain distinct records even when their reference URL is identical.
    if (source.url && urls.has(source.url) && entry.document.type !== 'profile') continue;
    const novel = [...entry.overlap].filter((term) => !covered.has(term));
    // Usually 1–3 sources suffice. Additional named records may support a longer answer.
    if (!entry.explicitlyNamed && selected.length > 0 && novel.length < (entry.named ? 1 : 2))
      continue;
    if (!entry.explicitlyNamed && selected.length >= 3 && !entry.named && novel.length < 4)
      continue;
    selected.push(source);
    for (const term of entry.overlap) covered.add(term);
    if (source.url) urls.add(source.url);
    if (selected.length === 10) break;
  }
  return selected;
}

/** Internal record IDs are not public citations or URLs. */
export function removeInternalCitationIds(answer: string): string {
  return answer
    .replace(/\s*\[(?:fonte|source):\s*(?:idiomas|cursos|formacao|experiencia)-[a-z0-9-]+\]/gi, '')
    .replace(/\s*\((?:(?:cursos|formacao|idiomas|experiencia)-[a-z0-9-]+(?:,\s*)?)+\)/gi, '');
}

/**
 * Apply bounded factual repairs ONLY when the actual documents passed to the
 * model contain affirmative evidence. Scoped gaps remain gaps: knowing Git
 * from a personal repository says nothing about Git at SIG Software.
 * No external tools, additional LLM requests or contract changes.
 */
export function reconcileDocumentedClaims(
  answer: string,
  documents: readonly KnowledgeDocument[],
): string {
  const verified = (id: string, pattern: RegExp) =>
    documents.some(
      (document) => document.id === id && pattern.test(knowledgePhrase(document.content)),
    );
  const mysql = verified('experiencia-geowellex', /\bgeowellex\b[\s\S]*\bmysql\b/);
  const java = verified('experiencia-sig', /\bsigaa\b[\s\S]*\bjava\b/);
  const react = verified('web-portfolio-v2', /\breact\b[\s\S]*\btypescript\b/);
  const versioning = verified('phasscode-platform', /\b(?:git|github actions|ci cd)\b/);
  const ci = verified('phasscode-platform', /\b(?:github actions|ci cd)\b/);
  const dockerProject = documents.some(
    (document) =>
      (document.type === 'platform' || document.type === 'project') &&
      document.category !== 'professional' &&
      document.technologies?.some((technology) => knowledgePhrase(technology) === 'docker') &&
      /\bdocker\b/.test(knowledgePhrase(document.content)),
  );
  const springStudy = documents.some(
    (document) =>
      document.id === 'webservice-springboot-jpa' &&
      /\bjpa\b/.test(knowledgePhrase(document.content)),
  );
  let result = answer;

  // Correct only unscoped denials when an actual author-owned Docker project
  // survived retrieval and compaction. Never claim commercial DevOps employment.
  if (dockerProject) {
    result = result
      .split('\n')
      .map((line) => {
        const normalized = knowledgePhrase(line);
        const dockerHeading = /^\s*(?:[-*]\s*)?(?:\*\*)?Docker\b/i.test(line);
        const denial =
          /\b(?:nao ha|nao verifiquei|nao foi comprovado|ausencia|lacuna|sem evidencia)\b/.test(
            normalized,
          );
        const specificallyEmployment =
          /\b(?:experiencia profissional|emprego|contrato|remunerad|corporativ|comercial|no sigaa|na geowellex)\b/.test(
            normalized,
          );
        if (!dockerHeading || !denial || specificallyEmployment) return line;
        return '**Docker** – Uso prático documentado em projetos autorais, incluindo PHASSCODE Platform (imagens, Docker Compose e CI/CD); isso não demonstra vínculo empregatício específico como DevOps.';
      })
      .join('\n');
  }
  if (springStudy && verified('experiencia-sig', /\bhibernate\b/)) {
    result = result
      .split('\n')
      .map((line) => {
        const normalized = knowledgePhrase(line);
        return /\bjpa\b/.test(normalized) &&
          /\b(?:sig software|sigaa)\b/.test(normalized) &&
          /\b(?:jpa e hibernate|hibernate e jpa|inclui hibernate e jpa)\b/.test(normalized)
          ? '**JPA / Hibernate** – Hibernate está documentado na experiência profissional SIGAA; JPA está demonstrado no webservice Spring Boot de estudo, sem evidência de uso profissional de JPA nesse vínculo.'
          : line;
      })
      .join('\n');
  }

  if (mysql) {
    // Preserve the scope of unrelated gaps (C++, C#, commercial REST)
    // while correcting only broad MySQL denials.
    result = result.replace(
      /,\s*nem de uso de MySQL\b/gi,
      '; há registro de PHP/MySQL na experiência profissional da Geowellex',
    );
    result = result.replace(
      /\bnão há (?:registro|evidência|comprovação) de (?:experiência|atuação|uso)(?: profissional)? (?:com |de )?MySQL\b/gi,
      'Há registro de PHP/MySQL na experiência profissional da Geowellex',
    );
    result = result.replace(
      /\bo banco relacional comprovado é PostgreSQL\b/gi,
      'os bancos relacionais documentados incluem PostgreSQL no SIGAA e MySQL na Geowellex',
    );
    result = result.replace(
      /\bFalta de experiência com MySQL\b/gi,
      'MySQL profissional declarado na Geowellex',
    );
    result = result.replace(
      /\bS[oó] PostgreSQL est[aá] documentado\b/gi,
      'PostgreSQL no SIGAA e MySQL na Geowellex estão documentados',
    );
    // Preserve the scope of remaining gaps after correcting MySQL.
    result = result.replace(
      /\bnão verifiquei MySQL,\s*nem\s+/gi,
      'MySQL consta na experiência profissional declarada da Geowellex (PHP/MySQL); não verifiquei ',
    );
    result = result.replace(
      /\bnão verifiquei (?:o uso (?:profissional )?de )?MySQL\b(?!\s+(?:no SIGAA|na ACRUX|em produção no SIGAA))/gi,
      'MySQL consta na experiência profissional declarada na Geowellex (PHP/MySQL); não foi auditado o código privado do sistema',
    );
    result = result.replace(
      /\bMySQL profissional não foi verificado\b/gi,
      'MySQL é documentado na experiência profissional declarada da Geowellex',
    );
  }
  if (react) {
    const projectDenial =
      /\b(?:não|nao)\s+(?:verifiquei|encontrei|há|ha|existem?|possui|consta)\b[^.!?\n]{0,280}\b(?:projetos?|reposit[oó]rios?)\b[^.!?\n]{0,280}\bReact\b[^.!?\n]*[.!?]?/gi;
    result = result.replace(projectDenial, (sentence) => {
      const normalized = knowledgePhrase(sentence);
      // "No commercial React project verified" may be true: personal
      // projects do not imply employment or corporate deliveries.
      if (/\bcomercia\w*\b/.test(normalized) && !/\b(?:autoral|pessoal)\b/.test(normalized))
        return sentence;
      return 'O projeto autoral PHASSCODE (web-portfolio-v2) documenta frontend com React e TypeScript; isso não comprova vínculo empregatício específico com React.';
    });
  }
  if (java) {
    result = result.replace(
      /\bnão verifiquei Java em produção nem experiência profissional como Desenvolvedor ou DevOps Júnior\b/gi,
      'A experiência profissional em Java na SIG Software/SIGAA está documentada; a atuação especificamente como DevOps Júnior não está comprovada',
    );
    result = result.replace(
      /\bnão verifiquei Java em produção\b(?!\s+(?:fora|com Spring|na ACRUX|na Greencity))/gi,
      'Há experiência profissional declarada com Java no SIGAA, embora o código privado e o ambiente de produção não tenham sido auditados',
    );
    result = result.replace(
      /\bJava em ambiente corporativo não est(?:á|ão) verificado(?:s)?\b/gi,
      'Java profissional na SIG Software/SIGAA está documentado',
    );
  }
  // Docker belongs to authored project evidence, not the SIGAA employment.
  // Remove only this narrowly scoped, unsupported compound attribution; keep
  // later mention of Docker when explicitly tied to PHASSCODE Platform.
  const sigaa = documents.find((document) => document.id === 'experiencia-sig');
  if (sigaa && !mentionedTechnologies(sigaa.technologies?.join(' ') ?? '').has('docker')) {
    result = result.replace(
      /\bPostgreSQL\s+e\s+Docker\s+documentados?\s+na\s+experi[eê]ncia\s+profissional(?=[^.!?\n]{0,150}\bSIGAA\b)/gi,
      'PostgreSQL documentado na experiência profissional',
    );
  }
  // Never deny Hibernate professional experience by grouping it with JPA.
  // SIGAA establishes Hibernate; JPA has separate evidence in a study project.
  // Change only an explicit employment denial, not an affirmative comparison.
  if (java && verified('experiencia-sig', /\bhibernate\b/)) {
    result = result
      .split(/(?<=[.!?])\s+/)
      .map((sentence) =>
        /\b(?:n[aã]o|nem|sem|aus[eê]ncia)\b/i.test(sentence) &&
        /\b(?:profissional|emprego|remunerad[ao])\b/i.test(sentence)
          ? sentence.replace(/\b(?:JPA\/Hibernate|Hibernate\/JPA)\b/gi, 'JPA')
          : sentence,
      )
      .join(' ');
  }
  if (versioning) {
    result = result.replace(
      /\bGit, versionamento específico e contribuições públicas de código \(não atribuir autoria exclusiva nem código público pessoal\)/gi,
      'Git e versionamento estão documentados nos repositórios autorais PHASSCODE; contribuições específicas em repositórios corporativos privados não estão comprovadas',
    );
    result = result.replace(
      /\bnão (?:verifiquei|foi comprovado) (?:uso de )?Git\b(?!\s+(?:no SIGAA|na SIG Software|em ambiente corporativo))/gi,
      'Git está documentado nos repositórios públicos autorais',
    );
  }
  if (ci) {
    result = result.replace(
      /\bNão há documentação de APIs REST com Swagger\/OpenAPI nem de CI\/CD na plataforma ou no portfólio recuperados\b/gi,
      'CI/CD com GitHub Actions está documentado na PHASSCODE Platform; a documentação Swagger/OpenAPI deve ser verificada separadamente',
    );
  }
  // Geowellex's stock system is private: never turn an employer's
  // undocumented code into a personal public GitHub repository.
  result = result
    .split('\n')
    .map((line) =>
      /\bGeowellex\b/i.test(line)
        ? line.replace(
            /\bO código est[aá] dispon[ií]vel publicamente(?: no reposit[oó]rio citado acima)?\.?/gi,
            'Não há repositório público desse sistema documentado.',
          )
        : line,
    )
    .join('\n');
  // A bold heading combining a professional Java role with REST may wrongly
  // imply that SIGAA implemented REST endpoints. REST belongs to separately
  // scoped project/study evidence unless the SIGAA stack explicitly says REST.
  if (
    java &&
    !mentionedTechnologies(sigaa?.technologies?.join(' ') ?? '').has('rest')
  ) {
    result = result.replace(
      /\*\*Java\s+e\s+APIs?\s+REST\*\*(?=\s*[–—-]\s*Na\s+SIG\s+Software)/gi,
      '**Java profissional no SIGAA**',
    );
  }
  // SIGAA is evidence of enterprise Java, not necessarily of REST endpoints.
  if (java) {
    result = result.replace(
      /\*\*POO e APIs REST em Java:\*\*(?=[^\n]*SIGAA)/gi,
      '**Desenvolvimento orientado a objetos em Java:**',
    );
  }
  return result;
}

/**
 * Complete the independent requirements of a complex recruiter question only
 * from canonical records included in this invocation's bounded LLM context.
 * No evidence is fetched implicitly and no employment is inferred from courses.
 */
export function completeRecruiterEvidence(
  answer: string,
  query: string,
  documents: readonly KnowledgeDocument[],
): string {
  const question = knowledgePhrase(query);
  const spoken = knowledgePhrase(answer);
  const byId = (id: string) => documents.find((document) => document.id === id);
  const additions: string[] = [];

  const geowellex = byId('experiencia-geowellex');
  if (
    /\bmysql\b/.test(question) &&
    geowellex &&
    /\bmysql\b/.test(knowledgePhrase(geowellex.content)) &&
    !/\bgeowellex\b/.test(spoken)
  ) {
    additions.push(
      'MySQL: consta na experiência profissional declarada na Geowellex, em sistema PHP/MySQL de controle de estoque; esse código privado não foi disponibilizado como repositório público.',
    );
  }
  const degree = byId('formacao-gestao-ti');
  if (
    /\b(?:formacao|graduacao|curso superior|computacao)\b/.test(question) &&
    degree &&
    /\b(?:concluiu|concluido|concluida)\b/.test(knowledgePhrase(degree.content)) &&
    !/\b(?:tecnologo|gestao da ti|gestao da tecnologia da informacao|etep|unibf)\b/.test(spoken)
  ) {
    additions.push(
      'Formação: Tecnólogo em Gestão da Tecnologia da Informação concluído; o diploma oficial foi emitido pelo Centro Universitário ETEP (identificado como UNIBF no portfólio).',
    );
  }
  const language = byId('idiomas-declarados');
  if (
    /\b(?:ingles|english|idioma)\b/.test(question) &&
    language &&
    /\b(?:ingles|leitura)\b/.test(knowledgePhrase(language.content)) &&
    !/\bingles\b/.test(spoken)
  ) {
    additions.push(
      'Idioma: inglês básico para leitura, conforme currículo declarado; não é comprovação de fluência.',
    );
  }
  if (!additions.length) return answer;
  const supplement = '\n\nEvidências adicionais: ' + additions.join(' ');
  return answer + supplement;
}

/**
 * Guardrail for recruiter tables, after model generation and before citations.
 * A row may never borrow a technology from a different named project. The
 * correction uses only source records supplied to this LLM invocation.
 * It does not infer capabilities from another project or private repository.
 */
export function auditRecruiterMatrix(
  answer: string,
  documents: readonly KnowledgeDocument[],
): string {
  if (!/\|\s*Requisito\s*\|/i.test(answer)) return answer;

  const knownProjects = [
    { id: 'phasscode-platform', name: /\bPHASSCODE Platform\b/i },
    { id: 'greencity-os', name: /\bGreencity OS\b/i },
    { id: 'web-portfolio-v2', name: /\bweb-portfolio-v2\b/i },
    { id: 'hsp-simulator', name: /\bHSP Simulator\b/i },
  ];
  const explicitStacks = [
    'mysql',
    'firebase',
    'flutter',
    'postgresql',
    'redis',
    'react',
    'typescript',
    'python',
    'java',
    'fastapi',
    'node',
    'docker',
    'git',
  ];
  const has = (document: KnowledgeDocument, technology: string): boolean => {
    const available = mentionedTechnologies(document.technologies?.join(' ') ?? '');
    return (
      available.has(technology) ||
      (technology === 'sql' && (available.has('mysql') || available.has('postgresql')))
    );
  };
  const sourceFor = (technology: string) => {
    const matched = documents.filter((document) => has(document, technology));
    // An employment record outranks a personal project, but private project
    // source code is never linked as if it were publicly accessible.
    return matched.sort((a, b) => {
      const priority = (document: KnowledgeDocument) =>
        document.category === 'professional' && document.type === 'project'
          ? 4
          : document.category === 'professional'
            ? 3
            : document.category === 'personal'
              ? 2
              : document.category === 'study'
                ? 1
                : 0;
      return priority(b) - priority(a);
    });
  };
  return answer
    .split('\n')
    .map((line) => {
      if (!line.trim().startsWith('|')) {
        // The LLM must not invent percentages or totals that were never
        // computed by the application. Keep the line-oriented evidence matrix.
        if (
          /\b(?:possui|atende|comprova|cobre)\b[^\n]{0,95}\b\d+\s*(?:\/|dos?|de)\s*\d+\b[^\n]{0,90}\brequisit/i.test(
            knowledgePhrase(line),
          ) ||
          /\brequisitos sem comprovacao\b[^\n]*\bnenhum\b/i.test(knowledgePhrase(line))
        )
          return 'A aderência deve ser avaliada por requisito na matriz; não foi calculado um total de requisitos atendidos.';
        return line;
      }
      const cells = line.split('|');
      if (cells.length < 5) return line;
      const requirement = mentionedTechnologies(cells[1] ?? '');
      const requested = [...requirement].find(
        (key) => key !== 'sql' || !requirement.has('sql-server'),
      );
      if (!requested) return line;
      const origin = cells[3] ?? '';
      const mentionedProject = knownProjects.filter((project) => project.name.test(origin));
      const invalid = mentionedProject.some(({ id }) => {
        const document = documents.find((candidate) => candidate.id === id);
        if (!document) return false;
        if (!has(document, requested)) return true;
        // A SQL row can legitimately say PostgreSQL. It cannot also attribute
        // MySQL to a project that only documents PostgreSQL.
        const claimedStack = mentionedTechnologies(origin);
        return explicitStacks.some(
          (technology) =>
            claimedStack.has(technology) &&
            !has(document, technology) &&
            // Ignore a second project's role when explicitly separated by a
            // semicolon or a distinct employment/project entry.
            !/\b(?:nao|não|sem|ausencia|ausência)\b/i.test(origin),
        );
      });
      if (!invalid) return line;
      const candidates = sourceFor(requested);
      if (candidates.length === 0) {
        cells[2] = ' Evidência insuficiente ';
        cells[3] = ' Associação ao projeto não comprovada ';
        cells[4] = ' — ';
        return cells.join('|');
      }
      const chosen = requested === 'sql' ? candidates.slice(0, 2) : candidates.slice(0, 1);
      cells[2] = chosen.some((d) => d.category === 'professional')
        ? ' Emprego ou projeto profissional '
        : chosen[0]!.category === 'study'
          ? ' Estudo '
          : ' Projeto autoral ';
      cells[3] = ' ' + chosen.map((d) => d.title).join('; ') + ' ';
      cells[4] =
        ' ' +
        chosen
          .map((d) => documentSource(d).url)
          .filter(Boolean)
          .join(' ; ') +
        ' ';
      return cells.join('|');
    })
    .join('\n');
}
