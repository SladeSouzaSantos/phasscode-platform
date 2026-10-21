import type {
  ChatResponse,
  ProviderName,
  Source,
} from '../../../../packages/contracts/src/index.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
export interface KnowledgeDocument extends Source {
  content: string;
  keywords: string[];
}
export interface KnowledgeRepository {
  search(query: string): KnowledgeDocument[];
}
export interface GenerationInput {
  message: string;
  history: Message[];
  documents: KnowledgeDocument[];
  signal: AbortSignal;
}
export interface GenerationResult {
  answer: string;
  sources: Source[];
}
export interface ChatProvider {
  readonly name: ProviderName;
  generate(input: GenerationInput): Promise<GenerationResult>;
}
export interface TurnResult {
  response: ChatResponse;
  messages: Message[];
}
export interface ConversationStore {
  runTurn(
    input: { id: string; tokenHash: string; isNew: boolean },
    operation: (history: Message[]) => Promise<TurnResult>,
  ): Promise<ChatResponse>;
  ready(): Promise<void>;
  close(): Promise<void>;
}
