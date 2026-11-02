import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import {
  Neo4jEvidenceRepository,
  graphConstraintCypher,
  graphFindEvidenceCypher,
  graphPruneNodesCypher,
  planNeo4jGraphSeed,
} from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';

describe('F3.2: Cypher parametrizado, escopo de grafo e operação opt-in', () => {
  it('gera operações estáveis e idempotentes para todo o PPKS', async () => {
    const graph = await projectPpksEvidenceGraph();
    const first = planNeo4jGraphSeed(graph);
    const second = planNeo4jGraphSeed(graph);
    expect(first).toEqual(second);
    expect(first.nodes).toBe(graph.nodes.length);
    expect(first.relations).toBe(graph.relations.length);
    expect(first.operations).toHaveLength(4);
    expect(first.snapshot).toMatch(/^[a-f0-9]{64}$/);
    expect(first.operations.every((operation) => operation.query.includes('$'))).toBe(true);
    expect(first.operations.at(-1)!.query).toBe(graphPruneNodesCypher);
    expect(graphConstraintCypher).toContain('IF NOT EXISTS');
  });

  it('não promove relações técnicas nem cursos a vínculo profissional', async () => {
    const graph = await projectPpksEvidenceGraph();
    const plan = planNeo4jGraphSeed(graph);
    const data = plan.operations[0]!.params.rows as {
      id: string;
      properties: Record<string, unknown>;
    }[];
    const pending = data.find((entry) => entry.id === 'formacao-computacao');
    expect(pending?.properties.status).toBe('pending_completion');
    const study = data.find((entry) => entry.id === 'webservice-springboot-jpa');
    expect(study?.properties.category).toBe('study');
    const claims = data.filter((entry) => entry.properties.kind === 'claim');
    expect(
      claims.filter(
        (entry) =>
          entry.properties.scope === 'professional' &&
          String(entry.properties.objectId).includes('go'),
      ),
    ).toHaveLength(0);
  });

  it('consulta só Cypher fixo com parâmetros e exige toda proveniência da claim', async () => {
    const claim = {
      kind: 'claim',
      id: 'claim-project-skill-react',
      label: 'Projeto React',
      subjectId: 'project',
      predicate: 'USES_TECHNOLOGY',
      objectId: 'skill-react',
      scope: 'personal_project',
      sourceIds: ['source-project-1', 'source-project-2'],
    };
    const source = {
      kind: 'source',
      id: 'source-project-1',
      label: 'Repo',
      origin: 'github',
      visibility: 'public',
      verificationStatus: 'code_reviewed',
    };
    const read = vi
      .fn()
      .mockResolvedValue([{ claim: JSON.stringify(claim), sources: [JSON.stringify(source)] }]);
    const repository = new Neo4jEvidenceRepository({ read });
    const result = await repository.findEvidence([
      { kind: 'vacancy_requirement', id: 'react', label: 'React', mandatory: true },
    ]);
    expect(read).toHaveBeenCalledWith(graphFindEvidenceCypher, { skill: 'React', limit: 5 });
    expect(result[0]).toEqual({ requirementId: 'react', claims: [], sources: [] });
  });

  it('nunca usa a pergunta como Cypher e limita o número de claims', async () => {
    const read = vi.fn().mockResolvedValue([]);
    const repo = new Neo4jEvidenceRepository({ read });
    await repo.findEvidence(
      [
        {
          kind: 'vacancy_requirement',
          id: 'r',
          label: 'React") DETACH DELETE n //',
          mandatory: true,
        },
      ],
      { maxClaimsPerRequirement: 1000 },
    );
    const [cypher, params] = read.mock.calls[0]!;
    expect(cypher).toBe(graphFindEvidenceCypher);
    expect(params).toEqual({ skill: 'React") DETACH DELETE n //', limit: 20 });
    expect(cypher).not.toContain('DELETE n //');
  });

  it('não publica Bolt/Browser nem habilita Neo4j por padrão no DEV', async () => {
    const overlay = YAML.parse(await readFile('compose.graphrag.dev.yaml', 'utf8')) as {
      services: {
        neo4j: { profiles: string[]; ports?: string[]; networks: string[]; secrets: string[] };
      };
    };
    const service = overlay.services.neo4j;
    expect(service.profiles).toContain('graphrag');
    expect(service.ports).toBeUndefined();
    expect(service.networks).toContain('backend');
    expect(service.secrets).toContain('neo4j_auth');

    const original = YAML.parse(await readFile('compose.yaml', 'utf8')) as {
      services: Record<string, unknown>;
    };
    expect(original.services).not.toHaveProperty('neo4j');
  });
});
