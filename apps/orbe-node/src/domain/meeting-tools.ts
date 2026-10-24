import type { z } from 'zod';
import type {
  meetingProposalInputSchema,
  meetingProposalResponseSchema,
  meetingAvailabilityResponseSchema,
} from '../../../../packages/contracts/src/meetings.js';

// Only these two capabilities reach the model. Creating a request is an HTTP UI action.
export interface MeetingTools {
  availability(
    start: string,
    end: string,
  ): Promise<z.infer<typeof meetingAvailabilityResponseSchema>>;
  prepareProposal(
    input: z.infer<typeof meetingProposalInputSchema>,
  ): Promise<z.infer<typeof meetingProposalResponseSchema>>;
}
