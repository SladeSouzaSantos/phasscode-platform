import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { loadPpksCards } from '../apps/orbe-node/src/adapters/ppks.js';

describe('PPKS v1.0 — catálogo técnico e proveniência', () => {
  it('valida JSON Schema, índice, datas, identificadores e referências de evidência', () => {
    const result = execFileSync(process.execPath, ['scripts/ppks.mjs', 'check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result).toContain('PPKS_CHECK_OK: 22 projects, 4 experiences');
  });

  it('recupera 22 fichas e preserva SHA e data do commit quando verificados', async () => {
    const cards = await loadPpksCards();
    expect(cards.size).toBe(22);
    const java = cards.get('webservice-springboot-jpa');
    expect(java?.sync.verificationStatus).toBe('code_reviewed');
    expect(cards.has('phasscode-platform')).toBe(true);
  });

  it('responde pergunta arquitetural usando PPKS sem afirmar CRUD completo no estudo Java', async () => {
    const repository = await JsonKnowledgeRepository.load();
    const results = repository.search(
      'Explique a arquitetura e os padrões de projeto do webservice Spring Boot JPA',
    );
    const java = results.find((x) => x.id === 'webservice-springboot-jpa');
    expect(java?.content).toContain('PPKS v1.0');
    expect(java?.content).toContain('UserRepository');
    expect(java?.content).toContain('CRUD completo');
    expect(java?.content).toContain('not_implemented');
    expect(java?.content.length).toBeLessThanOrEqual(6000);
  });

  it('prioriza experiências com PostgreSQL e MySQL em perguntas sobre bancos profissionais', async () => {
    const repository = await JsonKnowledgeRepository.load();
    const results = repository.search(
      'Quais bancos relacionais e SQL foram usados profissionalmente?',
    );
    expect(results.map((x) => x.id)).toContain('experiencia-sig');
    expect(results.map((x) => x.id)).toContain('experiencia-geowellex');
    expect(results).toHaveLength(5);
  });

  it('não injeta fichas PPKS em repositórios de teste isolados', () => {
    const repository = new JsonKnowledgeRepository([
      {
        type: 'project',
        id: 'webservice-springboot-jpa',
        title: 'fixture',
        content: 'Teste',
        keywords: ['java'],
      },
    ]);
    expect(repository.search('Java')[0]?.content).toBe('Teste');
  });
});
