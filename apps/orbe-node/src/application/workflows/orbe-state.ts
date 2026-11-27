import { Annotation } from '@langchain/langgraph';
import type { KnowledgeDocument, Message } from '../../domain/ports.js';
import type { ResolvedTurnContext } from '../intent/context-resolver.js';
import type { OrbeIntent } from '../intent/intent-schema.js';

export const OrbeState = Annotation.Root({
  message: Annotation<string>,
  history: Annotation<Message[]>,
  context: Annotation<ResolvedTurnContext>,
  intent: Annotation<OrbeIntent>,
  retrieved: Annotation<KnowledgeDocument[]>,
  experienceDocuments: Annotation<KnowledgeDocument[]>,
});
