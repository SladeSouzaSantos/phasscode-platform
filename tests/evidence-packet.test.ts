import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import {
  buildEvidencePacket,
  traceEvidence,
} from '../apps/orbe-node/src/application/evidence-packet.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import type { GenerationInput, KnowledgeDocument } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { reconcileDocumentedClaims } from '../apps/orbe-node/src/application/sources.js';
import { mentionedTechnologies } from '../apps/orbe-node/src/knowledge-matching.js';

const doc = (id: string, content: string): KnowledgeDocument => ({
  id,
  title: id,
  type: 'project',
  keywords: [id],
  content,
});
afterEach(() => vi.restoreAllMocks());

describe('PPKS phase 1–2: provenance and fair evidence budget', () => {
  it('preserves each source and allocates a minimum before additional characters', () => {
    const originals = [
      doc('java', 'Java profissional '.repeat(120)),
      doc('backend', 'Node.js '.repeat(120)),
      doc('react', 'React e TypeScript implementados no portfolio. '.repeat(30)),
      doc('mysql', 'MySQL profissional na Geowellex. '.repeat(40)),
      doc('formacao', 'Tecnólogo Gestão TI concluído. '.repeat(40)),
    ];
    const packet = buildEvidencePacket(originals, 1200)!;
    expect(packet.documents.map(({ id }) => id)).toEqual(originals.map(({ id }) => id));
    expect(packet.retainedChars).toBeLessThanOrEqual(1200);
    for (const document of packet.documents) {
      expect(document.content.length).toBeGreaterThanOrEqual(96);
      expect(document.content).toBe(
        originals
          .find((item) => item.id === document.id)!
          .content.slice(0, document.content.length),
      );
    }
    expect(originals[0]!.content.length).toBeGreaterThan(1200);
  });

  it('preserves the recorded React stack when the description must be tiny', () => {
    const react = {
      ...doc(
        'web-portfolio-v2',
        'PHASSCODE é um portfólio profissional autoral com interface em React e TypeScript. '.repeat(
          10,
        ),
      ),
      technologies: ['React', 'TypeScript', 'Vite'],
    };
    const packet = buildEvidencePacket([react], 32)!;
    expect(packet.documents).toHaveLength(1);
    expect(packet.documents[0]!.content).toContain('React');
    expect(packet.documents[0]!.content).toContain('TypeScript');
    expect(packet.retainedChars).toBeLessThanOrEqual(32);
    expect(react.content).toContain('PHASSCODE');
  });

  it('fails closed rather than dropping React on an impossible budget', () => {
    const records = [doc('java', 'Java '.repeat(300)), doc('react', 'React '.repeat(300))];
    expect(buildEvidencePacket(records, 63)).toBeNull();
    expect(buildEvidencePacket(records, 64)?.documents.map(({ id }) => id)).toEqual([
      'java',
      'react',
    ]);
  });

  it('records only source IDs and lengths with explicit opt-in', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('ORBE_EVIDENCE_TRACE', 'false');
    traceEvidence('retrieved', [{ id: 'react', content: 'SENSITIVE_TEXT' }]);
    expect(spy).not.toHaveBeenCalled();
    vi.stubEnv('ORBE_EVIDENCE_TRACE', 'true');
    traceEvidence('chat_bounded', [{ id: 'react', content: 'SENSITIVE_TEXT' }], 'context_budget');
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]![0]);
    expect(logged).toContain('chat_bounded');
    expect(logged).toContain('react');
    expect(logged).not.toContain('SENSITIVE_TEXT');
    vi.unstubAllEnvs();
  });

  it('ChatService keeps the last high-value sources in a complex vacancy', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const query =
      'Sou recrutador de React e Java: quais projetos React TypeScript e experiência Java POO?';
    const ranked = knowledge.search(query);
    expect(ranked.map((item) => item.id)).toContain('web-portfolio-v2');
    let received: GenerationInput | undefined;
    const provider = {
      name: 'mock' as const,
      generate: async (input: GenerationInput) => {
        received = input;
        return { answer: 'Experiências e projetos documentados.', sources: [] };
      },
    };
    const service = new ChatService(
      new MemoryConversationStore(),
      provider,
      knowledge,
      loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '12000' }),
    );
    await service.execute({ message: query });
    expect(received).toBeDefined();
    expect(received!.documents.map(({ id }) => id)).toContain('web-portfolio-v2');
    expect(received!.documents.find((item) => item.id === 'web-portfolio-v2')!.content).toContain(
      'React',
    );
  });

  it('retrieves Docker, React, Java, MySQL, academic and language evidence from one 14-requirement vacancy', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const query =
      'Sou recrutador para uma vaga que exige Java, Spring Boot, JPA, Hibernate, SQL, PostgreSQL, MySQL, React, TypeScript, Docker, testes automatizados, Git, inglês técnico e formação superior. Diferencie emprego, projetos e estudos.';
    const documents = knowledge.search(query);
    const ids = documents.map(({ id }) => id);
    expect(ids).toContain('experiencia-sig');
    expect(ids).toContain('experiencia-geowellex');
    expect(ids).toContain('webservice-springboot-jpa');
    expect(ids).toContain('web-portfolio-v2');
    expect(ids).toContain('phasscode-platform');
    expect(ids).toContain('idiomas-declarados');
    expect(ids).toContain('formacao-gestao-ti');
    expect(documents.length).toBeGreaterThan(5);

    let received: GenerationInput | undefined;
    const service = new ChatService(
      new MemoryConversationStore(),
      {
        name: 'mock',
        generate: async (input: GenerationInput) => {
          received = input;
          return { answer: 'Evidências documentadas.', sources: [] };
        },
      },
      knowledge,
      loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '12000' }),
    );
    await service.execute({ message: query });
    expect(received).toBeDefined();
    expect(received!.documents.map(({ id }) => id)).toEqual(ids);
    expect(received!.documents.find(({ id }) => id === 'phasscode-platform')?.technologies).toContain(
      'Docker',
    );
    expect(received!.documents.find(({ id }) => id === 'experiencia-geowellex')?.category).toBe(
      'professional',
    );
  });

  it('handles more than twenty technology requirements without capping the document count at five', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const query =
      'Vaga para recrutador: Java, JavaScript, TypeScript, Python, Flutter, Dart, React, Node.js, Spring Boot, JPA, Hibernate, JBoss, PostgreSQL, MySQL, Redis, Docker, FastAPI, Fastify, Firebase, PHP, HTML, CSS, SQL, Git, CI/CD, testes automatizados, inglês, formação superior.';
    const documents = knowledge.search(query);
    const ids = documents.map(({ id }) => id);
    expect(documents.length).toBeGreaterThan(5);
    for (const id of [
      'experiencia-sig',
      'experiencia-geowellex',
      'webservice-springboot-jpa',
      'web-portfolio-v2',
      'phasscode-platform',
      'idiomas-declarados',
      'formacao-gestao-ti',
    ]) {
      expect(ids).toContain(id);
    }
    const present = new Set(documents.flatMap((doc) => [...mentionedTechnologies(doc.technologies?.join(' ') ?? '')]));
    for (const requirement of [
      'java',
      'typescript',
      'react',
      'mysql',
      'postgresql',
      'docker',
      'jpa',
      'hibernate',
      'redis',
      'php',
    ])
      expect(present.has(requirement)).toBe(true);
    const packet = buildEvidencePacket(documents, 2500);
    expect(packet?.documents).toHaveLength(documents.length);
  });

  it('repairs unsupported Docker gaps and JPA employment claims without inventing DevOps employment', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const sources = [
      knowledge.getDocument('phasscode-platform')!,
      knowledge.getDocument('experiencia-sig')!,
      knowledge.getDocument('webservice-springboot-jpa')!,
    ];
    const answer =
      '**Docker** – Não há evidência pública de que Pedro tenha trabalhado com Docker em projetos ou ambientes de produção. → **lacuna**\n' +
      '**JPA / Hibernate** – No mesmo vínculo com a SIG Software, a stack declarada inclui Hibernate e JPA.';
    const fixed = reconcileDocumentedClaims(answer, sources);
    expect(fixed).toContain('PHASSCODE Platform');
    expect(fixed).toContain('Docker Compose');
    expect(fixed).not.toContain('**lacuna**');
    expect(fixed).toContain('JPA está demonstrado no webservice Spring Boot de estudo');
    expect(fixed).not.toContain('Hibernate e JPA.');
    const scope = '**Docker** – Não há experiência profissional remunerada com Docker na SIGAA.';
    expect(reconcileDocumentedClaims(scope, sources)).toBe(scope);
    expect(reconcileDocumentedClaims(answer, [])).toBe(answer);
  });

});
