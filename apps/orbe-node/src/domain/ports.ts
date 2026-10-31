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
  technologies?: string[] | undefined;
  category?: 'professional' | 'personal' | 'study' | 'contribution' | undefined;
  role?: string | undefined;
  visibility?: 'public' | 'private' | 'third-party' | undefined;
  relatedProjectIds?: string[] | undefined;
  repositoryUrl?: string | undefined;
  demoUrl?: string | undefined;
  experiencePeriod?:
    | {
        start: string;
        end?: string | undefined;
        currentAsOf?: string | undefined;
        areas: ('software-development' | 'engineering')[];
      }
    | undefined;
}
export interface KnowledgeRepository {
  search(query: string): KnowledgeDocument[];
  getDocument?(id: string): KnowledgeDocument | undefined;
  experienceDocuments?(): KnowledgeDocument[];
}
export interface GenerationInput {
  message: string;
  history: Message[];
  documents: KnowledgeDocument[];
  signal: AbortSignal;
  meetingActions?: boolean;
  asOf?: Date;
  experienceIds?: string[];
}
export interface GenerationResult {
  answer: string;
  sources: Source[];
  actions?: ChatResponse['actions'];
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
    input: { id: string; tokenHash: string; isNew: boolean; analyticsConsent?: boolean },
    operation: (history: Message[]) => Promise<TurnResult>,
  ): Promise<ChatResponse>;
  withdrawReport?(id: string, tokenHash: string): Promise<void>;
  ready(): Promise<void>;
  close(): Promise<void>;
}
