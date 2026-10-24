import type { AIMessage, BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';

// One invocation session per chat turn. Switching transports retains the same
// transcript and executed tools; the session owns reservations for each attempt.
export type LlmInvocationFactory = (
  tools: StructuredToolInterface[],
  signal: AbortSignal,
) => (messages: BaseMessage[]) => Promise<AIMessage>;
