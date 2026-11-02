import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import type { GenerationInput } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { matrixSchema } from '../evaluation/schema.js';

describe('matriz v3 contra recuperação e políticas reais, sem LLM', () => {
  it('preserva fontes obrigatórias completas nos 22 turnos e distingue os três turnos determinísticos', async () => {
    const matrix = matrixSchema.parse(JSON.parse(await readFile('evaluation/cases.json', 'utf8')));
    const catalog = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8')) as {
      id: string;
      content: string;
    }[];
    const knowledge = await JsonKnowledgeRepository.load();
    let modelTurns = 0;
    let policyTurns = 0;
    for (const scenario of matrix.cases) {
      const store = new MemoryConversationStore();
      let captured: GenerationInput | undefined;
      const service = new ChatService(
        store,
        {
          name: 'openai-compatible',
          generate: async (input) => {
            captured = input;
            modelTurns += 1;
            return {
              answer: 'Resposta sintética: este teste verifica contexto, sem avaliar geração.',
              sources: input.documents.map(({ type, id, title, url }) => ({
                type,
                id,
                title,
                ...(url ? { url } : {}),
              })),
            };
          },
        },
        knowledge,
        loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      );
      let conversationId: string | undefined;
      let token: string | undefined;
      for (const turn of scenario.turns) {
        captured = undefined;
        const result = await service.execute(
          { message: turn.message, ...(conversationId ? { conversationId } : {}) },
          token,
        );
        conversationId = result.conversationId;
        token ??= result.conversationToken;
        if (!captured) policyTurns += 1;
        for (const id of turn.expect.requiredSourceIds) {
          expect(
            result.sources.map((source) => source.id),
            scenario.id,
          ).toContain(id);
          if (captured) {
            const document = (captured as GenerationInput).documents.find((doc) => doc.id === id);
            // PPKS appends technical facets without replacing the original catalog evidence.
            expect(document?.content, `${scenario.id}: ${id} mantém fonte original`).toContain(
              catalog.find((doc) => doc.id === id)?.content,
            );
          }
        }
        if (turn.expect.sourcePolicy === 'none') expect(result.sources, scenario.id).toEqual([]);
        expect(token).toHaveLength(43);
      }
      await store.close();
    }
    expect(modelTurns).toBe(19);
    expect(policyTurns).toBe(3);
  });
});
