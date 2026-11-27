import { meetingProposalInputSchema } from '../../../../../packages/contracts/src/meetings.js';
import { AppError } from '../../domain/errors.js';
import type { MeetingTools } from '../../domain/meeting-tools.js';
import type { GenerationInput, GenerationResult, KnowledgeRepository } from '../../domain/ports.js';
import { createSearchPortfolioTool, searchPortfolioArgs } from './search-portfolio.tool.js';
import {
  createMeetingAvailabilityTool,
  meetingAvailabilityArgs,
} from './meeting-availability.tool.js';
import { createPrepareMeetingRequestTool } from './prepare-meeting-request.tool.js';

interface ToolRegistryOptions {
  knowledge: KnowledgeRepository;
  meetings: MeetingTools | undefined;
  meetingActions: boolean;
  signal: AbortSignal;
  actions: NonNullable<GenerationResult['actions']>;
  serialize(docs: GenerationInput['documents']): string;
  record(docs: GenerationInput['documents']): string;
  fits(content: string): boolean;
  setToolCallId(id: string): void;
}

interface RequestedTool {
  name: string;
  args: unknown;
  id?: string | undefined;
}

export function createToolRegistry(options: ToolRegistryOptions) {
  const search = createSearchPortfolioTool(options);
  const meetings = options.meetingActions ? options.meetings : undefined;
  const availability = meetings
    ? createMeetingAvailabilityTool(meetings, options.signal)
    : undefined;
  const prepare = meetings
    ? createPrepareMeetingRequestTool(meetings, options.signal, options.actions)
    : undefined;
  const tools = availability && prepare ? [search, availability, prepare] : [search];
  const invalidArgs = () =>
    new AppError('LLM_INVALID_TOOL', 502, 'Parâmetros de ferramenta inválidos.');

  return {
    tools,
    async execute(call: RequestedTool): Promise<string> {
      if (!call.id || !tools.some((candidate) => candidate.name === call.name))
        throw new AppError('LLM_INVALID_TOOL', 502, 'Ferramenta não autorizada.');
      options.setToolCallId(call.id);
      if (call.name === search.name) {
        const args = searchPortfolioArgs.safeParse(call.args);
        if (!args.success) throw invalidArgs();
        return search.invoke(args.data);
      }
      if (availability && call.name === availability.name) {
        const args = meetingAvailabilityArgs.safeParse(call.args);
        if (!args.success) throw invalidArgs();
        return availability.invoke(args.data);
      }
      if (prepare && call.name === prepare.name) {
        const args = meetingProposalInputSchema.safeParse(call.args);
        if (!args.success) throw invalidArgs();
        return prepare.invoke(args.data);
      }
      throw new AppError('LLM_INVALID_TOOL', 502, 'Ferramenta não autorizada.');
    },
  };
}
