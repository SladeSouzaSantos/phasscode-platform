import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imageVersion = '1.64.1';
const frontendSuiteNames = ['default', 'f1', 'f2', 'phase3', 'orbe'];
const backendPaths = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'vitest.config.ts',
  'vitest.integration.config.ts',
  'vitest.browser.config.ts',
  'eslint.config.js',
  '.prettierrc.json',
  'apps',
  'packages',
  'tests',
  'scripts',
  'knowledge',
  'infrastructure/postgres/migrations',
  // Imported by typechecked test sources; evaluation data/reports are not copied.
  'evaluation/evaluator.ts',
  'evaluation/phase3.ts',
  'evaluation/schema.ts',
  'evaluation/runner.ts',
  'examples/frontend-client.ts',
  'examples/phase3-client.ts',
];
const frontendPaths = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'index.html',
  'vite.config.ts',
  'vite.f3.config.ts',
  'playwright.config.ts',
  'playwright.f3.config.ts',
  'playwright.f1.config.ts',
  'playwright.f2.config.ts',
  'playwright.phase3.config.ts',
  'playwright.orbe.config.ts',
  // Exact non-secret CI policy sources used by the frontend workflow regression test.
  '.github/workflows/deploy.yml',
  '.github/workflows/paired-dev-ci.yml',
  'src',
  'public',
  'tests',
  'scripts',
];

function validateTestFilter(value, option = '--grep') {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)
  ) {
    throw new Error(`B2 ${option} must contain 1-200 characters without control characters.`);
  }
  return value;
}

function validateFrontendSuites(value) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((name) => !frontendSuiteNames.includes(name)) ||
    new Set(value).size !== value.length
  )
    throw new Error('B2 --frontend-suites requires unique names from default,f1,f2,phase3,orbe.');
  return frontendSuiteNames.filter((name) => value.includes(name));
}

export function parseArguments(args) {
  const result = { regression: false };
  let regressionExplicit = false;
  let regressionOnlyExplicit = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--regression' && !regressionExplicit) {
      result.regression = true;
      regressionExplicit = true;
    } else if (name === '--regression-only' && !regressionOnlyExplicit) {
      regressionOnlyExplicit = true;
      result.regressionOnly = true;
      result.regression = true;
    } else if (name === '--frontend-regression-only' && !result.frontendOnly) {
      result.frontendOnly = true;
      result.regressionOnly = true;
      result.regression = true;
    } else if (name === '--grep' && result.grep === undefined) {
      const value = args[++index];
      if (typeof value !== 'string' || value.startsWith('--'))
        throw new Error('Missing B2 --grep text.');
      result.grep = validateTestFilter(value);
    } else if (name === '--frontend-grep' && result.frontendGrep === undefined) {
      const value = args[++index];
      if (typeof value !== 'string' || value.startsWith('--'))
        throw new Error('Missing B2 --frontend-grep text.');
      result.frontendGrep = validateTestFilter(value, name);
    } else if (name === '--frontend-suites' && result.frontendSuites === undefined) {
      const value = args[++index];
      if (typeof value !== 'string' || value.startsWith('--'))
        throw new Error('Missing B2 --frontend-suites list.');
      result.frontendSuites = validateFrontendSuites(value.split(','));
    } else if (['--frontend', '--artifacts'].includes(name) && !result[name.slice(2)]) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing B2 harness argument.');
      result[name.slice(2)] = resolve(value);
    } else
      throw new Error(
        'Usage: npm run test:e2e -- --frontend PATH [--grep TEXT] [--regression | --regression-only | --frontend-regression-only [--frontend-grep TEXT] [--frontend-suites default,f1,f2,phase3,orbe]] [--artifacts DIR]',
      );
  }
  if (!result.frontend)
    throw new Error('An explicit frontend checkout is required: --frontend PATH');
  if (result.frontendGrep !== undefined && !result.frontendOnly)
    throw new Error('B2 --frontend-grep requires --frontend-regression-only.');
  if (result.frontendSuites !== undefined && !result.frontendOnly)
    throw new Error('B2 --frontend-suites requires --frontend-regression-only.');
  if (result.frontendGrep && result.frontendSuites && !result.frontendSuites.includes('default'))
    throw new Error('B2 --frontend-grep requires default in --frontend-suites.');
  if (result.frontendOnly && result.grep !== undefined)
    throw new Error('Use --frontend-grep for frontend regressions; --grep selects integrated E2E.');
  return result;
}

export function isLocalEndpoint(endpoint) {
  if (endpoint.startsWith('unix://') || endpoint.startsWith('npipe://')) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'tcp:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function dockerEnvironment(environment = process.env) {
  return Object.fromEntries(
    [
      'PATH',
      'SystemRoot',
      'ComSpec',
      'PATHEXT',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      'ProgramFiles',
      'ProgramFiles(x86)',
      'ProgramW6432',
      'ProgramData',
      'ALLUSERSPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'XDG_RUNTIME_DIR',
    ].flatMap((name) => (environment[name] === undefined ? [] : [[name, environment[name]]])),
  );
}

export function snapshotPathAllowed(name, kind) {
  if (typeof name !== 'string' || name.includes('\\') || isAbsolute(name)) return false;
  const parts = name.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /^\.env(?:\.|$)/i.test(part) ||
        [
          '.git',
          '.npmrc',
          'node_modules',
          'dist',
          'coverage',
          'phasscode-private-backups',
        ].includes(part.toLowerCase()),
    )
  )
    return false;
  const paths = kind === 'backend' ? backendPaths : kind === 'frontend' ? frontendPaths : [];
  return paths.some((path) => name === path || name.startsWith(`${path}/`));
}

function within(directory, file) {
  const path = relative(directory, file);
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path);
}
async function git(directory, args) {
  const { stdout } = await exec('git', args, {
    cwd: directory,
    env: dockerEnvironment(),
    windowsHide: true,
    maxBuffer: 8_388_608,
  });
  return stdout;
}
async function snapshot(directory, checkout, kind) {
  const repository = await realpath(checkout);
  const branch = (await git(repository, ['branch', '--show-current'])).trim();
  assert.equal(branch, 'dev', 'The integrated harness only accepts the authorized dev checkouts.');
  const head = (await git(repository, ['rev-parse', 'HEAD'])).trim();
  assert.match(head, /^[a-f0-9]{40}$/);
  const paths = kind === 'backend' ? backendPaths : frontendPaths;
  // Pathspecs limit discovery to known source trees; no parent workspace is traversed.
  const candidates = (
    await git(repository, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      ...paths,
      ':(exclude)**/phasscode-private-backups/**',
    ])
  )
    .split('\0')
    .filter(Boolean);
  const names = [...new Set(candidates)].filter((name) => snapshotPathAllowed(name, kind)).sort();
  const entries = [];
  for (const name of names) {
    const source = resolve(repository, name);
    assert.ok(within(repository, source));
    const metadata = await lstat(source);
    assert.ok(
      metadata.isFile() && !metadata.isSymbolicLink(),
      'Snapshots refuse symlinks and non-files.',
    );
    assert.ok(
      within(repository, await realpath(source)),
      'Snapshot files must remain inside their checkout.',
    );
    const bytes = await readFile(source);
    const target = join(directory, kind, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    entries.push({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const lock = JSON.parse(await readFile(join(directory, kind, 'package-lock.json'), 'utf8'));
  assert.equal(
    lock.packages?.['node_modules/playwright-core']?.version,
    imageVersion,
    'Both locked Playwright packages must match the official browser image.',
  );
  if (kind === 'frontend')
    assert.equal(lock.packages?.['node_modules/@playwright/test']?.version, imageVersion);
  return {
    branch,
    head,
    files: entries.length,
    snapshotSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
  };
}

async function executeDocker(args, { env, phase, timeout = 180_000, signal }) {
  console.info(`[B2] ${phase}`);
  const started = Date.now();
  const progress = setInterval(() => {
    console.info(`[B2] ${phase}: running (${Math.floor((Date.now() - started) / 1000)}s)`);
  }, 30_000);
  try {
    const result = await exec('docker', args, {
      cwd: root,
      env,
      timeout,
      signal,
      windowsHide: true,
      maxBuffer: 16_777_216,
    });
    return result.stdout.trim();
  } catch (error) {
    // Do not expose command exceptions, environment dumps or third-party payloads.
    const failure = new Error(`B2 disposable harness failed during ${phase}.`);
    failure.output = [error.stdout, error.stderr]
      .filter((value) => typeof value === 'string')
      .join('\n');
    throw failure;
  } finally {
    clearInterval(progress);
  }
}

export async function runIntegratedE2e(
  options,
  { docker = executeDocker, prepareSnapshot = snapshot, signal } = {},
) {
  const testFilter = options.grep === undefined ? '' : validateTestFilter(options.grep);
  const frontendOnly = !!options.frontendOnly;
  const frontendTestFilter =
    options.frontendGrep === undefined
      ? ''
      : validateTestFilter(options.frontendGrep, '--frontend-grep');
  assert.ok(!frontendTestFilter || frontendOnly, '--frontend-grep requires frontend-only mode.');
  assert.ok(!frontendOnly || !testFilter, '--grep cannot select frontend regressions.');
  const integratedSkipped = !!options.regressionOnly || frontendOnly;
  const regression = !!options.regression || integratedSkipped;
  const requestedFrontendSuites =
    options.frontendSuites === undefined
      ? frontendSuiteNames
      : validateFrontendSuites(options.frontendSuites);
  assert.ok(
    options.frontendSuites === undefined || frontendOnly,
    '--frontend-suites requires frontend-only mode.',
  );
  assert.ok(
    !frontendTestFilter || requestedFrontendSuites.includes('default'),
    '--frontend-grep requires the default frontend suite.',
  );
  const frontendSuites = regression
    ? frontendTestFilter
      ? ['default']
      : requestedFrontendSuites
    : [];
  const regressionScope = frontendOnly ? 'frontend' : regression ? 'backend-and-frontend' : 'none';
  const frontend = await realpath(options.frontend);
  assert.notEqual(frontend, root, 'Select the separate frontend repository.');
  const project = `phasscode-b2-e2e-${randomUUID()}`;
  const tag = `${project}:runner`;
  const env = dockerEnvironment();
  const invoke = (args, phase, timeout = 180_000) =>
    docker(args, { env, phase, timeout, ...(signal ? { signal } : {}) });
  const endpoint =
    (env.DOCKER_CONTEXT
      ? await invoke(
          ['context', 'inspect', env.DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}'],
          'local Docker daemon check',
        )
      : env.DOCKER_HOST) ||
    (await invoke(
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      'local Docker daemon check',
    ));
  assert.ok(isLocalEndpoint(endpoint), 'B2 is restricted to a local Docker daemon.');
  // Before any mutation, prove that cleanup cannot refer to an existing project.
  for (const resource of ['container', 'network', 'volume']) {
    const args = [
      resource,
      'ls',
      ...(resource === 'container' ? ['--all'] : []),
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--quiet',
    ];
    assert.equal(
      await invoke(args, 'fresh disposable project check'),
      '',
      'The generated project must be unused.',
    );
  }
  assert.equal(
    await invoke(['image', 'ls', '--quiet', tag], 'fresh runner tag check'),
    '',
    'The runner tag must be unused.',
  );
  for (const image of ['postgres:17-alpine', 'redis:7-alpine']) {
    assert.equal(
      await invoke(
        ['image', 'inspect', '--format', '{{.Os}}', image],
        'local test dependency image check',
      ),
      'linux',
      'Preload the PostgreSQL/Redis test images explicitly; runtime never pulls images.',
    );
  }
  const directory = await mkdtemp(join(tmpdir(), 'phasscode-b2-context-'));
  const emptyEnv = join(directory, 'empty.env');
  const artifactRoot = resolve(options.artifacts ?? join(root, '.docker-local', 'b2-e2e'));
  const artifactDirectory = join(artifactRoot, project);
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(artifactDirectory); // Refuse rather than overwrite even an improbable collision.
  const startedAt = new Date().toISOString();
  let manifest;
  let imageId;
  let containerId;
  let networkId;
  let networkInternal = false;
  let failure;
  let cleanupFailed = false;
  let built = false;
  let attemptedCompose = false;
  await writeFile(emptyEnv, '', { mode: 0o600 });
  Object.assign(env, {
    PHASSCODE_B2_RUNNER_IMAGE: tag,
    PHASSCODE_B2_OWNERSHIP_NONCE: randomUUID(),
    PHASSCODE_B2_CONTROL_KEY: randomUUID(),
    PHASSCODE_B2_REGRESSION: regression ? 'true' : 'false',
    PHASSCODE_B2_REGRESSION_ONLY: integratedSkipped ? 'true' : 'false',
    PHASSCODE_B2_FRONTEND_ONLY: frontendOnly ? 'true' : 'false',
    PHASSCODE_B2_REGRESSION_SCOPE: regressionScope,
    PHASSCODE_B2_TEST_GREP: testFilter,
    PHASSCODE_B2_FRONTEND_TEST_GREP: frontendTestFilter,
    PHASSCODE_B2_FRONTEND_SUITES: frontendSuites.join(','),
  });
  const compose = [
    'compose',
    '--project-name',
    project,
    '--env-file',
    emptyEnv,
    '--file',
    join(root, 'compose.b2-e2e.yaml'),
  ];
  try {
    manifest = {
      backend: await prepareSnapshot(directory, root, 'backend'),
      frontend: await prepareSnapshot(directory, frontend, 'frontend'),
    };
    await writeFile(join(directory, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
    await cp(join(root, 'infrastructure/docker/B2.Dockerfile'), join(directory, 'Dockerfile'));
    await invoke(
      [
        'build',
        '--tag',
        tag,
        '--label',
        `com.phasscode.b2.project=${project}`,
        '--file',
        join(directory, 'Dockerfile'),
        directory,
      ],
      'owned combined runner build',
      1_200_000,
    );
    built = true;
    const metadata = (
      await invoke(
        [
          'image',
          'inspect',
          '--format',
          '{{.Id}}|{{.Os}}|{{index .Config.Labels "com.phasscode.b2.project"}}',
          tag,
        ],
        'owned runner image verification',
      )
    ).split('|');
    [imageId] = metadata;
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
    assert.equal(metadata[1], 'linux');
    assert.equal(metadata[2], project);
    env.PHASSCODE_B2_RUNNER_IMAGE = imageId;
    await invoke([...compose, 'config', '--quiet'], 'isolated Compose validation');
    attemptedCompose = true;
    await invoke(
      [...compose, 'up', '-d', '--no-build', '--pull', 'never', '--wait', 'postgres', 'redis'],
      'exclusive PostgreSQL/Redis startup',
    );
    networkId = await invoke(
      ['network', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--quiet'],
      'owned network lookup',
    );
    assert.match(networkId, /^[a-f0-9]{12,64}$/);
    assert.equal(
      await invoke(
        [
          'network',
          'inspect',
          '--format',
          '{{.Internal}}|{{index .Labels "com.docker.compose.project"}}',
          networkId,
        ],
        'network isolation verification',
      ),
      `true|${project}`,
    );
    networkInternal = true;
    await invoke(
      [...compose, 'create', '--no-build', '--pull', 'never', 'e2e'],
      'owned runner creation',
    );
    containerId = await invoke(
      [...compose, 'ps', '--all', '--quiet', 'e2e'],
      'owned runner lookup',
    );
    assert.match(containerId, /^[a-f0-9]{12,64}$/);
    assert.equal(
      await invoke(
        [
          'inspect',
          '--format',
          '{{index .Config.Labels "com.docker.compose.project"}}|{{.Image}}',
          containerId,
        ],
        'owned runner container verification',
      ),
      `${project}|${imageId}`,
    );
    const output = await invoke(
      [
        ...compose,
        'up',
        '--no-build',
        '--pull',
        'never',
        '--abort-on-container-exit',
        '--exit-code-from',
        'e2e',
        'e2e',
      ],
      frontendOnly
        ? 'frontend regressions only'
        : integratedSkipped
          ? 'regressions only'
          : 'React/Fastify integrated run',
      1_800_000,
    );
    await writeFile(join(artifactDirectory, 'runner-output.log'), output);
  } catch (error) {
    failure = error;
    if (typeof error?.output === 'string') {
      try {
        await writeFile(join(artifactDirectory, 'runner-output.log'), error.output);
      } catch {
        /* A full artifact disk must never prevent project cleanup. */
      }
    }
  }
  try {
    if (containerId) {
      // Verify ownership again before copying from an exited container.
      assert.equal(
        await docker(
          [
            'inspect',
            '--format',
            '{{index .Config.Labels "com.docker.compose.project"}}',
            containerId,
          ],
          { env, phase: 'artifact container ownership check' },
        ),
        project,
      );
      await docker(['cp', `${containerId}:/app/artifacts/.`, artifactDirectory], {
        env,
        phase: 'owned JSON/HTML artifact extraction',
      });
    }
  } catch (error) {
    failure ??= error;
  }
  try {
    // Cleanup deliberately does not inherit the interrupted execution signal.
    if (attemptedCompose)
      await docker([...compose, 'down', '--volumes', '--remove-orphans', '--timeout', '30'], {
        env,
        phase: 'own disposable project cleanup',
        timeout: 90_000,
      });
    if (built) {
      assert.equal(
        await docker(
          [
            'image',
            'inspect',
            '--format',
            '{{index .Config.Labels "com.phasscode.b2.project"}}',
            tag,
          ],
          { env, phase: 'owned runner tag cleanup check' },
        ),
        project,
      );
      await docker(['image', 'rm', tag], { env, phase: 'own runner tag removal' });
    }
  } catch (error) {
    cleanupFailed = true;
    failure ??= error;
  } finally {
    // The only recursive filesystem removal is a verified, newly created temp context.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('phasscode-b2-context-'));
    await rm(directory, { recursive: true, force: true });
    delete env.PHASSCODE_B2_CONTROL_KEY;
  }
  await writeFile(
    join(artifactDirectory, 'isolation.json'),
    JSON.stringify(
      {
        project,
        startedAt,
        finishedAt: new Date().toISOString(),
        passed: !failure,
        cleanupFailed,
        imageId,
        networkId,
        containerId,
        networkInternal,
        publishedPorts: [],
        persistentVolumes: [],
        workerStarted: false,
        regression,
        regressionScope,
        frontendOnly,
        integratedSkipped,
        testFilter: testFilter || null,
        frontendTestFilter: frontendTestFilter || null,
        frontendSuites,
        source: manifest,
      },
      null,
      2,
    ),
  );
  if (failure)
    throw new Error(
      `${failure instanceof Error ? failure.message : 'Integrated E2E failed.'} Artifacts: ${artifactDirectory}.${cleanupFailed ? ` Cleanup incomplete: inspect only project ${project}.` : ''}`,
    );
  return { project, imageId, artifactDirectory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await runIntegratedE2e(options, {
      signal: controller.signal,
    });
    const scope = options.frontendOnly
      ? `${options.frontendGrep ? 'filtered ' : options.frontendSuites ? 'selected ' : ''}frontend regressions only (integrated E2E/backend checks not run)`
      : options.regressionOnly
        ? 'regressions only (integrated E2E not run)'
        : options.grep
          ? 'filtered integrated E2E'
          : 'integrated E2E';
    console.info(
      `PASS B2/F3 ${scope}; own disposable project removed. Artifacts: ${result.artifactDirectory}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'B2/F3 disposable harness failed.');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
