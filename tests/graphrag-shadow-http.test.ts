import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { testApp } from './helpers.js';
import { chatResponseSchema } from '../packages/contracts/src/index.js';
import { createGraphRagShadow } from '../apps/orbe-node/src/application/graph-rag-shadow.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import type { GraphShadowPort } from '../apps/orbe-node/src/application/graph-rag-shadow.js';
import type { EvidenceGraphRepository } from '../apps/orbe-node/src/domain/evidence-graph.js';

const applications: FastifyInstance[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

const requestText = 'Quais projetos do portfólio utilizam React?';
const config = (mode: 'off' | 'shadow' = 'off') =>
  loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_MAX: '100',
    ORBE_GRAPHRAG_MODE: mode,
    ORBE_GRAPHRAG_STAGE: 'dev',
    ORBE_GRAPHRAG_DEV_APPROVED: 'true',
  });

const shadow = (inspect: GraphShadowPort['inspect']): GraphShadowPort => ({ inspect });
const valid = {
  mode: 'canonical_ppks' as const,
  reason: 'unavailable_or_incomplete' as const,
  matchedRequirements: 0,
  unknownRequirements: 0,
};

async function mount(overrides: Parameters<typeof testApp>[0] = {}) {
  const app = await testApp(overrides);
  applications.push(app);
  return app;
}

async function post(app: FastifyInstance, message = requestText) {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/chat',
    payload: { message },
  });
  expect(result.statusCode).toBe(200);
  return chatResponseSchema.parse(result.json());
}

describe('F3.3/F3.5 DEV-only graph shadow: existing HTTP contract always wins', () => {
  it('rejects accidental shadow activation without BOTH explicit DEV approvals', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', ORBE_GRAPHRAG_MODE: 'shadow' })).toThrow(
      'GRAPH_SHADOW_REQUIRES_EXPLICIT_DEV_APPROVAL',
    );
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        ORBE_GRAPHRAG_MODE: 'shadow',
        ORBE_GRAPHRAG_STAGE: 'dev',
      }),
    ).toThrow('GRAPH_SHADOW_REQUIRES_EXPLICIT_DEV_APPROVAL');
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        ORBE_GRAPHRAG_MODE: 'shadow',
        ORBE_GRAPHRAG_DEV_APPROVED: 'true',
      }),
    ).toThrow('GRAPH_SHADOW_REQUIRES_EXPLICIT_DEV_APPROVAL');
    expect(config().ORBE_GRAPHRAG_MODE).toBe('off');
  });

  it('refuses to boot a shadow-enabled API without an injected reader port', async () => {
    await expect(testApp({ config: config('shadow') })).rejects.toThrow(
      'GRAPH_SHADOW_MISSING_PORT',
    );
  });

  it('does not call an injected shadow implementation when the feature flag is OFF', async () => {
    const inspect = vi.fn(async () => valid);
    const app = await mount({ config: config('off'), graphShadow: shadow(inspect) });
    const body = await post(app);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(inspect).not.toHaveBeenCalled();
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).statusCode).toBe(200);
  });

  it('preserves response sources, answer and provider metadata in shadow mode', async () => {
    const inspect = vi.fn(async () => ({
      mode: 'verified_graph' as const,
      reason: 'verified' as const,
      matchedRequirements: 1,
      unknownRequirements: 0,
    }));
    const baseline = await mount({ config: config('off') });
    const staged = await mount({ config: config('shadow'), graphShadow: shadow(inspect) });
    const a = await post(baseline);
    const b = await post(staged);
    expect(b.answer).toBe(a.answer);
    expect(b.sources).toEqual(a.sources);
    expect(b.meta).toEqual(a.meta);
    expect(inspect).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledWith(requestText);
    expect((await staged.inject('/health')).statusCode).toBe(200);
    expect((await staged.inject('/ready')).statusCode).toBe(200);
  });

  it('falls back to unchanged PPKS response when graph reader is unavailable', async () => {
    const inspect = vi.fn(async () => {
      throw new Error('private-graph-reader-token-or-password');
    });
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = await mount({ config: config('shadow'), graphShadow: shadow(inspect) });
    const baseline = await mount({ config: config('off') });
    const expected = await post(baseline);
    const actual = await post(app);
    expect(actual.answer).toBe(expected.answer);
    expect(actual.sources).toEqual(expected.sources);
    expect(actual.meta).toEqual(expected.meta);
    const telemetry = output.mock.calls
      .map((args) => String(args[0] ?? ''))
      .filter((line) => line.includes('"event":"orbe_graphrag_shadow"'));
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toContain('"mode":"error"');
    expect(telemetry[0]).not.toContain('private-graph-reader');
    expect(telemetry[0]).not.toContain(requestText);
  });

  it('rejects untrusted shadow metrics without logging the malicious content', async () => {
    const inspect: GraphShadowPort['inspect'] = vi.fn(async () => ({
      mode: 'verified_graph',
      reason: 'verified',
      matchedRequirements: 1,
      unknownRequirements: 0,
      question: 'private-vacancy-text',
    }));
    const logs = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = await mount({ config: config('shadow'), graphShadow: shadow(inspect) });
    const answer = await post(app);
    expect(answer.answer.length).toBeGreaterThan(0);
    const telemetry = logs.mock.calls
      .map((args) => String(args[0] ?? ''))
      .filter((line) => line.includes('"event":"orbe_graphrag_shadow"'));
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toContain('"mode":"error"');
    expect(telemetry[0]).not.toContain('private-vacancy-text');
  });

  it('passes the same public HTTP schema over a real localhost TCP listener', async () => {
    const inspect = vi.fn(async () => valid);
    const app = await mount({ config: config('shadow'), graphShadow: shadow(inspect) });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    const response = await fetch('http://127.0.0.1:' + address.port + '/api/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: requestText }),
    });
    expect(response.status).toBe(200);
    const body = chatResponseSchema.parse(await response.json());
    expect(body.answer.length).toBeGreaterThan(0);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(inspect).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const ready = await fetch('http://127.0.0.1:' + address.port + '/ready');
    expect(ready.status).toBe(200);
  });

  it('preserves academic and greeting responses without activating graph on greetings', async () => {
    const inspect = vi.fn(async () => valid);
    const app = await mount({ config: config('shadow'), graphShadow: shadow(inspect) });
    const greeting = await post(app, 'Olá');
    expect(greeting.answer.length).toBeGreaterThan(0);
    expect(inspect).not.toHaveBeenCalled();
    const academic = await post(app, 'Pedro concluiu Ciência da Computação na UNISUL?');
    expect(academic.answer).toMatch(/UNISUL|Ciência da Computação|conclu/i);
  });

  it('keeps private PPKS evidence out of GraphRAG direct claims', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    const findEvidence = vi.fn(async () => []);
    const evidence: EvidenceGraphRepository = {
      findEvidence,
      getSource: vi.fn(),
    };
    const inspector = createGraphRagShadow(snapshot, evidence);
    const observed = await inspector.inspect('Requisitos: Java, Go');
    expect(observed.mode).toBe('canonical_ppks');
    expect(observed.reason).toBe('unrecognized_requirements');
    expect(observed.unknownRequirements).toBe(1);
    expect(findEvidence).not.toHaveBeenCalled();
  });
});
