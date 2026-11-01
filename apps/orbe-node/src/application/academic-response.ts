import type { AcademicCourseListing, KnowledgeDocument } from '../domain/ports.js';
import type { Source } from '../../../../packages/contracts/src/index.js';
import { knowledgePhrase } from '../knowledge-matching.js';
import { documentSource } from './sources.js';

/** A request for every course is a factual enumeration, never a model-estimated total. */
export function buildCompleteAcademicResponse(
  query: string,
  listing: AcademicCourseListing,
  retrieved: readonly KnowledgeDocument[],
): { answer: string; sources: Source[] } {
  const phrase = knowledgePhrase(query);
  const blocks: string[] = [];
  const cited: KnowledgeDocument[] = [];
  const byId = (id: string) => retrieved.find((doc) => doc.id === id);
  const addSource = (doc: KnowledgeDocument | undefined) => {
    if (doc && !cited.some((item) => item.id === doc.id)) cited.push(doc);
  };
  const work = /\b(?:experienc\w*|profission\w*|trabalh\w*|empreg\w*|vincul\w*)\b/.test(phrase);
  const project = /\b(?:projet\w*|webservice|spring boot|jpa)\b/.test(phrase);
  const postgraduate = /\b(?:pos graduacao|pos|unipds|andamento|java applied engineering)\b/.test(
    phrase,
  );
  const graduation = /\b(?:graduacao|tecnologo|diploma)\b/.test(phrase) && !postgraduate;
  if (work) {
    const jobs = ['experiencia-acrux', 'experiencia-sig']
      .map(byId)
      .filter(
        (doc): doc is KnowledgeDocument => doc !== undefined && doc.category === 'professional',
      );
    if (jobs.length) {
      blocks.push('**Experiência profissional com Java**');
      blocks.push(
        ...jobs.map((doc) => {
          addSource(doc);
          const role = doc.role ? ` — ${doc.role}` : '';
          const technologies =
            doc.technologies?.filter((tech) => tech !== 'Scrum').join(', ') ?? 'Java';
          return `- **${doc.title}**${role}: ${technologies}.`;
        }),
      );
    }
  }
  if (project) {
    const study = byId('webservice-springboot-jpa');
    if (study && study.category === 'study') {
      addSource(study);
      blocks.push(
        '**Projeto de estudo em Java**',
        `- ${study.title}: ${study.technologies?.join(', ') ?? 'Java'}. Isso é evidência de estudo, não experiência profissional no SIGAA.`,
      );
    }
  }

  const completed = listing.courses.filter((course) => course.status === 'completed');
  blocks.push(
    `**Cursos livres concluídos — ${listing.trackName} (${completed.length} de ${listing.courses.length} registros)**`,
    ...completed.map((course) => `- ${course.title} — ${course.provider}`),
  );
  addSource(byId(listing.trackId));

  if (postgraduate) {
    const degree = byId('formacao-unipds-java');
    if (degree) {
      addSource(degree);
      blocks.push(
        '**Pós-graduação em andamento**',
        `- ${degree.title}. Não é curso livre concluído nem diploma já emitido.`,
      );
    }
  } else if (graduation) {
    const degree = byId('formacao-gestao-ti');
    if (degree) {
      addSource(degree);
      blocks.push('**Graduação concluída**', `- ${degree.title}.`);
    }
  }

  // Ensure every course is attributed to the catalog, not to a degree transcript.
  const sourceLinks = [...new Set(cited.map((doc) => documentSource(doc).url).filter(Boolean))];
  if (sourceLinks.length) blocks.push('**Fontes públicas:** ' + sourceLinks.join(' · '));
  return {
    answer: blocks.join('\n\n'),
    sources: cited.map(documentSource),
  };
}
