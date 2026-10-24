import type { ChatProvider, GenerationInput, GenerationResult } from '../domain/ports.js';
import { selectSources } from '../application/sources.js';

export class MockChatProvider implements ChatProvider {
  readonly name = 'mock' as const;
  async generate(input: GenerationInput): Promise<GenerationResult> {
    const answer = `[MOCK: resposta simulada, sem chamada a LLM] ${input.documents.length ? input.documents.map((doc) => doc.content).join('\n\n') : 'Essa informação ainda não consta na base pública do PHASSCODE.'}`;
    return {
      answer,
      sources: selectSources({ query: input.message, answer, documents: input.documents }),
    };
  }
}
