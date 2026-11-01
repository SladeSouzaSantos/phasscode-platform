import { describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { SemanticKnowledgeGraph } from '../apps/orbe-node/src/adapters/semantic-graph.js';
import { loadAcademicEvidence } from '../apps/orbe-node/src/adapters/academic.js';

describe('PPKS: grafo semântico de competências com proveniência', () => {
  it('usa apenas documentos retidos para fundamentar React e Java', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const documents = ['web-portfolio-v2', 'experiencia-sig'].map((id) =>
      knowledge.getDocument(id)!,
    );
    const question = 'Vaga de React: como a experiência em Java e POO facilita adaptação?';
    const context = knowledge.semanticContext(question, documents);
    expect(context).toContain('React moderno');
    expect(context).toContain('Hooks');
    expect(context).toContain('não substitui prática');
    expect(context).toContain('web-portfolio-v2 (projeto)');
    expect(context).toContain('experiencia-sig (experiência profissional declarada)');
    expect(knowledge.semanticContext(question, [documents[1]!])).not.toContain(
      'web-portfolio-v2 (projeto)',
    );
  });

  it('SQL encontra evidências separadas de PostgreSQL e MySQL, sem promover um banco a outro', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = ['experiencia-geowellex', 'experiencia-sig'].map((id) =>
      knowledge.getDocument(id)!,
    );
    const result = knowledge.semanticContext('Experiência em SQL e bancos relacionais', docs);
    expect(result).toContain('MySQL permite consultas SQL');
    expect(result).toContain('PostgreSQL usa SQL');
    expect(result).toContain('experiencia-geowellex (experiência profissional declarada)');
    expect(result).toContain('experiencia-sig (experiência profissional declarada)');
  });

  it('distingue Firebase de Firestore e usa Redis como NoSQL apenas quando há fonte', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const sdgp = knowledge.getDocument('greencity-sdgp')!;
    const platform = knowledge.getDocument('phasscode-platform')!;
    const firebase = knowledge.semanticContext('Firebase, Firestore e NoSQL', [sdgp, platform]);
    expect(firebase).toContain('Firebase disponibiliza Cloud Firestore');
    expect(firebase).toContain('não comprova utilização de Firestore');
    expect(firebase).not.toContain('Cloud Firestore: greencity-sdgp');
    const noSql = knowledge.semanticContext('Projetos usando bancos NoSQL', [platform]);
    expect(noSql).toContain('Redis');
    expect(noSql).toContain('phasscode-platform (projeto)');
  });

  it('grafo não afirma capacidade técnica pessoal se a consulta não recebeu evidência', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const question = 'Java e React: conhecimentos transferíveis';
    const empty = knowledge.semanticContext(question, []);
    expect(empty).toBe('');
    const docs = [knowledge.getDocument('experiencia-sig')!];
    const message = knowledge.semanticContext(question, docs);
    expect(message).not.toContain('web-portfolio-v2 (projeto)');
    expect(message).toContain('experiencia-sig (experiência profissional declarada)');
  });

  it('rejeita relações pendentes e tecnologias falsamente atreladas a cursos', async () => {
    const academic = await loadAcademicEvidence();
    const valid = {
      schemaVersion: '1.0' as const,
      nodes: [{ id: 'a', label: 'A', kind: 'concept' as const, aliases: ['alpha'] }],
      edges: [
        {
          from: 'a',
          to: 'missing',
          relation: 'is_a' as const,
          description: 'A belongs to missing.',
        },
      ],
    };
    expect(() => new SemanticKnowledgeGraph(valid, academic.skills)).toThrow(
      'PPKS_GRAPH_DANGLING_EDGE',
    );
    const invalidSkill = {
      ...valid,
      nodes: [
        { id: 'a', label: 'A', kind: 'concept' as const, aliases: ['alpha'], skill: 'Made Up' },
      ],
      edges: [],
    };
    expect(() => new SemanticKnowledgeGraph(invalidSkill, academic.skills)).toThrow(
      'PPKS_GRAPH_UNKNOWN_SKILL',
    );
  });
});
