import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeDocument } from '../domain/ports.js';
import { knowledgePhrase } from '../knowledge-matching.js';

export interface TechnicalCard {
  id: string;
  identity: { name: string; nature: string };
  classification: { applicationType: string };
  summary: { technical: string };
  stack: { name: string; usage: string; evidenceLevel: string }[];
  architecture: {
    style: string;
    components: string[];
    patterns: { name: string; application: string; evidenceLevel: string }[];
  };
  features: { name: string; description: string; status: string }[];
  engineering: {
    tests: { name: string; scope: string }[];
    ciCd: string[];
    security: string[];
    deployment: string[];
  };
  competencies: { name: string; demonstrates: string; evidenceLevel: string }[];
  limitations: { topic: string; status: string; description: string }[];
  sync: { verificationStatus: string };
}
interface Index {
  projects: { id: string; path: string }[];
  experiences: { id: string; path: string }[];
}
export interface ExperienceCard {
  id: string;
  kind: 'experience';
  organization: string;
  role: string;
  start: string;
  end: string | null;
  areas: string[];
  responsibilities: string[];
  stack: { name: string; usage: string; evidenceLevel: string }[];
  competencies: { name: string; demonstrates: string; evidenceLevel: string }[];
  limitations: { topic: string; status: string; description: string }[];
  sync: { verificationStatus: string };
}

export async function loadPpksExperienceCards(
  root = 'knowledge/ppks',
): Promise<Map<string, ExperienceCard>> {
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8')) as Index;
  const entries = await Promise.all(index.experiences.map(async ({ id, path }) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || path !== `experiences/${id}.json`)
      throw new Error('PPKS_EXPERIENCE_INVALID_PATH');
    const card = JSON.parse(await readFile(join(root, path), 'utf8')) as ExperienceCard;
    if (card.id !== id || card.kind !== 'experience') throw new Error('PPKS_EXPERIENCE_INVALID_CARD');
    return [id, card] as const;
  }));
  if (new Set(entries.map(([id]) => id)).size !== entries.length)
    throw new Error('PPKS_EXPERIENCE_DUPLICATE');
  return new Map(entries);
}

/** Structured professional evidence remains declared unless independently code-verified. */
export function enrichExperienceDocument(
  document: KnowledgeDocument,
  query: string,
  cards: ReadonlyMap<string, ExperienceCard>,
): KnowledgeDocument {
  if (!document.experiencePeriod) return document;
  const card = cards.get(document.id);
  if (!card) return document;
  const phrase = knowledgePhrase(query);
  const professional = /vaga|recrut|experien|profission|trabalh|contrat|cargo|responsab|stack|tecnolog/i.test(phrase);
  const lines = [
    `PPKS experiência: ${card.organization}, ${card.role}; período ${card.start} a ${card.end ?? 'atual conforme registro'}; fonte ${card.sync.verificationStatus}.`,
    `Tecnologias neste vínculo (não transferir para outros empregadores): ${card.stack.map(s => `${s.name} [${s.evidenceLevel}]`).join(', ')}.`,
  ];
  if (professional) {
    lines.push(`Responsabilidades registradas: ${card.responsibilities.slice(0, 2).join('; ')}.`);
    lines.push(`Limitações: ${card.limitations.slice(0, 2).map(l => l.description).join('; ') || 'sem detalhes adicionais'}.`);
  }
  const allowance = Math.min(850, Math.max(0, 6000 - document.content.length - 1));
  if (!allowance) return document;
  return { ...document, content: `${document.content}\n${lines.join('\n').slice(0, allowance)}` };
}

/** Read curated PPKS cards at startup; never fetch GitHub on a live chat request. */
export async function loadPpksCards(root = 'knowledge/ppks'): Promise<Map<string, TechnicalCard>> {
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8')) as Index;
  const cards = await Promise.all(
    index.projects.map(async (record) => {
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id) ||
        record.path !== `projects/${record.id}.json`
      )
        throw new Error('PPKS_INDEX_INVALID_PATH');
      const card = JSON.parse(await readFile(join(root, record.path), 'utf8')) as TechnicalCard;
      if (card.id !== record.id) throw new Error('PPKS_CARD_ID_MISMATCH');
      return [record.id, card] as const;
    }),
  );
  if (new Set(cards.map(([id]) => id)).size !== cards.length)
    throw new Error('PPKS_DUPLICATE_CARD');
  return new Map(cards);
}

/** Include only the PPKS facets relevant to this question, not all project cards. */
export function enrichProjectDocument(
  document: KnowledgeDocument,
  query: string,
  cards: ReadonlyMap<string, TechnicalCard>,
): KnowledgeDocument {
  const card = cards.get(document.id);
  if (!card || (document.type !== 'project' && document.type !== 'platform')) return document;

  const phrase = knowledgePhrase(query);
  const architecture =
    /arquitet|camadas?|padroes?|patterns?|design|service|repository|mvc|solid/i.test(phrase);
  const implementation =
    /como|funcion|implement|recurso|api|endpoint|crud|codigo|projeto|modulo/i.test(phrase);
  const quality = /test|qa|bug|corrig|erro|deploy|ci cd|seguranca|qualidade|git|devops/i.test(
    phrase,
  );
  const recruitment = /vaga|recrut|contrat|experien|habilidad|competenc|comprov|profission/i.test(
    phrase,
  );

  const lines = [
    `PPKS v1.0: ${card.identity.name} [${card.identity.nature}; ${card.classification.applicationType}; validação ${card.sync.verificationStatus}].`,
    `Stack do projeto: ${
      card.stack
        .filter((item) => item.usage !== 'planned' && item.usage !== 'unconfirmed')
        .map((item) => `${item.name} (${item.evidenceLevel})`)
        .join(', ') || 'não documentada'
    }.`,
  ];
  if (architecture) {
    lines.push(
      `Arquitetura: ${card.architecture.style}; componentes: ${card.architecture.components.join(', ') || 'não documentados'}.`,
    );
    lines.push(
      `Padrões: ${
        card.architecture.patterns
          .map((pattern) => `${pattern.name} [${pattern.evidenceLevel}]: ${pattern.application}`)
          .join('; ') || 'não documentados'
      }.`,
    );
  }
  if (implementation || recruitment)
    lines.push(
      `Funcionalidades: ${
        card.features
          .slice(0, 5)
          .map((feature) => `${feature.name} [${feature.status}]: ${feature.description}`)
          .join('; ') || 'consultar descrição original'
      }.`,
    );
  if (quality || recruitment) {
    lines.push(
      `Testes: ${
        card.engineering.tests.map((test) => `${test.name}: ${test.scope}`).join('; ') ||
        'não documentados'
      }.`,
    );
    lines.push(`CI/CD: ${card.engineering.ciCd.join('; ') || 'não documentado'}.`);
  }
  if (recruitment || architecture)
    lines.push(
      `Competências: ${card.competencies
        .slice(0, 4)
        .map((entry) => `${entry.name} [${entry.evidenceLevel}]: ${entry.demonstrates}`)
        .join('; ')}.`,
    );
  lines.push(
    `Limitações: ${
      card.limitations
        .slice(0, 6)
        .map((entry) => `${entry.topic} [${entry.status}]: ${entry.description}`)
        .join('; ') || 'sem ressalvas adicionais verificadas'
    }.`,
  );
  const allowance = Math.max(0, Math.min(2400, 6000 - document.content.length - 2));
  if (allowance === 0) return document;
  return { ...document, content: `${document.content}\n${lines.join('\n').slice(0, allowance)}` };
}
