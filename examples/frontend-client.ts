import type { ChatRequest, ChatResponse } from '../packages/contracts/src/index.js';

// Copie/adapte apenas este cliente para o frontend existente. Tokens apenas em memória.
export class OrbeClient {
  private conversationId?: string;
  private token?: string;
  constructor(private readonly baseUrl: string) {}
  async send(message: string, signal?: AbortSignal): Promise<ChatResponse> {
    const body: ChatRequest = {
      message,
      ...(this.conversationId ? { conversationId: this.conversationId } : {}),
    };
    const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { 'X-Conversation-Token': this.token } : {}),
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok)
      throw new Error(
        `Falha no chat (${response.status}); referência ${response.headers.get('X-Correlation-Id') ?? 'indisponível'}`,
      );
    const result = (await response.json()) as ChatResponse;
    this.conversationId = result.conversationId;
    if (result.conversationToken) this.token = result.conversationToken;
    return result;
  }
  reset(): void {
    delete this.conversationId;
    delete this.token;
  }
}

export async function sendFromView(
  client: OrbeClient,
  message: string,
  view: {
    setLoading(value: boolean): void;
    showAnswer(answer: string, simulated: boolean): void;
    showError(message: string): void;
  },
) {
  view.setLoading(true);
  try {
    const response = await client.send(message);
    // Renderize como texto; se aceitar Markdown, sanitize HTML e links.
    view.showAnswer(response.answer, response.meta.simulated);
  } catch (error) {
    view.showError(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
  } finally {
    view.setLoading(false);
  }
}
// Availability/meeting requests serão adicionados na Fase 3, junto com contratos reais.
