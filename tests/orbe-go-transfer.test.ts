import { describe, expect, it, vi } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { buildDirectGoExperienceResponse } from '../apps/orbe-node/src/application/go-experience-response.js';
import type { KnowledgeRepository } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const directQuestions = [
  'Pedro tem experiência profissional com Go (Golang)?',
  'Pedro tem experiência com Go?',
  'Ele já trabalhou com Golang?',
  'Pedro possui experiência em Go em produção?',
  'Pedro domina Go?',
  'Pedro conhece Golang?',
];

describe('Orbe: Go direct assessment and grounded transferable skills', () => {
  it.each(directQuestions)(
    'answers a direct Go question with two grounded transferable skill areas: %s',
    async (question) => {
      const knowledge = await JsonKnowledgeRepository.load();
      const generate = vi.fn(async () => ({
        answer: 'Java, PHP, MySQL, Docker, Python, Dart, Flutter, HTML, CSS e JavaScript.',
        sources: [],
      }));
      const service = new ChatService(
        new MemoryConversationStore(),
        { name: 'mock', generate },
        knowledge,
        loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      );

      const response = await service.execute({ message: question });
      expect(generate).not.toHaveBeenCalled();
      expect(response.meta.deterministic).toBe(true);
      expect(response.answer).toContain('Não há experiência profissional com Go');
      expect(response.answer).toContain('Duas competências documentadas');
      expect(response.answer).toContain('**Backend Java no SIGAA (experiência profissional):**');
      expect(response.answer).toContain(
        '**APIs em Node.js/TypeScript no PHASSCODE Platform (projeto autoral):**',
      );
      expect(response.answer).toContain('transferíveis');
      expect(response.answer).toContain('não comprova domínio dessa linguagem');
      expect(response.answer.match(/^- \*\*/gm)).toHaveLength(2);
      expect(response.answer).not.toContain('PHP, MySQL, HTML');
      expect(response.answer).not.toContain('trabalhou com Go na');
      expect(response.sources.map((source) => source.id)).toEqual([
        'experiencia-sig',
        'phasscode-platform',
      ]);
      expect(response.sources.every((source) => source.url?.startsWith('https://'))).toBe(true);
    },
  );

  it.each([
    'Analise uma vaga que exige Go obrigatório, Java, Docker e CI/CD.',
    'Compare a experiência com Java e Go para uma candidatura.',
    'Pedro tem experiência profissional com Java e Go?',
    'Monte uma matriz de requisitos: Java, Go, Python e PostgreSQL.',
  ])(
    'leaves multi-skill or vacancy analysis to the regular recruiter route: %s',
    async (question) => {
      const knowledge = await JsonKnowledgeRepository.load();
      expect(buildDirectGoExperienceResponse(question, knowledge)).toBeUndefined();
    },
  );

  it('does not deny Go when verified Go evidence is later added to the catalog', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const goDocument = {
      ...knowledge.getDocument('phasscode-platform')!,
      id: 'future-go-project',
      keywords: ['go', 'golang'],
      technologies: ['Go'],
    };
    const withGo: KnowledgeRepository = {
      search: (query) => (query === 'Go Golang' ? [goDocument] : knowledge.search(query)),
      getDocument: (id) => knowledge.getDocument(id),
    };
    expect(
      buildDirectGoExperienceResponse('Pedro tem experiência com Go?', withGo),
    ).toBeUndefined();
  });

  it('does not invent transferable projects if a verified source is missing', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const withoutProject: KnowledgeRepository = {
      search: (query) => knowledge.search(query),
      getDocument: (id) => (id === 'phasscode-platform' ? undefined : knowledge.getDocument(id)),
    };
    expect(
      buildDirectGoExperienceResponse(
        'Pedro tem experiência profissional com Golang?',
        withoutProject,
      ),
    ).toBeUndefined();
  });

  it('preserves the standard generative route for an open Java question', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const generate = vi.fn(async () => ({
      answer: 'Java documentado no SIGAA com Hibernate e PostgreSQL.',
      sources: [],
    }));
    const service = new ChatService(
      new MemoryConversationStore(),
      { name: 'mock', generate },
      knowledge,
      loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    );
    const response = await service.execute({ message: 'Pedro tem experiência com Java?' });
    expect(generate).toHaveBeenCalledOnce();
    expect(response.meta.deterministic).toBeUndefined();
  });
});
