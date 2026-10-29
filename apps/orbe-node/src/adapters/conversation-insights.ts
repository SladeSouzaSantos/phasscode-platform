import type pg from 'pg';

interface InsightRow {
  id: string;
  intent: string;
  summary: string;
  topics: string[];
  turns: number;
  created_at: Date;
  updated_at: Date;
}
interface CountRow {
  total: number;
}
interface NamedCountRow {
  name: string;
  total: number;
}

export interface InsightQuery {
  limit: number;
  offset: number;
  retentionDays: number;
}

export class PostgresConversationInsights {
  constructor(private readonly pool: pg.Pool) {}

  async list({ limit, offset, retentionDays }: InsightQuery) {
    // Read only anonymous classifications; never fetch message bodies or hashes.
    const predicate = "updated_at >= now() - ($1::int * interval '1 day')";
    const [count, turns, intents, topics, page] = await Promise.all([
      this.pool.query<CountRow>(
        'SELECT count(*)::integer AS total FROM conversation_insights WHERE ' + predicate,
        [retentionDays],
      ),
      this.pool.query<CountRow>(
        'SELECT coalesce(sum(turns),0)::integer AS total FROM conversation_insights WHERE ' +
          predicate,
        [retentionDays],
      ),
      this.pool.query<NamedCountRow>(
        'SELECT intent AS name, count(*)::integer AS total FROM conversation_insights WHERE ' +
          predicate +
          ' GROUP BY intent ORDER BY total DESC, name',
        [retentionDays],
      ),
      this.pool.query<NamedCountRow>(
        'SELECT t.topic AS name, count(*)::integer AS total ' +
          'FROM conversation_insights i CROSS JOIN LATERAL unnest(i.topics) AS t(topic) ' +
          "WHERE i.updated_at >= now() - ($1::int * interval '1 day') " +
          'GROUP BY t.topic ORDER BY total DESC, name LIMIT 8',
        [retentionDays],
      ),
      this.pool.query<InsightRow>(
        'SELECT conversation_id AS id, intent, summary, topics, turns, created_at, updated_at ' +
          'FROM conversation_insights WHERE ' +
          predicate +
          ' ORDER BY updated_at DESC, conversation_id DESC LIMIT $2 OFFSET $3',
        [retentionDays, limit + 1, offset],
      ),
    ]);
    const hasMore = page.rows.length > limit;
    const items = page.rows.slice(0, limit).map((row) => ({
      id: row.id,
      intent: row.intent,
      summary: row.summary,
      topics: row.topics,
      turns: row.turns,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
    return {
      retentionDays,
      generatedAt: new Date().toISOString(),
      totals: {
        conversations: count.rows[0]?.total ?? 0,
        questions: turns.rows[0]?.total ?? 0,
      },
      intents: intents.rows,
      topics: topics.rows,
      items,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
}
