import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { parseImage, qualifyImage } from '../scripts/phase3-docker-smoke.mjs';
import type { DockerExecutor } from '../scripts/phase3-docker-smoke.mjs';

const imageId = `sha256:${'a'.repeat(64)}`;
function fakeDocker({ occupied = false, smokeFailure = false } = {}) {
  return vi.fn<DockerExecutor>(async (args, options) => {
    expect(options.env.LLM_API_KEY).toBeUndefined();
    expect(options.env.DATABASE_URL).toBeUndefined();
    if (args[0] === 'context') return 'unix:///var/run/docker.sock';
    if (args[0] === 'image') return `${imageId}|linux`;
    if (args[0] === 'container') return occupied ? 'preexisting-container' : '';
    if (args[0] === 'network' || args[0] === 'volume') return '';
    if (args[0] === 'inspect') return imageId;
    if (args.includes('ps')) return `synthetic-${args.at(-1)}`;
    if (args.includes('run') && smokeFailure) throw new Error('Synthetic runtime failure.');
    return '';
  });
}

describe('disposable Phase 3 image qualification', () => {
  beforeEach(() => {
    vi.stubEnv('DOCKER_HOST', '');
    vi.stubEnv('DOCKER_CONTEXT', '');
    vi.stubEnv('LLM_API_KEY', 'must-not-reach-disposable-runtime');
    vi.stubEnv('DATABASE_URL', 'must-not-reach-disposable-runtime');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires an explicit candidate and rejects shell-like input', () => {
    expect(parseImage(['--image', 'phasscode-platform:ci'])).toBe('phasscode-platform:ci');
    expect(() => parseImage([])).toThrow('Usage');
    expect(() => parseImage(['--image', 'candidate; anything'])).toThrow('Usage');
  });

  it('preserves Windows plugin discovery paths without inheriting application secrets', async () => {
    vi.stubEnv('ProgramFiles', 'C:\\Program Files');
    vi.stubEnv('ProgramData', 'C:\\ProgramData');
    vi.stubEnv('APPDATA', 'C:\\Synthetic\\AppData\\Roaming');
    const docker = fakeDocker();
    await qualifyImage('candidate:local', { docker });
    const environment = docker.mock.calls[0]![1].env;
    expect(environment.ProgramFiles).toBe('C:\\Program Files');
    expect(environment.ProgramData).toBe('C:\\ProgramData');
    expect(environment.APPDATA).toBe('C:\\Synthetic\\AppData\\Roaming');
    expect(environment.LLM_API_KEY).toBeUndefined();
    expect(environment.DATABASE_URL).toBeUndefined();
  });

  it('pins the local candidate ID and uses only one fresh project, even during cleanup', async () => {
    const docker = fakeDocker();
    const result = await qualifyImage('phasscode-platform:ci', { docker });
    expect(result.imageId).toBe(imageId);
    const compose = docker.mock.calls.filter(([args]) => args[0] === 'compose');
    for (const [args, options] of compose) {
      expect(args[args.indexOf('--project-name') + 1]).toBe(result.project);
      expect(result.project).toMatch(/^phasscode-p3-smoke-[a-f0-9-]{36}$/);
      expect(args[args.indexOf('--env-file') + 1]).toMatch(/phasscode-p3-smoke-.*[/\\]empty\.env$/);
      expect(options.env.PHASSCODE_TEST_IMAGE).toBe(imageId);
    }
    expect(compose.some(([args]) => args.includes('run') && args.at(-1) === 'smoke')).toBe(true);
    expect(compose.at(-1)![0]).toContain('down');
    expect(compose.at(-1)![0]).toContain('--volumes');
  });

  it('does not start or clean up a project whose generated name already has resources', async () => {
    const docker = fakeDocker({ occupied: true });
    await expect(qualifyImage('candidate:local', { docker })).rejects.toThrow('unused');
    expect(docker.mock.calls.some(([args]) => args[0] === 'compose')).toBe(false);
  });

  it('cleans only its disposable project after a runtime failure', async () => {
    const docker = fakeDocker({ smokeFailure: true });
    await expect(qualifyImage('candidate:local', { docker })).rejects.toThrow('runtime failure');
    const compose = docker.mock.calls.filter(([args]) => args[0] === 'compose');
    expect(new Set(compose.map(([args]) => args[args.indexOf('--project-name') + 1])).size).toBe(1);
    expect(compose.at(-1)![0]).toContain('down');
  });

  it('allows cleanup to finish after an interrupted runtime command', async () => {
    const controller = new AbortController();
    const local = fakeDocker();
    const docker = vi.fn<DockerExecutor>(async (args, options) => {
      if (args.includes('run')) {
        controller.abort();
        throw new Error('Synthetic interruption.');
      }
      return local(args, options);
    });
    await expect(
      qualifyImage('candidate:local', { docker, signal: controller.signal }),
    ).rejects.toThrow('interruption');
    const cleanup = docker.mock.calls.find(([args]) => args.includes('down'));
    expect(cleanup).toBeDefined();
    expect(cleanup![1].signal).toBeUndefined();
  });

  it('refuses a remote Docker endpoint before starting a disposable stack', async () => {
    const local = fakeDocker();
    const docker = vi.fn<DockerExecutor>(async (args, options) =>
      args[0] === 'context' ? 'ssh://remote.example.test' : local(args, options),
    );
    await expect(qualifyImage('candidate:local', { docker })).rejects.toThrow(
      'local Docker daemon',
    );
    expect(docker.mock.calls.every(([args]) => args[0] === 'context')).toBe(true);
  });

  it('keeps all services private and enables only synthetic Phase 3 integrations', async () => {
    const config = parse(await readFile('compose.phase3-test.yaml', 'utf8'), { merge: true }) as {
      networks: { tests: { internal: boolean } };
      services: Record<
        string,
        { ports?: unknown; pull_policy: string; environment: Record<string, string> }
      >;
      volumes?: unknown;
    };
    expect(config.networks.tests.internal).toBe(true);
    expect(Object.values(config.services).every((service) => service.ports === undefined)).toBe(
      true,
    );
    expect(config.volumes).toBeUndefined();
    for (const name of ['api', 'worker']) {
      expect(config.services[name]!.pull_policy).toBe('never');
      expect(config.services[name]!.environment).toMatchObject({
        AUTH_ENABLED: 'true',
        AUTH_ADMIN_EMAIL: 'admin@example.test',
        MEETINGS_ENABLED: 'true',
        WORKER_ENABLED: 'true',
        GOOGLE_CALENDAR_MODE: 'fake',
        NOTIFICATION_MODE: 'fake',
        LLM_PROVIDER: 'mock',
      });
    }
  });

  it('qualifies the public chat image before using the selected image for the standard smoke', async () => {
    const ci = parse(await readFile('.github/workflows/ci.yml', 'utf8')) as {
      jobs: {
        docker: { steps: Array<{ name?: string; run?: string; env?: Record<string, string> }> };
      };
    };
    const steps = ci.jobs.docker.steps;
    const qualification = steps.findIndex(
      (step) => step.name === 'Validate public Orbe image without privileged services',
    );
    const standard = steps.findIndex((step) => step.name === 'Smoke test complete environment');
    expect(qualification).toBeGreaterThan(0);
    expect(standard).toBeGreaterThan(qualification);
    expect(steps[standard]!.env!.PHASSCODE_IMAGE).toBe('phasscode-platform:ci');
    expect(steps[standard]!.run).toContain('--no-build');
    expect(steps[standard]!.run).not.toContain('--build');
  });
});
