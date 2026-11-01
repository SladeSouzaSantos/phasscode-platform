import { describe, expect, it, vi } from 'vitest';
import { buildVerifiedRecruiterMatrix } from '../apps/orbe-node/src/application/recruiter-matrix.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const vacancy = 'Como recrutador, analise os 29 requisitos em uma matriz Markdown: Java, Hibernate, JBoss, Spring Boot, JPA, PostgreSQL, MySQL, SQL, SQL Server, Angular, React, TypeScript, Node.js, Python, FastAPI, Flutter, Firebase, Redis, Docker, Docker Swarm, Git, GitHub Actions, CI/CD, Vitest, Playwright, CodeQL, OWASP ZAP, inglês, graduação. Em cada linha classifique emprego/projeto/curso/insuficiente, sem atribuir stack a projeto errado.';

describe('Recruiter evidence matrix: 29 independent requirements', () => {
  it('produces 29 complete and correctly scoped rows without a generative token limit', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const matrix = buildVerifiedRecruiterMatrix(vacancy, knowledge.search(vacancy));
    expect(matrix).toBeDefined();
    expect(matrix!.requirements).toBe(29);
    const rows = matrix!.answer.split('\n').filter((line) => /^\| (?!Requisito|---)/.test(line));
    expect(rows).toHaveLength(29);
    for (const row of rows) expect(row.split('|')).toHaveLength(6);
    const bySkill = (skill: string) => rows.find((r) => r.startsWith('| ' + skill + ' |'))!;
    expect(bySkill('SQL Server')).toContain('Curso');
    expect(bySkill('SQL Server')).toContain('Udemy');
    expect(bySkill('SQL')).toContain('Experiência profissional');
    expect(bySkill('MySQL')).toContain('Geowellex');
    expect(bySkill('PostgreSQL')).toContain('SIGAA');
    expect(bySkill('Firebase')).toContain('SDGP');
    expect(bySkill('Flutter')).toContain('SDGP');
    expect(bySkill('Git')).toContain('Projeto autoral');
    expect(bySkill('TypeScript')).toContain('Projeto autoral');
    expect(bySkill('Graduação')).toContain('Formação concluída');
    expect(bySkill('Inglês')).toContain('inglês básico');
    expect(bySkill('OWASP ZAP')).toContain('PHASSCODE');
    expect(matrix!.answer).not.toMatch(/23\s*\/\s*29/);
    expect(matrix!.answer).not.toContain('MySQL | Projeto autoral | PHASSCODE Platform');
  });

  it('bypasses LLM and its provider-call quotas for complete structured recruiter matrices', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const generate = vi.fn(async () => ({ answer: 'LLM SHOULD NOT BE CALLED', sources: [] }));
    const service = new ChatService(
      new MemoryConversationStore(),
      { name: 'mock', generate },
      knowledge,
      loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '12000' }),
    );
    const response = await service.execute({ message: vacancy });
    expect(generate).not.toHaveBeenCalled();
    expect(response.meta.deterministic).toBe(true);
    expect(response.answer).toContain('| OWASP ZAP |');
    expect(response.answer).toContain('| Graduação |');
    expect(response.answer).not.toContain('LLM SHOULD NOT BE CALLED');
    expect(response.sources.length).toBeGreaterThan(0);
    expect(response.sources.length).toBeLessThanOrEqual(10);
  });

  it('does not replace a normal free-form recruiter question with a table', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    expect(buildVerifiedRecruiterMatrix('Qual sua experiência em Java, MySQL e Spring Boot?', knowledge.search('Java MySQL Spring Boot'))).toBeUndefined();
  });
});