import { describe, expect, it, vi } from 'vitest';
import { RestrictedPublicEvidenceReader } from '../apps/orbe-node/src/application/public-evidence.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const vacancy = 'https://www.linkedin.com/jobs/view/4482546362/';

function htmlResponse(content: string, type = 'text/html') {
  return new Response(content, { status: 200, headers: { 'Content-Type': type } });
}

describe('leitura pública limitada para vagas e projetos', () => {
  it('extrai JobPosting de uma vaga específica, sem seguir links ou executar instruções', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      htmlResponse('<script type="application/ld+json">' + JSON.stringify({
        '@type': 'JobPosting', title: 'Pessoa desenvolvedora Java',
        description: '<p>Requer Java, PostgreSQL, testes automatizados e Spring Boot. Trabalho com APIs e revisão de código.</p>'.repeat(2),
      }) + '</script>'),
    );
    const reader = new RestrictedPublicEvidenceReader(fetcher);
    const docs = await reader.read('Sou recrutadora, a vaga está em ' + vacancy, []);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.content).toContain('PostgreSQL');
    expect(docs[0]?.content).toContain('Spring Boot');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(vacancy);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
  });

  it('não inventa requisitos de uma vaga bloqueada e não acessa domínios arbitrários', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('blocked', { status: 403 }));
    const reader = new RestrictedPublicEvidenceReader(fetcher);
    const docs = await reader.read('Avalie a vaga ' + vacancy + ' contra a experiência de Pedro', []);
    expect(docs[0]?.content).toContain('não pôde ser extraída');
    expect(docs[0]?.content).toContain('Não deduza requisitos');
    expect(await reader.read('Leia https://127.0.0.1:3001/admin e https://169.254.169.254/latest', []))
      .toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejeita respostas grandes ou tipos inseguros', async () => {
    const reader = new RestrictedPublicEvidenceReader(async () =>
      htmlResponse('<h1>conteúdo</h1>', 'image/png'),
    );
    expect((await reader.read('vaga ' + vacancy, []))[0]?.content).toContain('não pôde ser extraída');
  });

  it('usa somente README público de repositório de propriedade conhecida e limita o trecho', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => htmlResponse(
      '# PHASSCODE Platform\nAplicação backend de LLMs, integração de modelos, REST APIs e dados estruturados. '.repeat(25),
      'text/plain',
    ));
    const reader = new RestrictedPublicEvidenceReader(fetcher);
    const docs = await reader.read('Conte sobre o projeto PHASSCODE e seu repositório', [{
      id: 'phasscode-platform', type: 'platform', title: 'Plataforma',
      keywords: ['LLM'], content: 'Backend próprio', visibility: 'public',
      repositoryUrl: 'https://github.com/SladeSouzaSantos/phasscode-platform',
    }, {
      id: 'foreign', type: 'project', title: 'projeto de terceiros',
      keywords: ['java'], content: 'outros',
      repositoryUrl: 'https://github.com/outro/projeto',
    }]);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe('phasscode-platform');
    expect(docs[0]?.content).toContain('Trecho público do README');
    expect(docs[0]?.content.length).toBeLessThan(2200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toMatch(/^https:\/\/api\.github\.com\/repos\/SladeSouzaSantos\//);
  });

  it('permite ao modelo comparar dados da vaga com o perfil sem depender de HTTP real', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const captured: string[][] = [];
    const service = new ChatService(new MemoryConversationStore(), {
      name: 'openai-compatible',
      generate: async (input) => {
        captured.push(input.documents.map(doc => doc.id));
        return { answer: 'Há experiência Java profissional, mas a compatibilidade depende dos requisitos.', sources: [] };
      },
    }, knowledge, loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    false, () => new Date('2026-10-29T12:00:00Z'), {
      read: async () => [{
        id: 'external-vacancy', type: 'service', title: 'Vaga pública',
        content: 'Vaga exige Java, Spring Boot, APIs REST e experiência em equipe.',
        keywords: ['vaga'],
      }],
    });
    await service.execute({ message: 'A vaga é ' + vacancy + '. Pedro é compatível?' });
    expect(captured[0]).toContain('external-vacancy');
    expect(captured[0]).toContain('experiencia-sig');
  });

  it('pergunta sobre júnior, pleno e sênior é do escopo profissional', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const result = knowledge.search('Ele pode ser considerado um Junior, Pleno ou Senior?');
    expect(result.length).toBeGreaterThan(0);
    const generator = vi.fn(async () => ({ answer: 'A avaliação depende do escopo e da autonomia demonstrada.', sources: [] }));
    const service = new ChatService(new MemoryConversationStore(), { name: 'openai-compatible', generate: generator }, knowledge,
      loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    await service.execute({ message: 'Ele pode ser considerado um Junior, Pleno ou Senior?' });
    expect(generator).toHaveBeenCalledOnce();
  });
});
