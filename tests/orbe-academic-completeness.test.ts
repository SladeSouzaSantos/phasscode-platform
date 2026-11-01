import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { loadAcademicEvidence, requestedCompleteJavaCourses } from '../apps/orbe-node/src/adapters/academic.js';
import { removeInternalCitationIds, reconcileDocumentedClaims } from '../apps/orbe-node/src/application/sources.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const mixed = 'Pedro tem experiência com Java? Cite seus cursos Java concluídos, com instituições, e separadamente sua pós-graduação em andamento.';
const named = 'Quais cursos concluídos específicos de Java e arquitetura Pedro realizou? Liste os títulos e instituições e diferencie-os da pós-graduação Java Applied Engineering ainda em andamento.';

describe('Orbe: nine canonical Java courses and mixed career questions', () => {
  it('loads all nine canonical titles including the architecture-only Clean Code course', async () => {
    const evidence = await loadAcademicEvidence();
    const listing = requestedCompleteJavaCourses(named, evidence)!;
    expect(listing.courses).toHaveLength(9);
    expect(listing.courses.map((c) => c.id)).toContain('curso-clean-code-na-pratica');
    expect(listing.courses.every((c) => c.status === 'completed')).toBe(true);
    expect(listing.courses.every((c) => c.verification === 'owner_confirmed')).toBe(true);
    expect(requestedCompleteJavaCourses('Pedro tem experiência com Java?', evidence)).toBeUndefined();
  });

  it('keeps professional Java, all nine course rows and ongoing UNIPDS separate before inference', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const retrieved = knowledge.search(mixed);
    for (const id of [
      'experiencia-acrux', 'experiencia-sig', 'cursos-java-arquitetura',
      'formacao-unipds-java',
    ]) expect(retrieved.map((doc) => doc.id)).toContain(id);
    const course = retrieved.find((doc) => doc.id === 'cursos-java-arquitetura')!;
    const canonical = knowledge.academicCourseListing(mixed)!;
    for (const item of canonical.courses) {
      expect(course.content).toContain(item.title + ' — ' + item.provider);
    }
    expect(course.content).toContain('9 cursos livres');
    expect(course.content).not.toContain('Disciplinas:');
  });

  it.each([named, mixed])('responds all nine courses without calling a paid or free model: %s', async (query) => {
    const knowledge = await JsonKnowledgeRepository.load();
    const generate = vi.fn(async () => ({ answer: 'Esta lista possui apenas oito cursos.', sources: [] }));
    const service = new ChatService(
      new MemoryConversationStore(),
      { name: 'mock', generate },
      knowledge,
      loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '12000' }),
    );
    const result = await service.execute({ message: query });
    expect(generate).not.toHaveBeenCalled();
    expect(result.meta.deterministic).toBe(true);
    expect(result.answer).toContain('9 de 9 registros');
    expect(result.answer).not.toContain('oito cursos');
    const listing = knowledge.academicCourseListing(query)!;
    for (const course of listing.courses) {
      expect(result.answer).toContain('- ' + course.title + ' — ' + course.provider);
    }
    expect(result.answer).toContain('Clean Code na Prática — Udemy');
    expect(result.answer).toContain('**Pós-graduação em andamento**');
    expect(result.answer).not.toContain('Algoritmos e Programação —');
    expect(result.sources.some((source) => source.id === 'cursos-java-arquitetura')).toBe(true);
    expect(result.sources.every((source) => !source.url || source.url.startsWith('https://'))).toBe(true);
  });

  it('preserves employer stacks in mixed responses, without misattributing study JPA', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const provider = { name: 'mock' as const, generate: vi.fn() };
    const service = new ChatService(
      new MemoryConversationStore(),
      provider,
      knowledge,
      loadConfig({ NODE_ENV: 'test' }),
    );
    const result = await service.execute({ message: mixed });
    expect(result.answer).toContain('**Experiência profissional com Java**');
    expect(result.answer).toContain('Hibernate, JBoss, PostgreSQL');
    expect(result.answer).not.toContain('JPA, Hibernate, JBoss');
  });

  it('corrects the explicit SIGAA REST heading only when employer evidence is present', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const answer = '**Java e APIs REST** – Na SIG Software (jun/2016 – fev/2017), Pedro trabalhou no SIGAA com Java e PostgreSQL. No PHASSCODE Platform desenvolveu APIs.';
    const result = reconcileDocumentedClaims(answer, [
      knowledge.getDocument('experiencia-sig')!,
      knowledge.getDocument('phasscode-platform')!,
    ]);
    expect(result).toContain('**Java profissional no SIGAA** – Na SIG Software');
    expect(result).toContain('No PHASSCODE Platform desenvolveu APIs');
    expect(reconcileDocumentedClaims(answer, [knowledge.getDocument('phasscode-platform')!])).toBe(answer);
  });

  it('never exposes internal academic IDs as a public source', () => {
    expect(removeInternalCitationIds('Inglês básico para leitura. [fonte: idiomas-declarados]'))
      .toBe('Inglês básico para leitura.');
    expect(removeInternalCitationIds('Fontes: https://gbc.phasscode.com/#academico (cursos-java-arquitetura, formacao-unipds-java)'))
      .toBe('Fontes: https://gbc.phasscode.com/#academico');
  });
});
