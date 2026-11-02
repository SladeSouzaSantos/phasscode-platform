import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { PostgresConversationStore } from '../apps/orbe-node/src/adapters/postgres-store.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MockChatProvider } from '../apps/orbe-node/src/adapters/mock-provider.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { hashToken } from '../apps/orbe-node/src/domain/security.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL obrigatória em testes de integração descartáveis');
const pool = createPool(process.env.TEST_DATABASE_URL);
const ids: string[] = [];
beforeAll(async () => {
  await migrate(pool);
});
afterAll(async () => {
  await pool.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [ids]);
  await pool.end();
});

describe('persistência real de relatórios opt-in', () => {
  it('não registra conversas sem autorização; registra somente etiquetas quando autorizadas', async () => {
    const store = new PostgresConversationStore(pool, 12, 7, true);
    const service = new ChatService(
      store,
      new MockChatProvider(),
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const regular = await service.execute({ message: 'Quais projetos Java?' });
    ids.push(regular.conversationId);
    const none = await pool.query(
      'SELECT 1 FROM orbe_conversation_reports WHERE conversation_id=$1',
      [regular.conversationId],
    );
    expect(none.rowCount).toBe(0);

    const first = await service.execute(
      { message: 'Sou recrutadora Java para vaga Spring Boot' },
      undefined,
      { analyticsConsent: true },
    );
    ids.push(first.conversationId);
    const next = await service.execute(
      {
        conversationId: first.conversationId,
        message: 'E quais projetos React?',
      },
      first.conversationToken,
    );
    expect(next.conversationId).toBe(first.conversationId);
    const report = await pool.query<{
      turns: number;
      topics: string[];
      intent: string;
      due_at: Date;
    }>(
      'SELECT turns, topics, intent, due_at FROM orbe_conversation_reports WHERE conversation_id=$1',
      [first.conversationId],
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.turns).toBe(2);
    expect(report.rows[0]!.topics).toContain('java');
    expect(report.rows[0]!.topics).toContain('frontend');
    expect(report.rows[0]!.intent).toBe('recrutamento');
    expect(report.rows[0]!.due_at.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);

    await expect(
      store.withdrawReport(first.conversationId, hashToken(first.conversationToken!)),
    ).resolves.toBeUndefined();
    expect(
      (
        await pool.query('SELECT 1 FROM orbe_conversation_reports WHERE conversation_id=$1', [
          first.conversationId,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query<{ reports_opted_out: boolean }>(
          'SELECT reports_opted_out FROM conversations WHERE id=$1',
          [first.conversationId],
        )
      ).rows[0]!.reports_opted_out,
    ).toBe(true);
  });

  it('impede revogação com token errado e não registra histórico da conversa nos relatórios', async () => {
    const store = new PostgresConversationStore(pool, 12, 7, true);
    const service = new ChatService(
      store,
      new MockChatProvider(),
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const first = await service.execute(
      {
        message: 'Gostaria de vaga Java, meu email é secreto@example.org',
      },
      undefined,
      { analyticsConsent: true },
    );
    ids.push(first.conversationId);
    await expect(
      store.withdrawReport(first.conversationId, hashToken(randomUUID())),
    ).rejects.toMatchObject({ status: 404 });
    const record = await pool.query(
      'SELECT * FROM orbe_conversation_reports WHERE conversation_id=$1',
      [first.conversationId],
    );
    expect(JSON.stringify(record.rows)).not.toContain('secreto@example.org');
  });
});
