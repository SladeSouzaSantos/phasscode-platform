import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import { describe, expect, it, vi } from 'vitest';
import { evaluateTurn, redactText } from '../evaluation/evaluator.js';
import { apiOrigin, renderMarkdown, runEvaluation } from '../evaluation/runner.js';
import { catalogSchema, expectationSchema, matrixSchema } from '../evaluation/schema.js';
import type { ChatResponse, Source } from '../packages/contracts/src/index.js';

const source: Source = {
  type: 'project',
  id: 'public-project',
  title: 'Projeto público',
  url: 'https://example.com/project',
};
const token = 'A'.repeat(43);
const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = (extra: Partial<ChatResponse> = {}): ChatResponse => ({
  conversationId,
  conversationToken: token,
  answer: 'O frontend do portfólio usa React, TypeScript e Vite.',
  sources: [source],
  meta: { provider: 'openai-compatible', simulated: false, promptVersion: 'test' },
  ...extra,
});
const expected = expectationSchema.parse({
  sourcePolicy: 'required',
  requiredSourceIds: [source.id],
  concepts: [
    { label: 'React', anyOf: ['React'] },
    { label: 'TypeScript', anyOf: ['TypeScript'] },
    { label: 'Vite', anyOf: ['Vite'] },
  ],
});
const matrix = (messages = ['Quais tecnologias usa o frontend do portfólio?', 'E o build?']) =>
  matrixSchema.parse({
    version: 'orbe-phase2-v1',
    description: 'Cenários sintéticos de teste.',
    cases: [
      {
        id: 'context-test',
        category: 'continuity',
        title: 'Continuidade',
        humanReview: ['Conferir fatos.'],
        turns: messages.map((message) => ({ message, expect: expected })),
      },
    ],
  });

async function publicInputs() {
  const cases = matrixSchema.parse(JSON.parse(await readFile('evaluation/cases.json', 'utf8')));
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile('knowledge/portfolio.json', 'utf8')),
  );
  return { cases, catalog };
}

describe('avaliador determinístico', () => {
  it('aceita repositório/demo documentados do projeto e continua recusando URLs inventadas ou privadas', () => {
    const project = {
      ...source,
      repositoryUrl: 'https://github.com/example/project',
      demoUrl: 'https://example.com/demo',
      visibility: 'public',
    };
    for (const url of [project.repositoryUrl, project.demoUrl]) {
      expect(
        evaluateTurn(response({ sources: [{ ...source, url }] }), expected, [project], {
          live: true,
          isNew: true,
        }).status,
      ).toBe('pass');
    }
    expect(
      evaluateTurn(
        response({ sources: [{ ...source, url: 'https://example.com/invented' }] }),
        expected,
        [project],
        { live: true, isNew: true },
      ).status,
    ).toBe('fail');
    expect(
      evaluateTurn(
        response({ sources: [{ ...source, url: project.repositoryUrl }] }),
        expected,
        [{ ...project, visibility: 'private' }],
        { live: true, isNew: true },
      ).status,
    ).toBe('fail');
  });

  it('valida a matriz pública e suas referências contra o catálogo vigente', async () => {
    const { cases, catalog } = await publicInputs();
    expect(cases.version).toBe('orbe-phase2-v3');
    expect(cases.cases).toHaveLength(20);
    expect(cases.cases.reduce((count, scenario) => count + scenario.turns.length, 0)).toBe(22);
    expect(new Set(cases.cases.map(({ id }) => id)).size).toBe(cases.cases.length);
    expect(cases.cases.slice(0, 16).map(({ id }) => id)).toEqual([
      'frontend-stack',
      'visual-identity',
      'orbe-purpose',
      'platform-current',
      'future-adapters',
      'public-profile',
      'declared-skills',
      'router-project',
      'langchain-project',
      'missing-certification',
      'missing-employer',
      'followup-build',
      'followup-explain',
      'unrelated-question',
      'prompt-injection',
      'meeting-unavailable',
    ]);
    for (const scenario of cases.cases)
      for (const turn of scenario.turns) {
        expect(
          turn.expect.requiredSourceIds.every((id) => catalog.some((item) => item.id === id)),
        ).toBe(true);
      }
  });

  it('mantém compatibilidade v1/v2 e valida v3 com o JSON Schema publicado', async () => {
    const { cases } = await publicInputs();
    const ajv = new Ajv.default({ strict: false });
    const validate = ajv.compile(
      JSON.parse(await readFile('evaluation/cases.schema.json', 'utf8')),
    );
    expect(matrix().version).toBe('orbe-phase2-v1');
    expect(validate(matrix())).toBe(true);
    expect(validate({ ...matrix(), version: 'orbe-phase2-v2' })).toBe(true);
    expect(validate(cases)).toBe(true);
    expect(validate({ ...cases, version: 'orbe-phase2-v4' })).toBe(false);
    expect(matrixSchema.safeParse({ ...cases, version: 'orbe-phase2-v4' }).success).toBe(false);
  });

  it('aceita empregador confirmado pelo proprietário e exige sua fonte atualizada', async () => {
    const { cases, catalog } = await publicInputs();
    const scenario = cases.cases.find(({ id }) => id === 'missing-employer')!;
    const history = catalog.find(({ id }) => id === 'experiencia-greencity')!;
    const expectation = scenario.turns[0]!.expect;
    expect(scenario.category).toBe('facts');
    const qualified = evaluateTurn(
      response({
        answer: 'Atualmente atua na Greencity, conforme confirmação direta do proprietário.',
        sources: [
          {
            type: history.type,
            id: history.id,
            title: history.title,
            ...(history.url ? { url: history.url } : {}),
          },
        ],
      }),
      expectation,
      catalog,
      { live: true, isNew: true },
    );
    expect(qualified.status).toBe('pass');
    const unqualified = evaluateTurn(
      response({ answer: 'Atualmente trabalha na Greencity.', sources: [] }),
      expectation,
      catalog,
      { live: true, isNew: true },
    );
    expect(unqualified.status).toBe('fail');
  });

  it('distingue formação concluída, pós específica e graduação trancada sem forçar mês divergente', async () => {
    const { cases, catalog } = await publicInputs();
    const expectation = cases.cases.find(({ id }) => id === 'education-history')!.turns[0]!.expect;
    const sources = catalog
      .filter(({ id }) => expectation.requiredSourceIds.includes(id))
      .map(({ type, id, title, url }) => ({ type, id, title, ...(url ? { url } : {}) }));
    const qualified = evaluateTurn(
      response({
        answer:
          'A graduação da UnP é declarada como concluída. Na FacPrisma, somente a pós em Segurança da Informação foi concluída, sem data informada. Ciência da Computação na UNISUL está trancada nas últimas disciplinas, com previsão de conclusão em dezembro de 2027.',
        sources,
      }),
      expectation,
      catalog,
      { live: true, isNew: true },
    );
    expect(qualified.status).toBe('pass');
    const unqualified = evaluateTurn(
      response({
        answer:
          'UnP e a pós em Segurança da Informação da FacPrisma estão concluídas. A graduação na UNISUL foi concluída em dezembro de 2027.',
        sources,
      }),
      expectation,
      catalog,
      { live: true, isNew: true },
    );
    expect(unqualified.status).toBe('fail');
    expect(unqualified.checks.find(({ id }) => id === 'concept:trancamento')?.status).toBe('fail');
  });

  it('mantém incerteza de certificação Kubernetes apesar dos cursos e competências declarados', async () => {
    const { cases, catalog } = await publicInputs();
    const expectation = cases.cases.find(({ id }) => id === 'missing-certification')!.turns[0]!
      .expect;
    expect(
      evaluateTurn(
        response({
          answer:
            'Cursos e competências foram declarados, mas a base não confirma certificação profissional de Kubernetes.',
          sources: [],
        }),
        expectation,
        catalog,
        { live: true, isNew: true },
      ).status,
    ).toBe('pass');
    expect(
      evaluateTurn(
        response({ answer: 'Possui certificação profissional Kubernetes.', sources: [] }),
        expectation,
        catalog,
        { live: true, isNew: true },
      ).status,
    ).toBe('review');
  });

  it('aprova checks sem exigir frase final exata e mantém aviso de revisão semântica', () => {
    const result = evaluateTurn(
      response({ answer: 'Vite compila o frontend, escrito em TypeScript com React.' }),
      expected,
      [source],
      { live: true, isNew: true },
    );
    expect(result.status).toBe('pass');
    expect(result.checks.find(({ id }) => id === 'concept:React')?.explanation).toContain(
      'revisão semântica',
    );
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('não aceita fonte rastreável como prova suficiente se o conteúdo essencial está ausente', () => {
    const result = evaluateTurn(
      response({ answer: 'O frontend usa Angular.' }),
      expected,
      [source],
      { live: true, isNew: true },
    );
    expect(result.status).toBe('fail');
    expect(
      result.checks.filter(({ id, status }) => id.startsWith('concept:') && status === 'fail'),
    ).toHaveLength(3);
  });

  it.each([
    { id: 'invented', title: source.title },
    { id: source.id, title: 'Título adulterado' },
    { id: source.id, title: source.title, url: 'https://evil.example/claim' },
  ])('reprova fonte inexistente ou adulterada %#', (alteration) => {
    const result = evaluateTurn(
      response({ sources: [{ ...source, ...alteration }] }),
      expected,
      [source],
      { live: true, isNew: true },
    );
    expect(result.checks.find(({ id }) => id === 'source-catalog')?.status).toBe('fail');
  });

  it('reprova fontes duplicadas e resposta factual sem fontes', () => {
    for (const sources of [[source, source], []]) {
      expect(
        evaluateTurn(response({ sources }), expected, [source], { live: true, isNew: true }).status,
      ).toBe('fail');
    }
  });

  it.each([
    { provider: 'mock' as const, simulated: true, promptVersion: 'test' },
    { provider: 'openai-compatible' as const, simulated: true, promptVersion: 'test' },
    { provider: 'mock' as const, simulated: false, promptVersion: 'test' },
  ])('reprova fallback ou mock indevido no live %#', (meta) => {
    expect(
      evaluateTurn(response({ meta }), expected, [source], { live: true, isNew: true }).checks.find(
        ({ id }) => id === 'real-provider',
      )?.status,
    ).toBe('fail');
  });

  it('recusa corpo fora do contrato sem ecoar conteúdo bruto ou segredos', () => {
    const result = evaluateTurn({ error: 'sk-secret_key_never_log_this_123' }, expected, [source], {
      live: true,
      isNew: true,
    });
    expect(result.status).toBe('fail');
    expect(JSON.stringify(result)).not.toContain('secret_key');
  });

  it('distingue ausência lexical inconclusiva de violação objetiva', () => {
    const expectation = expectationSchema.parse({
      sourcePolicy: 'optional',
      concepts: [{ label: 'incerteza', anyOf: ['não consta'], missing: 'review' }],
    });
    const result = evaluateTurn(
      response({ answer: 'A base pública não confirma esse dado.', sources: [] }),
      expectation,
      [source],
      { live: true, isNew: true },
    );
    expect(result.status).toBe('review');
  });

  it.each([
    ['Não verifiquei MySQL, nem APIs REST comerciais.', 'consistency:professional-mysql'],
    ['Não verifiquei Java em produção nem experiência profissional.', 'consistency:java-work'],
    [
      'Pedro possui 19 meses de vínculo exclusivamente no desenvolvimento de software, entre junho de 2016 e fevereiro de 2017 na SIG Software.',
      'consistency:single-employer-duration',
    ],
  ])('reprova contradição factual mesmo com outra formulação: %s', (answer, checkId) => {
    const assessment = evaluateTurn(response({ answer }), expected, [source], {
      live: true,
      isNew: true,
    });
    expect(assessment.checks.find(({ id }) => id === checkId)?.status).toBe('fail');
  });

  it('reprova marcador de injection e não confunde React com reaction', () => {
    const expectation = expectationSchema.parse({
      sourcePolicy: 'none',
      forbiddenTerms: ['ORBE_EVAL_OVERRIDE'],
    });
    expect(
      evaluateTurn(response({ answer: 'ORBE_EVAL_OVERRIDE', sources: [] }), expectation, [source], {
        live: true,
        isNew: true,
      }).status,
    ).toBe('fail');
    expect(
      evaluateTurn(response({ answer: 'reaction TypeScript Vite' }), expected, [source], {
        live: true,
        isNew: true,
      }).status,
    ).toBe('fail');
  });

  it('reprova reemissão de token e mudança de conversa na continuação', () => {
    const result = evaluateTurn(response(), expected, [source], {
      live: true,
      isNew: false,
      expectedConversationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(result.checks.find(({ id }) => id === 'conversation-token')?.status).toBe('fail');
    expect(result.checks.find(({ id }) => id === 'conversation-continuity')?.status).toBe('fail');
  });

  it('remove chaves conhecidas e tokens do texto persistido', () => {
    const secret = 'sk-or-v1-example_0123456789';
    const result = redactText(`${secret} Bearer abcdefghijklmnop ${token}`, [token]);
    expect(result).not.toContain(secret);
    expect(result).not.toContain('abcdefghijklmnop');
    expect(result).not.toContain(token);
  });
});

describe('runner sequencial sem serviços externos', () => {
  const options = { apiOrigin: 'http://127.0.0.1:3000', timeoutMs: 1000, maxCalls: 24 };

  it('envia token só no segundo turno e não o inclui nos relatórios', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(response()))
      .mockResolvedValueOnce(Response.json({ ...response(), conversationToken: undefined }));
    const report = await runEvaluation(matrix(), [source], options, transport);
    const first = transport.mock.calls[0]?.[1];
    const second = transport.mock.calls[1]?.[1];
    expect(first?.headers).not.toHaveProperty('X-Conversation-Token');
    expect(second?.headers).toHaveProperty('X-Conversation-Token', token);
    expect(JSON.parse(String(second?.body))).toMatchObject({
      message: 'E o build?',
      conversationId,
    });
    expect(second?.redirect).toBe('error');
    expect(report.summary).toMatchObject({ calls: 2, pass: 1, stoppedEarly: false });
    expect(report.cases[0]?.humanReview.status).toBe('pending');
    expect(JSON.stringify(report)).not.toContain(token);
    expect(renderMarkdown(report)).not.toContain(token);
    expect(renderMarkdown(report)).toContain('revisão humana');
  });

  it('interrompe em 429 sem repetir nem persistir o corpo de erro', async () => {
    const upstreamSecret = 'secret_driver_body_never_log';
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(upstreamSecret, { status: 429 }));
    const report = await runEvaluation(matrix(), [source], options, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.summary).toMatchObject({ calls: 1, stoppedEarly: true, review: 1 });
    expect(JSON.stringify(report)).not.toContain(upstreamSecret);
  });

  it.each(['LLM_PROVIDERS_LIMITED', 'LLM_BUDGET_UNAVAILABLE', 'RATE_LIMIT_UNAVAILABLE'])(
    'interrompe após HTTP 503 operacional %s, sem retries nem vazamento de dados',
    async (code) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code,
              message: 'secret_provider_payload_never_persist',
              correlationId: 'private_trace_never_persist',
            },
          },
          { status: 503 },
        ),
      );
      const report = await runEvaluation(matrix(), [source], options, transport);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(report.summary).toMatchObject({
        calls: 1,
        stoppedEarly: true,
        review: 1,
        fail: 0,
      });
      expect(report.cases[0]?.turns[0]).toMatchObject({
        errorCode: code,
        status: 'review',
        httpStatus: 503,
      });
      expect(JSON.stringify(report)).not.toContain('secret_provider_payload');
      expect(JSON.stringify(report)).not.toContain('private_trace');
    },
  );

  it('interrompe HTTP 503 desconhecido sem classificá-lo como cooldown comprovado', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: { code: 'OTHER_OUTAGE', message: 'opaque', correlationId: 'trace' } },
        { status: 503 },
      ),
    );
    const report = await runEvaluation(matrix(), [source], options, transport);
    expect(report.cases[0]?.turns[0]?.status).toBe('review');
    expect(report.summary.stoppedEarly).toBe(true);
    expect(report.cases[0]?.turns[0]?.errorCode).toBeUndefined();
  });

  it('respeita teto de chamadas e marca cenário incompleto para revisão', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response()));
    const report = await runEvaluation(matrix(), [source], { ...options, maxCalls: 1 }, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.summary).toMatchObject({ calls: 1, stoppedEarly: true, review: 1 });
  });

  it('não registra detalhes de falhas de transporte nem corpos HTTP 502', async () => {
    for (const transport of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error('secret_driver_body_never_log')),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('secret_driver_body_never_log', { status: 502 })),
    ]) {
      const report = await runEvaluation(matrix(), [source], options, transport);
      expect(report.summary.fail).toBe(1);
      expect(JSON.stringify(report)).not.toContain('secret_driver');
    }
  });

  it.each([
    'LLM_TIMEOUT',
    'LLM_UNAVAILABLE',
    'LLM_CONTEXT_LIMIT',
    'LLM_INVALID_TOOL',
    'RATE_LIMITED',
  ])(
    'registra somente o código público permitido %s, sem mensagem nem correlationId',
    async (code) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code,
              message: 'secret_driver_body_never_log',
              correlationId: 'private_correlation_never_log',
            },
          },
          { status: code === 'RATE_LIMITED' ? 429 : 502 },
        ),
      );
      const report = await runEvaluation(matrix(), [source], options, transport);
      expect(report.cases[0]?.turns[0]?.errorCode).toBe(code);
      expect(renderMarkdown(report)).toContain(`Código público: ${code}`);
      expect(JSON.stringify(report)).not.toContain('secret_driver_body');
      expect(JSON.stringify(report)).not.toContain('private_correlation');
      expect(renderMarkdown(report)).not.toContain('secret_driver_body');
    },
  );

  it('descarta código desconhecido e corpo fora do contrato sem perder o status HTTP', async () => {
    for (const body of [
      { error: { code: 'SDK_SECRET_NEVER_LOG', message: 'private', correlationId: 'private' } },
      { error: { code: 'LLM_TIMEOUT' } },
      { code: 'LLM_TIMEOUT', sdk: 'SDK_SECRET_NEVER_LOG' },
    ]) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body, { status: 504 }));
      const report = await runEvaluation(matrix(), [source], options, transport);
      expect(report.cases[0]?.turns[0]?.httpStatus).toBe(504);
      expect(report.cases[0]?.turns[0]?.errorCode).toBeUndefined();
      expect(JSON.stringify(report)).not.toContain('SDK_SECRET_NEVER_LOG');
    }
  });

  it('limita leitura de erros a 8192 bytes e cancela streams maiores', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8193).fill(65));
      },
      cancel,
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 502 }));
    const report = await runEvaluation(matrix(), [source], options, transport);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(report.cases[0]?.turns[0]?.errorCode).toBeUndefined();
    expect(report.cases[0]?.turns[0]?.httpStatus).toBe(502);
  });

  it('decodifica corpo de erro válido dividido em chunks sem persistir campos privados', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        error: {
          code: 'LLM_TIMEOUT',
          message: 'não persistir',
          correlationId: 'private_correlation_never_log',
        },
      }),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17));
        controller.close();
      },
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 504 }));
    const report = await runEvaluation(matrix(), [source], options, transport);
    expect(report.cases[0]?.turns[0]?.errorCode).toBe('LLM_TIMEOUT');
    expect(JSON.stringify(report)).not.toContain('private_correlation');
  });

  it('restringe URL por padrão e aceita origem remota HTTPS explícita', () => {
    expect(apiOrigin()).toBe('http://127.0.0.1:3000');
    expect(apiOrigin('http://localhost:3001')).toBe('http://localhost:3001');
    expect(apiOrigin('https://api.example.com', true)).toBe('https://api.example.com');
    for (const origin of [
      'https://api.example.com',
      'http://user:secret@localhost',
      'http://localhost?key=secret',
      'http://localhost/path',
    ]) {
      expect(() => apiOrigin(origin)).toThrow();
    }
    expect(() => apiOrigin('http://api.example.com', true)).toThrow();
  });
});
