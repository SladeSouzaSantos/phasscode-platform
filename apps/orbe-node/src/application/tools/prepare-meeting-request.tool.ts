import { tool } from '@langchain/core/tools';
import { meetingProposalInputSchema } from '../../../../../packages/contracts/src/meetings.js';
import { AppError } from '../../domain/errors.js';
import type { MeetingTools } from '../../domain/meeting-tools.js';
import type { GenerationResult } from '../../domain/ports.js';

export function createPrepareMeetingRequestTool(
  meetings: MeetingTools,
  signal: AbortSignal,
  actions: NonNullable<GenerationResult['actions']>,
) {
  return tool(
    async (args) => {
      signal.throwIfAborted();
      if (actions.length)
        throw new AppError('LLM_TOOL_LIMIT', 502, 'Prepare somente uma proposta por turno.');
      const proposal = await meetings.prepareProposal(args);
      actions.push({ type: 'confirm_meeting_request', proposal });
      // The one-use confirmation secret belongs to the UI, never to model history.
      return JSON.stringify({
        summary: {
          start: proposal.summary.start,
          end: proposal.summary.end,
          timeZone: proposal.summary.timeZone,
        },
        consentVersion: proposal.consentVersion,
        expiresAt: proposal.expiresAt,
        requiresVisitorConfirmation: true,
        requestCreated: false,
      });
    },
    {
      name: 'prepare_meeting_request',
      description:
        'Prepara proposta com dados informados pelo visitante. NÃO cria solicitação nem reserva horário. O visitante precisa confirmar os dados no formulário do frontend.',
      schema: meetingProposalInputSchema,
    },
  );
}
