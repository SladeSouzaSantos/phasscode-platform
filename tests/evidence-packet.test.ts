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
});
