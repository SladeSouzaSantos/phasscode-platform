import { describe, expect, it, vi } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { reconcileCanonicalAcademicClaims } from '../apps/orbe-node/src/application/canonical-claims.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

describe('Orbe: PPKS canonical claims in open recruiter answers', () => {
  async function facts() {
    const knowledge = await JsonKnowledgeRepository.load();
    const canonical = knowledge.canonicalAcademicFacts()!;
    expect(canonical.educations.find((item) => item.id === 'formacao-computacao')).toMatchObject({
      title: 'Bacharelado em Ciência da Computação',
      institution: 'UNISUL',
      status: 'pending_completion',
    });
    expect(canonical.tracks.find((item) => item.id === 'cursos-java-arquitetura')).toMatchObject({
      completedCount: 9,
      totalCount: 9,
    });
    return canonical;
  }

  it('repairs the exact wrong UNISUL degree introduced during a Go vacancy analysis', async () => {
    const canonical = await facts();
    const answer =
      'Docker e CI/CD pertencem ao PHASSCODE Platform. Graduação em Sistemas de Informação (UNISUL) está pendente, com previsão indicativa entre 2027 e 2028.';
    const result = reconcileCanonicalAcademicClaims(answer, canonical);
    expect(result.answer).toContain('Graduação em Ciência da Computação (UNISUL) está pendente');
    expect(result.answer).not.toContain('Sistemas de Informação');
    expect(result.answer).toContain('Docker e CI/CD pertencem ao PHASSCODE Platform');
    expect(result.rules).toEqual(['unisul_degree_title']);
    expect(result.sourceIds).toEqual(['formacao-computacao']);
  });

  it('repairs the literal DEV E2E false course claim without altering Java evidence', async () => {
    const answer =
      'Pedro possui nove cursos concluídos na trilha Java & Arquitetura. Porém, o curso de Sistemas de Informação na UNISUL está pendente, com previsão incerta para 2027/2028. Java profissional na SIG Software/SIGAA.';
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).toContain('o curso de Ciência da Computação na UNISUL está pendente');
    expect(result.answer).not.toContain('Sistemas de Informação');
    expect(result.answer).toContain('nove cursos concluídos na trilha Java & Arquitetura');
    expect(result.answer).toContain('Java profissional na SIG Software/SIGAA');
    expect(result.rules).toEqual(['unisul_degree_title']);
    expect(result.sourceIds).toEqual(['formacao-computacao']);
  });

  it('repairs the exact eight-course total phrase observed after 70da738 DEV deploy', async () => {
    const answer =
      'O resumo está parcialmente correto: Pedro Santos declarou a conclusão de oito cursos da trilha Java & Arquitetura, estudo livre que não equivale a experiência profissional. A graduação em Ciência da Computação na UNISUL está pendente. Java profissional em ACRUX e SIGAA.';
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).toContain('conclusão de nove cursos da trilha Java & Arquitetura');
    expect(result.answer).not.toContain('conclusão de oito cursos');
    expect(result.answer).toContain('Ciência da Computação na UNISUL está pendente');
    expect(result.answer).toContain('Java profissional em ACRUX e SIGAA');
    expect(result.rules).toEqual(['java_track_completed_count']);
    expect(result.sourceIds).toEqual(['cursos-java-arquitetura']);
  });

  it.each([
    'Pedro concluiu oito cursos da trilha Java & Arquitetura.',
    'Pedro completou 8 cursos na trilha Java e Arquitetura.',
    'O aluno declarou a conclusão de oito cursos da trilha Java & Arquitetura.',
  ])('normalizes alternative complete-track course totals: %s', async (answer) => {
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).not.toMatch(/\b(?:8|oito)\s+cursos\b/i);
    expect(result.answer).toMatch(/\b(?:9|nove)\s+cursos\b/i);
    expect(result.sourceIds).toEqual(['cursos-java-arquitetura']);
  });

  it('repairs the full literal DEV claim where completion follows the track name', async () => {
    const original =
      'Parcialmente correto. Os oito cursos da trilha Java & Arquitetura estão concluídos, mas são estudo livre, não emprego, e a pós-graduação Java Applied Engineering na UNIPDS está em andamento. A experiência profissional em Java inclui a ACRUX e o SIGAA.';
    const result = reconcileCanonicalAcademicClaims(original, await facts());
    expect(result.answer).toContain('Os nove cursos da trilha Java & Arquitetura estão concluídos');
    expect(result.answer).toContain('a ACRUX e o SIGAA');
    expect(result.rules).toEqual(['java_track_completed_count']);
    expect(result.sourceIds).toEqual(['cursos-java-arquitetura']);
  });

  it.each([
    'Os oito cursos da trilha Java & Arquitetura estão concluídos.',
    'Os 8 cursos da trilha Java & Arquitetura foram concluídos.',
    'Os sete cursos da trilha Java & Arquitetura estão concluídos.',
  ])('corrects completed total claims with status after the track: %s', async (answer) => {
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).not.toMatch(/\b(?:oito|8|sete)\s+cursos\b/i);
    expect(result.answer).toMatch(/\b(?:nove|9)\s+cursos\b/i);
    expect(result.rules).toEqual(['java_track_completed_count']);
  });

  it('answers the exact UNISUL degree when it was omitted in a multi-topic fact-check', async () => {
    const query =
      "Revise o resumo: oito cursos concluídos na trilha Java & Arquitetura e Sistemas de Informação na UNISUL. Está correto?";
    const answer =
      'São nove cursos concluídos na trilha Java & Arquitetura. A graduação na UNISUL está pendente. Java profissional no SIGAA.';
    const result = reconcileCanonicalAcademicClaims(answer, await facts(), query);
    expect(result.answer).toContain('Bacharelado em Ciência da Computação');
    expect(result.answer).toContain('ainda não concluído');
    expect(result.answer).toContain('São nove cursos');
    expect(result.answer).toContain('Java profissional no SIGAA');
    expect(result.rules).toEqual(['unisul_degree_explicit_answer']);
    expect(result.sourceIds).toEqual(['formacao-computacao']);
  });

  it('repairs the exact eight-course claim while retaining a Java career summary', async () => {
    const canonical = await facts();
    const answer =
      'Java profissional no SIGAA; além de oito cursos concluídos na trilha Java & Arquitetura.';
    const result = reconcileCanonicalAcademicClaims(answer, canonical);
    expect(result.answer).toContain('nove cursos concluídos na trilha Java & Arquitetura');
    expect(result.answer).toContain('Java profissional no SIGAA');
    expect(result.sourceIds).toEqual(['cursos-java-arquitetura']);
  });

  it.each([
    'A trilha Java e Arquitetura tem 8 cursos concluídos.',
    'A trilha Java & Arquitetura possui oito cursos livres concluídos.',
    'Oito cursos concluídos na trilha Java & Arquitetura.',
  ])('repairs only complete-track counts in reversed and direct phrasing: %s', async (answer) => {
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).not.toMatch(/\b(?:8|oito)\b/i);
    expect(result.answer).toMatch(/\b(?:9|nove)\b/i);
    expect(result.rules).toEqual(['java_track_completed_count']);
  });

  it.each([
    'Ele apresentou oito dos nove cursos da trilha Java & Arquitetura.',
    'Pedro apresentou oito cursos da trilha Java & Arquitetura nesta seleção.',
    'Os oito cursos da trilha Java & Arquitetura foram selecionados como exemplos.',
    'Os oito cursos da trilha Java & Arquitetura não estão concluídos.',
    'Pedro não concluiu oito cursos da trilha Java & Arquitetura.',
    'Não são oito cursos concluídos na trilha Java & Arquitetura, mas nove.',
    'A afirmação de oito cursos concluídos na trilha Java & Arquitetura está incorreta.',
    'Concluiu oito cursos de Java que selecionou para esta apresentação.',
    'Formação Java & Arquitetura: oito exemplos de cursos.',
    'Cursou Sistemas de Informação em uma instituição diferente da UNISUL.',
    'Pedro não cursou Sistemas de Informação na UNISUL; cursou Ciência da Computação.',
    'A graduação em Ciência da Computação na UNISUL ainda não foi concluída.',
    'Possui pós-graduação concluída em Segurança da Informação (FacPrisma).',
    'Experiência em Go não documentada, Java no SIGAA e Docker no PHASSCODE.',
  ])('does not over-correct an ambiguous or already correct statement: %s', async (answer) => {
    const result = reconcileCanonicalAcademicClaims(answer, await facts());
    expect(result.answer).toBe(answer);
    expect(result.rules).toEqual([]);
    expect(result.sourceIds).toEqual([]);
  });

  it('reconciles explicit affirmative false degree completion, without altering other degrees', async () => {
    const canonical = await facts();
    const answer =
      'A graduação em Ciência da Computação pela UNISUL foi concluída. O tecnólogo em Gestão da TI foi concluído.';
    const result = reconcileCanonicalAcademicClaims(answer, canonical);
    expect(result.answer).toContain('UNISUL ainda não foi concluída');
    expect(result.answer).toContain('O tecnólogo em Gestão da TI foi concluído');
    expect(result.sourceIds).toEqual(['formacao-computacao']);
  });

  it('does not attempt a correction when curated PPKS is absent', () => {
    const answer = 'Graduação em Sistemas de Informação (UNISUL) está pendente.';
    expect(reconcileCanonicalAcademicClaims(answer, undefined).answer).toBe(answer);
  });

  it('reconciles a mock LLM output before storing it, with relevant public source links', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const generate = vi.fn(async () => ({
      answer:
        'Pedro trabalhou com Java no SIGAA, além de oito cursos concluídos na trilha Java & Arquitetura. Graduação em Sistemas de Informação (UNISUL) está pendente.',
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
    expect(response.answer).toContain('nove cursos concluídos na trilha Java & Arquitetura');
    expect(response.answer).toContain('Graduação em Ciência da Computação (UNISUL)');
    expect(response.answer).toContain('Pedro trabalhou com Java no SIGAA');
    expect(response.meta.deterministic).toBeUndefined();
    expect(response.sources.map((source) => source.id)).toEqual([
      'cursos-java-arquitetura',
      'formacao-computacao',
    ]);
    expect(response.sources.every((source) => source.url?.startsWith('https://'))).toBe(true);
  });

  it('keeps direct Go deterministic, without invoking LLM or academic correction', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const generate = vi.fn(async () => ({ answer: 'Oito cursos.', sources: [] }));
    const service = new ChatService(
      new MemoryConversationStore(),
      { name: 'mock', generate },
      knowledge,
      loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    );
    const response = await service.execute({
      message: 'Pedro tem experiência profissional com Go (Golang)?',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(response.meta.deterministic).toBe(true);
    expect(response.answer).toContain('Duas competências documentadas');
  });
});
