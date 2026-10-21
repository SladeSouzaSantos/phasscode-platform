import type { ChatProvider, GenerationInput, GenerationResult } from '../domain/ports.js';

export class MockChatProvider implements ChatProvider {
  readonly name = 'mock' as const;
  async generate(input: GenerationInput): Promise<GenerationResult> {
    return {
      answer: `[MOCK: resposta simulada, sem chamada a LLM] ${input.documents.length ? input.documents.map((doc) => doc.content).join('\n\n') : 'Essa informação ainda não consta na base pública do PHASSCODE.'}`,
      sources: input.documents.map(({ type, id, title, url }) => ({
        type,
        id,
        title,
        ...(url ? { url } : {}),
      })),
    };
  }
}
