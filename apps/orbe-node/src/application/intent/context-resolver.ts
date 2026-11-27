import type { Message } from '../../domain/ports.js';
import { isContextualFollowUp } from '../../domain/security.js';
import { eligibleHistory } from '../context.js';
import { isCareerDurationEllipsis, rewriteCareerDurationEllipsis } from '../experience-context.js';
import {
  ellipticalTechnology,
  rewriteEllipticalTechnologyQuestion,
} from '../technology-follow-up.js';

export function resolveTurnContext(message: string, history: Message[]) {
  const eligible = eligibleHistory(history);
  const previous = [...eligible]
    .reverse()
    .find(
      (message) =>
        message.role === 'user' &&
        !isContextualFollowUp(message.content) &&
        !ellipticalTechnology(message.content) &&
        !isCareerDurationEllipsis(message.content),
    );
  const technologyFollowUp = previous ? ellipticalTechnology(message) : undefined;
  const durationFollowUp =
    previous && isCareerDurationEllipsis(message)
      ? rewriteCareerDurationEllipsis(previous.content)
      : undefined;
  const followUp = Boolean(
    previous && (isContextualFollowUp(message) || technologyFollowUp || durationFollowUp),
  );
  // A recruiter who asks "Java?" then "E com Go?" is changing the
  // technology, not requesting evidence from Java and Go together.
  // Preserve only the previous intent and the new technical subject.
  const query =
    previous && technologyFollowUp
      ? rewriteEllipticalTechnologyQuestion(previous.content, technologyFollowUp)
      : durationFollowUp
        ? durationFollowUp
        : followUp
          ? `${previous!.content}\n${message}`
          : message;
  return { eligible, previous, technologyFollowUp, durationFollowUp, followUp, query };
}

export type ResolvedTurnContext = ReturnType<typeof resolveTurnContext>;
