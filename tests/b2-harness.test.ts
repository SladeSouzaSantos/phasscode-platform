import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  dockerEnvironment,
  isLocalEndpoint,
  parseArguments,
  runIntegratedE2e,
  snapshotPathAllowed,
  type DockerExecutor,
  type IntegratedOptions,
  type SnapshotMetadata,
} from '../scripts/b2-e2e.mjs';

const imageId = `sha256:${'a'.repeat(64)}`;
const containerId = 'b'.repeat(64);
const networkId = 'c'.repeat(12);
const directories: string[] = [];
async function inputs() {
  const directory = await mkdtemp(join(tmpdir(), 'phasscode-b2-unit-'));
  directories.push(directory);
  const frontend = join(directory, 'frontend');
  await mkdir(frontend);
  return { frontend, artifacts: join(directory, 'artifacts') };
}
const prepareSnapshot = vi.fn<
  (directory: string, checkout: string, kind: 'backend' | 'frontend') => Promise<SnapshotMetadata>
>(async () => ({
  branch: 'dev',
  head: 'd'.repeat(40),
  files: 2,
  snapshotSha256: 'e'.repeat(64),
}));
function fakeDocker({
  collision = false,
  failure = false,
  remote = false,
  interrupted,
}: {
  collision?: boolean;
  failure?: boolean;
  remote?: boolean;
  interrupted?: AbortController;
} = {}) {
  let project = '';
  return vi.fn<DockerExecutor>(async (args, invocation) => {
    expect(invocation.env.DATABASE_URL).toBeUndefined();
    expect(invocation.env.LLM_API_KEY).toBeUndefined();
    expect(invocation.env.NODE_OPTIONS).toBeUndefined();
    if (args[0] === 'context')
      return remote ? 'ssh://deployed.example.test' : 'unix:///var/run/docker.sock';
    if (args[0] === 'container' || args[0] === 'volume') return collision ? containerId : '';
    if (args[0] === 'network' && args[1] === 'ls')
      return args.join(' ').includes(project) && project ? networkId : '';
    if (args[0] === 'network' && args[1] === 'inspect') return `true|${project}`;
    if (args[0] === 'image' && args[1] === 'ls') return '';
    if (args[0] === 'image' && args[1] === 'inspect') {
      if (['postgres:17-alpine', 'redis:7-alpine'].includes(args.at(-1)!)) return 'linux';
      return args.includes('{{.Id}}|{{.Os}}|{{index .Config.Labels "com.phasscode.b2.project"}}')
        ? `${imageId}|linux|${project}`
        : project;
    }
    if (args[0] === 'build') {
      project = args[args.indexOf('--label') + 1]!.split('=')[1]!;
      return 'Synthetic build only: no Docker command is executed.';
    }
    if (args[0] === 'inspect')
      return args.includes('{{index .Config.Labels "com.docker.compose.project"}}|{{.Image}}')
        ? `${project}|${imageId}`
        : project;
    if (args[0] === 'compose' && args.includes('ps')) return containerId;
    if (args.includes('--exit-code-from')) {
      if (interrupted) {
        interrupted.abort();
        throw new Error('Synthetic interruption.');
      }
      if (failure) throw new Error('Synthetic E2E failure.');
      return 'Synthetic integrated results.';
    }
    return '';
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  prepareSnapshot.mockClear();
  for (const directory of directories.splice(0)) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()));
    expect(basename(directory)).toMatch(/^phasscode-b2-unit-/);
    await rm(directory, { recursive: true, force: true });
  }
});

describe('B2 disposable runner policy without a Docker daemon', () => {
  it('requires an explicit frontend and rejects unknown, missing or duplicated options', () => {
    expect(parseArguments(['--frontend', './synthetic', '--regression'])).toEqual({
      frontend: resolve('synthetic'),
      regression: true,
    });
    expect(parseArguments(['--frontend', './synthetic', '--regression-only'])).toEqual({
      frontend: resolve('synthetic'),
      regression: true,
      regressionOnly: true,
    });
    expect(parseArguments(['--frontend', './synthetic', '--frontend-regression-only'])).toEqual({
      frontend: resolve('synthetic'),
      frontendOnly: true,
      regressionOnly: true,
      regression: true,
    });
    for (const flags of [
      ['--regression', '--regression-only'],
      ['--regression-only', '--regression'],
    ]) {
      expect(parseArguments(['--frontend', './synthetic', ...flags])).toMatchObject({
        regression: true,
        regressionOnly: true,
      });
    }
    const filter = '^callback.*(state|nonce)$';
    expect(
      parseArguments([
        '--frontend',
        './synthetic',
        '--frontend-suites',
        'orbe,phase3',
        '--frontend-regression-only',
      ]).frontendSuites,
    ).toEqual(['phase3', 'orbe']);
    expect(
      parseArguments([
        '--frontend',
        './synthetic',
        '--frontend-regression-only',
        '--frontend-suites',
        'orbe,phase3,f2,f1,default',
      ]).frontendSuites,
    ).toEqual(['default', 'f1', 'f2', 'phase3', 'orbe']);
    expect(
      parseArguments([
        '--frontend',
        './synthetic',
        '--frontend-regression-only',
        '--frontend-suites',
        'phase3,default',
        '--frontend-grep',
        filter,
      ]),
    ).toMatchObject({ frontendSuites: ['default', 'phase3'], frontendGrep: filter });
    for (const selection of [
      '',
      'unknown',
      'phase3,phase3',
      'phase3,',
      ',orbe',
      'Phase3',
      'phase3, orbe',
      'phase3\norbe',
    ])
      expect(() =>
        parseArguments([
          '--frontend',
          './synthetic',
          '--frontend-regression-only',
          '--frontend-suites',
          selection,
        ]),
      ).toThrow();
    expect(parseArguments(['--frontend', './synthetic', '--grep', filter]).grep).toBe(filter);
    for (const flags of [
      ['--frontend-regression-only', '--frontend-grep', filter],
      ['--frontend-grep', filter, '--frontend-regression-only'],
      ['--regression-only', '--frontend-regression-only', '--frontend-grep', filter],
      ['--frontend-regression-only', '--regression-only', '--frontend-grep', filter],
    ])
      expect(parseArguments(['--frontend', './synthetic', ...flags])).toMatchObject({
        frontendOnly: true,
        regressionOnly: true,
        regression: true,
        frontendGrep: filter,
      });
    expect(
      parseArguments(['--frontend', './synthetic', '--grep', 'a'.repeat(200)]).grep,
    ).toHaveLength(200);
    expect(
      parseArguments([
        '--frontend',
        './synthetic',
        '--frontend-regression-only',
        '--frontend-grep',
        'a'.repeat(200),
      ]).frontendGrep,
    ).toHaveLength(200);
    for (const invalid of [
      '',
      ' ',
      'a'.repeat(201),
      'callback\nstate',
      'callback\rstate',
      'callback\tstate',
      'callback\0state',
      'callback\u001bstate',
      'callback\u0085state',
      'callback\u2028state',
    ]) {
      expect(() => parseArguments(['--frontend', './synthetic', '--grep', invalid])).toThrow();
      expect(() =>
        parseArguments([
          '--frontend',
          './synthetic',
          '--frontend-regression-only',
          '--frontend-grep',
          invalid,
        ]),
      ).toThrow();
    }
    for (const args of [
      [],
      ['--frontend'],
      ['--frontend', '--regression'],
      ['--production'],
      ['--frontend', './a', '--frontend', './b'],
      ['--frontend', './a', '--regression', '--regression'],
      ['--frontend', './a', '--regression-only', '--regression-only'],
      ['--frontend', './a', '--grep'],
      ['--frontend', './a', '--grep', '--regression'],
      ['--frontend', './a', '--grep', 'first', '--grep', 'second'],
      ['--frontend', './a', '--frontend-regression-only', '--frontend-regression-only'],
      ['--frontend', './a', '--frontend-grep', 'theme'],
      ['--frontend', './a', '--regression-only', '--frontend-grep', 'theme'],
      ['--frontend', './a', '--frontend-regression-only', '--frontend-grep'],
      ['--frontend', './a', '--frontend-regression-only', '--frontend-grep', '--regression'],
      [
        '--frontend',
        './a',
        '--frontend-regression-only',
        '--frontend-grep',
        'first',
        '--frontend-grep',
        'second',
      ],
      ['--frontend', './a', '--frontend-regression-only', '--grep', 'theme'],
      ['--frontend', './a', '--frontend-suites', 'phase3,orbe'],
      ['--frontend', './a', '--regression-only', '--frontend-suites', 'phase3,orbe'],
      ['--frontend', './a', '--frontend-regression-only', '--frontend-suites'],
      ['--frontend', './a', '--frontend-regression-only', '--frontend-suites', '--regression'],
      [
        '--frontend',
        './a',
        '--frontend-regression-only',
        '--frontend-suites',
        'phase3',
        '--frontend-suites',
        'orbe',
      ],
      [
        '--frontend',
        './a',
        '--frontend-regression-only',
        '--frontend-suites',
        'phase3,orbe',
        '--frontend-grep',
        'theme',
      ],
    ]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });

  it('accepts local Docker endpoints only and excludes inherited application credentials', () => {
    for (const endpoint of [
      'unix:///var/run/docker.sock',
      'npipe:////./pipe/docker_engine',
      'tcp://127.0.0.1:2375',
      'tcp://[::1]:2375',
    ]) {
      expect(isLocalEndpoint(endpoint)).toBe(true);
    }
    for (const endpoint of [
      'ssh://macmini',
      'tcp://deployed.example.test:2375',
      'https://127.0.0.1:2375',
      '',
    ]) {
      expect(isLocalEndpoint(endpoint)).toBe(false);
    }
    expect(
      dockerEnvironment({
        PATH: '/synthetic/bin',
        ProgramFiles: 'C:\\Synthetic',
        DATABASE_URL: 'private',
        AUTH_JWT_PRIVATE_KEY: 'private',
        LLM_API_KEY: 'private',
        NODE_OPTIONS: '--env-file=real.env',
        COMPOSE_FILE: 'deploy.yml',
        PHASSCODE_B2_TEST_GREP: 'must-not-be-inherited',
        PHASSCODE_B2_REGRESSION_ONLY: 'must-not-be-inherited',
        PHASSCODE_B2_FRONTEND_ONLY: 'must-not-be-inherited',
        PHASSCODE_B2_REGRESSION_SCOPE: 'must-not-be-inherited',
        PHASSCODE_B2_FRONTEND_TEST_GREP: 'must-not-be-inherited',
        PHASSCODE_B2_FRONTEND_SUITES: 'must-not-be-inherited',
      }),
    ).toEqual({ PATH: '/synthetic/bin', ProgramFiles: 'C:\\Synthetic' });
  });

  it('selects known source paths without dotenv, credentials, artifacts or backup paths', () => {
    expect(snapshotPathAllowed('src/services/authClient.ts', 'frontend')).toBe(true);
    expect(snapshotPathAllowed('.github/workflows/deploy.yml', 'frontend')).toBe(true);
    expect(snapshotPathAllowed('.github/workflows/paired-dev-ci.yml', 'frontend')).toBe(true);
    expect(snapshotPathAllowed('.github/workflows/unapproved.yml', 'frontend')).toBe(false);
    expect(snapshotPathAllowed('tests/e2e/runtime.ts', 'backend')).toBe(true);
    expect(
      snapshotPathAllowed('infrastructure/postgres/migrations/001_initial.sql', 'backend'),
    ).toBe(true);
    for (const path of ['tests/.npmrc', 'apps/orbe-node/.npmrc'])
      expect(snapshotPathAllowed(path, 'backend')).toBe(false);
    for (const path of [
      '.env',
      '.env.local',
      'src/.env.example',
      '../outside.ts',
      '/outside.ts',
      'src/../outside.ts',
      'src\\outside.ts',
      'node_modules/dependency.ts',
      'dist/bundle.js',
      'src/phasscode-private-backups/private.txt',
      'src/.git/config',
      'src/node_modules/file.ts',
      'test-results/report.json',
      '.npmrc',
    ])
      expect(snapshotPathAllowed(path, 'frontend')).toBe(false);
  });

  it('keeps the Compose network private with no published ports, bind mounts or persistent volumes', async () => {
    const config = parse(await readFile('compose.b2-e2e.yaml', 'utf8')) as {
      services: Record<
        string,
        {
          ports?: unknown;
          volumes?: unknown;
          pull_policy?: string;
          networks: string[];
          environment?: Record<string, string>;
        }
      >;
      networks: { e2e: { internal: boolean } };
      volumes?: unknown;
    };
    expect(config.networks.e2e.internal).toBe(true);
    expect(config.volumes).toBeUndefined();
    expect(Object.keys(config.services)).toEqual(['postgres', 'redis', 'e2e']);
    for (const service of Object.values(config.services)) {
      expect(service.ports).toBeUndefined();
      expect(service.volumes).toBeUndefined();
      expect(service.pull_policy).toBe('never');
      expect(service.networks).toEqual(['e2e']);
    }
    expect(config.services.e2e!.environment).toMatchObject({
      NODE_ENV: 'test',
      GITHUB_REF_NAME: 'dev',
      PHASSCODE_B2_DISPOSABLE: 'true',
      PHASSCODE_B2_FRONTEND_ONLY: '${PHASSCODE_B2_FRONTEND_ONLY:-false}',
      PHASSCODE_B2_REGRESSION_SCOPE: '${PHASSCODE_B2_REGRESSION_SCOPE:-none}',
      PHASSCODE_B2_FRONTEND_TEST_GREP: '${PHASSCODE_B2_FRONTEND_TEST_GREP:-}',
      PHASSCODE_B2_FRONTEND_SUITES: '${PHASSCODE_B2_FRONTEND_SUITES:-}',
    });
  });

  it('refuses a remote daemon or preexisting project before building or cleaning anything', async () => {
    const options = await inputs();
    for (const docker of [fakeDocker({ remote: true }), fakeDocker({ collision: true })]) {
      await expect(runIntegratedE2e(options, { docker, prepareSnapshot })).rejects.toThrow();
      expect(docker.mock.calls.some(([args]) => args[0] === 'compose' || args[0] === 'build')).toBe(
        false,
      );
      expect(prepareSnapshot).not.toHaveBeenCalled();
    }
    const invalidModes: Array<Partial<IntegratedOptions>> = [
      { frontendGrep: 'theme' },
      { frontendOnly: true, grep: 'theme' },
      { frontendOnly: true, frontendGrep: 'theme\ntransition' },
      { frontendSuites: ['phase3'] },
      { frontendOnly: true, frontendSuites: ['phase3', 'phase3'] },
      { frontendOnly: true, frontendSuites: ['phase3'], frontendGrep: 'theme' },
    ];
    for (const invalid of invalidModes) {
      const docker = fakeDocker();
      await expect(
        runIntegratedE2e({ ...options, ...invalid }, { docker, prepareSnapshot }),
      ).rejects.toThrow();
      expect(docker).not.toHaveBeenCalled();
    }
  });

  it('pins its runner, verifies isolation, extracts owned artifacts and cleans exactly one new project', async () => {
    vi.stubEnv('DATABASE_URL', 'must-not-be-inherited');
    vi.stubEnv('LLM_API_KEY', 'must-not-be-inherited');
    vi.stubEnv('NODE_OPTIONS', '--env-file=must-not-be-loaded');
    const modes: Array<Partial<IntegratedOptions>> = [
      { grep: 'callback|state', regressionOnly: true },
      { frontendOnly: true },
      { frontendOnly: true, frontendGrep: '^theme transition$' },
      { frontendOnly: true, frontendSuites: ['orbe', 'phase3'] },
      {
        frontendOnly: true,
        frontendSuites: ['phase3', 'default'],
        frontendGrep: '^theme transition$',
      },
    ];
    for (const mode of modes) {
      const options = { ...(await inputs()), ...mode };
      const selectedSuites = options.frontendGrep
        ? ['default']
        : ['default', 'f1', 'f2', 'phase3', 'orbe'].filter(
            (name) =>
              !options.frontendSuites ||
              options.frontendSuites.includes(
                name as NonNullable<IntegratedOptions['frontendSuites']>[number],
              ),
          );
      const snapshotCallIndex = prepareSnapshot.mock.calls.length;
      const docker = fakeDocker();
      const result = await runIntegratedE2e(options, { docker, prepareSnapshot });
      expect(result.imageId).toBe(imageId);
      expect(result.project).toMatch(/^phasscode-b2-e2e-[a-f0-9-]{36}$/);
      const compose = docker.mock.calls.filter(([args]) => args[0] === 'compose');
      for (const [args, invocation] of compose) {
        expect(args[args.indexOf('--project-name') + 1]).toBe(result.project);
        expect(args[args.indexOf('--env-file') + 1]).toMatch(
          /phasscode-b2-context-.*[/\\]empty\.env$/,
        );
        expect(invocation.env.PHASSCODE_B2_RUNNER_IMAGE).toBe(imageId);
        expect(invocation.env.PHASSCODE_B2_TEST_GREP).toBe(options.grep ?? '');
        expect(invocation.env.PHASSCODE_B2_FRONTEND_TEST_GREP).toBe(options.frontendGrep ?? '');
        expect(invocation.env.PHASSCODE_B2_FRONTEND_SUITES).toBe(selectedSuites.join(','));
        expect(invocation.env.PHASSCODE_B2_FRONTEND_ONLY).toBe(
          options.frontendOnly ? 'true' : 'false',
        );
        expect(invocation.env.PHASSCODE_B2_REGRESSION_SCOPE).toBe(
          options.frontendOnly ? 'frontend' : 'backend-and-frontend',
        );
        expect(invocation.env.PHASSCODE_B2_REGRESSION).toBe('true');
        expect(invocation.env.PHASSCODE_B2_REGRESSION_ONLY).toBe('true');
      }
      const extraction = docker.mock.calls.find(([args]) => args[0] === 'cp');
      expect(extraction?.[0]).toEqual([
        'cp',
        `${containerId}:/app/artifacts/.`,
        result.artifactDirectory,
      ]);
      const isolation = JSON.parse(
        await readFile(join(result.artifactDirectory, 'isolation.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(isolation).toMatchObject({
        passed: true,
        cleanupFailed: false,
        networkInternal: true,
        publishedPorts: [],
        persistentVolumes: [],
        workerStarted: false,
        testFilter: options.grep ?? null,
        frontendTestFilter: options.frontendGrep ?? null,
        frontendSuites: selectedSuites,
        frontendOnly: !!options.frontendOnly,
        regressionScope: options.frontendOnly ? 'frontend' : 'backend-and-frontend',
        regression: true,
        integratedSkipped: true,
      });
      expect(JSON.stringify(isolation)).not.toContain('PHASSCODE_B2_CONTROL_KEY');
      expect(compose.at(-1)?.[0]).toContain('down');
      expect(docker.mock.calls.at(-1)?.[0]).toEqual(['image', 'rm', `${result.project}:runner`]);
      const context = prepareSnapshot.mock.calls[snapshotCallIndex]![0];
      await expect(stat(context)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('preserves extraction and project cleanup after a runtime failure or interruption', async () => {
    const options = await inputs();
    for (const interrupted of [undefined, new AbortController()]) {
      const docker = fakeDocker({ failure: true, ...(interrupted ? { interrupted } : {}) });
      await expect(
        runIntegratedE2e(options, {
          docker,
          prepareSnapshot,
          ...(interrupted ? { signal: interrupted.signal } : {}),
        }),
      ).rejects.toThrow(/Artifacts:/);
      const cleanup = docker.mock.calls.find(([args]) => args.includes('down'));
      expect(cleanup).toBeDefined();
      expect(cleanup![1].signal).toBeUndefined();
      expect(docker.mock.calls.some(([args]) => args[0] === 'cp')).toBe(true);
      expect(docker.mock.calls.some(([args]) => args.includes('prune'))).toBe(false);
    }
  });
});
