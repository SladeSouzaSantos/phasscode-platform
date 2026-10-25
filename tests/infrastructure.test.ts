import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { LLM_FALLBACK_ENV_NAMES } from '../packages/shared-config/src/llm-fallback.js';

const root = resolve('.');
const processTimeoutMs = 30_000;
const temp = mkdtempSync(join(tmpdir(), 'phasscode-infrastructure-'));
afterAll(() => {
  if (
    !resolve(temp).startsWith(`${resolve(tmpdir())}${sep}`) ||
    !basename(temp).startsWith('phasscode-infrastructure-')
  ) {
    throw new Error('Refusing to remove an unexpected infrastructure test directory.');
  }
  rmSync(temp, { recursive: true, force: true });
});
const composeBin =
  process.platform === 'win32'
    ? 'C:/Program Files/Docker/Docker/resources/cli-plugins/docker-compose.exe'
    : 'docker';
const composePrefix = process.platform === 'win32' ? [] : ['compose'];
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const composeAvailable =
  spawnSync(composeBin, [...composePrefix, 'version', '--short'], {
    timeout: processTimeoutMs,
    env: { ...process.env, DOCKER_CONFIG: temp },
  }).status === 0;
const bashAvailable = spawnSync(bash, ['--version'], { timeout: processTimeoutMs }).status === 0;
if (!composeAvailable || !bashAvailable) {
  throw new Error(
    'test:infrastructure requires the Docker Compose CLI and Bash (Git Bash on Windows); no Docker daemon is needed.',
  );
}
const shellPath = (path: string) =>
  path
    .replaceAll('\\', '/')
    .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const dummyEnv = join(temp, 'isolated.env');
writeFileSync(dummyEnv, 'POSTGRES_PASSWORD=isolation-test-only\n');

interface ComposeConfig {
  name: string;
  services: Record<
    string,
    {
      image: string;
      container_name?: string;
      ports?: { host_ip: string; published: string; target: number }[];
      networks: Record<string, { aliases?: string[] }>;
      environment: Record<string, string>;
    }
  >;
  networks: Record<string, { name: string; external?: boolean }>;
  volumes?: Record<string, { name: string }>;
}
function render(
  project: string,
  port: string,
  files = ['compose.yaml'],
  extra: Record<string, string> = {},
) {
  const result = spawnSync(
    composeBin,
    [
      ...composePrefix,
      '--project-name',
      project,
      '--env-file',
      dummyEnv,
      ...files.flatMap((file) => ['-f', join(root, file)]),
      '--profile',
      '*',
      'config',
      '--format',
      'json',
    ],
    {
      encoding: 'utf8',
      timeout: processTimeoutMs,
      env: {
        ...process.env,
        DOCKER_CONFIG: temp,
        COMPOSE_PROJECT_NAME: project,
        PHASSCODE_HTTP_PORT: port,
        PHASSCODE_IMAGE: '',
        POSTGRES_PASSWORD: 'isolation-test-only',
        LLM_PROVIDER: 'mock',
        LLM_API_KEY: '',
        PHASSCODE_PROXY_NETWORK: '',
        PHASSCODE_PROXY_ALIAS: '',
        ...extra,
      },
    },
  );
  return {
    ...result,
    config: result.status === 0 ? (JSON.parse(result.stdout) as ComposeConfig) : undefined,
  };
}

describe('Docker environment isolation (real Compose interpolation, no daemon)', () => {
  it('isolates production/development names, images, private networks, volumes and HTTP ports', () => {
    const production = render('phasscode-platform', '3202');
    const development = render('phasscode-platform-dev', '3001');
    expect(production.status, production.stderr).toBe(0);
    expect(development.status, development.stderr).toBe(0);
    const prod = production.config!;
    const dev = development.config!;
    expect(prod.name).not.toBe(dev.name);
    expect(prod.services.api!.image).toBe('phasscode-platform:local');
    expect(dev.services.api!.image).toBe('phasscode-platform-dev:local');
    expect(prod.networks.backend!.name).not.toBe(dev.networks.backend!.name);
    for (const name of ['postgres-data', 'redis-data', 'rabbitmq-data', 'kafka-data']) {
      expect(prod.volumes![name]!.name).not.toBe(dev.volumes![name]!.name);
    }
    expect(prod.services.api!.ports).toEqual([
      { host_ip: '127.0.0.1', target: 3000, published: '3202', mode: 'ingress', protocol: 'tcp' },
    ]);
    expect(dev.services.api!.ports![0]).toMatchObject({
      host_ip: '127.0.0.1',
      target: 3000,
      published: '3001',
    });
    expect(
      Object.values(prod.services).every((service) => service.container_name === undefined),
    ).toBe(true);
  });

  it('uses the same selected image, database and quota policy for API, migrations and retention', () => {
    const image = `ghcr.io/example/platform@sha256:${'a'.repeat(64)}`;
    const result = render('phasscode-platform-dev', '3001', ['compose.yaml'], {
      PHASSCODE_IMAGE: image,
      POSTGRES_DB: 'development_database',
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_GLOBAL_WINDOW_MS: '60000',
      LLM_GLOBAL_BUDGET_KEY: 'custom-budget',
    });
    expect(result.status, result.stderr).toBe(0);
    for (const name of ['api', 'migrate', 'retention', 'worker']) {
      const service = result.config!.services[name]!;
      expect(service.image).toBe(image);
      expect(service.environment.DATABASE_URL).toContain('@postgres:5432/development_database');
      expect(service.environment.LLM_GLOBAL_MAX_CALLS).toBe('40');
      expect(service.environment.LLM_GLOBAL_BUDGET_KEY).toBe('custom-budget');
    }
  });

  it('keeps databases/brokers unpublished unless the explicit host-development override is selected', () => {
    const base = render('private-test', '3100').config!;
    for (const name of ['postgres', 'redis', 'rabbitmq', 'kafka'])
      expect(base.services[name]!.ports).toBeUndefined();
    const result = render('host-dev-test', '3101', ['compose.yaml', 'compose.dev.yaml'], {
      PHASSCODE_POSTGRES_PORT: '15432',
      PHASSCODE_REDIS_PORT: '16379',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.config!.services.postgres!.ports![0]).toMatchObject({
      host_ip: '127.0.0.1',
      published: '15432',
    });
    expect(result.config!.services.redis!.ports![0]).toMatchObject({
      host_ip: '127.0.0.1',
      published: '16379',
    });
  });

  it('forwards every opt-in fallback setting to the selected image without legacy credentials', () => {
    const values = Object.fromEntries(
      LLM_FALLBACK_ENV_NAMES.map((name) => [
        name,
        name === 'LLM_FALLBACK_ENABLED'
          ? 'true'
          : name.endsWith('_API_KEY')
            ? 'synthetic-only'
            : name.endsWith('_MODEL')
              ? 'synthetic-model:free'
              : name.endsWith('_PER_TURN')
                ? '6'
                : '1000',
      ]),
    );
    const result = render('fallback-config-test', '3102', ['compose.yaml'], values);
    expect(result.status, result.stderr).toBe(0);
    const environment = result.config!.services.api!.environment;
    for (const name of LLM_FALLBACK_ENV_NAMES) expect(environment[name], name).toBe(values[name]);
    expect(environment.LLM_API_KEY).toBe('');
  });

  it('forwards phase 3 session and integration timing overrides to API and worker', () => {
    const overrides = {
      AUTH_ACCESS_TTL_SECONDS: '240',
      AUTH_SESSION_TTL_SECONDS: '1200',
      AUTH_SESSION_MAX_SECONDS: '14400',
      AUTH_HTTP_TIMEOUT_SECONDS: '8',
      MEETINGS_MAX_AVAILABILITY_DAYS: '3',
      MEETINGS_PROPOSAL_TTL_MINUTES: '20',
      NOTIFICATION_HTTP_TIMEOUT_MS: '7000',
    };
    const result = render('phase3-timing-overrides', '3102', ['compose.yaml'], overrides);
    expect(result.status, result.stderr).toBe(0);
    for (const name of ['api', 'worker'])
      expect(result.config!.services[name]!.environment).toMatchObject(overrides);
  });

  it('requires confirmation of a proxy network and uses distinct explicitly selected aliases', () => {
    expect(render('proxy-missing', '3000', ['compose.yaml', 'compose.proxy.yaml']).status).not.toBe(
      0,
    );
    for (const [project, alias] of [
      ['proxy-prod', 'api-production'],
      ['proxy-dev', 'api-development'],
    ]) {
      const result = render(project!, '3000', ['compose.yaml', 'compose.proxy.yaml'], {
        PHASSCODE_PROXY_NETWORK: 'already-confirmed-network',
        PHASSCODE_PROXY_ALIAS: alias!,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.config!.networks.proxy).toMatchObject({
        name: 'already-confirmed-network',
        external: true,
      });
      expect(result.config!.services.api!.networks.proxy!.aliases).toEqual([alias]);
      expect(result.config!.services.postgres!.networks.proxy).toBeUndefined();
    }
  });

  it('scopes disposable integration images and networks by their own project', () => {
    const first = render('disposable-one', '3000', ['compose.test.yaml']).config!;
    const second = render('disposable-two', '3000', ['compose.test.yaml']).config!;
    expect(first.services.tests!.image).not.toBe(second.services.tests!.image);
    expect(first.networks.tests!.name).not.toBe(second.networks.tests!.name);
    expect(Object.values(first.services).every((service) => service.ports === undefined)).toBe(
      true,
    );
  });
});

const digest = `ghcr.io/example/platform@sha256:${'b'.repeat(64)}`;
const sha = 'c'.repeat(40);
const hooks = join(temp, 'fake-tools.sh');
writeFileSync(
  hooks,
  `
docker() {
  printf 'docker[%s|%s|%s] %s\\n' "$COMPOSE_PROJECT_NAME" "$PHASSCODE_HTTP_PORT" "$PHASSCODE_IMAGE" "$*" >> "$TEST_LOG"
  case "$*" in
    *'config --format json'*) printf '{\\n  "WORKER_ENABLED": "%s"\\n}\\n' "\${FAKE_WORKER_ENABLED:-false}" ;;
    *'run --rm --no-deps migrate'*) [[ \${FAKE_MIGRATION_FAIL:-0} != 1 ]] || return 9 ;;
    *'up -d --no-build --no-deps --wait api'*) [[ \${FAKE_API_FAIL:-0} != 1 ]] || return 9 ;;
    *'up -d --no-build --no-deps --wait worker'*) [[ \${FAKE_WORKER_FAIL:-0} != 1 ]] || return 9 ;;
    *'ps -q api'*) echo api-container ;;
    *'ps -q worker'*) echo worker-container ;;
    *'inspect --format {{.Config.Image}}'*) echo "\${FAKE_ACTUAL_IMAGE:-$PHASSCODE_IMAGE}" ;;
    *'inspect --format'*'org.opencontainers.image.revision'*) echo "\${FAKE_IMAGE_REVISION:-${sha}}" ;;
  esac
  return 0
}
git() {
  case "$*" in
    'branch --show-current') echo "\${FAKE_BRANCH:-dev}" ;;
    'rev-parse HEAD') echo "\${FAKE_REVISION:-${sha}}" ;;
    'status --porcelain') [[ \${FAKE_DIRTY:-0} != 1 ]] || echo ' M tracked.txt' ;;
    *) return 99 ;;
  esac
  return 0
}
curl() { printf 'curl %s\\n' "$*" >> "$TEST_LOG"; echo '{"status":"ready"}'; }
export -f docker git curl
`,
);

function deployment(
  target = 'development',
  overrides: Record<string, string> = {},
  apply = true,
  image = digest,
  checkoutOverride?: string,
) {
  const fixture = checkoutOverride ? dirname(checkoutOverride) : mkdtempSync(join(temp, 'deploy-'));
  const project = target === 'production' ? 'phasscode-platform' : 'phasscode-platform-dev';
  const checkout = checkoutOverride ?? join(fixture, project);
  mkdirSync(join(checkout, '.git'), { recursive: true });
  mkdirSync(join(checkout, 'scripts'), { recursive: true });
  cpSync(join(root, 'scripts/compose.sh'), join(checkout, 'scripts/compose.sh'));
  writeFileSync(join(checkout, '.env'), 'POSTGRES_PASSWORD=synthetic-only\n');
  const log = join(fixture, 'commands.log');
  writeFileSync(log, '');
  const result = spawnSync(
    bash,
    [shellPath(join(root, 'scripts/deploy.sh')), target, image, sha, ...(apply ? ['--apply'] : [])],
    {
      encoding: 'utf8',
      timeout: processTimeoutMs,
      env: {
        ...process.env,
        BASH_ENV: shellPath(hooks),
        TEST_LOG: shellPath(log),
        PHASSCODE_PROJECTS_ROOT: shellPath(fixture),
        PHASSCODE_USE_PROXY: '',
        PHASSCODE_HTTP_PORT: target === 'production' ? '3202' : '',
        FAKE_BRANCH: target === 'production' ? 'main' : 'dev',
        ...overrides,
      },
    },
  );
  return { ...result, checkout, log: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

const releasedSnapshots = new Map<string, ReturnType<typeof deployment>>();
function rememberReleasedSnapshot(
  target: string,
  proxy: boolean,
  release: ReturnType<typeof deployment>,
) {
  // Baselines come only from a completed execution of the actual deploy script with fake tools.
  // Keep an immutable copy: operations tests must never share mutable metadata with each other.
  expect(release.status, release.stderr).toBe(0);
  const project = target === 'production' ? 'phasscode-platform' : 'phasscode-platform-dev';
  for (const [file, value] of Object.entries({
    'image-ref': digest,
    'project-name': project,
    'http-port': target === 'production' ? '3202' : '3001',
    'use-proxy': String(proxy),
  }))
    expect(readFileSync(join(release.checkout, '.deployment', file), 'utf8').trim()).toBe(value);
  expect(existsSync(join(release.checkout, '.deploy-lock'))).toBe(false);
  const baseline = join(mkdtempSync(join(temp, 'released-baseline-')), project);
  cpSync(release.checkout, baseline, { recursive: true });
  releasedSnapshots.set(`${target}:${proxy}`, { ...release, checkout: baseline });
}

function releasedFixture(target = 'development', proxy = false) {
  const key = `${target}:${proxy}`;
  if (!releasedSnapshots.has(key))
    rememberReleasedSnapshot(
      target,
      proxy,
      deployment(target, { PHASSCODE_USE_PROXY: String(proxy) }),
    );
  const baseline = releasedSnapshots.get(key)!;
  const project = target === 'production' ? 'phasscode-platform' : 'phasscode-platform-dev';
  const checkout = join(mkdtempSync(join(temp, 'operation-fixture-')), project);
  cpSync(baseline.checkout, checkout, { recursive: true });
  return { ...baseline, checkout };
}

function operationalCompose(
  checkout: string,
  project: string,
  overrides: Record<string, string> = {},
  command = ['--profile', 'maintenance', 'run', '--rm', 'retention'],
) {
  const log = join(checkout, 'operation.log');
  const result = spawnSync(
    bash,
    [
      shellPath(join(checkout, 'scripts/compose.sh')),
      project,
      shellPath(join(checkout, '.env')),
      ...command,
    ],
    {
      encoding: 'utf8',
      timeout: processTimeoutMs,
      env: {
        ...process.env,
        BASH_ENV: shellPath(hooks),
        TEST_LOG: shellPath(log),
        PHASSCODE_IMAGE: '',
        PHASSCODE_HTTP_PORT: '',
        PHASSCODE_USE_PROXY: '',
        ...overrides,
      },
    },
  );
  return { ...result, log: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

describe('deployment orchestration with fake Git, Docker and HTTP only', () => {
  it('drains and upgrades the opted-in worker using the verified API image', () => {
    const result = deployment('development', { FAKE_WORKER_ENABLED: 'true' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.log).toContain('pull api migrate retention worker');
    expect(result.log.indexOf('stop worker')).toBeLessThan(
      result.log.indexOf('run --rm --no-deps migrate'),
    );
    expect(result.log.indexOf('run --rm --no-deps migrate')).toBeLessThan(
      result.log.indexOf('up -d --no-build --no-deps --wait worker'),
    );
    expect(result.log).toContain('ps -q worker');
    expect(result.log).toContain('worker-container');
  });
  it('keeps a failed worker release marked incomplete without rolling back data', () => {
    const result = deployment('development', {
      FAKE_WORKER_ENABLED: 'true',
      FAKE_WORKER_FAIL: '1',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Worker failed after migration');
    expect(existsSync(join(result.checkout, '.deployment/attempted-image-ref'))).toBe(true);
    expect(existsSync(join(result.checkout, '.deployment/image-ref'))).toBe(false);
    expect(result.log).not.toMatch(/down|--volumes/);
  });
  it('does nothing by default and rejects mutable image tags', () => {
    const plan = deployment('development', {}, false);
    expect(plan.status, plan.stderr).toBe(0);
    expect(plan.log).toBe('');
    expect(existsSync(join(plan.checkout, '.deployment'))).toBe(false);
    const mutable = deployment('development', {}, true, 'ghcr.io/example/platform:latest');
    expect(mutable.status).not.toBe(0);
    expect(mutable.log).toBe('');
  });

  it.each(['', '3000', '3001', '999', '65536', 'abc'])(
    'rejects unsafe production HTTP port %j before modifying the server',
    (port) => {
      const result = deployment('production', { PHASSCODE_HTTP_PORT: port });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('PHASSCODE_HTTP_PORT');
      expect(result.log).toBe('');
      expect(existsSync(join(result.checkout, '.deployment'))).toBe(false);
    },
  );

  it('preserves the DEV host port regardless of the production port variable', () => {
    const result = deployment('development', { PHASSCODE_HTTP_PORT: '3202' }, false);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('port=127.0.0.1:3001');
    expect(result.log).toBe('');
  });

  it.each([
    ['development', 'phasscode-platform-dev', '3001'],
    ['production', 'phasscode-platform', '3202'],
  ])('selects only %s resources and migrates before activation', (target, project, port) => {
    const result = deployment(target);
    expect(result.status, result.stderr).toBe(0);
    expect(result.log).toContain(`docker[${project}|${port}|${digest}]`);
    expect(result.log).toContain(`--project-name ${project} --env-file `);
    expect(result.log).toContain(`http://127.0.0.1:${port}/ready`);
    expect(result.log.indexOf('run --rm --no-deps migrate')).toBeLessThan(
      result.log.indexOf('up -d --no-build --no-deps --wait api'),
    );
    expect(readFileSync(join(result.checkout, '.deployment/image-ref'), 'utf8').trim()).toBe(
      digest,
    );
    expect(existsSync(join(result.checkout, '.deploy-lock'))).toBe(false);
    expect(result.log).not.toMatch(/down|--volumes|nginx/);
    rememberReleasedSnapshot(target!, false, result);
  });

  it.each([{ FAKE_BRANCH: 'wrong' }, { FAKE_REVISION: 'd'.repeat(40) }, { FAKE_DIRTY: '1' }])(
    'rejects invalid checkout state before Docker changes (%j)',
    (overrides) => {
      const result = deployment('development', overrides);
      expect(result.status).not.toBe(0);
      expect(result.log).toBe('');
    },
  );

  it('does not activate the API when migration fails', () => {
    const result = deployment('development', { FAKE_MIGRATION_FAIL: '1' });
    expect(result.status).not.toBe(0);
    expect(result.log).not.toContain('up -d --no-build --no-deps --wait api');
    expect(existsSync(join(result.checkout, '.deployment/image-ref'))).toBe(false);
  });

  it('rejects an image from another revision before database startup, migration or API activation', () => {
    const result = deployment('development', { FAKE_IMAGE_REVISION: 'd'.repeat(40) });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Pulled image revision differs');
    expect(result.log).not.toContain('up -d');
    expect(result.log).not.toContain('run --rm --no-deps migrate');
    expect(existsSync(join(result.checkout, '.deployment'))).toBe(false);
  });

  it('reports API activation failure without pretending to roll back database changes', () => {
    const result = deployment('development', { FAKE_API_FAIL: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No automatic database/image rollback');
    expect(existsSync(join(result.checkout, '.deployment/image-ref'))).toBe(false);
    expect(result.log).not.toMatch(/down|--volumes|rollback/);
    expect(existsSync(join(result.checkout, '.deploy-lock'))).toBe(false);
  });

  it('refuses to promote a different running image', () => {
    const result = deployment('development', {
      FAKE_ACTUAL_IMAGE: `ghcr.io/example/other@sha256:${'e'.repeat(64)}`,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Running API does not use');
    expect(existsSync(join(result.checkout, '.deployment/image-ref'))).toBe(false);
  });

  it.each([
    ['development', 'phasscode-platform-dev', '3001'],
    ['production', 'phasscode-platform', '3202'],
  ])(
    'retention after %s deploy reuses its saved immutable image, project and port',
    (target, project, port) => {
      const release = releasedFixture(target);
      expect(release.status, release.stderr).toBe(0);
      writeFileSync(
        join(release.checkout, '.env'),
        'POSTGRES_PASSWORD=synthetic-only\nPHASSCODE_IMAGE=wrong-local:tag\nPHASSCODE_HTTP_PORT=3999\n',
      );
      const operation = operationalCompose(release.checkout, project!);
      expect(operation.status, operation.stderr).toBe(0);
      expect(operation.log).toContain(`docker[${project}|${port}|${digest}]`);
      expect(operation.log).toContain('--profile maintenance run --rm retention');
    },
  );

  it('requires project metadata to match and refuses corrupt saved image references', () => {
    const release = releasedFixture();
    expect(release.status, release.stderr).toBe(0);
    const wrongProject = operationalCompose(release.checkout, 'phasscode-platform');
    expect(wrongProject.status).not.toBe(0);
    expect(wrongProject.log).toBe('');
    writeFileSync(
      join(release.checkout, '.deployment/image-ref'),
      'ghcr.io/example/platform:latest\n',
    );
    const invalidImage = operationalCompose(release.checkout, 'phasscode-platform-dev');
    expect(invalidImage.status).not.toBe(0);
    expect(invalidImage.log).toBe('');
    expect(invalidImage.stderr).toContain('Invalid deployment metadata');
  });

  it('does not fall back to local configuration after an incomplete deployment', () => {
    const failed = deployment('development', { FAKE_MIGRATION_FAIL: '1' });
    expect(failed.status).not.toBe(0);
    const operation = operationalCompose(failed.checkout, 'phasscode-platform-dev');
    expect(operation.status).not.toBe(0);
    expect(operation.log).toBe('');
    expect(operation.stderr).toContain('Deployment attempt is incomplete');
  });

  it('permits a conscious image/port override while preserving the selected project', () => {
    const release = releasedFixture();
    expect(release.status, release.stderr).toBe(0);
    const overrideImage = `ghcr.io/example/platform@sha256:${'f'.repeat(64)}`;
    const operation = operationalCompose(release.checkout, 'phasscode-platform-dev', {
      PHASSCODE_IMAGE: overrideImage,
      PHASSCODE_HTTP_PORT: '3101',
    });
    expect(operation.status, operation.stderr).toBe(0);
    expect(operation.log).toContain(`docker[phasscode-platform-dev|3101|${overrideImage}]`);
  });

  it('rejects Compose flags that would silently replace the selected project, env-file or source files', () => {
    const release = releasedFixture();
    expect(release.status, release.stderr).toBe(0);
    for (const flag of [
      '--project-name=another-project',
      '-panother-project',
      '--env-file=other.env',
      '-fother.yaml',
    ]) {
      const operation = operationalCompose(release.checkout, 'phasscode-platform-dev', {}, [
        flag,
        'config',
        '--quiet',
      ]);
      expect(operation.status).not.toBe(0);
      expect(operation.log).toBe('');
    }
  });

  it('retains the applied proxy overlay for retention and a later deployment with no explicit mode', () => {
    const release = releasedFixture('development', true);
    expect(release.status, release.stderr).toBe(0);
    expect(readFileSync(join(release.checkout, '.deployment/use-proxy'), 'utf8').trim()).toBe(
      'true',
    );
    const operation = operationalCompose(release.checkout, 'phasscode-platform-dev');
    expect(operation.status, operation.stderr).toBe(0);
    expect(operation.log).toContain('compose.proxy.yaml');
    const next = deployment('development', {}, true, digest, release.checkout);
    expect(next.status, next.stderr).toBe(0);
    expect(next.log).toContain('compose.proxy.yaml');
    expect(readFileSync(join(next.checkout, '.deployment/use-proxy'), 'utf8').trim()).toBe('true');
  }, 30_000);

  it('supports an explicit --no-proxy operation and an explicitly selected non-proxy release', () => {
    const release = releasedFixture('development', true);
    expect(release.status, release.stderr).toBe(0);
    const operation = operationalCompose(release.checkout, 'phasscode-platform-dev', {}, [
      '--no-proxy',
      '--profile',
      'maintenance',
      'run',
      '--rm',
      'retention',
    ]);
    expect(operation.status, operation.stderr).toBe(0);
    expect(operation.log).not.toContain('compose.proxy.yaml');
    const next = deployment(
      'development',
      { PHASSCODE_USE_PROXY: 'false' },
      true,
      digest,
      release.checkout,
    );
    expect(next.status, next.stderr).toBe(0);
    expect(next.log).not.toContain('compose.proxy.yaml');
    expect(readFileSync(join(next.checkout, '.deployment/use-proxy'), 'utf8').trim()).toBe('false');
  });

  it('fails before Docker when the persisted proxy mode is invalid', () => {
    const release = releasedFixture();
    expect(release.status, release.stderr).toBe(0);
    writeFileSync(join(release.checkout, '.deployment/use-proxy'), 'not-a-mode\n');
    const operation = operationalCompose(release.checkout, 'phasscode-platform-dev');
    expect(operation.status).not.toBe(0);
    expect(operation.log).toBe('');
    expect(operation.stderr).toContain('Invalid deployment metadata');
    const next = deployment('development', {}, true, digest, release.checkout);
    expect(next.status).not.toBe(0);
    expect(next.log).toBe('');
  });
});

it('release workflow automates dev/main pushes, retains manual dry-run and gates deployment', () => {
  const source = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  const workflow = parse(source) as {
    on: {
      push: { branches: string[] };
      workflow_dispatch: { inputs: Record<string, { default?: unknown }> };
    };
    jobs: Record<
      string,
      {
        if?: string;
        needs?: string[];
        environment?: string;
        env?: Record<string, string>;
      }
    >;
  };
  expect(Object.keys(workflow.on).sort()).toEqual(['push', 'workflow_dispatch']);
  expect(workflow.on.push.branches).toEqual(['dev', 'main']);
  expect(workflow.on.workflow_dispatch.inputs.apply_remote!.default).toBe(false);
  expect(workflow.jobs.deploy!.if).toBe("github.event_name == 'push' || inputs.apply_remote");
  expect(workflow.jobs.deploy!.environment).toContain("'production'");
  expect(workflow.jobs.deploy!.environment).toContain("'development'");
  expect(workflow.jobs.verify!.environment).toBe(workflow.jobs.deploy!.environment);
  expect(workflow.jobs.deploy!.env!.DEPLOY_TARGET).toContain("github.ref_name == 'main'");
  expect(workflow.jobs.deploy!.env!.DEPLOY_BRANCH).toContain('github.ref_name');
  expect(workflow.jobs.deploy!.env!.PROJECT_DIR).toContain('github.ref_name');
  expect(source).toContain('test "$ENABLE_REMOTE_DEPLOY" = true');
  expect(workflow.jobs.deploy!.needs).toEqual(['image', 'dast']);
  expect(workflow.jobs.deploy!.env!.PHASSCODE_USE_PROXY).toBe('${{ vars.PHASSCODE_USE_PROXY }}');
  expect(workflow.jobs.deploy!.env!.PHASSCODE_HTTP_PORT).toBe('${{ vars.PHASSCODE_HTTP_PORT }}');
  expect(source).toContain('PHASSCODE_USE_PROXY,PHASSCODE_HTTP_PORT');
  expect(workflow.jobs.dast!.env!.LLM_PROVIDER).toBe('mock');
  expect(workflow.jobs.dast!.env!.LLM_API_KEY).toBe('');
  expect(source).toContain('ENABLE_REMOTE_DEPLOY');
  expect(source).toContain('needs.image.outputs.ref');
  expect(source).toContain('-O http://127.0.0.1:18080');
  expect(source).toContain('"$PUBLIC_URL/health"');
  expect(source).not.toContain('"$PUBLIC_URL/ready"');
  expect(source).not.toContain('--live');
});
