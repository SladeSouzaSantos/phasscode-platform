import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { loadDevGraphReaderToken } from '../apps/orbe-node/src/application/graph-reader-secret.js';

const approved = {
  ORBE_GRAPHRAG_MODE: 'shadow',
  ORBE_GRAPHRAG_STAGE: 'dev',
  ORBE_GRAPHRAG_DEV_APPROVED: 'true',
  ORBE_GRAPH_READER_TOKEN_FILE: '/run/secrets/graph_reader_token',
};

describe('F3.5 DEV-only Docker secret and shadow overlay guardrails', () => {
  it('reads only the fixed Docker secret path for explicit DEV shadow opt-in', async () => {
    const read = vi.fn(async () => 'A'.repeat(43) + '\n');
    await expect(loadDevGraphReaderToken(approved, read)).resolves.toBe('A'.repeat(43));
    expect(read).toHaveBeenCalledExactlyOnceWith('/run/secrets/graph_reader_token');
  });

  it.each([
    { ORBE_GRAPHRAG_MODE: undefined },
    { ORBE_GRAPHRAG_MODE: 'off' },
    { ORBE_GRAPHRAG_MODE: 'shadow', ORBE_GRAPHRAG_STAGE: 'production' },
    { ORBE_GRAPHRAG_MODE: 'shadow', ORBE_GRAPHRAG_STAGE: 'dev', ORBE_GRAPHRAG_DEV_APPROVED: 'false' },
  ])('never reads the token without approved DEV shadow credentials (%#)', async (overrides) => {
    const read = vi.fn(async () => 'A'.repeat(43));
    await expect(loadDevGraphReaderToken({ ...approved, ...overrides }, read)).rejects.toThrow(
      'GRAPH_READER_DEV_SHADOW_ONLY',
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('does not accept a raw bearer token in a process environment', async () => {
    const read = vi.fn(async () => 'A'.repeat(43));
    await expect(
      loadDevGraphReaderToken({ ...approved, ORBE_GRAPH_READER_TOKEN: 'B'.repeat(43) }, read),
    ).rejects.toThrow('GRAPH_READER_PLAINTEXT_ENV_FORBIDDEN');
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses arbitrary or missing secret paths before filesystem access', async () => {
    const read = vi.fn(async () => 'A'.repeat(43));
    for (const path of ['', '/tmp/graph_reader_token', '.env', '/run/secrets/neo4j_auth']) {
      await expect(
        loadDevGraphReaderToken({ ...approved, ORBE_GRAPH_READER_TOKEN_FILE: path }, read),
      ).rejects.toThrow('GRAPH_READER_SECRET_FILE_REQUIRED');
    }
    expect(read).not.toHaveBeenCalled();
  });

  it('fails closed when the Docker secret is absent or invalid', async () => {
    await expect(
      loadDevGraphReaderToken(approved, async () => {
        throw new Error('private-token-content');
      }),
    ).rejects.toThrow('GRAPH_READER_SECRET_UNAVAILABLE');
    for (const token of ['', 'short', 'B'.repeat(43) + '/', 'C'.repeat(129)]) {
      await expect(loadDevGraphReaderToken(approved, async () => token)).rejects.toThrow(
        'GRAPH_READER_SECRET_INVALID',
      );
    }
  });

  it('mounts exactly the reader token to the DEV API, not the Neo4j admin secret', async () => {
    const [shadowText, readerText, graphText] = await Promise.all([
      readFile('compose.graphrag.shadow.dev.yaml', 'utf8'),
      readFile('compose.graphrag.reader.dev.yaml', 'utf8'),
      readFile('compose.graphrag.dev.yaml', 'utf8'),
    ]);
    const shadow = parse(shadowText) as {
      services: {
        api: {
          environment: Record<string, string>;
          secrets: string[];
        };
      };
    };
    const reader = parse(readerText) as {
      services: { 'graph-reader': { secrets: string[]; ports?: unknown } };
      secrets: Record<string, { file: string }>;
    };
    const graph = parse(graphText) as {
      services: { neo4j: { ports?: unknown } };
    };
    expect(shadow.services.api.secrets).toEqual(['graph_reader_token']);
    expect(shadow.services.api.environment).toMatchObject({
      ORBE_GRAPHRAG_MODE: 'shadow',
      ORBE_GRAPHRAG_STAGE: 'dev',
      ORBE_GRAPHRAG_DEV_APPROVED: 'true',
      ORBE_GRAPH_READER_TOKEN_FILE: '/run/secrets/graph_reader_token',
    });
    for (const forbidden of ['NEO4J_AUTH', 'NEO4J_URI', 'NEO4J_PASSWORD']) {
      expect(shadow.services.api.environment).not.toHaveProperty(forbidden);
    }
    expect(reader.services['graph-reader'].secrets).toContain('graph_reader_token');
    expect(reader.services['graph-reader'].ports).toBeUndefined();
    expect(graph.services.neo4j.ports).toBeUndefined();
    expect(reader.secrets.graph_reader_token?.file).toContain('graph_reader_token');
  });

  it('keeps Mac Mini preflight read-only and requires full SHA', async () => {
    const text = await readFile('scripts/preflight-graphrag-shadow-dev.sh', 'utf8');
    expect(text).toContain("WRONG_DIRECTORY_NOT_DEV");
    expect(text).toContain("PINNED_IMAGE_SHA_NOT_CURRENT_DEV");
    expect(text).toContain("SHADOW_MUST_BE_OPT_IN_OVERLAY_NOT_BASE_ENV");
    expect(text).toContain("DEV_COMPOSE_CONFIG_INVALID");
    const executable = text.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
    expect(executable).not.toMatch(/\bdocker\s+(?:compose\s+)?(?:up|down|rm|restart|run|exec)\b/);
    expect(executable).not.toMatch(/\bgit\s+(?:pull|push|merge|checkout|reset|clean)\b/);
  });
});
