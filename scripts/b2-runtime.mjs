import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const backend = '/app/backend';
const frontend = '/app/frontend';
const artifacts = '/app/artifacts';
const origin = {
  API: 'http://127.0.0.1:3000',
  FRONTEND: 'http://127.0.0.1:5173',
  OIDC: 'http://127.0.0.1:4400',
  CONTROL: 'http://127.0.0.1:4401',
  PROXY: 'http://127.0.0.1:4402',
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const children = new Set();
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

// Frontend/browser subprocesses never inherit the API's key or database credentials.
const commonEnvironment = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH'].flatMap((name) =>
    process.env[name] === undefined ? [] : [[name, process.env[name]]],
  ),
);
Object.assign(commonEnvironment, { CI: 'true', NODE_ENV: 'test', GITHUB_REF_NAME: 'dev' });
for (const [name, value] of Object.entries(origin)) {
  commonEnvironment[`PHASSCODE_B2_${name}_URL`] = value;
}
Object.assign(commonEnvironment, {
  PHASSCODE_B2_DISPOSABLE: 'true',
  PHASSCODE_B2_ARTIFACTS_DIR: artifacts,
  PHASSCODE_B2_OWNERSHIP_NONCE: process.env.PHASSCODE_B2_OWNERSHIP_NONCE,
  PHASSCODE_B2_CONTROL_KEY: process.env.PHASSCODE_B2_CONTROL_KEY,
});

function launch(name, args, cwd, env, { output = false } = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    shell: false,
    stdio: ['ignore', output ? 'inherit' : 'ignore', output ? 'inherit' : 'ignore'],
  });
  children.add(child);
  const completion = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`Could not start the owned ${name} process.`)));
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`Owned ${name} exited with ${code ?? signal ?? 'unknown status'}.`));
    });
  });
  // Background failures are checked by readiness/race, without unhandled rejections.
  void completion.catch(() => {});
  return { child, completion };
}
async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let expired = false;
  await Promise.race([
    exited,
    delay(5000).then(() => {
      expired = true;
    }),
  ]);
  if (expired && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(2000)]);
  }
}
async function waitFor(url, validate = () => true, processes = [], headers = {}) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    controller.signal.throwIfAborted();
    for (const process of processes) {
      if (process.child.exitCode !== null || process.child.signalCode !== null) {
        await process.completion;
        throw new Error('An owned background process exited before readiness.');
      }
    }
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(1500),
        redirect: 'error',
      });
      if (response.ok && (await validate(response))) return;
    } catch {
      /* Retry readiness only; never retry application mutations. */
    }
    await delay(100, undefined, { signal: controller.signal });
  }
  throw new Error('The disposable services did not become ready within the deadline.');
}

const phases = [];
const testFilter = process.env.PHASSCODE_B2_TEST_GREP ?? '';
const frontendTestFilter = process.env.PHASSCODE_B2_FRONTEND_TEST_GREP ?? '';
const frontendOnly = process.env.PHASSCODE_B2_FRONTEND_ONLY === 'true';
const integratedSkipped = frontendOnly || process.env.PHASSCODE_B2_REGRESSION_ONLY === 'true';
const regression = integratedSkipped || process.env.PHASSCODE_B2_REGRESSION === 'true';
const regressionScope = frontendOnly ? 'frontend' : regression ? 'backend-and-frontend' : 'none';
const frontendSuiteNames = ['default', 'f1', 'f2', 'phase3', 'orbe'];
const frontendSuites = regression
  ? process.env.PHASSCODE_B2_FRONTEND_SUITES
    ? process.env.PHASSCODE_B2_FRONTEND_SUITES.split(',')
    : frontendTestFilter
      ? ['default']
      : frontendSuiteNames
  : [];
async function command(name, args, cwd, env) {
  const started = Date.now();
  const process = launch(name, args, cwd, env, { output: true });
  let abortListener = () => {};
  try {
    await Promise.race([
      process.completion,
      new Promise((_resolve, reject) => {
        if (controller.signal.aborted) reject(new Error('Disposable run interrupted.'));
        else {
          abortListener = () => reject(new Error('Disposable run interrupted.'));
          controller.signal.addEventListener('abort', abortListener, { once: true });
        }
      }),
    ]);
    phases.push({ name, status: 'passed', durationMs: Date.now() - started });
  } catch (error) {
    await terminate(process.child);
    phases.push({ name, status: 'failed', durationMs: Date.now() - started });
    throw error;
  } finally {
    controller.signal.removeEventListener('abort', abortListener);
  }
}

async function frontendSuite(name, configuration, environment, filter = '') {
  const directory = join(artifacts, `frontend-${name}`);
  await mkdir(directory, { recursive: true });
  const report = join(directory, 'report.json');
  const phase = `frontend ${name} regressions`;
  try {
    await command(
      phase,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        configuration,
        '--reporter=list,json,html',
        '--retries=0',
        ...(filter ? ['--grep', filter] : []),
        '--output',
        join(directory, 'test-results'),
      ],
      frontend,
      {
        ...environment,
        PLAYWRIGHT_JSON_OUTPUT_FILE: report,
        PLAYWRIGHT_HTML_OUTPUT_DIR: join(directory, 'html'),
        PLAYWRIGHT_HTML_OPEN: 'never',
      },
    );
  } finally {
    try {
      const { stats } = JSON.parse(await readFile(report, 'utf8'));
      const result = phases.findLast((item) => item.name === phase);
      if (result && filter) result.testFilter = filter;
      if (
        result &&
        ['expected', 'unexpected', 'flaky', 'skipped'].every((key) =>
          Number.isSafeInteger(stats?.[key]),
        )
      ) {
        result.tests = {
          passed: stats.expected,
          failed: stats.unexpected,
          flaky: stats.flaky,
          skipped: stats.skipped,
        };
      }
    } catch {
      /* Preserve the original test/startup failure if no JSON report exists. */
    }
  }
}

async function scanMainBuild(needles) {
  const started = Date.now();
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'The generated frontend build must not contain symlinks.');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.(?:[cm]?js|css|html|json|map)$/.test(entry.name)) {
        const bytes = await readFile(path);
        const text = bytes.toString('utf8');
        for (const needle of needles)
          assert.ok(
            !text.includes(needle),
            'A forbidden API URL or private synthetic sentinel appeared in the main build.',
          );
        files.push({
          path: path.slice(join(frontend, 'dist').length + 1),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  }
  try {
    await visit(join(frontend, 'dist'));
    assert.ok(
      files.some((file) => file.path.endsWith('.js')),
      'Main build produced no JavaScript.',
    );
    phases.push({
      name: 'frontend main artifact scan',
      status: 'passed',
      durationMs: Date.now() - started,
    });
    return { forbiddenStringsAbsent: true, files, policyTestsPassed: false };
  } catch (error) {
    phases.push({
      name: 'frontend main artifact scan',
      status: 'failed',
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

let failure;
try {
  assert.equal(process.platform, 'linux');
  assert.match(process.versions.node, /^24\./);
  assert.equal(process.cwd(), backend);
  assert.equal(process.env.PHASSCODE_B2_DISPOSABLE, 'true');
  assert.match(process.env.PHASSCODE_B2_OWNERSHIP_NONCE ?? '', uuid);
  assert.match(process.env.PHASSCODE_B2_CONTROL_KEY ?? '', uuid);
  for (const filter of [testFilter, frontendTestFilter])
    assert.ok(
      typeof filter === 'string' &&
        filter.length <= 200 &&
        !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(filter) &&
        (!filter || !!filter.trim()),
      'The generated B2 test filter is invalid.',
    );
  assert.ok(!frontendTestFilter || frontendOnly, 'Frontend filtering requires frontend-only mode.');
  assert.ok(!frontendOnly || !testFilter, 'Integrated E2E filtering cannot select frontend tests.');
  assert.equal(process.env.PHASSCODE_B2_REGRESSION_SCOPE, regressionScope);
  assert.ok(
    (!regression || frontendSuites.length > 0) &&
      frontendSuites.every((name) => frontendSuiteNames.includes(name)) &&
      new Set(frontendSuites).size === frontendSuites.length,
    'The generated frontend suite selection is invalid.',
  );
  assert.deepEqual(
    frontendSuites,
    frontendSuiteNames.filter((name) => frontendSuites.includes(name)),
    'Frontend suites must use canonical order.',
  );
  assert.ok(
    !frontendTestFilter || (frontendSuites.length === 1 && frontendSuites[0] === 'default'),
    'Frontend filtering selects only the default suite.',
  );
  await access('/.dockerenv');
  const manifest = JSON.parse(await readFile('/app/b2-source-manifest.json', 'utf8'));
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
  const privateKey = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
  const regressionEnvironment = {
    ...commonEnvironment,
    LOG_LEVEL: 'silent',
    PERSISTENCE: 'postgres',
    DATABASE_URL: 'postgresql://synthetic:synthetic@postgres:5432/phasscode_e2e',
    TEST_DATABASE_URL: 'postgresql://synthetic:synthetic@postgres:5432/phasscode_e2e',
    REDIS_URL: 'redis://redis:6379/0',
    TEST_REDIS_URL: 'redis://redis:6379/1',
    LLM_PROVIDER: 'mock',
    LLM_FALLBACK_ENABLED: 'false',
  };
  const backendEnvironment = {
    ...regressionEnvironment,
    HOST: '127.0.0.1',
    PORT: '3001',
    CORS_ORIGINS: origin.FRONTEND,
    RATE_LIMIT_MAX: '10000',
    AUTH_ENABLED: 'true',
    AUTH_ADMIN_EMAIL: 'admin@example.test',
    AUTH_PUBLIC_URL: origin.API,
    AUTH_FRONTEND_URL: origin.FRONTEND,
    AUTH_GOOGLE_ISSUER: origin.OIDC,
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_JWT_KEY_ID: 'b2-e2e-local',
    AUTH_JWT_PRIVATE_KEY: privateKey,
    MEETINGS_ENABLED: 'true',
    GOOGLE_CALENDAR_MODE: 'fake',
    WORKER_ENABLED: 'false',
    NOTIFICATION_MODE: 'disabled',
  };
  await command(
    'real migrations',
    ['--import', 'tsx', 'packages/database/src/migrate.ts'],
    backend,
    regressionEnvironment,
  );
  const { chromium } = await import(
    pathToFileURL(join(frontend, 'node_modules/playwright-core/index.mjs')).href
  );
  const browserEnvironment = {
    ...commonEnvironment,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: chromium.executablePath(),
  };
  if (!integratedSkipped) {
    const runtime = launch(
      'Fastify/OIDC/control/proxy',
      ['--import', 'tsx', 'tests/e2e/runtime.ts'],
      backend,
      backendEnvironment,
    );
    await waitFor(
      `${origin.CONTROL}/ready`,
      async (response) => {
        const body = await response.json();
        return (
          body.ready === true &&
          body.ownershipNonce === commonEnvironment.PHASSCODE_B2_OWNERSHIP_NONCE
        );
      },
      [runtime],
      { 'x-e2e-control-key': commonEnvironment.PHASSCODE_B2_CONTROL_KEY },
    );
    const vite = launch(
      'isolated React/Vite',
      [
        'node_modules/vite/bin/vite.js',
        '--config',
        'vite.f3.config.ts',
        '--host',
        '127.0.0.1',
        '--port',
        '5173',
        '--strictPort',
      ],
      frontend,
      commonEnvironment,
    );
    await waitFor(
      origin.FRONTEND,
      async (response) => (await response.text()).includes('id="root"'),
      [runtime, vite],
    );
    await command(
      'React/Fastify integrated E2E',
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.f3.config.ts',
        ...(testFilter ? ['--grep', testFilter] : []),
      ],
      frontend,
      browserEnvironment,
    );
    if (regression) {
      const started = Date.now();
      try {
        const response = await fetch(`${origin.CONTROL}/reset`, {
          method: 'POST',
          headers: {
            'x-e2e-control-key': commonEnvironment.PHASSCODE_B2_CONTROL_KEY,
            'Content-Type': 'application/json',
          },
          body: '{}',
          redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        assert.ok(response.ok, 'The owned fixture reset was not accepted.');
        assert.equal(
          (await response.json()).ok,
          true,
          'The owned fixture reset was not confirmed.',
        );
        phases.push({
          name: 'owned fixture reset',
          status: 'passed',
          durationMs: Date.now() - started,
        });
      } catch (error) {
        phases.push({
          name: 'owned fixture reset',
          status: 'failed',
          durationMs: Date.now() - started,
        });
        throw error;
      }
    }
    await terminate(vite.child);
    await terminate(runtime.child);
  }
  if (regression && !frontendOnly) {
    const unitTests = (await readdir(join(backend, 'tests')))
      .filter(
        (name) =>
          /^(?:auth(?:-|\.)|meetings(?:-|\.)|phase3-config\.|calendar-notifications\.|b2-oidc\.)/.test(
            name,
          ) &&
          name.endsWith('.test.ts') &&
          !name.endsWith('.integration.test.ts'),
      )
      .sort()
      .map((name) => `tests/${name}`);
    assert.ok(unitTests.length >= 8, 'The targeted backend regression set is incomplete.');
    for (const [name, args] of [
      ['backend lint', ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings=0']],
      ['backend typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
      ['OpenAPI contract', ['--import', 'tsx', 'packages/contracts/src/generate.ts', '--check']],
      ['backend unit regressions', ['node_modules/vitest/vitest.mjs', 'run', ...unitTests]],
      [
        'backend PostgreSQL/Redis regressions',
        ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
      ],
      ['backend build', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']],
    ])
      await command(name, args, backend, regressionEnvironment);
  }
  if (regression) {
    const hostileApi = 'https://devapi.phasscode.com';
    const googleSentinel = 'b2-main-private-google-secret-sentinel';
    const jwtSentinel = 'b2-main-private-jwt-key-sentinel';
    const mainBuildEnvironment = {
      ...browserEnvironment,
      NODE_ENV: 'production',
      GITHUB_BASE_REF: 'main',
      GITHUB_REF_NAME: 'main',
      PHASSCODE_MOCK_API_BUILD: 'false',
      VITE_AUTH_ENABLED: 'true',
      VITE_MEETINGS_ENABLED: 'true',
      VITE_ORBE_API_ENABLED: 'true',
      VITE_PHASE3_ENABLED: 'true',
      VITE_API_BASE_URL: hostileApi,
      AUTH_GOOGLE_CLIENT_SECRET: googleSentinel,
      AUTH_JWT_PRIVATE_KEY: jwtSentinel,
    };
    await command(
      'frontend typecheck',
      ['node_modules/typescript/bin/tsc', '--noEmit'],
      frontend,
      browserEnvironment,
    );
    await command(
      'frontend main production build with hostile flags',
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist', '--emptyOutDir'],
      frontend,
      mainBuildEnvironment,
    );
    const mainEvidence = await scanMainBuild([
      hostileApi,
      origin.API,
      googleSentinel,
      jwtSentinel,
      commonEnvironment.PHASSCODE_B2_CONTROL_KEY,
      privateKey,
      'BEGIN PRIVATE KEY',
    ]);
    const mainEvidencePath = join(artifacts, 'frontend-main-build.json');
    mainEvidence.policyTestsSkipped = !!frontendTestFilter || !frontendSuites.includes('default');
    await writeFile(mainEvidencePath, JSON.stringify(mainEvidence, null, 2));
    // The default suite already includes both phase3-config main policy tests.
    // Its preview serves exactly the main dist just built and scanned above.
    if (frontendSuites.includes('default')) {
      await frontendSuite(
        'default',
        'playwright.config.ts',
        {
          ...browserEnvironment,
          GITHUB_BASE_REF: 'main',
          GITHUB_REF_NAME: 'main',
          PHASSCODE_MOCK_API_BUILD: 'false',
          VITE_AUTH_ENABLED: 'false',
          VITE_MEETINGS_ENABLED: 'false',
          VITE_ORBE_API_ENABLED: 'false',
          VITE_API_BASE_URL: '',
        },
        frontendTestFilter,
      );
      if (!frontendTestFilter) {
        const defaultReport = JSON.parse(
          await readFile(join(artifacts, 'frontend-default/report.json'), 'utf8'),
        );
        const policySpecs = [];
        function collectPolicyTests(suites) {
          for (const suite of suites ?? []) {
            for (const spec of suite.specs ?? []) {
              if (/^(?:build main|bundle main)/.test(spec.title)) policySpecs.push(spec);
            }
            collectPolicyTests(suite.suites);
          }
        }
        collectPolicyTests(defaultReport.suites);
        assert.equal(
          policySpecs.length,
          2,
          'Both existing main build policy tests must actually run.',
        );
        assert.ok(
          policySpecs.every(
            (spec) =>
              spec.ok &&
              spec.tests.some((test) => test.results.some((result) => result.status === 'passed')),
          ),
          'Main build policy tests did not both pass.',
        );
        mainEvidence.policyTestsPassed = true;
        await writeFile(mainEvidencePath, JSON.stringify(mainEvidence, null, 2));
      }
    }
    const developmentEnvironment = {
      ...browserEnvironment,
      GITHUB_BASE_REF: 'dev',
      GITHUB_REF_NAME: 'dev',
      PHASSCODE_MOCK_API_BUILD: 'false',
      VITE_ORBE_API_ENABLED: 'true',
      VITE_AUTH_ENABLED: 'true',
      VITE_MEETINGS_ENABLED: 'false',
      VITE_API_BASE_URL: hostileApi,
    };
    for (const [name, configuration] of [
      ['f1', 'playwright.f1.config.ts'],
      ['f2', 'playwright.f2.config.ts'],
      ['phase3', 'playwright.phase3.config.ts'],
      ['orbe', 'playwright.orbe.config.ts'],
    ].filter(([name]) => frontendSuites.includes(name)))
      await frontendSuite(name, configuration, {
        ...developmentEnvironment,
        // These profiles build and preview the app; F1/F2 use Vite dev.
        NODE_ENV: ['phase3', 'orbe'].includes(name) ? 'production' : 'development',
      });
  }
} catch (error) {
  failure = error;
} finally {
  await Promise.allSettled([...children].map((child) => terminate(child)));
  try {
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      join(artifacts, 'runtime-summary.json'),
      JSON.stringify(
        {
          passed: !failure,
          testFilter: testFilter || null,
          frontendTestFilter: frontendTestFilter || null,
          frontendSuites,
          regressionScope,
          frontendOnly,
          integratedSkipped,
          phases,
          integrations: { llm: 'mock', calendar: 'fake', notifications: 'disabled', worker: false },
        },
        null,
        2,
      ),
    );
  } catch {
    failure ??= new Error('Could not preserve the disposable runtime summary.');
  }
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
if (failure) {
  console.error(failure instanceof Error ? failure.message : 'Disposable integrated E2E failed.');
  process.exitCode = 1;
}
