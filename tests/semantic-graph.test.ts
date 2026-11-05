import { describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { SemanticKnowledgeGraph } from '../apps/orbe-node/src/adapters/semantic-graph.js';
import { loadAcademicEvidence } from '../apps/orbe-node/src/adapters/academic.js';

describe('PPKS phase 3: graph-directed evidence planning', () => {
  it('proposes React project and Java professional evidence without equating the two', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = knowledge.search(
      'Sou recrutador para vaga React e TypeScript, com base transferível Java e POO.',
    );
    const ids = docs.map((doc) => doc.id);
    expect(ids).toContain('web-portfolio-v2');
    expect(ids).toContain('experiencia-sig');
    const graph = await SemanticKnowledgeGraph.load((await loadAcademicEvidence()).skills);
    const graphIds = graph.evidenceIds('React TypeScript Java POO');
    expect(graphIds[0]).toBe('web-portfolio-v2');
    expect(graphIds).toContain('experiencia-sig');
  });

  it('connects generic SQL to both professional databases without fabricated Firestore use', async () => {
    const graph = await SemanticKnowledgeGraph.load((await loadAcademicEvidence()).skills);
    const ids = graph.evidenceIds('Experiência com SQL em bancos relacionais');
    expect(ids).toContain('experiencia-geowellex');
    expect(ids).toContain('experiencia-sig');
    expect(graph.evidenceIds('Cloud Firestore')).toEqual([]);
  });

  it('does not infer professional employment from a technology relationship', async () => {
    const graph = await SemanticKnowledgeGraph.load((await loadAcademicEvidence()).skills);
    const ids = graph.evidenceIds('React');
    expect(ids).toContain('web-portfolio-v2');
    expect(ids).not.toContain('experiencia-sig');
    expect(ids).not.toContain('experiencia-geowellex');
  });
});

describe('F3.7 — recuperação semântica para perguntas reais de recrutador', () => {
  it('recupera projeto React via conceito de componentes sem exigir a palavra React', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const query =
      'Sou recrutador: para uma vaga de arquitetura de componentes, quais projetos relevantes existem?';
    const matches = knowledge.search(query).map((document) => document.id);
    expect(matches).toContain('web-portfolio-v2');
    expect(matches[0]).toBe('web-portfolio-v2');
    // A relação arquitetural não inventa experiência profissional com React.
    expect(matches).not.toContain('experiencia-sig');
  });

  it('recupera experiência Java para fundamentos de orientação a objetos sem keyword Java', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const matches = knowledge
      .search('Sou recrutador para vaga com orientação a objetos: quais evidências existem?')
      .map((document) => document.id);
    expect(matches).toContain('experiencia-sig');
  });

  it('continua apresentando evidências amplas em vagas genéricas sem assunto semântico', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const matches = knowledge.search('Quais qualificações Pedro tem para uma vaga de desenvolvedor?');
    expect(matches.map((document) => document.id)).toContain('experiencia-sig');
    expect(matches.map((document) => document.id)).toContain('phasscode-platform');
  });

  it('não inventa evidência relacionada para tecnologia não catalogada', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const matches = knowledge
      .search('Quais experiências Pedro tem para uma vaga com Zig?')
      .map((document) => document.id);
    expect(matches).not.toContain('web-portfolio-v2');
  });
});

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
