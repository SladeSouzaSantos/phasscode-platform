import type { Message } from '../domain/ports.js';
import {
  greetingAnswer,
  injectionRefusal,
  isInjection,
  isPersonalLifeQuestion,
  isSimpleTest,
  meetingUnavailable,
  personalLifeAnswer,
  scopeRefusal,
  simpleTestAnswer,
  unknownAnswer,
} from '../domain/security.js';

const policyAnswers = new Set([
  greetingAnswer,
  simpleTestAnswer,
  personalLifeAnswer,
  injectionRefusal,
  meetingUnavailable,
  scopeRefusal,
  unknownAnswer,
]);
export function eligibleHistory(history: Message[]): Message[] {
  const result: Message[] = [];
  for (let index = 0; index < history.length - 1; index++) {
    const user = history[index]!;
    const assistant = history[index + 1]!;
    if (user.role !== 'user' || assistant.role !== 'assistant') continue;
    if (
      !isInjection(user.content) &&
      !isSimpleTest(user.content) &&
      !isPersonalLifeQuestion(user.content) &&
      !policyAnswers.has(assistant.content)
    )
      result.push(user, assistant);
    index++;
  }
  return result;
}
