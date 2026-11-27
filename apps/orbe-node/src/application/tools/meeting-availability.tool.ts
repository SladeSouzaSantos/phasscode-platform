import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { MeetingTools } from '../../domain/meeting-tools.js';

export const meetingAvailabilityArgs = z.strictObject({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

export function createMeetingAvailabilityTool(meetings: MeetingTools, signal: AbortSignal) {
  return tool(
    async ({ start, end }) => {
      signal.throwIfAborted();
      return JSON.stringify(await meetings.availability(start, end));
    },
    {
      name: 'get_meeting_availability',
      description:
        'Consulta intervalos de atendimento reais; nunca retorna detalhes de compromissos privados. Datas ISO com offset, janela de no máximo sete dias.',
      schema: meetingAvailabilityArgs,
    },
  );
}
