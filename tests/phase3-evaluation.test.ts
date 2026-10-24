import { describe, expect, it } from 'vitest';
import { evaluatePhase3 } from '../evaluation/phase3.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

async function evaluate(mode: 'normal' | 'invented-availability' | 'leaked-token' = 'normal') {
  const tokens: string[] = [];
  const knowledge = await JsonKnowledgeRepository.load();
  const report = await evaluatePhase3(
    (tools) =>
      new ChatService(
        new MemoryConversationStore(),
        {
          name: 'mock',
          generate: async (input) => {
            const dates = input.message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)!;
            if (input.message.includes('consultar horários')) {
              if (mode !== 'invented-availability') await tools.availability(dates[0]!, dates[1]!);
              return { answer: 'Agenda simulada: há um horário no teste.', sources: [] };
            }
            const proposal = await tools.prepareProposal({
              start: dates[0]!,
              name: 'Visitante Sintético',
              email: 'phase3-evaluation@example.test',
              topic: 'Avaliação sintética da integração do portfólio',
            });
            tokens.push(proposal.confirmationToken);
            return {
              answer:
                'Confira e confirme os dados no formulário. A solicitação ainda não foi registrada.' +
                (mode === 'leaked-token' ? proposal.confirmationToken : ''),
              sources: [],
              actions: [{ type: 'confirm_meeting_request', proposal }],
            };
          },
        },
        knowledge,
        loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
        true,
      ),
  );
  return { report, tokens };
}

describe('phase 3 model evaluation report', () => {
  it('exercises both meeting tools while keeping actions and credentials out of the report', async () => {
    const { report, tokens } = await evaluate();
    expect(report.summary).toEqual({ passed: 4, failed: 0 });
    expect(report.humanReview).toBe('pending');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('confirmationToken');
    expect(serialized).not.toContain('conversationToken');
    for (const token of tokens) expect(serialized).not.toContain(token);
    for (const id of ['legacy-client', 'injection']) {
      expect(report.cases.find((item) => item.id === id)).toMatchObject({
        passed: true,
        availabilityCalls: 0,
        proposalCalls: 0,
      });
    }
  });
  it('fails availability asserted without a tool call', async () => {
    const { report } = await evaluate('invented-availability');
    expect(report.cases.find((item) => item.id === 'availability')?.checks).toContainEqual({
      id: 'availability-tool-used',
      passed: false,
    });
    expect(report.summary.failed).toBe(1);
  });
  it('records a failed token disclosure without persisting that token', async () => {
    const { report, tokens } = await evaluate('leaked-token');
    const proposal = report.cases.find((item) => item.id === 'proposal');
    expect(proposal?.checks).toContainEqual({ id: 'no-token-in-answer', passed: false });
    expect(proposal?.answer).toContain('[REDACTED_TOKEN]');
    for (const token of tokens) expect(JSON.stringify(report)).not.toContain(token);
  });
});
